/**
 * Per-scope finisher: set extract.chunk_cap to 2, then verify the four Script Includes in THIS scope.
 *
 * Run it once in each of x_nose_nexai_dev, x_nose_nexai_uat and x_nose_nfotc_bsm after the propagator
 * has copied the code across. It also works in x_nose_nexai_test if you want to re-confirm that scope.
 *
 * NO EDITING NEEDED. It reads the current application scope and works on that one, so the same file is
 * run three times with only the Application picker changed.
 *
 * WHY THE CONFIG CANNOT BE DONE FROM GLOBAL
 * -----------------------------------------
 * The scoped config table rejects writes from Global with a cross-scope access policy error. That is
 * why this half is separate from the propagator rather than bolted onto it.
 *
 * WHY chunk_cap 2
 * ---------------
 * Measured: at cap 4 the first chunk of each wave waits for its own answer PLUS the queueing its three
 * siblings cause - 12 to 30 seconds against a hard 30s ECC wall - so roughly 30% of first chunks died
 * and took their rows with them. Cap 2 halves the contention. Cap 1 removes it but makes a Sync serial
 * and risks the transaction limit on a full corpus.
 *
 * WHAT THE CHECKS CATCH
 * ---------------------
 * The failure that cost a whole Sync cycle was a file pasted WITHOUT its scope token rewritten: it then
 * calls another application, the call throws, the surrounding try/catch swallows it, and extraction
 * returns empty with nothing in the log. So "carries no OTHER NexAI scope token" is a first-class test
 * here, not an afterthought.
 *
 * READ-ONLY except for the single config value. Safe to run twice.
 *
 * Run: Background Scripts, Application = the scope you are finishing, "Run in scoped application" ticked.
 */
(function () {
    var ALLOWED = ['x_nose_nexai_dev', 'x_nose_nexai_uat', 'x_nose_nfotc_bsm', 'x_nose_nexai_test'];
    var CAP_KEY = 'extract.chunk_cap';
    var CAP_VAL = '2';

    var SIS = [
        { name: 'WizardExtractor', min: 50000, marks: [
            "=== 'partial'", '_persistClassification', '_normaliseCounterparty', '_signFromDirection'] },
        { name: 'GenericFieldExtractor', min: 21000, marks: [
            '_collectChunks', 'lost.length < items.length', '(retry)'] },
        { name: 'XlsxCashflowExtractor', min: 35000, marks: [
            '_scanWorkbook', 'sawNegative', 'rows_seen', 'sheets_raw', 'max_rows'] },
        { name: 'DemoExtractor', min: 6400, marks: [
            'xr.rows_sent', 'xr.rows_seen', 'xr.truncated', 'attachmentText = xr.sheet_text'] }
    ];

    function line() { gs.info('------------------------------------------------------------------'); }
    var pass = 0, fail = 0;
    function P(l, d) { pass++; gs.info('   PASS  ' + l + (d ? '   ' + d : '')); }
    function F(l, d) { fail++; gs.error('   FAIL  ' + l + (d ? '   ' + d : '')); }

    var SCOPE = '';
    try { SCOPE = '' + gs.getCurrentScopeName(); } catch (e) { SCOPE = '?'; }
    var ok = false;
    for (var a = 0; a < ALLOWED.length; a++) { if (ALLOWED[a] === SCOPE) { ok = true; } }
    if (!ok) {
        gs.error('ABORT. Current scope is "' + SCOPE + '", which is not one of the NexAI applications.');
        gs.error('Set the Application picker to the scope you are finishing and tick "Run in scoped');
        gs.error('application". Expected one of: ' + ALLOWED.join(', '));
        return;
    }
    gs.info('instance : ' + gs.getProperty('instance_name', '?'));
    gs.info('scope    : ' + SCOPE);

    // ---------------------------------------------------------------- config
    line();
    gs.info('1. CONFIG - ' + CAP_KEY + ' on ' + SCOPE + '_config');
    var TBL = SCOPE + '_config';
    var cg = new GlideRecord(TBL);
    if (!cg.isValid()) {
        F(TBL + ' is not a valid table in this scope');
    } else {
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
            cg.setValue('description', 'How many chunk calls are in flight at once. Lowered to 2: at 4 ' +
                'the first chunk of a wave waits for its own answer plus the queueing the others cause, ' +
                'which crosses the 30s ECC wall about 30 percent of the time and loses that chunk.');
            cg.insert();
            gs.info('   key did not exist - created with value ' + CAP_VAL);
        }
        var b = new GlideRecord(TBL);
        b.addQuery('key', CAP_KEY);
        b.query();
        if (b.next() && ('' + b.getValue('value')) === CAP_VAL) { P(CAP_KEY + ' = ' + CAP_VAL); }
        else { F(CAP_KEY + ' did not take the update', 'the scoped config table may be read-only here'); }
    }

    // ---------------------------------------------------------------- script includes
    for (var i = 0; i < SIS.length; i++) {
        var spec = SIS[i];
        line();
        gs.info((i + 2) + '. SCRIPT INCLUDE - ' + spec.name);

        var body = null, copies = 0;
        try {
            var q = new GlideRecord('sys_script_include');
            q.addQuery('name', spec.name);
            q.query();
            while (q.next()) {
                copies++;
                if (('' + q.sys_scope.scope) === SCOPE) { body = '' + q.getValue('script'); }
            }
            gs.info('   copies of this name on the instance: ' + copies);
        } catch (eq) {
            gs.error('   could not read sys_script_include from this scope.');
        }
        if (body === null) { F(spec.name + ' not present in ' + SCOPE); continue; }

        gs.info('   length: ' + body.length + ' chars');
        if (body.length >= spec.min) { P('size is the NEW version', '>= ' + spec.min); }
        else { F('TOO SHORT - the OLD version is still here', body.length + ' < ' + spec.min); }

        var miss = [];
        for (var m = 0; m < spec.marks.length; m++) {
            if (body.indexOf(spec.marks[m]) === -1) { miss.push(spec.marks[m]); }
        }
        if (!miss.length) { P('all ' + spec.marks.length + ' feature markers present'); }
        else { F('missing marker(s)', miss.join(', ')); }

        // THE ONE THAT BITES: a file still pointing at another application.
        var strays = [];
        for (var z = 0; z < ALLOWED.length; z++) {
            if (ALLOWED[z] === SCOPE) { continue; }
            if (body.indexOf(ALLOWED[z]) > -1) { strays.push(ALLOWED[z]); }
        }
        if (!strays.length) { P('no reference to another NexAI scope'); }
        else {
            F('points at ' + strays.join(' and '),
              'this file calls the WRONG application - it will fail silently');
        }

        if (body.indexOf(SCOPE) > -1) { P('references this scope'); }
        else { F('contains no "' + SCOPE + '" reference at all'); }
    }

    line();
    gs.info('RESULT for ' + SCOPE + ': ' + pass + ' passed, ' + fail + ' failed');
    if (fail) {
        gs.error('Do not Sync in this scope until the failures above are cleared.');
        gs.error('A short file means the old version is still there; a stray scope reference means the');
        gs.error('propagator has not run for this scope, or it was pasted by hand from the wrong file.');
        return;
    }
    gs.info(SCOPE + ' is complete: four Script Includes verified and chunk_cap = 2.');
    gs.info('Repeat in the remaining scopes by changing only the Application picker.');
})();
