/**
 * Copy the four updated Script Includes from x_nose_nexai_test into the other three NexAI scopes.
 *
 * WHY THIS AND NOT TWELVE BROWSER PASTES
 * --------------------------------------
 * The bytes never leave the instance. A paste carries two risks we have already been bitten by: the
 * wrong (un-rewritten) file going in, which fails SILENTLY because the surrounding try/catch swallows
 * the cross-scope error; and the browser altering the encoding. The em dashes in these files sit inside
 * PROMPT STRINGS, not only comments, so a mangled paste quietly changes what the model is told. Reading
 * the source from the instance and rewriting it in memory removes both.
 *
 * WHY x_nose_nexai_test IS THE SOURCE
 * -----------------------------------
 * On this instance it is the only scope known correct - verified end to end at 289 cashflows across 63
 * mails, matching the reference. x_nose_nfotc_bsm is a TARGET here, not a source: it still carries the
 * old code.
 *
 * WHAT IT WILL NOT DO
 * -------------------
 *   - It never CREATES a Script Include. A missing record is reported and the run stops; creating one
 *     from here risks it landing in the wrong scope, which is how stray copies have appeared before.
 *   - It stops at the FIRST failed read-back rather than continuing into the next scope. A half-done
 *     run is visible and re-runnable; a run that ploughs on after a bad write is neither.
 *   - It does NOT touch extract.chunk_cap. That lives on a scoped config table which rejects writes
 *     from Global ("cross-scope access policy"), so it has to be set from inside each scope - that is
 *     what SET_CAP_AND_VERIFY.js is for.
 *
 * Safe to run twice: a target already byte-identical to the rewritten source is skipped.
 *
 * Run: Background Scripts, Application "Global". sys_script_include is a global table, so every scoped
 * copy is reachable from here.
 */
