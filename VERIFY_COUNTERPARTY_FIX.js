/**
 * DID THE COUNTERPARTY FIX ACTUALLY LAND IN THIS SCOPE?
 *
 * Scripts - Background.  "Execute in sandbox?" UNCHECKED.
 * APPLICATION = the environment to check. Run it once per scope:
 *     NexAI OTC BSM    x_nose_nfotc_bsm
 *     NexAI OTC Dev    x_nose_nexai_dev
 *     NexAI OTC Test   x_nose_nexai_test
 *     NexAI OTC UAT    x_nose_nexai_uat
 *
 * READ-ONLY. It changes nothing.
 *
 * WHY IT EXISTS
 * FIX_COUNTERPARTY_ALL_SCOPES reported "WRITE DID NOT STICK" for ExtractionConfidence on a record
 * that had in fact patched perfectly. The cause was in the CHECKER, not the patch: the marker phrase
 * it looked for after writing ("never carries an AI confidence grade") is wrapped across two lines in
 * the replacement text, so it never appears contiguously and could never be found. The operation
 * summary told the true story - sys_script_include showed 3 updates, i.e. all three Script Includes.
 *
 * This checks each site INDEPENDENTLY of that patch script, on two questions that cannot both be
 * satisfied by accident:
 *     is the NEW code present?          and      is the OLD code gone?
 * A record that answers yes/yes is genuinely fixed. Anything else is named precisely.
 */
