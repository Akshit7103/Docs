/**
 * TEST CHINOU AGAINST BOTH REGISTRATION IDs  -  run once, Application = Global.
 *
 * Sets `chinou.reg.id` to each ID in turn, makes a TEXT call and a DOCUMENT call on each, and
 * ALWAYS puts the original value back - including if a call throws.
 *
 *   AIUC00336   the ID in the AI CoE mandate, and the value held by the GMET app's own property
 *   AIUC00337   the value currently in chinou.reg.id, and the hard-coded fallback in ChinouClient
 *
 * 4 calls, about 10 seconds.
 *
 * WHY BOTH IN ONE RUN
 *   Testing them separately leaves room for "it was transient". Back to back, with the property
 *   restored afterwards, the result is a clean comparison you can paste into a ticket.
 *
 * HOW TO READ IT
 *   one ID works                 -> set chinou.reg.id to that one and the outage is over.
 *   both refused, same message   -> svcnewsd is blocked at the ACCOUNT level, not per ID. No
 *                                   configuration change can fix it; it needs the AI CoE.
 *   both refused, different text -> read the two messages; the difference is the clue.
 *
 * NOTE the gateway answers HTTP 200 and puts failures in the BODY as an LLMError, so 200 does not
 * mean success. The script reads success + error, not the status code.
 *
 * Credentials are never printed. The property is restored at the end and the restore is verified.
 *
 * Pure ASCII. ES5.
 */