(function () {
    var SOURCE = 'x_nose_nexai_test';
    var TARGETS = ['x_nose_nexai_dev', 'x_nose_nexai_uat', 'x_nose_nfotc_bsm'];

    // name -> the markers that prove this is the NEW version, and a floor under its size
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
    function dashes(s) {
        var n = 0;
        for (var i = 0; i < s.length; i++) { if (s.charCodeAt(i) === 8212) { n++; } }
        return n;
    }
    function occurrences(s, t) {
        var n = 0, at = s.indexOf(t);
        while (at > -1) { n++; at = s.indexOf(t, at + t.length); }
        return n;
    }
    function replaceAll(s, from, to) { return s.split(from).join(to); }

    // find the record of this name in this scope; null if absent
    function findIn(name, scope) {
        var g = new GlideRecord('sys_script_include');
        g.addQuery('name', name);
        g.query();
        var id = null;
        while (g.next()) {
            if (('' + g.sys_scope.scope) === scope) { id = g.getUniqueValue(); }
        }
        return id;
    }

    var scope = '?';
    try { scope = '' + gs.getCurrentScopeName(); } catch (e) { scope = '?'; }
    gs.info('instance : ' + gs.getProperty('instance_name', '?'));
    gs.info('scope    : ' + scope);
    if (scope !== 'rhino.global' && scope !== 'global') {
        gs.error('ABORT. Run with Application = "Global". Cross-scope Script Include updates from inside');
        gs.error('an application scope are how stray copies get created. Nothing was changed.');
        return;
    }

    // ---------------------------------------------------------------- load + validate the source
    line();
    gs.info('SOURCE: ' + SOURCE);
    var src = {};
    for (var s = 0; s < SIS.length; s++) {
        var spec = SIS[s];
        var id = findIn(spec.name, SOURCE);
        if (!id) {
            gs.error('ABORT. ' + spec.name + ' not found in ' + SOURCE + '. Nothing was changed.');
            return;
        }
        var g = new GlideRecord('sys_script_include');
        g.get(id);
        var body = '' + g.getValue('script');

        var missing = [];
        for (var m = 0; m < spec.marks.length; m++) {
            if (body.indexOf(spec.marks[m]) === -1) { missing.push(spec.marks[m]); }
        }
        if (missing.length || body.length < spec.min) {
            gs.error('ABORT. ' + spec.name + ' in ' + SOURCE + ' is not the updated version.');
            if (missing.length) { gs.error('   missing marker(s): ' + missing.join(', ')); }
            if (body.length < spec.min) { gs.error('   length ' + body.length + ' < ' + spec.min); }
            gs.error('Propagating it would copy OLD code into three more scopes. Nothing was changed.');
            return;
        }
        var occ = occurrences(body, SOURCE);
        if (!occ) {
            gs.error('ABORT. ' + spec.name + ' contains no "' + SOURCE + '" reference, so the rewrite');
            gs.error('would produce a file pointing at no scope at all. Nothing was changed.');
            return;
        }
        src[spec.name] = { body: body, occ: occ, dash: dashes(body) };
        gs.info('   ok  ' + spec.name + '  ' + body.length + ' chars, ' + occ +
            ' scope refs, ' + dashes(body) + ' em dashes');
    }

    // ---------------------------------------------------------------- propagate
    var wrote = 0, same = 0;
    for (var t = 0; t < TARGETS.length; t++) {
        var tgt = TARGETS[t];
        line();
        gs.info('TARGET: ' + tgt);

        for (var i = 0; i < SIS.length; i++) {
            var nm = SIS[i].name;
            var from = src[nm];
            var want = replaceAll(from.body, SOURCE, tgt);
            // every scope token shifts by the difference in name length; nothing else changes
            var wantLen = from.body.length + from.occ * (tgt.length - SOURCE.length);

            var rec = findIn(nm, tgt);
            if (!rec) {
                gs.error('   FAIL  ' + nm + ' does not exist in ' + tgt + '.');
                gs.error('   Not creating it from here. STOPPING - ' + wrote + ' file(s) written so far.');
                return;
            }

            var u = new GlideRecord('sys_script_include');
            u.get(rec);
            if (('' + u.getValue('script')) === want) {
                gs.info('   same  ' + nm + ' already matches');
                same++;
                continue;
            }
            var had = ('' + u.getValue('script')).length;
            u.setValue('script', want);
            u.update();

            // read back - never trust the write
            var v = new GlideRecord('sys_script_include');
            v.get(rec);
            var got = '' + v.getValue('script');

            var problems = [];
            if (got.length !== wantLen) { problems.push('length ' + got.length + ' != expected ' + wantLen); }
            if (occurrences(got, SOURCE) !== 0) { problems.push('still contains ' + SOURCE); }
            if (occurrences(got, tgt) !== from.occ) {
                problems.push('has ' + occurrences(got, tgt) + ' "' + tgt + '" refs, expected ' + from.occ);
            }
            if (dashes(got) !== from.dash) { problems.push('em dashes ' + dashes(got) + ' != ' + from.dash); }
            for (var k = 0; k < SIS[i].marks.length; k++) {
                if (got.indexOf(SIS[i].marks[k]) === -1) { problems.push('lost marker ' + SIS[i].marks[k]); }
            }

            if (problems.length) {
                gs.error('   FAIL  ' + nm + ' in ' + tgt);
                for (var p = 0; p < problems.length; p++) { gs.error('         ' + problems[p]); }
                gs.error('   STOPPING before the next file. ' + wrote + ' file(s) written so far.');
                return;
            }
            gs.info('   OK    ' + nm + '  ' + had + ' -> ' + got.length + ' chars, rewritten to ' + tgt);
            wrote++;
        }
    }

    line();
    gs.info('RESULT');
    gs.info('   written            : ' + wrote);
    gs.info('   already matching   : ' + same);
    gs.info('   scopes covered     : ' + TARGETS.join(', '));
    gs.info('   failures           : 0');
    line();
    gs.info('NEXT STEP - the config is NOT done yet.');
    gs.info('   extract.chunk_cap is still 4 in those scopes. It lives on a scoped config table that');
    gs.info('   rejects writes from Global, so run SET_CAP_AND_VERIFY.js once in EACH of:');
    for (var n2 = 0; n2 < TARGETS.length; n2++) { gs.info('      - ' + TARGETS[n2]); }
    gs.info('   That script sets the value and verifies all four Script Includes in that scope.');
})();
