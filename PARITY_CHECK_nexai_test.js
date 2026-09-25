/**
 * Is NexAI OTC Test on this instance actually set up the same way as the reference on eval?
 *
 * Code parity was already proved by the ship verifier. This checks everything that is DATA or lives
 * OUTSIDE the application, because none of it travels with a Script Include paste or an update set, and
 * every item below has silently broken a run before:
 *
 *   - the published wizard's FIELD PROMPTS. Extraction quality is almost entirely these. A scope whose
 *     wizard carries older prompts produces different answers from identical code, and nothing says so.
 *   - the wizard's ID RULES. These decide which mails the driver claims. Different rules, different
 *     relevant/irrelevant split, and the cashflow total moves for a reason that has nothing to do with
 *     extraction.
 *   - ChinouClient.invokeBatch. It is a GLOBAL Script Include pasted by hand per instance. When it was
 *     missing on bsmdev before, 24 of 25 mails extracted and exactly one failed - it read like a bad
 *     email rather than a missing method, because only mails big enough to chunk take that path.
 *   - the extract.* config, including the chunk_cap change.
 *   - the supporting Script Includes the extractor calls by name.
 *
 * REFERENCE = the eval instance, scope x_nose_nfotc_bsm, read on 25 September 2026.
 * Prompt lengths are compared rather than text: a length match is strong evidence of the same prompt,
 * and a mismatch is what needs looking at. Two of the reference prompts are themselves KNOWN STALE on
 * eval (Value Date and Currency), which is called out rather than hidden.
 *
 * READ-ONLY. Nothing is written.
 *
 * Run: Background Scripts, Application "NexAI OTC Test", "Run in scoped application" ticked.
 */
