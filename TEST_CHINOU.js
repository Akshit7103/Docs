/**
 * CHINOU CONNECTIVITY TEST  -  read-only. Run any time, Application = Global.
 *
 * Shows exactly what the gateway returns for each call type, with the real codes rather than a
 * summarised "it failed":
 *
 *   - the HTTP status the transport reported,
 *   - EVERY property on the client's response object, so nothing is hidden behind a wrapper,
 *   - the raw body, which is where this gateway puts its errors,
 *   - round-trip milliseconds,
 *   - the config actually in use (endpoint, MID, model, registration ID).
 *
 * WHY THE CODE ALONE MISLEADS HERE
 *   This gateway answers HTTP 200 and puts the failure in the BODY as an LLMError. So "status 200"
 *   does not mean success, and a caller that only checks the status records a refusal as an empty
 *   answer. Read the body line, not the status line.
 *
 * HOW TO READ THE OUTCOME
 *   200 + a real answer          working.
 *   200 + LLMError not authorized the account or registration ID is refused - an AI CoE matter.
 *   200 + LLMError other          the gateway or the model behind it, not this instance.
 *   401 / 403                     the credential.
 *   404                           the endpoint PATH is wrong - usually a lost path segment.
 *   504 / timeout                 the backend is down.
 *   host resolution failure       the call went direct instead of through the MID server.
 *
 * Credentials are redacted. Changes nothing.
 *
 * Pure ASCII. ES5.
 */
