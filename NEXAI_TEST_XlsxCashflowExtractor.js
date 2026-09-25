/**
 * XlsxCashflowExtractor — deterministic extraction of settlement cashflows from an EXCEL
 * (.xlsx) attachment embedded in a dropped .eml.
 *
 * Many counterparties (e.g. Deutsche Bank) put the actual cashflow rows in a spreadsheet tab
 * and leave the email BODY as a cover note / SSI notice. The text extractor (EmlFieldExtractor)
 * marks those 'skipped_attachment' because the cashflows aren't in the body — this fills that gap.
 *
 * Pipeline:
 *   1. Pull the .xlsx MIME part out of the raw .eml (hand-rolled, scoped has no email lib).
 *   2. Materialise it as a REAL sys_attachment on the email record
 *      (GlideSysAttachment.writeBase64 — a scoped-only API) so it can be streamed + downloaded.
 *   3. Parse it with sn_impex.GlideExcelParser: auto-detect the cashflow SHEET and HEADER ROW
 *      (no hardcoded sheet name / row number — real files have blank spacer rows above the
 *      header), map a wide set of column synonyms to our fields, infer Pay/Receive from the
 *      amount sign when there is no explicit direction column, and return one flow per row.
 *
 * Best-effort: any failure returns flow_count 0 and the caller keeps the text result.
 * Same flow shape as EmlFieldExtractor so child-row creation is identical.
 */
