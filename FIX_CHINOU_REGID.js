/**
 * FIX THE CHINOU AUTHORIZATION OUTAGE  -  run once, Application = Global.
 *
 * THE FAULT (measured, not assumed)
 *   Every model call on this instance - text AND document - returns HTTP 200 in ~15-50ms with:
 *       LLMError: Service account 'svcnewsd' is not authorized for Registration ID 'AIUC00337'
 *
 *   The Global ChinouClient reads its registration ID from the system property `chinou.reg.id`,
 *   which currently holds AIUC00337. The service account is authorized for AIUC00336 - the value
 *   still held by the GMET application's own property `x_nose_gmet_app.chinou.reg_id`.
 *
 *   So this is one wrong property value, and it takes out ALL AI extraction, not just PDFs. Because
 *   the gateway answers 200 with the error in the BODY, callers record it as 'empty_response', which
 *   is indistinguishable from "the model found nothing" - which is why it looked like an extraction
 *   problem rather than an outage.
 *
 * WHAT THIS DOES
 *   1. prints the current value and the one it is about to set;
 *   2. sets `chinou.reg.id` to AIUC00336;
 *   3. makes a LIVE call to prove the fix, and reports pass or fail.
 *
 * IT DOES NOT touch the hard-coded fallback inside the Global ChinouClient, which is also AIUC00337.
 * That is a code change in a Global script shared by every application, so it is called out at the
 * end rather than done silently here. Until it is corrected, any environment WITHOUT the property
 * set will break the same way.
 *
 * ROLLBACK: set `chinou.reg.id` back to AIUC00337 - the old value is printed below before the change.
 *
 * Pure ASCII. ES5.
 */
