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

    /**
     * @param {string} emlAttachmentSysId  sys_id of the raw .eml sys_attachment
     * @param {string} emailRecordSysId    sys_id of the parent x_nose_nfotc_bsm_email record
     * @return {{status:string, flow_count:number, flows:Array, attachment_name:string, attachment_sys_id:string}}
     */
    extract: function (emlAttachmentSysId, emailRecordSysId) {
        var out = { status: 'no_xlsx', flow_count: 0, flows: [], attachment_name: '', attachment_sys_id: '', sheet_text: '' };
        try {
            if (!emlAttachmentSysId || !emailRecordSysId) { return out; }
            var raw = this._readText(emlAttachmentSysId);
            if (!raw) { return out; }

            var xl = this._findExcelPart(raw);
            if (!xl) { return out; }
            out.attachment_name = xl.filename;

            var xlsxSysId = this._materialise(emailRecordSysId, xl.filename, xl.base64);
            if (!xlsxSysId) { out.status = 'xlsx_write_failed'; return out; }
            out.attachment_sys_id = xlsxSysId;

            var res = this._parseCashflows(xlsxSysId);
            out.flows = res.flows;
            out.flow_count = res.flows.length;
            out.sheet_text = res.text || '';
            out.status = res.flows.length ? 'extracted_attachment' : 'no_match';
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
    _findExcelPart: function (raw) {
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
                // xlsx / docx / zip all start with PK\x03\x04 -> base64 "UEsD". Require zip magic,
                // and (when a name is present) an Excel extension so we don't grab a .docx/.zip.
                var looksZip = b64.substr(0, 4) === 'UEsD';
                if (looksZip && (!fn || /\.xls[xmb]?$/i.test(fn))) {
                    return { filename: fn || 'Cashflows.xlsx', base64: b64 };
                }
            }
        }
        return null;
    },

    _afterHeaders: function (s) {
        var i = s.indexOf('\r\n\r\n'), d = 4;
        if (i === -1) { i = s.indexOf('\n\n'); d = 2; }
        return i === -1 ? '' : s.substring(i + d);
    },

    // filename from Content-Disposition filename= or Content-Type name=, RFC2047-decoded.
    _partFilename: function (c) {
        var m = c.match(/filename\*?=\s*"?([^";\r\n]+)"?/i) || c.match(/\bname\s*=\s*"?([^";\r\n]+)"?/i);
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
        var eg = new GlideRecord('x_nose_nfotc_bsm_email');
        if (!eg.get(emailSysId)) { return ''; }
        var existing = new GlideRecord('sys_attachment');
        existing.addQuery('table_name', 'x_nose_nfotc_bsm_email');
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
    _parseCashflows: function (xlsxSysId) {
        var diag = [], allFlows = [], allText = [];
        // GlideExcelParser.setSheetNumber is 0-based — start at 0. Don't abort the whole scan when
        // one sheet number fails to parse (robust to 0- or 1-based and out-of-range indexes).
        for (var s = 0; s <= this.MAX_SHEETS; s++) {
            // setHeaderRowNumber is 0-based — hr=0 is the FIRST row. Start at 0 so a header sitting on
            // row 1 (no spacer rows above it, e.g. one-table-per-desk tabs) is actually detected.
            for (var hr = 0; hr <= this.MAX_HEADER_ROW; hr++) {
                var parser = new sn_impex.GlideExcelParser();
                parser.setSheetNumber(s);
                parser.setHeaderRowNumber(hr);
                var ok = false;
                try { ok = parser.parse(new GlideSysAttachment().getContentStream(xlsxSysId)); } catch (e) { ok = false; }
                if (!ok) { this._close(parser); break; } // this sheet number didn't parse -> next sheet
                var headers = parser.getColumnHeaders() || [];
                var map = this._mapHeaders(headers);
                var ne = [];
                for (var z = 0; z < headers.length; z++) { if (('' + headers[z]).trim()) { ne.push('' + headers[z]); } }
                if (ne.length) { diag.push('s' + s + 'hr' + hr + '[' + ne.slice(0, 9).join(',') + ']'); }
                if (map.currency && map.amount && (map.value_date || map.reference)) {
                    var res = this._rows(parser, map, headers);
                    this._close(parser);
                    if (res.flows.length) {
                        gs.info('[XlsxCashflowExtractor] matched sheet=' + s + ' headerRow=' + hr + ' flows=' + res.flows.length);
                        for (var fi = 0; fi < res.flows.length; fi++) { allFlows.push(res.flows[fi]); }
                        if (res.text) { allText.push(res.text); }
                        break; // header row found for this sheet -> move on to the next sheet
                    }
                } else {
                    this._close(parser);
                }
            }
        }
        if (allFlows.length) {
            gs.info('[XlsxCashflowExtractor] total flows across sheets=' + allFlows.length);
            return { flows: allFlows, text: allText.join('\n\n').substring(0, 12000) };
        }
        gs.info('[XlsxCashflowExtractor] no cashflow sheet matched. scan: ' + diag.slice(0, 30).join(' || ').substring(0, 1500));
        return { flows: [], text: '' };
    },

    _close: function (p) { try { p.close(); } catch (e) {} },

    // Returns { flows, text }. `text` is a faithful pipe-delimited dump of the cashflow sheet
    // (header + data rows) — handed to the AI skill so the ATTACHMENT is read by the LLM too
    // (Chinou is text-only and can't ingest the binary .xlsx, so we give it the parsed grid; the
    // LLM still does the field extraction).
    _rows: function (parser, map, headers) {
        var flows = [], rows = [], hdr = [], MAXC = 30, MAXR = 60;
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
                rows.push({ cells: cells, dir: dir });
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
        if (addDir) { hdr.push('Direction'); }

        var lines = [hdr.join(' | ')];
        for (var r = 0; r < rows.length; r++) {
            var out = rows[r].cells;
            if (addDir) { out = out.concat([rows[r].dir || '']); }
            lines.push(out.join(' | '));
        }
        return { flows: flows, text: lines.join('\n').substring(0, 6000) };
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