(function () {

    var ENVIRONMENTS = {
        'x_nose_nfotc_bsm':  'NexAI OTC BSM',
        'x_nose_nexai_dev':  'NexAI OTC Dev',
        'x_nose_nexai_test': 'NexAI OTC Test',
        'x_nose_nexai_uat':  'NexAI OTC UAT'
    };

    var SCOPE = '' + gs.getCurrentScopeName();
    if (!ENVIRONMENTS[SCOPE]) {
        gs.error('[CPCHK] ABORT: Application is "' + SCOPE + '", not a NexAI OTC environment.');
        for (var k in ENVIRONMENTS) {
            if (ENVIRONMENTS.hasOwnProperty(k)) { gs.error('[CPCHK]     ' + ENVIRONMENTS[k] + '   (' + k + ')'); }
        }
        return;
    }

    var CASHFLOW_T = SCOPE + '_cashflow';
    var WIZ_T = SCOPE + '_wizard';

    var good = 0, bad = 0;

    function pad(s, n) {
        s = '' + (s === null || s === undefined ? '' : s);
        while (s.length < n) { s += ' '; }
        return s.substring(0, n);
    }

    gs.info('[CPCHK] ================================================================');
    gs.info('[CPCHK] environment : ' + ENVIRONMENTS[SCOPE] + '   (' + SCOPE + ')');
    gs.info('[CPCHK] ================================================================');
    gs.info('[CPCHK] ' + pad('WHAT', 26) + pad('NEW?', 7) + pad('OLD GONE?', 11) + 'VERDICT');
    gs.info('[CPCHK] ' + pad('', 74).replace(/ /g, '-'));

    function report(what, src, newText, oldText) {
        if (src === null) {
            gs.error('[CPCHK] ' + pad(what, 26) + 'RECORD NOT FOUND');
            bad++;
            return;
        }
        var hasNew = src.indexOf(newText) > -1;
        var goneOld = src.indexOf(oldText) === -1;
        var ok = hasNew && goneOld;
        if (ok) { good++; } else { bad++; }
        gs.info('[CPCHK] ' + pad(what, 26) + pad(hasNew ? 'yes' : 'NO', 7) +
                pad(goneOld ? 'yes' : 'NO', 11) + (ok ? 'FIXED' : '*** NOT FIXED ***') +
                '   (' + src.length + ' chars)');
    }

    function scriptOf(table, query, field) {
        var g = new GlideRecord(table);
        g.addEncodedQuery(query);
        g.setLimit(1);
        g.query();
        return g.next() ? ('' + (g.getValue(field) || '')) : null;
    }

    // ---------------------------------------------------------------- the three Script Includes
    report('WizardExtractor',
        scriptOf('sys_script_include', 'name=WizardExtractor^sys_scope.scope=' + SCOPE, 'script'),
        "NO 'counterparty name' entry",
        "        'counterparty name': 'ai_counterparty',");

    report('ExtractionConfidence',
        scriptOf('sys_script_include', 'name=ExtractionConfidence^sys_scope.scope=' + SCOPE, 'script'),
        'ALWAYS derived from the sender via the EVE directory',
        "if (fields.counterpartySource === 'ai')");

    report('TaggingDashboard',
        scriptOf('sys_script_include', 'name=TaggingDashboard^sys_scope.scope=' + SCOPE, 'script'),
        'no longer written and must not be shown',
        "ai_counterparty: cf.getValue('ai_counterparty')");

    // ---------------------------------------------------------------- the case screen
    // Target the ai-extraction widget BY ID. An earlier version matched the template on the text
    // "Derived &#183; EVE", which also appears in another, larger widget - so it graded the wrong
    // record and reported the case screen as unfixed when it was fine.
    report('case screen (server)',
        scriptOf('sp_widget', 'idLIKEai-extraction^sys_scope.scope=' + SCOPE, 'script'),
        'that is its ONLY source',
        'data.counterparty = _cpEve || _cpAi;');

    report('case screen (template)',
        scriptOf('sp_widget', 'idLIKEai-extraction^sys_scope.scope=' + SCOPE, 'template'),
        'class="prov prov-pcm">Derived',
        "counterpartySource === 'ai'");

    // ---------------------------------------------------------------- the builder catalogue
    report('Wizard Builder catalogue',
        scriptOf('sp_widget', 'idLIKEwizard-builder^sys_scope.scope=' + SCOPE, 'script'),
        'deliberately NOT offered',
        '{ name: "Counterparty Name", type: "string", mandatory: false,');

    // ---------------------------------------------------------------- the work drivers (DATA)
    gs.info('[CPCHK]');
    gs.info('[CPCHK] ---- work drivers ----');
    var drivers = 0, dirty = 0;
    var w = new GlideRecord(WIZ_T);
    w.query();
    while (w.next()) {
        drivers++;
        var names = [], still = false;
        try {
            var arr = JSON.parse('' + (w.getValue('input_fields') || '[]'));
            for (var i = 0; i < arr.length; i++) {
                var nm = '' + ((arr[i] || {}).name || '');
                names.push(nm);
                if (nm.toLowerCase().replace(/^\s+|\s+$/g, '') === 'counterparty name') { still = true; }
            }
        } catch (e) { gs.error('[CPCHK]   "' + w.getValue('name') + '": input_fields is not readable JSON'); continue; }

        if (still) { dirty++; bad++; } else { good++; }
        gs.info('[CPCHK]   "' + w.getValue('name') + '" [' + (w.getValue('status') || 'draft') + ']  ' +
                names.length + ' fields   ' + (still ? '*** STILL HAS Counterparty Name ***' : 'clean'));
    }
    if (!drivers) { gs.warn('[CPCHK]   no work drivers in this scope'); }

    // ---------------------------------------------------------------- leftover data (informational)
    gs.info('[CPCHK]');
    gs.info('[CPCHK] ---- leftover ai_counterparty values (informational, NOT a failure) ----');
    var a = new GlideAggregate(CASHFLOW_T);
    a.addQuery('ai_counterparty', '!=', '');
    a.addAggregate('COUNT');
    a.query();
    var left = a.next() ? parseInt(a.getAggregate('COUNT'), 10) : 0;
    gs.info('[CPCHK]   ' + left + ' cashflow row(s) still hold an AI-read counterparty.');
    gs.info('[CPCHK]   Nothing reads that column now. The values are left in place on purpose -');
    gs.info('[CPCHK]   deleting data to tidy a display is not worth the risk.');

    // ---------------------------------------------------------------- verdict
    gs.info('[CPCHK]');
    gs.info('[CPCHK] ================================================================');
    if (!bad) {
        gs.info('[CPCHK] ALL CLEAR - this scope is fully on the EVE-only counterparty.');
        gs.info('[CPCHK] The case screen will show "Derived . EVE", and BLANK wherever the sender is');
        gs.info('[CPCHK] not in the EVE directory. Blank is correct: it is the cue to seed EVE.');
    } else {
        gs.error('[CPCHK] ' + bad + ' site(s) NOT fixed - see the rows marked above.');
        gs.error('[CPCHK] Re-run FIX_COUNTERPARTY_ALL_SCOPES.js in THIS scope with DRY_RUN = false.');
        gs.error('[CPCHK] If a row says NEW=yes and OLD GONE=NO, the code differs from what the patch');
        gs.error('[CPCHK] expected - send this output back rather than editing by hand.');
    }
    gs.info('[CPCHK] ' + good + ' ok, ' + bad + ' not');
    gs.info('[CPCHK] ================================================================');
})();