(function () {
    var SCOPE = 'x_nose_nexai_test';

    // --- reference, from eval x_nose_nfotc_bsm -------------------------------------------------
    var REF_FIELDS = [
        ['Value Date', 482], ['Amount', 1184], ['Currency', 338], ['Direction', 2426],
        ['Counterparty Reference', 1663], ['Counterparty Name', 1804], ['Nomura Entity', 1273],
        ['Product', 784], ['Trade Date', 898], ['SSI Bank / BIC', 1593], ['SSI Account', 1295],
        ['SSI Beneficiary / BIC', 1669], ['SSI Intermediary', 942]
    ];
    var REF_IDRULES_LEN = 453;
    var REF_CONFIG = [
        ['extract.chunk_budget_s', '15'], ['extract.chunk_cap', '2'],
        ['extract.chunk_html_fallback', '1'], ['extract.chunk_overhead_s', '9'],
        ['extract.chunk_sec_per_row', '0'], ['extract.chunk_threshold', '12'],
        ['match.name_fuzzy_pct', '0.85'], ['match.t2_amt_abs', '50.0'], ['match.vd_tol_days', '2']
    ];
    var NEEDED_SIS = ['WizardExtractor', 'GenericFieldExtractor', 'DemoExtractor', 'RowSegmenter',
                      'LlmUsage', 'NfotcConfig', 'CompareMatch', 'ExtractionConfidence',
                      'EmlFieldExtractor', 'XlsxCashflowExtractor'];
    var CLIENT_METHODS = ['invokeBatch', 'invoke', '_fireAsync', '_collectAsync'];

    function line() { gs.info('------------------------------------------------------------------'); }
    var ok = 0, warn = 0, bad = 0;
    function P(l, d) { ok++; gs.info('   OK    ' + l + (d ? '   ' + d : '')); }
    function W(l, d) { warn++; gs.warn('   WARN  ' + l + (d ? '   ' + d : '')); }
    function F(l, d) { bad++; gs.error('   FAIL  ' + l + (d ? '   ' + d : '')); }

    var scope = '';
    try { scope = '' + gs.getCurrentScopeName(); } catch (e) { scope = '?'; }
    if (scope !== SCOPE) {
        gs.error('ABORT. Must run in ' + SCOPE + '; current scope is "' + scope + '".');
        return;
    }
    gs.info('Scope OK: ' + scope + '    instance: ' + gs.getProperty('instance_name', '?'));

    // ------------------------------------------------------------------ 1. the wizard
    line();
    gs.info('1. PUBLISHED WIZARD');
    var wz = new GlideRecord(SCOPE + '_wizard');
    wz.addQuery('status', 'published');
    wz.query();
    var n = wz.getRowCount();
    if (!wz.next()) {
        F('no PUBLISHED wizard in this scope', 'the driver will claim nothing and Sync does nothing');
    } else {
        gs.info('   name        : ' + wz.getValue('name'));
        gs.info('   work driver : ' + wz.getValue('work_driver'));
        gs.info('   published wizards in this scope: ' + n);
        if (n > 1) { W('more than one published wizard', 'mails may be claimed by the wrong driver'); }

        // id_rules: these decide the relevant / irrelevant split
        var idr = '' + (wz.getValue('id_rules') || '');
        if (!idr || idr === '[]') {
            F('id_rules is EMPTY', 'identify() defaults to relevant, so this wizard claims EVERYTHING');
        } else if (idr.length === REF_IDRULES_LEN) {
            P('id_rules length matches eval', idr.length + ' chars');
        } else {
            W('id_rules DIFFERS from eval', idr.length + ' chars vs ' + REF_IDRULES_LEN +
              ' - the relevant/irrelevant split will not match the prediction');
        }
        gs.info('   id_rules head: ' + idr.substring(0, 140));

        // field prompts: the thing extraction quality actually depends on
        var flds = [];
        try { flds = JSON.parse('' + (wz.getValue('input_fields') || '[]')); } catch (ep) { flds = []; }
        gs.info('   fields configured: ' + flds.length + '   (eval has ' + REF_FIELDS.length + ')');
        if (flds.length !== REF_FIELDS.length) {
            W('field COUNT differs from eval', flds.length + ' vs ' + REF_FIELDS.length);
        }
        var byName = {};
        for (var i = 0; i < flds.length; i++) {
            byName[('' + (flds[i].name || flds[i].label || '')).toLowerCase()] = '' + (flds[i].prompt || '');
        }
        gs.info('   prompt lengths vs eval:');
        var diff = 0;
        for (var r = 0; r < REF_FIELDS.length; r++) {
            var nm = REF_FIELDS[r][0], want = REF_FIELDS[r][1];
            var got = byName[nm.toLowerCase()];
            if (got === undefined) {
                gs.error('      MISSING  ' + nm);
                bad++;
                continue;
            }
            var mark = (got.length === want ? 'same ' : 'DIFF ');
            if (got.length !== want) { diff++; }
            gs.info('      ' + mark + nm + ': ' + got.length + ' vs ' + want);
        }
        if (diff === 0) { P('every field prompt matches eval by length'); }
        else { W(diff + ' field prompt(s) differ from eval', 'extraction output will differ from the prediction'); }
        gs.info('   NOTE: on eval, Value Date (482) and Currency (338) are themselves OLD short');
        gs.info('   prompts - the field catalogue in code holds 1214 and 820. If this scope shows');
        gs.info('   1214 / 820 it is AHEAD of eval, not broken.');
    }

    // ------------------------------------------------------------------ 2. ChinouClient
    line();
    gs.info('2. GLOBAL ChinouClient');
    var cc = null, ccCopies = 0;
    try {
        var q = new GlideRecord('sys_script_include');
        q.addQuery('name', 'ChinouClient');
        q.query();
        while (q.next()) {
            ccCopies++;
            var sc = '' + q.sys_scope.scope;
            if (sc === 'global' || sc === '') { cc = '' + q.getValue('script'); }
        }
    } catch (e1) { gs.error('   could not read sys_script_include: ' + (e1.message || e1)); }
    gs.info('   copies named ChinouClient on the instance: ' + ccCopies);
    if (ccCopies > 1) { W(ccCopies + ' copies exist', 'scoped forks have caused silent failures before'); }
    if (cc === null) {
        F('no GLOBAL ChinouClient found', 'nothing can call Chinou');
    } else {
        gs.info('   length: ' + cc.length + ' chars');
        for (var m = 0; m < CLIENT_METHODS.length; m++) {
            var meth = CLIENT_METHODS[m];
            if (cc.indexOf(meth + ':') > -1) { P('client has ' + meth + '()'); }
            else if (meth === 'invokeBatch') {
                F('client is MISSING invokeBatch()',
                  'every mail big enough to chunk will fail with "Cannot find function invokeBatch"');
            } else { W('client has no ' + meth + '()'); }
        }
        if (cc.indexOf('setEccResponseTimeout') > -1) {
            W('client carries setEccResponseTimeout', 'measured on eval as having NO effect - harmless, but it is not a fix');
        }
    }

    // ------------------------------------------------------------------ 3. config
    line();
    gs.info('3. CONFIG (' + SCOPE + '_config)');
    for (var c = 0; c < REF_CONFIG.length; c++) {
        var key = REF_CONFIG[c][0], exp = REF_CONFIG[c][1];
        var g = new GlideRecord(SCOPE + '_config');
        g.addQuery('key', key);
        g.query();
        if (!g.next()) { W(key + ' absent', 'the in-code default applies'); continue; }
        var val = '' + g.getValue('value');
        if (val === exp) { P(key + ' = ' + val); }
        else { W(key + ' = ' + val + ' (expected ' + exp + ')'); }
    }

    // ------------------------------------------------------------------ 4. supporting code
    line();
    gs.info('4. SCRIPT INCLUDES IN THIS SCOPE');
    for (var s = 0; s < NEEDED_SIS.length; s++) {
        var found = false, len = 0;
        try {
            var t = new GlideRecord('sys_script_include');
            t.addQuery('name', NEEDED_SIS[s]);
            t.query();
            while (t.next()) {
                if (('' + t.sys_scope.scope) === SCOPE) { found = true; len = ('' + t.getValue('script')).length; }
            }
        } catch (e2) { /* reported above */ }
        if (found) { P(NEEDED_SIS[s], len + ' chars'); }
        else { F(NEEDED_SIS[s] + ' NOT PRESENT in ' + SCOPE, 'the extractor calls it by name'); }
    }

    // ------------------------------------------------------------------ 5. data on hand
    line();
    gs.info('5. DATA IN THIS SCOPE');
    function count(tbl, q1, v1) {
        try {
            var a = new GlideAggregate(tbl);
            if (q1) { a.addQuery(q1, v1); }
            a.addAggregate('COUNT');
            a.query();
            return a.next() ? parseInt(a.getAggregate('COUNT'), 10) : 0;
        } catch (e3) { return -1; }
    }
    var mails = count(SCOPE + '_email');
    gs.info('   emails            : ' + mails);
    gs.info('     relevant        : ' + count(SCOPE + '_email', 'classification', 'relevant'));
    gs.info('     irrelevant      : ' + count(SCOPE + '_email', 'classification', 'irrelevant'));
    gs.info('     not classified  : ' + count(SCOPE + '_email', 'classification', ''));
    gs.info('   cashflows         : ' + count(SCOPE + '_cashflow'));
    gs.info('   flagged partial   : ' + count(SCOPE + '_email', 'extraction_status', 'partial'));
    gs.info('   bookings (PCM)    : ' + count(SCOPE + '_booking'));
    if (count(SCOPE + '_booking') === 0) {
        W('no bookings seeded', 'Compare and Match will find nothing to match against');
    }

    line();
    gs.info('SUMMARY: ' + ok + ' ok, ' + warn + ' warn, ' + bad + ' fail');
    if (bad) { gs.error('The FAIL items will stop extraction working correctly. Fix those first.'); }
    else if (warn) { gs.warn('No blockers. The WARN items explain any difference from eval numbers.'); }
    else { gs.info('Fully in line with the eval reference.'); }
})();