(function () {

    var PROP = 'chinou.reg.id';
    var IDS = ['AIUC00336', 'AIUC00337'];

    // Optional control: a deliberately unregistered ID, to see whether the gateway distinguishes
    // "unknown ID" from "this account is not authorized". Left OFF by default because the reg ID is
    // an AI CoE compliance stamp and sending a fabricated one shows up in their governance logs.
    // Turn it on only if the CoE asks what an unknown ID returns.
    var TEST_BOGUS = false;

    var out = [];
    function p(s) { out.push(s); }
    function pad(s, n) { s = '' + s; while (s.length < n) { s += ' '; } return s; }
    function redact(s) {
        return ('' + (s == null ? '' : s)).replace(
            /(token|secret|password|authorization|bearer|apikey|api_key)([\"'\s:=]+)[^\s\"',;}]+/gi,
            '$1$2<REDACTED>');
    }

    var TINY_PDF_B64 =
        'JVBERi0xLjQKMSAwIG9iago8PC9UeXBlL0NhdGFsb2cvUGFnZXMgMiAwIFI+PgplbmRvYmoKMiAw' +
        'IG9iago8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PgplbmRvYmoKMyAwIG9iago8' +
        'PC9UeXBlL1BhZ2UvUGFyZW50IDIgMCBSL01lZGlhQm94WzAgMCAyMDAgMTAwXS9SZXNvdXJjZXM8' +
        'PC9Gb250PDwvRjEgNCAwIFI+Pj4+L0NvbnRlbnRzIDUgMCBSPj4KZW5kb2JqCjQgMCBvYmoKPDwv' +
        'VHlwZS9Gb250L1N1YnR5cGUvVHlwZTEvQmFzZUZvbnQvSGVsdmV0aWNhPj4KZW5kb2JqCjUgMCBv' +
        'YmoKPDwvTGVuZ3RoIDQ0Pj4Kc3RyZWFtCkJUIC9GMSAxOCBUZiAyMCA0MCBUZCAoSEVMTE8gMTIz' +
        'NCkgVGogRVQKZW5kc3RyZWFtCmVuZG9iagp0cmFpbGVyCjw8L1Jvb3QgMSAwIFI+Pgo=';

    p('=================================================================');
    p('CHINOU - TEST BOTH REGISTRATION IDs');
    p('=================================================================');

    var here = '' + gs.getCurrentScopeName();
    if (here !== 'global' && here !== 'rhino.global') {
        p('!! WRONG SCOPE. Current = "' + here + '", needs Global. Nothing run, nothing changed.');
        gs.info('\n' + out.join('\n'));
        return;
    }

    // ---------------------------------------------------------------- remember the original
    var gr = new GlideRecord('sys_properties');
    gr.addQuery('name', PROP);
    gr.setLimit(1);
    gr.query();
    if (!gr.next()) {
        p('!! property ' + PROP + ' does not exist - cannot test by switching it. Nothing changed.');
        gs.info('\n' + out.join('\n'));
        return;
    }
    var ORIGINAL = '' + (gr.getValue('value') || '');
    var propSysId = gr.getUniqueValue();
    p('');
    p('original ' + PROP + ' = ' + ORIGINAL + '   (restored at the end, whatever happens)');

    function setProp(v) {
        var w = new GlideRecord('sys_properties');
        if (!w.get(propSysId)) { return false; }
        w.setValue('value', v);
        w.update();
        return ('' + gs.getProperty(PROP, '')) === v;   // what the CLIENT will actually read
    }

    function callText() {
        var t0 = new Date().getTime(), r = null, thrown = '';
        try { r = new global.ChinouClient().invoke('Reply with the single word OK and nothing else.'); }
        catch (e) { thrown = '' + e; }
        return { ms: new Date().getTime() - t0, r: r, thrown: thrown };
    }
    function callDoc() {
        var t0 = new Date().getTime(), r = null, thrown = '';
        try {
            r = new global.ChinouClient().invokeDocument(
                TINY_PDF_B64, 'Reply with the text you can see in this document, nothing else.',
                'probe.pdf', gs.getProperty('chinou.model.id', 'anthropic-5-sonnet[Bedrock]'), 512);
        } catch (e) { thrown = '' + e; }
        return { ms: new Date().getTime() - t0, r: r, thrown: thrown };
    }

    function outcome(res) {
        if (res.thrown) { return { word: 'THREW', detail: redact(res.thrown).substring(0, 220) }; }
        var r = res.r;
        if (!r) { return { word: 'NO-RESPONSE', detail: '' }; }
        var body = '' + (r.response || '');
        var err = '' + (r.error || '');
        if (r.success && body.replace(/^\s+|\s+$/g, '') !== '') {
            return { word: 'OK', detail: redact(body).substring(0, 160) };
        }
        var both = err + ' ' + body;
        if (both.indexOf('not authorized') > -1) {
            return { word: 'REFUSED', detail: redact(err || body).substring(0, 220) };
        }
        if (both.indexOf('LLMError') > -1) { return { word: 'LLMERROR', detail: redact(err || body).substring(0, 220) }; }
        if (body.replace(/^\s+|\s+$/g, '') === '') {
            return { word: 'EMPTY', detail: 'success=' + r.success + ' status=' + r.status + ' err=' + redact(err).substring(0, 180) };
        }
        return { word: 'UNCLEAR', detail: redact(err || body).substring(0, 220) };
    }

    var list = IDS.slice(0);
    if (TEST_BOGUS) { list.push('AIUC99999'); }

    var rows = [];

    // ---------------------------------------------------------------- the matrix, then ALWAYS restore
    try {
        for (var i = 0; i < list.length; i++) {
            var id = list[i];
            var applied = setProp(id);
            p('');
            p('-----------------------------------------------------------------');
            p('REGISTRATION ID : ' + id + (applied ? '' : '   !! the property did not take - results below are unreliable'));
            p('-----------------------------------------------------------------');

            var tx = callText();
            var ot = outcome(tx);
            p('   TEXT  invoke()         : ' + pad(ot.word, 12) + tx.ms + 'ms');
            if (ot.detail) { p('      ' + ot.detail); }

            var dc = callDoc();
            var od = outcome(dc);
            p('   DOC   invokeDocument() : ' + pad(od.word, 12) + dc.ms + 'ms');
            if (od.detail) { p('      ' + od.detail); }
            if (od.word === 'OK' && ('' + (dc.r.response || '')).indexOf('HELLO 1234') > -1) {
                p('      ^ contains HELLO 1234 - the document was genuinely read.');
            }

            rows.push({ id: id, applied: applied, text: ot, doc: od, tms: tx.ms, dms: dc.ms,
                        terr: ot.detail, derr: od.detail });
        }
    } finally {
        // runs even if a call throws - the instance must not be left on a test value
        var ok = setProp(ORIGINAL);
        p('');
        p('-----------------------------------------------------------------');
        p('RESTORED ' + PROP + ' = ' + gs.getProperty(PROP, '(gone)') +
          (ok ? '   (verified)' : '   !! RESTORE FAILED - set it back to ' + ORIGINAL + ' by hand'));
        p('-----------------------------------------------------------------');
    }

    // ---------------------------------------------------------------- the comparison
    p('');
    p('RESULTS');
    p('   ' + pad('registration id', 18) + pad('text', 14) + pad('ms', 7) + pad('document', 14) + 'ms');
    p('   ' + pad('---------------', 18) + pad('----', 14) + pad('--', 7) + pad('--------', 14) + '--');
    var anyOk = false, allRefused = true, msgs = {};
    for (i = 0; i < rows.length; i++) {
        var r2 = rows[i];
        p('   ' + pad(r2.id, 18) + pad(r2.text.word, 14) + pad(r2.tms, 7) + pad(r2.doc.word, 14) + r2.dms);
        if (r2.text.word === 'OK' || r2.doc.word === 'OK') { anyOk = true; }
        if (r2.text.word !== 'REFUSED' || r2.doc.word !== 'REFUSED') { allRefused = false; }
        msgs[r2.id] = r2.terr;
    }

    p('');
    p('VERDICT');
    if (anyOk) {
        p('   AT LEAST ONE ID WORKS. Set ' + PROP + ' to the one marked OK above and the outage');
        p('   is over. Re-run any extraction that produced nothing while it was broken.');
    } else if (allRefused) {
        var same = true, first = null;
        for (var k in msgs) {
            if (!msgs.hasOwnProperty(k)) { continue; }
            if (first === null) { first = msgs[k]; }
            else if (msgs[k] !== first) { same = false; }
        }
        p('   BOTH IDs REFUSED' + (same ? ', with the SAME message.' : ', with DIFFERENT messages - compare them above.'));
        if (same) {
            p('');
            p('   That is an ACCOUNT-level block on svcnewsd, not a wrong value. No configuration');
            p('   change on this instance can fix it - it needs the AI CoE to authorize the account.');
            p('');
            p('   Send them this:');
            p('     Service account svcnewsd is refused on every Chinou call from nomurabsmdev');
            p('     (MID ' + gs.getProperty('x_nose_gmet_app.chinou.mid_server', '(see properties)') + ').');
            p('     Tested back to back against ' + IDS.join(' and ') + ', on text and document calls:');
            p('     all four refused with "not authorized for Registration ID", HTTP 200.');
            p('     Which registration ID is this account authorized for, and is it still active?');
        }
    } else {
        p('   Mixed or unexpected results - read the per-ID detail above before concluding.');
    }
    p('');
    p('   Reminder: HTTP 200 here does NOT mean success. This gateway returns 200 and puts the');
    p('   failure in the body, which is why a refusal is recorded as an empty extraction.');
    p('=================================================================');
    gs.info('\n' + out.join('\n'));
})();
