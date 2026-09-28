/**
 * AUDIT TRAIL PROBE 2 - read-only. Run once in Background Scripts on nomurabsmdev, GLOBAL scope.
 *
 * Probe 1 left three things open:
 *   F  is classification_reason EVER audited? (probe 1 saw only the newest 40 rows, and
 *      composed_state flooded them, so the question is still unanswered)
 *   G  how noisy is the trail per field - composed_state looks like it is drowning the signal
 *   H  how is the "Audit History" UI Action actually surfaced? It is not a form button and not a
 *      list banner button, so it must be a link or a context-menu entry
 *   I  what roles do the real analyst users hold, and would they pass a sys_audit read?
 *
 * SAFETY: every sys_audit query is pinned to one tablename (indexed) and capped. No COUNT on
 * sys_audit. Nothing is written.
 */
(function () {
    var SCOPES = ['x_nose_nfotc_bsm', 'x_nose_nexai_dev', 'x_nose_nexai_test', 'x_nose_nexai_uat'];
    var ANALYSTS = ['khatrim', 'mohansat', 'makkaraa'];   // seen acting in the trail
    var out = [];
    function p(s) { out.push(s); }

    p('==================================================================');
    p('AUDIT TRAIL PROBE 2   scope: ' + gs.getCurrentScopeName() + '   user: ' + gs.getUserName());
    p('==================================================================');

    // ---------------------------------------------------------------- F. is the reason audited
    p('');
    p('F. IS classification_reason EVER AUDITED?  (targeted - not crowded out by other fields)');
    var WATCH = ['classification', 'classification_reason', 'extraction_status',
                 'review_status', 'thread_state', 'counterparty_name'];
    for (var s = 0; s < SCOPES.length; s++) {
        var tbl = SCOPES[s] + '_email';
        var line = [];
        for (var w = 0; w < WATCH.length; w++) {
            var a = new GlideRecord('sys_audit');
            a.addQuery('tablename', tbl);              // indexed
            a.addQuery('fieldname', WATCH[w]);
            a.setLimit(1);                             // existence check only - never count
            a.query();
            line.push(WATCH[w] + '=' + (a.hasNext() ? 'YES' : 'no'));
        }
        p('   ' + tbl);
        p('      ' + line.join('   '));
    }

    // ---------------------------------------------------------------- G. noise per field
    p('');
    p('G. WHAT IS FILLING THE TRAIL  (newest 200 on the busiest table, by field)');
    var busy = 'x_nose_nexai_test_email';
    var tally = {}, tot = 0;
    var g = new GlideRecord('sys_audit');
    g.addQuery('tablename', busy);
    g.orderByDesc('sys_created_on');
    g.setLimit(200);
    g.query();
    while (g.next()) {
        tot++;
        var f = g.getValue('fieldname') || '(none)';
        tally[f] = (tally[f] || 0) + 1;
    }
    p('   ' + busy + '  (sampled ' + tot + ' newest)');
    var keys = Object.keys(tally).sort(function (x, y) { return tally[y] - tally[x]; });
    for (var k = 0; k < keys.length; k++) {
        var pct = Math.round((tally[keys[k]] * 100) / (tot || 1));
        p('      ' + keys[k] + ' : ' + tally[keys[k]] + '  (' + pct + '%)');
    }

    // ---------------------------------------------------------------- H. how is it surfaced
    p('');
    p('H. HOW THE "Audit History" UI ACTION IS SURFACED');
    var ua = new GlideRecord('sys_ui_action');
    ua.addQuery('name', 'Audit History');
    ua.addQuery('table', 'STARTSWITH', 'x_nose_n');
    ua.setLimit(3);
    ua.query();
    while (ua.next()) {
        p('   table=' + ua.getValue('table'));
        p('      form_button=' + ua.getValue('form_button') +
          '  form_link=' + ua.getValue('form_link') +
          '  form_context_menu=' + ua.getValue('form_context_menu'));
        p('      list_banner_button=' + ua.getValue('list_banner_button') +
          '  list_link=' + ua.getValue('list_link') +
          '  list_context_menu=' + ua.getValue('list_context_menu') +
          '  list_choice=' + ua.getValue('list_choice'));
        p('      show_insert=' + ua.getValue('show_insert') +
          '  show_update=' + ua.getValue('show_update') +
          '  client=' + ua.getValue('client') +
          '  order=' + ua.getValue('order'));
        p('      onclick : ' + (ua.getValue('onclick') || '(none)'));
        p('      script  : ' + ((ua.getValue('script') || '(none)').replace(/\s+/g, ' ').substring(0, 220)));
        p('');
    }

    // ---------------------------------------------------------------- I. the analysts' roles
    p('');
    p('I. THE REAL ANALYST USERS - what roles do they hold?');
    for (var i = 0; i < ANALYSTS.length; i++) {
        var u = new GlideRecord('sys_user');
        u.addQuery('user_name', ANALYSTS[i]);
        u.setLimit(1);
        u.query();
        if (!u.next()) { p('   ' + ANALYSTS[i] + '  (not found)'); continue; }
        var roles = [];
        var r = new GlideRecord('sys_user_has_role');
        r.addQuery('user', u.getUniqueValue());
        r.query();
        while (r.next()) { roles.push(r.role.getDisplayValue()); }
        p('   ' + ANALYSTS[i] + '  (' + u.getValue('name') + ')');
        p('      roles: ' + (roles.join(', ') || '(none)'));
        p('      admin: ' + (roles.indexOf('admin') > -1) +
          '   nom_support_readonly: ' + (roles.indexOf('nom_support_readonly') > -1));
    }

    p('');
    p('==================================================================');
    gs.info('\n' + out.join('\n'));
})();
