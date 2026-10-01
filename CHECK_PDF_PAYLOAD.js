/**
 * IS THE PDF WE SEND ACTUALLY INTACT?  -  read-only. Application = NexAI OTC Test.
 *
 * WHY THIS, NOW
 *   The ablation showed that even a bare "transcribe this document" prompt - no field spec at all -
 *   comes back as an empty 200 for these mails. So the field definitions are NOT the cause.
 *
 *   But "the gateway cannot read this document" is not the only explanation, and the timings point
 *   elsewhere: the gateway answered in 114-708ms while the whole call took 12-37s. A fast empty
 *   answer is what you get when the payload is REJECTED, not when a document is hard to read.
 *
 *   So before blaming the gateway: is the base64 we hand it a valid, complete PDF?
 *
 *   There is a specific reason to doubt it. These mails carry a STALE X-Original-Content-Type
 *   boundary that differs from the real Content-Type boundary. _findAllPdfParts harvests EVERY
 *   boundary string it can see and splits the raw mail on each one in turn. Split on the wrong
 *   boundary and the "part" is truncated or polluted - and because the code then strips every
 *   non-base64 character, the damage is silent: what comes out still looks like clean base64.
 *
 * WHAT IT CHECKS, per mail
 *   For the PDF taken from the ATTACHMENT record (trustworthy) and the one scraped from the raw
 *   .eml MIME (suspect), independently:
 *     - decoded byte length,
 *     - the %PDF- header,
 *     - the %%EOF trailer - a truncated PDF is missing this, which is the whole point,
 *     - base64 length divisible by 4,
 *     - and whether the two sources AGREE.
 *   Then it reports which one findAllPdfs - the live code path - actually selected.
 *
 * Changes nothing. Makes no model calls. Pure ASCII. ES5.
 */