var XlsxCashflowExtractor = Class.create();
XlsxCashflowExtractor.prototype = {
    initialize: function () {},

    XLSX_TYPE: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    MAX_SHEETS: 8,
    MAX_HEADER_ROW: 10, // real settlement sheets have title + blank spacer rows above the header

    // Ceilings on what is handed to the model, all overridable from the config store.
    //
    // These used to be 60 rows / 6000 chars a sheet / 12000 overall, which quietly cut a big
    // spreadsheet in half: the model saw 60 rows, flow_count reported 143, and nothing said the
    // difference. The defaults below are set so that a REAL settlement mail is never cut - volume
    // is handled by chunking (RowSegmenter splits the text and fires concurrent calls), not by
    // throwing rows away. A cut is now a last-resort backstop, and it is loud when it happens.
    LIMITS: {
        'xlsx.max_rows': 400,           // per sheet
        'xlsx.max_cols': 40,            // per sheet
        'xlsx.max_chars_sheet': 40000,
        'xlsx.max_chars_total': 100000  // across every sheet of every attachment
    },

    // Read once per extract() and cached: NfotcConfig hits the database, and _rows asks per row.
    _lim: function (key) {
        if (!this._limCache) {
            this._limCache = {};
            var cfg = null;
            try { cfg = new x_nose_nexai_test.NfotcConfig(); } catch (e) { cfg = null; }
            for (var k in this.LIMITS) {
                if (!this.LIMITS.hasOwnProperty(k)) { continue; }
                var v = this.LIMITS[k];
                if (cfg) { try { v = cfg.getNumber(k, '', this.LIMITS[k]); } catch (e2) { v = this.LIMITS[k]; } }
                this._limCache[k] = (v > 0) ? v : this.LIMITS[k];
            }
        }
        return this._limCache[key];
    },

    /**
     * @param {string} emlAttachmentSysId  sys_id of the raw .eml sys_attachment
     * @param {string} emailRecordSysId    sys_id of the parent x_nose_nexai_test_email record
     * @return {{status:string, flow_count:number, flows:Array, attachment_name:string, attachment_sys_id:string}}
     */
    extract: function (emlAttachmentSysId, emailRecordSysId) {
        var out = { status: 'no_xlsx', flow_count: 0, flows: [], attachment_name: '', attachment_sys_id: '', sheet_text: '' };
        try {
            if (!emlAttachmentSysId || !emailRecordSysId) { return out; }
            var raw = this._readText(emlAttachmentSysId);
            if (!raw) { return out; }

            // EVERY spreadsheet, not just the first. A mail commonly carries the cashflows in one
            // workbook and the settlement instructions in another ("SHINHAN SECURITIES SSI",
            // "BBVA Madrid SSI - Cash"); stopping at the first silently discarded the second.
            var parts = this._findAllExcelParts(raw);
            if (!parts.length) { return out; }

            var names = [], ids = [], sheets = [], ssiTables = [], extras = [];
            for (var p = 0; p < parts.length; p++) {
                var sysId = this._materialise(emailRecordSysId, parts[p].filename, parts[p].base64);
                if (!sysId) { continue; }
                names.push(parts[p].filename);
                ids.push(sysId);
                var scan = this._scanWorkbook(sysId, parts[p].filename);
                for (var a = 0; a < scan.sheets.length; a++) { sheets.push(scan.sheets[a]); }
                for (var b = 0; b < scan.ssi.length; b++) { ssiTables.push(scan.ssi[b]); }
                for (var c = 0; c < scan.extras.length; c++) { extras.push(scan.extras[c]); }
            }
            if (!ids.length) { out.status = 'xlsx_write_failed'; return out; }
            out.attachment_name = names.join(', ');
            out.attachment_sys_id = ids[0];
            out.attachment_sys_ids = ids;

            var res = this._assemble(sheets, ssiTables, extras);
            out.flows = res.flows;
            out.flow_count = res.flows.length;
            out.sheet_text = res.text || '';
            out.ssi_tables = ssiTables.length;
            out.sheets_read = sheets.length;
            out.sheets_raw = extras.length;
            out.rows_seen = res.rowsSeen;
            out.rows_sent = res.rowsSent;
            out.truncated = res.truncated;            // a caller can surface a short read instead of trusting it
            // The grid is worth sending even with no recognised cashflow sheet - an unrecognised
            // layout is exactly the case the model is better at than the header patterns are.
            out.status = res.flows.length ? 'extracted_attachment'
                : (res.text ? 'extracted_text_only' : 'no_match');
            return out;
        } catch (e) {
            out.status = 'error';
            gs.warn('[XlsxCashflowExtractor] ' + e);
            return out;
        }
    },

    // ---------------------------------------------------------------- read raw .eml
    _readText: function (sysId) {
        var gr = new GlideRecord('sys_attachment');
        if (!gr.get(sysId)) { return ''; }
        return new GlideSysAttachment().getContent(gr) || '';
    },

    // ---------------------------------------------------------------- find the .xlsx MIME part
    // Tries every declared MIME boundary (outer first, so top-level attachments win cleanly) and
    // returns the first part that is Content-Disposition: attachment AND decodes to a zip (xlsx).
    // Every attachment that decodes to a zip with an Excel extension, in MIME order.
    _findAllExcelParts: function (raw) {
        var found = [], seen = {};
        var bounds = [];
        raw.replace(/boundary="?([^";\r\n]+)"?/gi, function (_, b) { if (bounds.indexOf(b) < 0) { bounds.push(b); } return _; });
        for (var bi = 0; bi < bounds.length; bi++) {
            var chunks = raw.split('--' + bounds[bi]);
            for (var i = 0; i < chunks.length; i++) {
                var c = chunks[i];
                if (!/Content-Disposition:[ \t]*attachment/i.test(c)) { continue; }
                var fn = this._partFilename(c);
                var b64 = ('' + this._afterHeaders(c)).replace(/[^A-Za-z0-9+/=]/g, '');
                if (b64.length < 100) { continue; }
                // xlsx / docx / zip all start with PK\x03\x04 -> base64 "UEsD". Require the zip magic,
                // and (when a name is present) an Excel extension so we don't grab a .docx/.zip.
                if (b64.substr(0, 4) !== 'UEsD') { continue; }
                if (fn && !/\.xls[xmb]?$/i.test(fn)) { continue; }
                var name = fn || ('Cashflows' + (found.length || '') + '.xlsx');
                var dedupe = name + ':' + b64.length;
                if (seen[dedupe]) { continue; }        // the same part seen under two boundaries
                seen[dedupe] = true;
                found.push({ filename: name, base64: b64 });
            }
        }
        return found;
    },

    _afterHeaders: function (s) {
        var i = s.indexOf('\r\n\r\n'), d = 4;
        if (i === -1) { i = s.indexOf('\n\n'); d = 2; }
        return i === -1 ? '' : s.substring(i + d);
    },

    // filename from Content-Disposition filename= or Content-Type name=, RFC2047-decoded.
    _partFilename: function (c) {
        // RFC 2231 (filename*=utf-8''%28KIS%29…) FIRST, and it is a different encoding from
        // RFC 2047 (=?utf-8?B?…?=) which _decodeMime handles. Both were being fed to _decodeMime,
        // so a non-ASCII name arrived as the literal string "utf-8''%28KIS%29TRS%20Unwind…" —
        // which became the attachment's name, overran the attachment name limit, and ended up in
        // the sheet label handed to the model. RFC says the extended form wins when both appear.
        var ext = c.match(/filename\*\s*=\s*"?([^";\r\n]+)"?/i);
        if (ext) {
            var v = ext[1].trim();
            var bits = v.split("'");                 // charset'language'encoded-text
            if (bits.length >= 3) { v = bits.slice(2).join("'"); }
            try { v = decodeURIComponent(v); } catch (e) { /* leave it percent-encoded */ }
            return v;
        }
        var m = c.match(/filename\s*=\s*"?([^";\r\n]+)"?/i) || c.match(/\bname\s*=\s*"?([^";\r\n]+)"?/i);
        return m ? this._decodeMime(m[1].trim()) : '';
    },

    // Decode =?utf-8?B?...?= / =?...?Q?...?= encoded-words (best-effort).
    _decodeMime: function (s) {
        var self = this;
        return ('' + s).replace(/=\?[^?]+\?([BbQq])\?([^?]*)\?=/g, function (_, enc, data) {
            try {
                if (enc.toUpperCase() === 'B') { return self._b64str(data); }
                return data.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, function (__, h) { return String.fromCharCode(parseInt(h, 16)); });
            } catch (e) { return data; }
        });
    },

    // ---------------------------------------------------------------- materialise as attachment
    // Idempotent by file name (a re-run reuses the attachment instead of duplicating it).
    _materialise: function (emailSysId, filename, base64) {
        var eg = new GlideRecord('x_nose_nexai_test_email');
        if (!eg.get(emailSysId)) { return ''; }
        var existing = new GlideRecord('sys_attachment');
        existing.addQuery('table_name', 'x_nose_nexai_test_email');
        existing.addQuery('table_sys_id', emailSysId);
        existing.addQuery('file_name', filename);
        existing.setLimit(1);
        existing.query();
        if (existing.next()) { return existing.getUniqueValue(); }
        return '' + new GlideSysAttachment().writeBase64(eg, filename, this.XLSX_TYPE, base64);
    },

    // ---------------------------------------------------------------- parse the workbook
    // Scan EVERY sheet 0..N; for each, try header rows 1..M until the headers map to cashflow
    // columns (currency + amount + a reference or value date). Cashflows can be split one-per-desk
    // across several tabs (e.g. Rates / Credit / FX), so flows from ALL matching sheets are
    // concatenated — not just the first.
    // Walk every sheet of one workbook and sort it into one of three piles: a cashflow table, a
    // settlement-instruction table, or neither. Previously anything that was not a cashflow table
    // was discarded, which is how 60 SSI values went missing from a single mail.
    // Walk every sheet of one workbook. A sheet is sorted into one of four piles:
    //
    //   A  cashflow table   currency + amount + (date|reference)  -> full treatment
    //   B  SSI table        currency + instruction columns, no amount -> per-currency lookup
    //   C  anything else with a header row and rows -> handed over as a RAW GRID
    //   D  empty / no usable header -> skipped, the only thing dropped
    //
    // C is the important one. Previously every sheet that was not A was discarded, so a sheet
    // headed "Ccy Code" / "Payment Date" was lost in its entirety rather than losing one column.
    // Code should only ever ADD signal, never SUBTRACT content: failing to recognise the columns
    // costs the enrichments (direction from the sign, ISO dates, the SSI join) and nothing else.
    _scanWorkbook: function (xlsxSysId, fileName) {
        var diag = [], sheets = [], ssi = [], extras = [];
        for (var sh = 0; sh <= this.MAX_SHEETS; sh++) {
            var matched = false, raw = null;
            for (var hr = 0; hr <= this.MAX_HEADER_ROW; hr++) {
                var parser = new sn_impex.GlideExcelParser();
                parser.setSheetNumber(sh);
                parser.setHeaderRowNumber(hr);
                var ok = false;
                try { ok = parser.parse(new GlideSysAttachment().getContentStream(xlsxSysId)); } catch (e) { ok = false; }
                if (!ok) { this._close(parser); break; }   // no such sheet -> next sheet number
                var headers = parser.getColumnHeaders() || [];
                var map = this._mapHeaders(headers);
                var ne = [];
                for (var z = 0; z < headers.length; z++) { if (('' + headers[z]).trim()) { ne.push('' + headers[z]); } }
                if (ne.length) { diag.push('s' + sh + 'hr' + hr + '[' + ne.slice(0, 9).join(',') + ']'); }

                if (map.currency && map.amount && (map.value_date || map.reference)) {
                    var res = this._rows(parser, map, headers);
                    this._close(parser);
                    if (res.rows.length) {
                        res.label = this._label(fileName, sh);
                        gs.info('[XlsxCashflowExtractor] cashflow ' + res.label + ' headerRow=' + hr +
                            ' rows=' + res.rows.length + (res.cut ? (' (CUT from ' + res.seen + ')') : ''));
                        sheets.push(res);
                        matched = true;
                        break;
                    }
                    continue;
                }

                var smap = this._mapSsiHeaders(headers);
                if (smap) {
                    var tbl = this._ssiRows(parser, smap);
                    this._close(parser);
                    if (tbl && tbl.count) {
                        gs.info('[XlsxCashflowExtractor] SSI ' + this._label(fileName, sh) + ' headerRow=' + hr +
                            ' currencies=' + tbl.count + ' beneficiary=' + (tbl.isNomura ? 'NOMURA' : 'counterparty'));
                        ssi.push(tbl);
                        matched = true;
                        break;
                    }
                    continue;
                }

                // Tier C. Keep the FIRST header row that yields a usable grid, in case no later
                // header row turns out to be a recognised table. A sheet whose real header sits
                // under a title row gives junk at hr=0, so "usable" asks for two named columns and
                // at least one row of data.
                if (!raw && ne.length >= 2) {
                    var cand = this._rawRows(parser, headers);
                    if (cand.rows.length) { cand.label = this._label(fileName, sh); cand.headerRow = hr; raw = cand; }
                }
                this._close(parser);
            }
            if (!matched && raw) {
                gs.info('[XlsxCashflowExtractor] unrecognised ' + raw.label + ' headerRow=' + raw.headerRow +
                    ' rows=' + raw.rows.length + ' -> sent as a raw grid' + (raw.cut ? (' (CUT from ' + raw.seen + ')') : ''));
                extras.push(raw);
            }
        }
        if (!sheets.length && !ssi.length && !extras.length) {
            gs.info('[XlsxCashflowExtractor] nothing matched. scan: ' + diag.slice(0, 30).join(' || ').substring(0, 1500));
        }
        return { sheets: sheets, ssi: ssi, extras: extras };
    },

    _label: function (fileName, sheetNo) {
        var f = ('' + (fileName || '')).replace(/\.xls[xmb]?$/i, '');
        return (f ? (f + ' / ') : '') + 'sheet ' + (sheetNo + 1);
    },

    // A sheet we could not classify, read verbatim. No mapping, so no normalisation and no
    // derived direction - the cells go over exactly as the workbook wrote them.
    _rawRows: function (parser, headers) {
        var MAXR = this._lim('xlsx.max_rows'), MAXC = this._lim('xlsx.max_cols');
        var hdr = [], rows = [], seen = 0;
        for (var j = 0; j < headers.length && j < MAXC; j++) { hdr.push(('' + headers[j]).replace(/\s+/g, ' ').trim()); }
        while (parser.next()) {
            var row = parser.getRow() || {};
            var cells = [], any = false;
            for (var k = 0; k < headers.length && k < MAXC; k++) {
                var cv = this._cell(row, '' + headers[k]);
                if (cv) { any = true; }
                cells.push(cv);
            }
            if (!any) { continue; }                    // blank / spacer row
            seen++;
            if (rows.length < MAXR) { rows.push({ cells: cells, dir: '', ccy: '' }); }
        }
        return { flows: [], hdr: hdr, rows: rows, addDir: false, raw: true, seen: seen, cut: seen > rows.length };
    },

    // An SSI table states, per currency, where money goes. It has a currency column and several
    // instruction columns, and crucially NO amount column - which is exactly why the cashflow gate
    // rejected it.
    _mapSsiHeaders: function (headers) {
        var m = { currency: null, bank_bic: null, bank_name: null, bene_bic: null, bene_name: null, account: null };
        var hasAmount = false, i, orig, h;
        for (i = 0; i < headers.length; i++) {
            orig = '' + headers[i];
            h = orig.toLowerCase().replace(/[\s_]+/g, ' ').trim();
            if (/(^|\s)amount/.test(h)) { hasAmount = true; }
            if (!m.currency && /^(currency|ccy|settlement currency|settlement ccy)$/.test(h)) { m.currency = orig; }
            if (!m.bank_bic && /(account with bank swift|account with bank bic|bank swift|correspondent swift|intermediary swift|nostro swift)/.test(h)) { m.bank_bic = orig; }
            if (!m.bank_name && /(account with bank name|bank name|correspondent bank|nostro bank)/.test(h)) { m.bank_name = orig; }
            if (!m.bene_bic && /(bene swift|beneficiary swift|bene bic|beneficiary bic)/.test(h)) { m.bene_bic = orig; }
            if (!m.bene_name && /(bene name|beneficiary name|beneficiary)$/.test(h)) { m.bene_name = orig; }
            if (!m.account && /(bene account|beneficiary account|account number|account no|a\/c)/.test(h)) { m.account = orig; }
        }
        if (hasAmount || !m.currency) { return null; }
        var signals = 0;
        if (m.bank_bic) { signals++; }
        if (m.bank_name) { signals++; }
        if (m.bene_bic) { signals++; }
        if (m.bene_name) { signals++; }
        if (m.account) { signals++; }
        return signals >= 2 ? m : null;      // two independent signals, so a stray "Bank" column is not enough
    },

    // Read an SSI sheet into a per-currency lookup, and work out WHOSE instructions they are from
    // the beneficiary column rather than the sheet's title - "DB Settlement Instructions" is
    // Deutsche Bank's wording and the next counterparty will use their own.
    _ssiRows: function (parser, m) {
        var by = {}, count = 0, nomuraHits = 0, total = 0;
        while (parser.next()) {
            var row = parser.getRow() || {};
            var ccy = this._cell(row, m.currency).toUpperCase().replace(/[^A-Z]/g, '').substring(0, 3);
            if (!ccy) { continue; }
            var bene = m.bene_name ? this._cell(row, m.bene_name) : '';
            var entry = {
                bank: this._cell(row, m.bank_name) || '',
                bank_bic: m.bank_bic ? this._cell(row, m.bank_bic) : '',
                bene: bene,
                bene_bic: m.bene_bic ? this._cell(row, m.bene_bic) : '',
                account: m.account ? this._cell(row, m.account) : ''
            };
            if (!entry.bank && !entry.bank_bic && !entry.account) { continue; }
            total++;
            if (/nomura|\bnfps\b|\bngfp\b|\bnip\b/i.test(bene + ' ' + entry.bene_bic)) { nomuraHits++; }
            if (!by[ccy]) { by[ccy] = entry; count++; }
        }
        return { byCcy: by, count: count, isNomura: (total > 0 && nomuraHits * 2 >= total) };
    },

    // Which instructions apply to a cashflow, from its DIRECTION and CURRENCY.
    //
    // Direction is stored from the SENDER's point of view here (it is flipped to Nomura's later),
    // so "Pay" means the sender pays and NOMURA RECEIVES -> the money lands in Nomura's account ->
    // the sheet whose beneficiary is Nomura. "Receive" is the mirror.
    //
    // Verified against the ground truth for the Deutsche Bank mail, which resolves exactly this way
    // and matches both of its sheets row for row.
    _ssiFor: function (tables, ccy, senderDir) {
        if (!tables.length || !ccy) { return null; }
        var wantNomura = (senderDir === 'Pay');
        var t, i;
        for (i = 0; i < tables.length; i++) {
            t = tables[i];
            if (t.isNomura === wantNomura && t.byCcy[ccy]) { return t.byCcy[ccy]; }
        }
        if (tables.length === 1 && tables[0].byCcy[ccy]) { return tables[0].byCcy[ccy]; }
        return null;                          // two tables and neither fits: assert nothing
    },

    // Build the grid the model reads: recognised sheets first with their SSI joined on, then every
    // sheet we could not classify, verbatim.
    //
    // ORDER IS THE BUDGET POLICY. Recognised cashflow sheets carry the money and go first, so if
    // the overall ceiling is ever reached it is an unrecognised sheet that is dropped, never a
    // cashflow row. Nothing is dropped silently: whatever is cut is logged and reported on the
    // result as `truncated`.
    //
    // SSI sheets are deliberately NOT included as text. They are already joined onto each row by
    // currency, and sending the raw table as well would give the model a second, unjoined copy to
    // disagree with.
    _assemble: function (sheets, ssiTables, extras) {
        extras = extras || [];
        var all = sheets.concat(extras);
        var TOTAL = this._lim('xlsx.max_chars_total'), PER = this._lim('xlsx.max_chars_sheet');
        var flows = [], blocks = [], used = 0, rowsSeen = 0, rowsSent = 0, dropped = [], cutAny = false, si, r, k;

        for (si = 0; si < all.length; si++) {
            var sheet = all[si];
            rowsSeen += (sheet.seen || sheet.rows.length);
            if (sheet.cut) { cutAny = true; }

            var hdr = sheet.hdr.slice(0);
            var addDir = sheet.addDir;
            if (addDir) { hdr.push('Direction'); }
            var addSsi = !sheet.raw && ssiTables.length > 0;
            if (addSsi) { hdr.push('SSI Bank'); hdr.push('SSI Account'); hdr.push('SSI Beneficiary'); }

            var lines = [hdr.join(' | ')];
            for (r = 0; r < sheet.rows.length; r++) {
                var cells = sheet.rows[r].cells.slice(0);
                if (addDir) { cells.push(sheet.rows[r].dir || ''); }
                if (addSsi) {
                    var ssi = this._ssiFor(ssiTables, sheet.rows[r].ccy, sheet.rows[r].dir);
                    if (ssi) {
                        var bank = ssi.bank_bic ? (ssi.bank + (ssi.bank ? ' (' : '') + ssi.bank_bic + (ssi.bank ? ')' : '')) : ssi.bank;
                        var bene = ssi.bene_bic ? (ssi.bene + (ssi.bene ? ' (' : '') + ssi.bene_bic + (ssi.bene ? ')' : '')) : ssi.bene;
                        cells.push(bank); cells.push(ssi.account); cells.push(bene);
                    } else {
                        cells.push(''); cells.push(''); cells.push('');
                    }
                }
                lines.push(cells.join(' | '));
            }

            // Name each block. With several attachments and several tabs the model would otherwise
            // see grids butted together with no idea which file or tab it is reading.
            var head = sheet.label ? ('--- ' + sheet.label + (sheet.raw ? ' (layout not recognised) ' : ' ') + '---\n') : '';
            var body = head + lines.join('\n');
            if (body.length > PER) { body = body.substring(0, PER); cutAny = true; dropped.push(sheet.label + ' (over ' + PER + ' chars)'); }
            if (used + body.length > TOTAL) {
                dropped.push((sheet.label || 'sheet ' + (si + 1)) + ' (no budget left)');
                cutAny = true;
                continue;                              // a later, smaller sheet may still fit
            }
            used += body.length + 2;
            rowsSent += sheet.rows.length;
            blocks.push(body);

            for (k = 0; k < sheet.flows.length; k++) {
                var f = sheet.flows[k];
                var fs = this._ssiFor(ssiTables, f.currency, f.direction);
                if (fs) {
                    f.ssi_bank = fs.bank_bic || fs.bank;
                    f.ssi_account = fs.account;
                    f.ssi_beneficiary = fs.bene_bic || fs.bene;
                }
                flows.push(f);
            }
        }

        if (ssiTables.length && flows.length) {
            gs.info('[XlsxCashflowExtractor] joined ' + ssiTables.length + ' SSI table(s) onto ' + flows.length + ' cashflow(s)');
        }
        if (dropped.length) {
            gs.warn('[XlsxCashflowExtractor] TRUNCATED — not everything reached the model: ' + dropped.join('; ') +
                '. Raise xlsx.max_chars_total / xlsx.max_chars_sheet in the config store if this is a real mail.');
        }
        if (rowsSeen > rowsSent) {
            gs.warn('[XlsxCashflowExtractor] ' + rowsSent + ' of ' + rowsSeen + ' row(s) sent — ' +
                (rowsSeen - rowsSent) + ' cut. Raise xlsx.max_rows.');
        }
        return {
            flows: flows,
            text: blocks.join('\n\n'),
            rowsSeen: rowsSeen,
            rowsSent: rowsSent,
            truncated: (cutAny || rowsSeen > rowsSent)
        };
    },

    _close: function (p) { try { p.close(); } catch (e) {} },

    // Returns { flows, text }. `text` is a faithful pipe-delimited dump of the cashflow sheet
    // (header + data rows) — handed to the AI skill so the ATTACHMENT is read by the LLM too
    // (Chinou is text-only and can't ingest the binary .xlsx, so we give it the parsed grid; the
    // LLM still does the field extraction).
    _rows: function (parser, map, headers) {
        var flows = [], rows = [], hdr = [];
        var MAXC = this._lim('xlsx.max_cols'), MAXR = this._lim('xlsx.max_rows');
        for (var j = 0; j < headers.length && j < MAXC; j++) { hdr.push(('' + headers[j]).replace(/\s+/g, ' ').trim()); }

        // Whether the sheet states a direction of its own. When it does not, the amount's SIGN is
        // the only thing that distinguishes Pay from Receive.
        var hasDirCol = !!map.direction;
        var sawNegative = false;

        while (parser.next()) {
            var row = parser.getRow() || {};
            var ccy = this._cell(row, map.currency);
            var amt = this._cell(row, map.amount);
            if (!ccy && !amt) { continue; } // blank / spacer row
            var dir = hasDirCol ? this._normDir(this._cell(row, map.direction)) : '';
            if (!dir) { dir = this._dirFromAmount(amt); }
            if (this._isNegative(amt)) { sawNegative = true; }
            // Direction is captured separately, so the amount is a magnitude — drop any leading sign
            // or accounting parentheses that only re-encode Pay/Receive (e.g. "-1,596,204.55").
            var amtMag = this._absAmount(amt);
            var vd = this._normDate(this._cell(row, map.value_date));
            // Text dump for the AI mirrors the normalised values (serial dates -> ISO, unsigned amount).
            if (rows.length < MAXR) {
                var cells = [];
                for (var k = 0; k < headers.length && k < MAXC; k++) {
                    var hk = '' + headers[k], cv = this._cell(row, hk);
                    if (map.value_date && hk === map.value_date) { cv = vd; }
                    else if (map.amount && hk === map.amount) { cv = amtMag; }
                    cells.push(cv);
                }
                rows.push({ cells: cells, dir: dir, ccy: ccy.toUpperCase() });
            }
            flows.push({
                reference: this._cell(row, map.reference),
                currency: ccy.toUpperCase(),
                amount: amtMag,
                direction: dir,
                value_date: vd
            });
        }

        // A sheet with no Direction column encodes direction in the sign, and the dump above has
        // just removed it — leaving the model nothing to read. Restore the signal as a column, using
        // the value _dirFromAmount already derived, so such a sheet reads exactly like one that
        // states its direction outright. Determining Pay from a minus sign is arithmetic; it should
        // not be left to the model to infer.
        //
        // Only when a negative actually appeared. If every amount is positive the sign carries no
        // information, and a column reading "Receive" on every row would be a guess dressed as data
        // — better to add nothing and let the model judge from the surrounding text.
        var addDir = (!hasDirCol && sawNegative);

        // The text is NOT built here any more. The SSI belonging in these rows can live in a later
        // sheet, or in a different attachment altogether, so assembly waits until every workbook
        // has been read — see _assemble.
        // `seen` is what the sheet actually held; `rows` is what fits. They must be reported
        // separately — the old code let flow_count claim 143 while the model was shown 60.
        return { flows: flows, hdr: hdr, rows: rows, addDir: addDir, seen: flows.length, cut: flows.length > rows.length };
    },

    _cell: function (row, key) {
        if (!key) { return ''; }
        var v = row[key];
        return ('' + (v == null ? '' : v)).replace(/\s+/g, ' ').trim();
    },

    // ---------------------------------------------------------------- header -> field mapping
    // Returns the ORIGINAL header string per field (getRow() is keyed by header text).
    _mapHeaders: function (headers) {
        var map = { reference: null, currency: null, amount: null, direction: null, value_date: null };
        for (var i = 0; i < headers.length; i++) {
            var orig = '' + headers[i];
            var h = orig.toLowerCase().replace(/[\s_]+/g, ' ').trim();
            if (!map.reference && /(trade id|trade ref|^reference$|deal id|markit ?wire id|netting id|trn id|transaction ref)/.test(h)) { map.reference = orig; }
            if (!map.currency && /^(currency|ccy|settlement currency|settlement ccy)$/.test(h)) { map.currency = orig; }
            if (!map.amount && /(^|\s)amount$/.test(h) && !/notional/.test(h)) { map.amount = orig; }
            if (!map.direction && /(direction|pay ?\/? ?receive|buy ?\/ ?sell|dr ?\/ ?cr|p ?\/ ?r)/.test(h)) { map.direction = orig; }
            if (!map.value_date && /(value date|settlement date|value dt|^vd$|pay date|settle date)/.test(h)) { map.value_date = orig; }
        }
        return map;
    },

    // ---------------------------------------------------------------- normalisers
    // No explicit direction column -> infer from the amount sign (negative = we pay / outflow).
    _dirFromAmount: function (a) {
        var n = this._signed(a);
        if (n === null || n === 0) { return ''; }
        return n < 0 ? 'Pay' : 'Receive';
    },

    // True when the cell carries a negative amount, including the accounting "(1,234.00)" form.
    // Shares _signed with _dirFromAmount so the two can never disagree about the same cell.
    _isNegative: function (a) {
        var n = this._signed(a);
        return n !== null && n < 0;
    },

    _signed: function (a) {
        var s = ('' + (a == null ? '' : a)).trim();
        if (!s) { return null; }
        var neg = false;
        if (/^\(.*\)$/.test(s)) { neg = true; s = s.replace(/^\((.*)\)$/, '$1'); }
        var n = parseFloat(s.replace(/[,\s]/g, ''));
        if (isNaN(n)) { return null; }
        return neg ? -Math.abs(n) : n;
    },

    _normDir: function (d) {
        d = ('' + (d || '')).toLowerCase().trim();
        if (!d) { return ''; }
        if (/^(p|pay|dr|debit|coun? pay|out)/.test(d)) { return 'Pay'; }
        if (/^(r|rec|cr|credit|coun? rec|in)/.test(d)) { return 'Receive'; }
        return '';
    },

    // Magnitude only — strip a leading sign or accounting parentheses "(1,234.00)".
    _absAmount: function (a) {
        var s = ('' + (a == null ? '' : a)).trim();
        if (!s) { return ''; }
        s = s.replace(/^\((.*)\)$/, '$1').replace(/^\s*[-+]\s*/, '');
        return s.trim();
    },

    _normDate: function (s) {
        s = ('' + (s || '')).trim();
        if (!s) { return ''; }
        var m;
        // Excel serial date (bare integer, no separators) — GlideExcelParser may hand back the raw
        // serial for a date-formatted cell. Convert from Excel's 1899-12-30 epoch. Range-gated to a
        // plausible settlement window (~1996..2064) so real reference numbers aren't misread as dates.
        if (/^\d{5}$/.test(s)) {
            var serial = parseInt(s, 10);
            if (serial >= 35000 && serial <= 60000) {
                var d = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
                return d.getUTCFullYear() + '-' + this._2(d.getUTCMonth() + 1) + '-' + this._2(d.getUTCDate());
            }
        }
        if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) { return m[1] + '-' + this._2(m[2]) + '-' + this._2(m[3]); }
        if ((m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/))) { return m[3] + '-' + this._2(m[2]) + '-' + this._2(m[1]); } // dd/MM/yyyy
        if ((m = s.match(/^(\d{1,2})[- ]([A-Za-z]{3})[- ,]*(\d{4})/))) { var mo = this._mon(m[2]); if (mo) { return m[3] + '-' + mo + '-' + this._2(m[1]); } }
        return s.substr(0, 10);
    },

    _2: function (n) { n = '' + n; return n.length < 2 ? '0' + n : n; },
    _mon: function (x) {
        var i = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
            .indexOf(('' + x).toLowerCase().substr(0, 3));
        return i < 0 ? '' : this._2(i + 1);
    },

    // pure-JS base64 -> string (RFC2047 filenames; ASCII-safe)
    _b64str: function (s) {
        s = ('' + s).replace(/[^A-Za-z0-9+/=]/g, '');
        var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/', out = '', i = 0;
        while (i < s.length) {
            var e1 = chars.indexOf(s.charAt(i++)), e2 = chars.indexOf(s.charAt(i++)),
                e3 = chars.indexOf(s.charAt(i++)), e4 = chars.indexOf(s.charAt(i++));
            if (e1 < 0 || e2 < 0) { break; }
            out += String.fromCharCode((e1 << 2) | (e2 >> 4));
            if (e3 >= 0 && e3 !== 64) { out += String.fromCharCode(((e2 & 15) << 4) | (e3 >> 2)); }
            if (e4 >= 0 && e4 !== 64) { out += String.fromCharCode(((e3 & 3) << 6) | e4); }
        }
        return out;
    },

    type: 'XlsxCashflowExtractor'
};
