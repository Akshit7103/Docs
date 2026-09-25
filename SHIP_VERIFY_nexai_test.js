/**
 * NexAI OTC Test: set extract.chunk_cap to 2, and verify the two pasted Script Includes.
 *
 * Run this AFTER pasting NEXAI_TEST_GenericFieldExtractor.js and NEXAI_TEST_WizardExtractor.js into
 * this scope's Script Includes.
 *
 * WHY chunk_cap 2
 * ---------------
 * Measured on eval: at cap 4 the first chunk of each wave waits for its own answer PLUS the queueing its
 * three siblings cause - 12 to 30 seconds against a hard 30s ECC wall - so roughly 30% of first chunks
 * were dying and taking their rows with them. Cap 2 halves that contention. Cap 1 removes it entirely
 * but makes a Sync serial, which risks the transaction limit on a large corpus.
 *
 * WHAT THE CHECKS ARE FOR
 * -----------------------
 * The pasted files were produced by rewriting every x_nose_nfotc_bsm reference to x_nose_nexai_test.
 * Two things can go wrong and both are silent:
 *   - a stray x_nose_nfotc_bsm left behind, which would have this scope reading BSM's tables;
 *   - a browser paste mangling the encoding. The em dashes in these files sit inside PROMPT STRINGS,
 *     not only comments, so a mangled paste quietly changes what the model is told. The counts are the
 *     cheap way to catch it: GenericFieldExtractor 14, WizardExtractor 33.
 *
 * Nothing here is shipped for the ECC response timeout - that change was measured on eval and does not
 * work, so it is deliberately left out.
 *
 * Run: Background Scripts, Application "NexAI OTC Test", "Run in scoped application" ticked.
 * Safe to run twice.
 */
(function () {
    var SCOPE = 'x_nose_nexai_test';
    var OLD_SCOPE = 'x_nose_nfotc_bsm';
    var CONFIG = SCOPE + '_config';
    var CAP_KEY = 'extract.chunk_cap';
    var CAP_VAL = '2';

    function line() { gs.info('------------------------------------------------------------------'); }
    function dashes(s) {
        var n = 0;
        for (var i = 0; i < s.length; i++) { if (s.charCodeAt(i) === 8212) { n++; } }
        return n;
    }

    var scope = '';
    try { scope = '' + gs.getCurrentScopeName(); } catch (e) { scope = '?'; }
    if (scope !== SCOPE) {
        gs.error('ABORT. Must run in ' + SCOPE + '; current scope is "' + scope + '".');
        gs.error('Set the Application picker to "NexAI OTC Test". Nothing was changed.');
        return;
    }
    gs.info('Scope OK: ' + scope);

    var pass = 0, fail = 0;
    function check(ok, label, detail) {
        if (ok) { pass++; gs.info('   PASS  ' + label + (detail ? '   ' + detail : '')); }
        else { fail++; gs.error('   FAIL  ' + label + (detail ? '   ' + detail : '')); }
    }

    // ---------------------------------------------------------------- config
    line();
    gs.info('1. CONFIG - ' + CAP_KEY + ' on ' + CONFIG);
    var cg = new GlideRecord(CONFIG);
    cg.addQuery('key', CAP_KEY);
    cg.query();
    if (cg.next()) {
        var was = '' + (cg.getValue('value') || '');
        if (was === CAP_VAL) {
            gs.info('   already ' + CAP_VAL + ' - nothing to change.');
        } else {
            cg.setValue('value', CAP_VAL);
            cg.update();
            gs.info('   changed from ' + was + ' to ' + CAP_VAL);
        }
    } else {
        cg.initialize();
        cg.setValue('key', CAP_KEY);
        cg.setValue('value', CAP_VAL);
        cg.setValue('description', 'How many chunk calls are in flight at once. Lowered to 2: at 4 the ' +
            'first chunk of a wave waits for its own answer plus the queueing the others cause, which ' +
            'crosses the 30s ECC wall about 30 percent of the time and loses that chunk.');
        cg.insert();
        gs.info('   key did not exist - created with value ' + CAP_VAL);
    }
    var b = new GlideRecord(CONFIG);
    b.addQuery('key', CAP_KEY);
    b.query();
    check(b.next() && ('' + b.getValue('value')) === CAP_VAL, CAP_KEY + ' = ' + CAP_VAL);

    // ---------------------------------------------------------------- script includes
    var WANT = [
        { name: 'GenericFieldExtractor', dashes: 14, len: 21259, marks: [
            ['_collectChunks', 'chunk retry helper present'],
            ['lost.length < items.length', 'retry gate - a whole-batch failure never retries'],
            ['(retry)', 'retry tagged in llm_usage'],
            [SCOPE + '.LlmUsage', 'usage recorder points at this scope'] ] },
        { name: 'WizardExtractor', dashes: 33, len: 50528, marks: [
            ["=== 'partial'", 'partial flag CLEARS on a complete run'],
            ['_persistClassification', 'relevance verdict written to the record'],
            ['_normaliseCounterparty', 'one counterparty per mail'],
            ['_signFromDirection', 'amount sign derived from direction'],
            [SCOPE + '_email', 'reads this scope\'s email table'],
            [SCOPE + '_cashflow', 'writes this scope\'s cashflow table'] ] }
    ];

    for (var w = 0; w < WANT.length; w++) {
        var spec = WANT[w];
        line();
        gs.info((w + 2) + '. SCRIPT INCLUDE - ' + spec.name);
        var si = null, copies = 0;
        try {
            var q = new GlideRecord('sys_script_include');
            q.addQuery('name', spec.name);
            q.query();
            while (q.next()) {
                copies++;
                if (('' + q.sys_scope.scope) === SCOPE) { si = '' + q.getValue('script'); }
            }
            gs.info('   copies of this name on the instance: ' + copies);
        } catch (eq) {
            gs.error('   could not read sys_script_include: ' + (eq.message || eq));
        }
        if (si === null) {
            check(false, spec.name + ' not found in ' + SCOPE, 'did the paste save?');
            continue;
        }
        gs.info('   length: ' + si.length + ' chars   (expected ' + spec.len + ')');
        check(si.length === spec.len, 'length matches the file that was handed over',
            si.length === spec.len ? '' : 'off by ' + (si.length - spec.len) +
            ' - the paste may be truncated or the source differed');
        for (var m = 0; m < spec.marks.length; m++) {
            check(si.indexOf(spec.marks[m][0]) > -1, spec.marks[m][1]);
        }
        // The rewrite must be complete: any leftover means this scope would read BSM's data.
        check(si.indexOf(OLD_SCOPE) === -1, 'no leftover ' + OLD_SCOPE + ' reference',
            si.indexOf(OLD_SCOPE) === -1 ? '' : 'FOUND - this scope would read the wrong tables');
        check(dashes(si) === spec.dashes, 'em dash count intact',
            'found ' + dashes(si) + ', expected ' + spec.dashes +
            (dashes(si) === spec.dashes ? '' : ' - RE-PASTE, the encoding was mangled'));
        var MOJI = String.fromCharCode(226) + String.fromCharCode(128) + String.fromCharCode(148);
        check(si.indexOf(MOJI) === -1, 'no mojibake from the paste');
    }

    line();
    gs.info('RESULT: ' + pass + ' passed, ' + fail + ' failed');
    if (fail) {
        gs.error('Do not run a Sync in this scope until the failures above are cleared.');
        return;
    }
    gs.info('NexAI OTC Test is up to date. When you are happy with it, run PROPAGATE_ALL_SCOPES.js');
    gs.info('in the Global application to do dev and uat the same way - it will skip test as');
    gs.info('already matching.');
})();
