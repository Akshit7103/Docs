/**
 * DIAGNOSE THE CHINOU AUTHORIZATION FAILURE  -  read-only. Run once, Application = Global.
 *
 * WHAT HAPPENED
 *   Every model call on this instance is coming back as HTTP 200 with:
 *       LLMError: Service account 'svcnewsd' is not authorized for Registration ID 'AIUC00337'
 *   in 15-50ms. That is the gateway rejecting the request outright, not a slow or failed read. It
 *   makes every AI extraction return nothing, and because the body is a 200 the caller records it as
 *   'empty_response' - which looks exactly like "the model found nothing".
 *
 * WHY IT MATTERS BEYOND THIS
 *   The registration ID is an AI CoE compliance stamp that must be carried on every call. The ID in
 *   the error is AIUC00337. The ID recorded for this integration is AIUC00336. So either the client
 *   is sending the wrong one, or the service account's authorization has changed.
 *
 * THIS SCRIPT
 *   1. tests a plain TEXT call and a DOCUMENT call, so you know whether the outage is document-only
 *      or total;
 *   2. finds every place a registration ID is configured and prints it;
 *   3. shows the relevant properties.
 *
 *   It changes nothing, and it REDACTS anything token-shaped so no credential is printed.
 *
 * Pure ASCII. ES5.
 */
(function () {

    var out = [];
    function p(s) { out.push(s); }
    function pad(s, n) { s = '' + s; while (s.length < n) { s += ' '; } return s; }

    // never print a credential, even partially
    function redact(s) {
        s = '' + (s == null ? '' : s);
        s = s.replace(/(token|secret|password|authorization|bearer|apikey|api_key)([\"'\s:=]+)[^\s\"',;}]+/gi,
                      '$1$2<REDACTED>');
        return s;
    }

    p('=================================================================');
    p('CHINOU AUTHORIZATION DIAGNOSTIC   (read-only)');
    p('=================================================================');

    // ---------------------------------------------------------------- 1. how wide is the outage?
    p('');
    p('1. LIVE CALL TEST');

    var textOk = false, docOk = false;

    try {
        var t0 = new Date().getTime();
        var r1 = new global.ChinouClient().invoke('Reply with the single word OK and nothing else.');
        var ms1 = new Date().getTime() - t0;
        var body1 = '' + ((r1 && r1.response) || '');
        var err1 = '' + ((r1 && r1.error) || '');
        textOk = !!(r1 && r1.success && body1.replace(/^\s+|\s+$/g, '') !== '');
        p('   TEXT  invoke()          : ' + (textOk ? 'OK' : 'FAILED') + '   ' + ms1 + 'ms');
        p('      success=' + (r1 ? r1.success : 'null') + '  responseChars=' + body1.length);
        if (!textOk) { p('      error: ' + redact(err1 || body1).substring(0, 300)); }
        else { p('      response: ' + redact(body1).substring(0, 120)); }
    } catch (e1) {
        p('   TEXT  invoke()          : THREW  ' + redact('' + e1).substring(0, 200));
    }

    // a 1-page minimal PDF, built inline - no dependency on any mail
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
        var body2 = '' + ((r2 && r2.response) || '');
        var err2 = '' + ((r2 && r2.error) || '');
        docOk = !!(r2 && r2.success && body2.replace(/^\s+|\s+$/g, '') !== '');
        p('   DOC   invokeDocument()  : ' + (docOk ? 'OK' : 'FAILED') + '   ' + ms2 + 'ms');
        p('      success=' + (r2 ? r2.success : 'null') + '  responseChars=' + body2.length);
        if (!docOk) { p('      error: ' + redact(err2 || body2).substring(0, 300)); }
        else { p('      response: ' + redact(body2).substring(0, 120)); }
    } catch (e2) {
        p('   DOC   invokeDocument()  : THREW  ' + redact('' + e2).substring(0, 200));
    }

    p('');
    p('   READING:');
    if (!textOk && !docOk) {
        p('      TOTAL OUTAGE - every model call is rejected. No extraction of any kind can work,');
        p('      and any "0 rows" result recorded while this lasts is meaningless.');
    } else if (textOk && !docOk) {
        p('      DOCUMENT-ONLY - text calls work, document calls are rejected. PDFs cannot be read;');
        p('      body and spreadsheet extraction still can.');
    } else if (!textOk && docOk) {
        p('      TEXT-ONLY failure - unusual. Check the text path separately.');
    } else {
        p('      Both work NOW. The earlier rejection was transient or has been fixed since.');
    }

    // ---------------------------------------------------------------- 2. where is the reg id set?
    p('');
    p('2. WHERE THE REGISTRATION ID COMES FROM');

    var hits = 0;
    var si = new GlideRecord('sys_script_include');
    si.addQuery('name', 'ChinouClient');
    si.query();
    while (si.next()) {
        var scopeName = '' + si.getDisplayValue('sys_scope');
        var src = '' + (si.getValue('script') || '');
        p('');
        p('   ChinouClient in scope "' + scopeName + '"   ' + src.length + ' chars   sys_id ' + si.getUniqueValue());

        // every AIUC id mentioned in the source
        var ids = src.match(/AIUC\d{5}/g) || [];
        var uniq = [], seen = {};
        for (var i = 0; i < ids.length; i++) { if (!seen[ids[i]]) { seen[ids[i]] = 1; uniq.push(ids[i]); } }
        p('      registration IDs hard-coded here : ' + (uniq.length ? uniq.join(', ') : 'none'));

        // which property/config it reads the id from
        var props = src.match(/getProperty\(\s*['"][^'"]*(reg|registration)[^'"]*['"]/gi) || [];
        p('      read from a property             : ' + (props.length ? props.join(' | ') : 'no property lookup found'));

        // where the id is placed in the request - body vs query string matters
        var inParams = src.indexOf('parameters') > -1;
        var inQuery = /reg[_a-z]*id\s*=\s*/i.test(src) || src.indexOf('registrationId=') > -1;
        p('      mentions request parameters      : ' + inParams);
        p('      looks like a query-string param  : ' + inQuery);
        hits++;
    }
    if (!hits) { p('   !! no ChinouClient Script Include found on this instance.'); }

    // ---------------------------------------------------------------- 3. properties
    p('');
    p('3. RELATED PROPERTIES');
    var pr = new GlideRecord('sys_properties');
    pr.addEncodedQuery('nameLIKEchinou^ORnameLIKEreg_id^ORnameLIKEregistration');
    pr.orderBy('name');
    pr.query();
    var n = 0;
    while (pr.next()) {
        n++;
        var nm = '' + pr.getValue('name');
        var vl = '' + (pr.getValue('value') || '');
        var isSecret = /token|secret|password|key/i.test(nm);
        p('   ' + pad(nm, 46) + (isSecret ? '<REDACTED>' : redact(vl).substring(0, 60)));
    }
    if (!n) { p('   (none found)'); }

    p('');
    p('=================================================================');
    p('WHAT TO DO WITH THIS');
    p('   The registration ID in the rejection was AIUC00337. The ID on record for this integration');
    p('   is AIUC00336. If section 2 shows AIUC00337 hard-coded or in a property, that is the whole');
    p('   fault and it is a one-value fix.');
    p('');
    p('   If it shows AIUC00336 instead, then the client is correct and the SERVICE ACCOUNT lost its');
    p('   authorization - that is a question for the AI CoE, not a code change.');
    p('');
    p('   Either way: no extraction result recorded while this is failing means anything. Re-run the');
    p('   PDF ablation only after a live call succeeds.');
    p('=================================================================');
    gs.info('\n' + out.join('\n'));
})();