(function () {

    var PROP = 'chinou.reg.id';
    var WANT = 'AIUC00336';

    var out = [];
    function p(s) { out.push(s); }

    p('=================================================================');
    p('FIX CHINOU REGISTRATION ID');
    p('=================================================================');

    var here = '' + gs.getCurrentScopeName();
    if (here !== 'global' && here !== 'rhino.global') {
        p('!! WRONG SCOPE. Current = "' + here + '", needs Global. Nothing changed.');
        gs.info('\n' + out.join('\n'));
        return;
    }

    // ---------------------------------------------------------------- before
    var gr = new GlideRecord('sys_properties');
    gr.addQuery('name', PROP);
    gr.setLimit(1);
    gr.query();

    var had = gr.next();
    var before = had ? ('' + (gr.getValue('value') || '')) : '(property does not exist)';
    p('');
    p('property   : ' + PROP);
    p('before     : ' + before);
    p('after      : ' + WANT);
    p('');
    p('ROLLBACK   : set ' + PROP + ' back to "' + before + '"');

    if (had && before === WANT) {
        p('');
        p('Already set to ' + WANT + ' - no change made. Skipping to the live test.');
    } else if (had) {
        gr.setValue('value', WANT);
        gr.update();
        p('');
        p('UPDATED.');
    } else {
        var np = new GlideRecord('sys_properties');
        np.initialize();
        np.setValue('name', PROP);
        np.setValue('value', WANT);
        np.setValue('type', 'string');
        np.setValue('description',
            'AI CoE Registration ID stamped on every Chinou call. The service account svcnewsd is ' +
            'authorized for this ID. A wrong value here makes EVERY model call fail with a 200 whose ' +
            'body carries an LLMError, which callers record as an empty response.');
        p('');
        p(np.insert() ? 'CREATED.' : '!! create FAILED');
    }

    // ---------------------------------------------------------------- prove it
    p('');
    p('LIVE TEST');

    var textOk = false, docOk = false;

    try {
        var t0 = new Date().getTime();
        var r1 = new global.ChinouClient().invoke('Reply with the single word OK and nothing else.');
        var ms1 = new Date().getTime() - t0;
        var b1 = '' + ((r1 && r1.response) || '');
        textOk = !!(r1 && r1.success && b1.replace(/^\s+|\s+$/g, '') !== '');
        p('   TEXT  invoke()         : ' + (textOk ? 'OK' : 'STILL FAILING') + '   ' + ms1 + 'ms');
        if (!textOk) { p('      ' + ('' + ((r1 && r1.error) || b1)).substring(0, 240)); }
        else { p('      response: ' + b1.substring(0, 80)); }
    } catch (e1) {
        p('   TEXT  invoke()         : THREW ' + ('' + e1).substring(0, 200));
    }

    var TINY_PDF_B64 =
        'JVBERi0xLjQKMSAwIG9iago8PC9UeXBlL0NhdGFsb2cvUGFnZXMgMiAwIFI+PgplbmRvYmoKMiAw' +
        'IG9iago8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PgplbmRvYmoKMyAwIG9iago8' +
        'PC9UeXBlL1BhZ2UvUGFyZW50IDIgMCBSL01lZGlhQm94WzAgMCAyMDAgMTAwXS9SZXNvdXJjZXM8' +
        'PC9Gb250PDwvRjEgNCAwIFI+Pj4+L0NvbnRlbnRzIDUgMCBSPj4KZW5kb2JqCjQgMCBvYmoKPDwv' +
        'VHlwZS9Gb250L1N1YnR5cGUvVHlwZTEvQmFzZUZvbnQvSGVsdmV0aWNhPj4KZW5kb2JqCjUgMCBv' +
        'YmoKPDwvTGVuZ3RoIDQ0Pj4Kc3RyZWFtCkJUIC9GMSAxOCBUZiAyMCA0MCBUZCAoSEVMTE8gMTIz' +
        'NCkgVGogRVQKZW5kc3RyZWFtCmVuZG9iagp0cmFpbGVyCjw8L1Jvb3QgMSAwIFI+Pgo=';

    try {
        var t1 = new Date().getTime();
        var r2 = new global.ChinouClient().invokeDocument(
            TINY_PDF_B64, 'Reply with the text you can see in this document, nothing else.',
            'probe.pdf', 'anthropic-5-sonnet[Bedrock]', 512);
        var ms2 = new Date().getTime() - t1;
        var b2 = '' + ((r2 && r2.response) || '');
        docOk = !!(r2 && r2.success && b2.replace(/^\s+|\s+$/g, '') !== '');
        p('   DOC   invokeDocument() : ' + (docOk ? 'OK' : 'STILL FAILING') + '   ' + ms2 + 'ms');
        if (!docOk) { p('      ' + ('' + ((r2 && r2.error) || b2)).substring(0, 240)); }
        else { p('      response: ' + b2.substring(0, 80) + '   (the probe PDF contains HELLO 1234)'); }
    } catch (e2) {
        p('   DOC   invokeDocument() : THREW ' + ('' + e2).substring(0, 200));
    }

    // ---------------------------------------------------------------- verdict
    p('');
    p('=================================================================');
    if (textOk && docOk) {
        p('FIXED. Both call types work again.');
        p('');
        p('NEXT, in this order:');
        p('   1. Re-run the PDF ablation. Every result it produced before this moment is void -');
        p('      it was measuring an authorization rejection, not a document.');
        p('   2. Re-check the mails currently counted as "extracted nothing". Some may simply have');
        p('      been processed DURING this outage, in which case they are not extraction failures');
        p('      at all and a re-sync will clear them.');
        p('   3. Correct the hard-coded AIUC00337 fallback in the Global ChinouClient');
        p('      (sys_script_include, scope Global) so a missing property cannot cause this again.');
    } else if (textOk || docOk) {
        p('PARTIAL - one call type works, the other does not. Read the two lines above; this is no');
        p('longer a registration-ID problem alone.');
    } else {
        p('STILL FAILING after the change.');
        p('');
        p('If the error still names AIUC00337, the client is not reading this property - check the');
        p('hard-coded fallback in the Global ChinouClient.');
        p('If it now names AIUC00336, then svcnewsd is not authorized for EITHER id, and this is a');
        p('question for the AI CoE rather than a configuration change. Quote the confluence link in');
        p('the error when raising it.');
    }
    p('=================================================================');
    gs.info('\n' + out.join('\n'));
})();