(function () {

    var SCOPE = 'x_nose_nexai_test';

    var WANT = [
        'payment notice nomura international plc jul-30-2026',
        'gs settlement for value date 2026-08-19  gs ref num 215512496',
        'otc derivative confirmation sdbb4qn33349cd99qq.0.0.0.1',
        'rebate  tdcctrade date 812',
        'irs-payment val. 15.05.26'
    ];

    var out = [];
    function p(s) { out.push(s); }
    function pad(s, n) { s = '' + s; while (s.length < n) { s += ' '; } return s; }

    p('=================================================================');
    p('PDF PAYLOAD INTEGRITY   scope ' + SCOPE);
    p('=================================================================');

    var here = '' + gs.getCurrentScopeName();
    if (here !== SCOPE) {
        p('!! WRONG SCOPE. Current = "' + here + '", needs "' + SCOPE + '". Nothing run.');
        gs.info('\n' + out.join('\n'));
        return;
    }

    var pdfx = new PdfCashflowExtractor();

    // --------------------------------------------------------------- helpers
    function b64Info(b64, label) {
        var r = { label: label, b64len: 0, bytes: 0, header: '', tail: '', eof: false, mod4: false, ok: false };
        b64 = '' + (b64 || '');
        r.b64len = b64.length;
        if (!b64.length) { return r; }
        r.mod4 = (b64.length % 4) === 0;
        var dec = '';
        try {
            dec = '' + GlideStringUtil.base64Decode(b64);
        } catch (e) {
            try { dec = '' + gs.base64Decode(b64); } catch (e2) { dec = ''; }
        }
        r.bytes = dec.length;
        r.header = dec.substring(0, 8);
        r.tail = dec.substring(Math.max(0, dec.length - 24));
        r.eof = dec.indexOf('%%EOF') > -1;
        r.ok = (r.header.indexOf('%PDF-') === 0) && r.eof && r.mod4;
        return r;
    }

    function show(info) {
        p('      ' + pad(info.label, 22) +
          'b64 ' + pad(info.b64len, 9) +
          'bytes ' + pad(info.bytes, 9) +
          'hdr "' + info.header.replace(/[^\x20-\x7e]/g, '.') + '"  ' +
          '%%EOF ' + pad(info.eof ? 'yes' : 'NO', 5) +
          'mod4 ' + pad(info.mod4 ? 'yes' : 'NO', 5) +
          (info.ok ? 'VALID' : '*** SUSPECT ***'));
        if (!info.eof && info.bytes) {
            p('         tail: "' + info.tail.replace(/[^\x20-\x7e]/g, '.') + '"   <- a complete PDF ends with %%EOF');
        }
    }

    var verdicts = [];

    for (var w = 0; w < WANT.length; w++) {
        var frag = WANT[w];

        var e = new GlideRecord(SCOPE + '_email');
        e.query();
        var em = null;
        while (e.next()) {
            if (('' + (e.getValue('name') || '')).toLowerCase().indexOf(frag) > -1) {
                em = { id: e.getUniqueValue(), name: '' + e.getValue('name') };
                break;
            }
        }
        if (!em) { p(''); p('(not found) ' + frag); continue; }

        p('');
        p('-----------------------------------------------------------------');
        p(em.name.substring(0, 70));
        p('-----------------------------------------------------------------');

        // ---- source A: the attachment records on the mail
        var attInfos = [], emlAtt = '';
        var a = new GlideRecord('sys_attachment');
        a.addQuery('table_name', SCOPE + '_email');
        a.addQuery('table_sys_id', em.id);
        a.orderBy('sys_created_on');
        a.query();
        p('   attachments on the record:');
        while (a.next()) {
            var fn = '' + (a.getValue('file_name') || '');
            var ct = ('' + (a.getValue('content_type') || '')).toLowerCase();
            var sz = a.getValue('size_bytes');
            p('      ' + pad(fn.substring(0, 46), 48) + pad(ct.substring(0, 24), 26) + sz + ' bytes');
            if (ct === 'message/rfc822' || fn.toLowerCase().substring(fn.length - 4) === '.eml') {
                emlAtt = a.getUniqueValue();
            }
            if (ct === 'application/pdf' || /\.pdf$/i.test(fn)) {
                var ab = '';
                try { ab = ('' + (new GlideSysAttachment().getContentBase64(a) || '')).replace(/\s+/g, ''); }
                catch (eA) { ab = ''; }
                attInfos.push(b64Info(ab, 'ATTACHMENT'));
            }
        }

        // ---- source B: scraped out of the raw .eml by the live code
        var partInfos = [];
        if (emlAtt) {
            var raw = '';
            try { raw = '' + (pdfx._readText(emlAtt) || ''); } catch (eR) { raw = ''; }
            if (raw) {
                var boundaries = [];
                raw.replace(/boundary="?([^";\r\n]+)"?/gi, function (_m, b) {
                    if (boundaries.indexOf(b) < 0) { boundaries.push(b); }
                    return _m;
                });
                p('   MIME boundaries declared in the raw mail : ' + boundaries.length);
                for (var bi = 0; bi < boundaries.length; bi++) {
                    p('      [' + bi + '] ' + boundaries[bi].substring(0, 60));
                }
                if (boundaries.length > 1) {
                    p('      ^ more than one. _findAllPdfParts splits on EVERY one of these in turn,');
                    p('        so a stale boundary can produce a truncated or polluted part.');
                }
                var parts = [];
                try { parts = pdfx._findAllPdfParts(raw) || []; } catch (eP) { parts = []; }
                for (var q = 0; q < parts.length; q++) {
                    partInfos.push(b64Info(parts[q].base64, 'MIME PART ' + (q + 1)));
                }
            }
        } else {
            p('   (no .eml attachment on this record - nothing to scrape)');
        }

        // ---- what the live path actually hands to the gateway
        var live = [];
        try { live = pdfx.findAllPdfs(emlAtt, em.id) || []; } catch (eL) { live = []; }

        p('');
        p('   INTEGRITY');
        var i;
        for (i = 0; i < attInfos.length; i++) { show(attInfos[i]); }
        for (i = 0; i < partInfos.length; i++) { show(partInfos[i]); }
        if (!attInfos.length && !partInfos.length) { p('      (no PDF found by either route)'); }

        for (i = 0; i < live.length; i++) {
            var li = b64Info(live[i].base64, 'SENT (findAllPdfs)');
            show(li);
            verdicts.push({ mail: em.name, info: li, filename: live[i].filename });
        }

        // ---- do the two sources agree?
        if (attInfos.length && partInfos.length) {
            var same = (attInfos[0].bytes === partInfos[0].bytes);
            p('');
            p('   attachment vs MIME-scraped : ' +
              (same ? 'same length - consistent'
                    : 'DIFFERENT (' + attInfos[0].bytes + ' vs ' + partInfos[0].bytes +
                      ' bytes) <- one of them is wrong'));
        }
    }

    // --------------------------------------------------------------- verdict
    p('');
    p('=================================================================');
    p('WHAT THIS MEANS');
    var bad = 0, good = 0;
    for (var v = 0; v < verdicts.length; v++) {
        if (verdicts[v].info.ok) { good++; } else { bad++; }
    }
    p('   PDFs the live path would send : ' + verdicts.length +
      '   valid ' + good + '   suspect ' + bad);
    p('');
    if (bad > 0) {
        p('   AT LEAST ONE PAYLOAD IS MALFORMED. That is very likely the whole fault: a truncated or');
        p('   polluted PDF is rejected by the gateway in milliseconds and returns an empty 200 - which');
        p('   is exactly the signature we measured (roundTrip 114-708ms, empty body).');
        p('   This is OUR bug, in the MIME part extraction, not the model and not the document.');
    } else if (verdicts.length) {
        p('   EVERY PAYLOAD IS A COMPLETE, VALID PDF. So we are sending a good document and the');
        p('   gateway is returning nothing for it. That moves the fault to the gateway document');
        p('   handler - ask whether it rejects these PDFs (encryption flags, fonts, producer), and');
        p('   test the same file against the dedicated document-parser endpoint.');
    } else {
        p('   No PDFs were resolved at all - check the attachment list above first.');
    }
    p('=================================================================');
    gs.info('\n' + out.join('\n'));
})();
