/**
 * Show the audit setup across ALL FOUR NexAI applications in one table.
 *
 * Run: Background Scripts, Application "Global". READ-ONLY - it changes nothing, so it is safe to run
 * at any point, before or after ENABLE_AUDIT_AND_VERIFY.js, as often as you like.
 *
 * This is the answer to "where can I see that all of it is actually on". The per-scope script reports
 * what IT did; this reports what IS, across every scope at once, from a single run - which is the only
 * way to catch the scope somebody forgot.
 *
 * For every table it shows three things, because all three have to be true for the trail to work:
 *
 *   AUDIT       is Audit ticked on the COLLECTION row of the table's dictionary entry - the row whose
 *               Column name is empty and whose Type is "collection". This is the setting itself.
 *   UI ACTION   is there an "Audit History" action (action_name = audit_history) on that table, active,
 *               client, on the list context menu. This is how anyone reaches the trail.
 *   TRAIL       how many sys_audit rows that table has actually accumulated. Zero is NOT a fault on a
 *               table nothing has changed on since the tick - audit is not retrospective - but a table
 *               being edited daily that still reads zero means the tick did not really take.
 *
 * The last column is the one worth trusting. The first two say it is configured; only the third says
 * it is working.
 */
(function () {
    var SCOPES = ['x_nose_nexai_test', 'x_nose_nexai_dev', 'x_nose_nexai_uat', 'x_nose_nfotc_bsm'];
    var EXPECTED_ON = ['email', 'cashflow', 'booking', 'counterparty',
                       'wizard', 'config', 'capability', 'work_item'];
    var EXPECTED_OFF = ['llm_usage', 'audit', 'mailbox_drop', 'zip_drop'];

    // the decision events - what the native trail cannot see, written by the business rules
    var EVENT_RULES = 10;
    var EVENTS = ['classification.decided', 'cashflow.extracted', 'config.changed', 'wizard.changed',
                  'mail.processed', 'extraction.partial', 'thread.classified', 'analyst.decision',
                  'match.decided', 'mo.sent', 'cashflow.deleted', 'email.deleted'];

    function line() { gs.info('=================================================================='); }
    function thin() { gs.info('   ----------------------------------------------------------------'); }
    function pad(s, n) { s = '' + s; while (s.length < n) { s = s + ' '; } return s; }
    function lpad(s, n) { s = '' + s; while (s.length < n) { s = ' ' + s; } return s; }
    function isOn(v) { v = '' + (v || ''); return v === 'true' || v === '1'; }
    function inList(arr, v) {
        for (var i = 0; i < arr.length; i++) { if (arr[i] === v) { return true; } }
        return false;
    }

    function collectionRow(table) {
        var d = new GlideRecord('sys_dictionary');
        d.addQuery('name', table);
        d.query();
        while (d.next()) {
            if (('' + (d.getValue('element') || '')) === '' &&
                ('' + (d.getValue('internal_type') || '')) === 'collection') { return d; }
        }
        return null;
    }

    function auditRows(table) {
        try {
            var a = new GlideAggregate('sys_audit');
            a.addQuery('tablename', table);
            a.addAggregate('COUNT');
            a.query();
            return a.next() ? parseInt(a.getAggregate('COUNT'), 10) : 0;
        } catch (e) { return -1; }
    }

    var scope = '?';
    try { scope = '' + gs.getCurrentScopeName(); } catch (e) { scope = '?'; }
    gs.info('instance : ' + gs.getProperty('instance_name', '?'));
    gs.info('scope    : ' + scope + '   (read-only, nothing is changed)');
    if (scope !== 'global' && scope !== 'rhino.global') {
        gs.warn('Run with Application = "Global" so every scope is readable from one run.');
    }

    var gTables = 0, gAudit = 0, gUi = 0, gTrail = 0, gEvents = 0, problems = [];

    for (var s = 0; s < SCOPES.length; s++) {
        var SC = SCOPES[s];
        line();
        gs.info(SC);

        var tables = [];
        var o = new GlideRecord('sys_db_object');
        o.addQuery('name', 'STARTSWITH', SC + '_');
        o.orderBy('name');
        o.query();
        while (o.next()) { tables.push('' + o.getValue('name')); }

        if (!tables.length) {
            gs.error('   no table found with this prefix - does the application exist on this instance?');
            problems.push(SC + ': application not found');
            continue;
        }

        gs.info('   ' + pad('TABLE', 34) + pad('AUDIT', 10) + pad('UI ACTION', 14) + lpad('TRAIL', 8));
        thin();

        var nAudit = 0, nUi = 0, nTrail = 0;
        for (var t = 0; t < tables.length; t++) {
            var tbl = tables[t];
            var suffix = tbl.substring(SC.length + 1);
            gTables++;

            // audit flag
            var dr = collectionRow(tbl);
            var audOn = dr ? isOn(dr.getValue('audit')) : null;
            var audTxt = (dr === null) ? 'NO ROW' : (audOn ? 'on' : 'off');
            if (audOn) { nAudit++; gAudit++; }

            // ui action
            var ua = new GlideRecord('sys_ui_action');
            ua.addQuery('table', tbl);
            ua.addQuery('action_name', 'audit_history');
            ua.query();
            var uiTxt = '-';
            if (ua.next()) {
                var good = isOn(ua.getValue('active')) && isOn(ua.getValue('client')) &&
                           isOn(ua.getValue('list_context_menu')) && isOn(ua.getValue('ui11_compatible'));
                uiTxt = good ? 'yes' : 'PRESENT/BAD';
                if (good) { nUi++; gUi++; }
            }

            // actual trail
            var ar = auditRows(tbl);
            if (ar > 0) { nTrail++; gTrail += ar; }

            gs.info('   ' + pad(tbl, 34) + pad(audTxt, 10) + pad(uiTxt, 14) +
                lpad(ar < 0 ? '?' : ar, 8));

            // flag anything that disagrees with the plan
            if (inList(EXPECTED_ON, suffix)) {
                if (!audOn) { problems.push(SC + '.' + suffix + ': should be audited, is not'); }
                else if (uiTxt !== 'yes') { problems.push(SC + '.' + suffix + ': audited but no working Audit History action'); }
            } else if (inList(EXPECTED_OFF, suffix)) {
                if (audOn) { problems.push(SC + '.' + suffix + ': audited, but was meant to stay off'); }
            }
        }
        thin();
        gs.info('   audited ' + nAudit + '   with UI action ' + nUi +
            '   tables with any trail yet ' + nTrail + '   of ' + tables.length + ' tables');

        // ---- the decision events: business rules, and what they have written
        var brs = 0, brOff = 0;
        var b = new GlideRecord('sys_script');
        b.addQuery('name', 'STARTSWITH', 'Audit - ');
        b.query();
        while (b.next()) {
            if (('' + b.getValue('collection')).indexOf(SC + '_') !== 0) { continue; }
            brs++;
            if (!isOn(b.getValue('active'))) { brOff++; }
        }
        gs.info('   decision-event business rules: ' + brs + ' of ' + EVENT_RULES +
            (brOff ? ('   (' + brOff + ' INACTIVE)') : ''));
        if (brs < EVENT_RULES) {
            problems.push(SC + ': ' + brs + ' of ' + EVENT_RULES +
                ' audit event rules - INSTALL_AUDIT_EVENTS.js not run here?');
        }
        if (brOff) { problems.push(SC + ': ' + brOff + ' audit event rule(s) inactive'); }

        var counts = [], anyEvent = 0;
        for (var ev = 0; ev < EVENTS.length; ev++) {
            var c2 = 0;
            try {
                var ga = new GlideAggregate(SC + '_audit');
                ga.addQuery('event_type', EVENTS[ev]);
                ga.addAggregate('COUNT');
                ga.query();
                if (ga.next()) { c2 = parseInt(ga.getAggregate('COUNT'), 10) || 0; }
            } catch (e3) { c2 = -1; }
            if (c2 > 0) { anyEvent += c2; }
            counts.push(EVENTS[ev] + '=' + c2);
        }
        gs.info('   events: ' + counts.join('  '));
        gTrail += 0;
        gEvents += anyEvent;
    }

    // ---------------------------------------------------------------- every audit_history on the box
    line();
    gs.info('EVERY "audit_history" UI ACTION ON THE INSTANCE');
    gs.info('   (ours, plus the Nomura original it was copied from)');
    var all = new GlideRecord('sys_ui_action');
    all.addQuery('action_name', 'audit_history');
    all.orderBy('table');
    all.query();
    var n = 0;
    while (all.next()) {
        n++;
        gs.info('   ' + pad(all.getValue('table'), 40) +
            pad(all.sys_scope.scope, 22) +
            (isOn(all.getValue('active')) ? 'active' : 'INACTIVE'));
    }
    gs.info('   total: ' + n);

    // ---------------------------------------------------------------- verdict
    line();
    gs.info('TOTALS');
    gs.info('   tables seen        : ' + gTables);
    gs.info('   audited            : ' + gAudit + '   (expected ' + (EXPECTED_ON.length * SCOPES.length) +
        ' if every scope is done and every table exists)');
    gs.info('   with UI action     : ' + gUi);
    gs.info('   sys_audit rows     : ' + gTrail);
    gs.info('   audit EVENT rows   : ' + gEvents + '   (the decisions - see INSTALL_AUDIT_EVENTS.js)');
    gs.info('');
    if (!problems.length) {
        gs.info('   No discrepancies. Every table that should be audited is, with a working action,');
        gs.info('   and nothing that was meant to stay off has been switched on.');
    } else {
        gs.error('   ' + problems.length + ' DISCREPANCY(IES):');
        for (var p = 0; p < problems.length; p++) { gs.error('      ' + problems[p]); }
    }
    if (gTrail === 0) {
        gs.info('');
        gs.info('   sys_audit is empty for these tables. That is expected right after enabling - the');
        gs.info('   trail is not retrospective. Edit one record and re-run to prove it is recording.');
    }

    // ---------------------------------------------------------------- where to look in the UI
    line();
    gs.info('THE SAME THREE THINGS, IN THE UI');
    var host = gs.getProperty('glide.servlet.uri', 'https://nomurabsmdev.service-now.com/');
    gs.info('   1. Audit ticked on every collection row');
    gs.info('      ' + host + 'sys_dictionary_list.do?sysparm_query=' +
        'nameSTARTSWITHx_nose_^internal_type=collection^ORDERBYname');
    gs.info('      (add the Audit column via the gear icon if it is not shown)');
    gs.info('');
    gs.info('   2. Every Audit History UI action');
    gs.info('      ' + host + 'sys_ui_action_list.do?sysparm_query=' +
        'action_name=audit_history^ORDERBYtable');
    gs.info('');
    gs.info('   3. The decision events, newest first');
    gs.info('      any x_nose_*_audit list, or filter event_type');
    gs.info('');
    gs.info('   4. The field-change trail, newest first');
    gs.info('      ' + host + 'sys_audit_list.do?sysparm_query=' +
        'tablenameSTARTSWITHx_nose_^ORDERBYDESCsys_created_on');
    gs.info('');
    gs.info('   And per record: open the table LIST, right-click a row, "Audit History".');
})();
