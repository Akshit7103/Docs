/**
 * WHAT IS THIS INSTANCE ACTUALLY CONFIGURED TO DO?
 *
 * Scripts - Background, Application = **Global**, "Execute in sandbox?" UNCHECKED.
 * Global so it can see every scope's properties, not just one app's.
 *
 * READ-ONLY. It changes nothing. It never prints a password, token or credential.
 *
 * WHY THIS EXISTS
 * Before comparing results between instances, know what differs. Three things decide whether two
 * instances give the same answer from the same code, and only one of them is code:
 *
 *   1. THE MODEL          eval ran anthropic-5-sonnet[Bedrock]; bsmdev is understood to be on
 *                         4.5-sonnet. Different model, different extraction. Biggest single gap.
 *   2. THE FIELD PROMPTS  these are DATA on the published work driver, not code. Identical code
 *                         with older prompts gives different answers, and nothing warns you.
 *   3. TEMPERATURE        our client sends 0.3 for text and 0 for documents, so text extraction is
 *                         already slightly non-deterministic. Set both to 0 for repeatability.
 *
 * AND THE TRAP THIS IS REALLY FOR
 * On bsmdev the Chinou plumbing is REUSED FROM GMET, so the properties may live under
 * x_nose_gmet_app.chinou.* rather than a plain chinou.* name - and each app may carry its own copy.
 * Editing the wrong one does nothing, and it looks like "the change had no effect" rather than
 * "you edited the wrong record". So this does not guess a prefix: it lists every match it finds.
 */
(function () {

    var scope = '' + gs.getCurrentScopeName();
    if (scope !== 'global' && scope !== 'rhino.global') {
        gs.error('[CFG] ABORT: run with Application = Global, not ' + scope);
        gs.error('[CFG] In a scoped app it cannot see the other scopes\' properties.');
        return;
    }

    function pad(s, n) { s = '' + (s === null || s === undefined ? '' : s); while (s.length < n) { s += ' '; } return s.substring(0, n); }
    function secret(name) { return /password|secret|token|credential|auth|api_?key/i.test('' + name); }

    gs.info('[CFG] ================================================================================');
    gs.info('[CFG] 1. CHINOU / MODEL PROPERTIES - every scope, every prefix');
    gs.info('[CFG] ================================================================================');

    var seen = 0;
    var p = new GlideRecord('sys_properties');
    p.addEncodedQuery('nameLIKEchinou^ORnameLIKEmodel.id^ORnameLIKEreg.id^ORnameLIKEextraction.engine');
    p.orderBy('name');
    p.query();
    while (p.next()) {
        var n = '' + p.getValue('name');
        var v = secret(n) ? '*** (not printed)' : ('' + (p.getValue('value') || '(empty)'));
        gs.info('[CFG] ' + pad(n, 52) + v.substring(0, 90));
        seen++;
    }
    if (!seen) { gs.warn('[CFG] No matching properties. The app may read its config from a table instead.'); }

    gs.info('[CFG]');
    gs.info('[CFG] ================================================================================');
    gs.info('[CFG] 2. THE PUBLISHED WORK DRIVERS - are the field prompts actually here?');
    gs.info('[CFG] ================================================================================');

    // The environments do NOT share a prefix, so they are listed explicitly.
    var APPS = ['x_nose_nfotc_bsm', 'x_nose_nexai_dev', 'x_nose_nexai_test', 'x_nose_nexai_uat', 'x_nose_nfotc'];

    for (var a = 0; a < APPS.length; a++) {
        var tbl = APPS[a] + '_wizard';
        var gr;
        try {
            gr = new GlideRecord(tbl);
            if (!gr.isValid()) { gs.info('[CFG] ' + pad(APPS[a], 22) + '(no such table - app not installed here)'); continue; }
        } catch (e) { gs.info('[CFG] ' + pad(APPS[a], 22) + '(not readable)'); continue; }

        gr.addQuery('status', 'published');
        gr.query();
        if (!gr.hasNext()) { gs.info('[CFG] ' + pad(APPS[a], 22) + 'no PUBLISHED work driver'); continue; }

        while (gr.next()) {
            var raw = '' + (gr.getValue('input_fields') || '');
            var fields = 0, withPrompt = 0, withExamples = 0;
            try {
                var arr = JSON.parse(raw || '[]');
                if (arr instanceof Array) {
                    fields = arr.length;
                    for (var i = 0; i < arr.length; i++) {
                        var f = arr[i] || {};
                        if (f.prompt && ('' + f.prompt).length > 40) { withPrompt++; }
                        if (f.examples && f.examples.length >= 3) { withExamples++; }
                    }
                }
            } catch (eJ) { /* leave the counts at zero and report the raw size */ }

            gs.info('[CFG] ' + pad(APPS[a], 22) + '"' + gr.getValue('name') + '"');
            gs.info('[CFG]   fields ' + fields + '   with a real prompt ' + withPrompt +
                '   with 3+ examples ' + withExamples + '   raw ' + raw.length + ' chars');

            // Eval's published driver measured 13 fields / 13 prompts / 13 with examples / 16351 chars.
            // A much smaller number here means the prompts never came across - and that would change
            // the results more than the model does.
            if (raw.length < 8000) {
                gs.warn('[CFG]   *** SHORT. Eval carried ~16000 chars across 13 fields. The full prompt');
                gs.warn('[CFG]   *** catalogue does not look present in this environment.');
            }
        }
    }

    gs.info('[CFG]');
    gs.info('[CFG] ================================================================================');
    gs.info('[CFG] 3. THE REST MESSAGE - which endpoint and MID the calls actually use');
    gs.info('[CFG] ================================================================================');

    var m = new GlideRecord('sys_rest_message');
    m.addQuery('name', 'CONTAINS', 'Chinou');
    m.query();
    if (!m.hasNext()) { gs.info('[CFG] no REST Message matching "Chinou" (bsmdev may build the request inline)'); }
    while (m.next()) {
        gs.info('[CFG] message "' + m.getValue('name') + '"  base=' + (m.getValue('rest_endpoint') || '(none)'));
        var f = new GlideRecord('sys_rest_message_fn');
        f.addQuery('rest_message', m.getUniqueValue());
        f.orderBy('function_name');
        f.query();
        while (f.next()) {
            var mid = f.getValue('use_mid_server') || f.getValue('mid_server') || '';
            gs.info('[CFG]   ' + pad(f.getValue('function_name'), 16) + pad(f.getValue('http_method'), 6) +
                pad(mid || 'DIRECT - no MID', 36) + (f.getValue('rest_endpoint') || '(inherits base)'));
        }
    }

    gs.info('[CFG]');
    gs.info('[CFG] ================================================================================');
    gs.info('[CFG] WHAT TO DO WITH THIS');
    gs.info('[CFG]   - More than one model.id? Find which prefix the app actually READS before');
    gs.info('[CFG]     editing one. Changing the wrong copy looks exactly like "no effect".');
    gs.info('[CFG]   - Work driver much smaller than ~16000 chars? The prompts are missing, and that');
    gs.info('[CFG]     matters more than the model.');
    gs.info('[CFG]   - No MID on a function? Nomura hosts are internal DNS and will not resolve.');
    gs.info('[CFG] ================================================================================');
})();