(function () {

    var out = [];
    function p(s) { out.push(s); }
    function pad(s, n) { s = '' + s; while (s.length < n) { s += ' '; } return s; }

    function redact(s) {
        s = '' + (s == null ? '' : s);
        return s.replace(
            /(token|secret|password|authorization|bearer|apikey|api_key|auth)([\"'\s:=]+)[^\s\"',;}]+/gi,
            '$1$2<REDACTED>');
    }

    // print every own property of whatever the client hands back - no assumptions about its shape
    function dump(label, obj) {
        if (obj === null || obj === undefined) { p('      ' + label + ' : (null)'); return; }
        if (typeof obj !== 'object') { p('      ' + label + ' : ' + redact('' + obj)); return; }
        var keys = [], k;
        for (k in obj) { if (obj.hasOwnProperty(k)) { keys.push(k); } }
        keys.sort();
        if (!keys.length) { p('      ' + label + ' : (object with no own properties)'); return; }
        for (var i = 0; i < keys.length; i++) {
            var v = obj[keys[i]];
            var t = typeof v;
            if (t === 'function') { continue; }
            var shown;
            if (v === null || v === undefined) { shown = '(null)'; }
            else if (t === 'object') { shown = '(object)'; }
            else {
                shown = redact('' + v);
                if (shown.length > 320) { shown = shown.substring(0, 320) + ' ...[' + ('' + v).length + ' chars]'; }
            }
            p('      ' + pad(keys[i], 18) + ' = ' + shown);
        }
    }

    p('=================================================================');
    p('CHINOU CONNECTIVITY TEST');
    p('=================================================================');

    // ---------------------------------------------------------------- config in use
    p('');
    p('CONFIG IN USE');
    var cfgKeys = ['chinou.reg.id', 'chinou.model.id', 'chinou.endpoint', 'chinou.rest_endpoint',
                   'chinou.mid_server', 'chinou.midserver', 'chinou.url', 'chinou.timeout'];
    for (var c = 0; c < cfgKeys.length; c++) {
        var v = gs.getProperty(cfgKeys[c], '');
        if (v === '' || v === null) { continue; }
        var secret = /token|secret|password|key|auth/i.test(cfgKeys[c]);
        p('   ' + pad(cfgKeys[c], 26) + (secret ? '<REDACTED>' : redact('' + v)));
    }
    var pr = new GlideRecord('sys_properties');
    pr.addEncodedQuery('nameLIKEchinou');
    pr.orderBy('name');
    pr.query();
    p('');
    p('   all chinou.* properties on the instance:');
    while (pr.next()) {
        var nm = '' + pr.getValue('name');
        var vl = '' + (pr.getValue('value') || '');
        var isSecret = /token|secret|password|key|auth/i.test(nm);
        p('      ' + pad(nm, 40) + (isSecret ? '<REDACTED>' : redact(vl).substring(0, 70)));
    }

    // ---------------------------------------------------------------- 1. text call
    p('');
    p('-----------------------------------------------------------------');
    p('TEST 1  invoke()   - plain text');
    p('-----------------------------------------------------------------');
    var t0 = new Date().getTime(), r1 = null, thrown1 = '';
    try {
        r1 = new global.ChinouClient().invoke('Reply with the single word OK and nothing else.');
    } catch (e1) { thrown1 = '' + e1; }
    var ms1 = new Date().getTime() - t0;
    p('   elapsed : ' + ms1 + 'ms');
    if (thrown1) {
        p('   THREW   : ' + redact(thrown1).substring(0, 400));
    } else {
        p('   response object:');
        dump('response', r1);
        var b1 = '' + ((r1 && r1.response) || '');
        p('');
        p('   BODY (this is where the real error lives):');
        p('      ' + (b1 ? redact(b1).substring(0, 600) : '(empty)'));
    }

    // ---------------------------------------------------------------- 2. document call
    var TINY_PDF_B64 =
        'JVBERi0xLjQKMSAwIG9iago8PC9UeXBlL0NhdGFsb2cvUGFnZXMgMiAwIFI+PgplbmRvYmoKMiAw' +
        'IG9iago8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PgplbmRvYmoKMyAwIG9iago8' +
        'PC9UeXBlL1BhZ2UvUGFyZW50IDIgMCBSL01lZGlhQm94WzAgMCAyMDAgMTAwXS9SZXNvdXJjZXM8' +
        'PC9Gb250PDwvRjEgNCAwIFI+Pj4+L0NvbnRlbnRzIDUgMCBSPj4KZW5kb2JqCjQgMCBvYmoKPDwv' +
        'VHlwZS9Gb250L1N1YnR5cGUvVHlwZTEvQmFzZUZvbnQvSGVsdmV0aWNhPj4KZW5kb2JqCjUgMCBv' +
        'YmoKPDwvTGVuZ3RoIDQ0Pj4Kc3RyZWFtCkJUIC9GMSAxOCBUZiAyMCA0MCBUZCAoSEVMTE8gMTIz' +
        'NCkgVGogRVQKZW5kc3RyZWFtCmVuZG9iagp0cmFpbGVyCjw8L1Jvb3QgMSAwIFI+Pgo=';

    p('');
    p('-----------------------------------------------------------------');
    p('TEST 2  invokeDocument()   - a 392-byte PDF containing the text HELLO 1234');
    p('-----------------------------------------------------------------');
    var t1 = new Date().getTime(), r2 = null, thrown2 = '';
    try {
        r2 = new global.ChinouClient().invokeDocument(
            TINY_PDF_B64, 'Reply with the text you can see in this document, nothing else.',
            'probe.pdf', gs.getProperty('chinou.model.id', 'anthropic-5-sonnet[Bedrock]'), 512);
    } catch (e2) { thrown2 = '' + e2; }
    var ms2 = new Date().getTime() - t1;
    p('   elapsed : ' + ms2 + 'ms');
    if (thrown2) {
        p('   THREW   : ' + redact(thrown2).substring(0, 400));
    } else {
        p('   response object:');
        dump('response', r2);
        var b2 = '' + ((r2 && r2.response) || '');
        p('');
        p('   BODY:');
        p('      ' + (b2 ? redact(b2).substring(0, 600) : '(empty)'));
        if (b2.indexOf('HELLO 1234') > -1) {
            p('      ^ contains HELLO 1234 - the document was genuinely read.');
        }
    }

    // ---------------------------------------------------------------- summary
    function verdict(r, thrown, body) {
        if (thrown) { return 'THREW - transport level'; }
        if (!r) { return 'no response object'; }
        var b = '' + (body || '');
        if (r.success && b.replace(/^\s+|\s+$/g, '') !== '') { return 'OK'; }
        if (b.indexOf('not authorized') > -1 || ('' + (r.error || '')).indexOf('not authorized') > -1) {
            return 'REFUSED - account / registration ID (AI CoE)';
        }
        if (('' + (r.error || '') + b).indexOf('LLMError') > -1) { return 'LLMError - gateway or model side'; }
        if (b.replace(/^\s+|\s+$/g, '') === '') { return 'EMPTY BODY with success=' + r.success; }
        return 'unclear - read the dump above';
    }

    p('');
    p('=================================================================');
    p('SUMMARY');
    p('   ' + pad('call', 20) + pad('ms', 8) + 'outcome');
    p('   ' + pad('invoke() text', 20) + pad(ms1, 8) +
      verdict(r1, thrown1, r1 && r1.response));
    p('   ' + pad('invokeDocument()', 20) + pad(ms2, 8) +
      verdict(r2, thrown2, r2 && r2.response));
    p('');
    p('   The transport status appears in the lines the client logs above this output, as');
    p('   "[ChinouClient] ... status=NNN". Remember 200 does NOT mean success here - this');
    p('   gateway returns 200 and puts the failure in the body.');
    p('=================================================================');
    gs.info('\n' + out.join('\n'));
})();
