/**
 * AUDIT TRAIL PROBE - read-only. Run once in Background Scripts on nomurabsmdev.
 *
 * WHERE TO RUN: Global scope first (it reads platform tables). Then, if you want answer (E)
 * for the scoped case, run it again with Application = NexAI OTC BSM.
 *
 * Answers:
 *   A  which of our tables actually have Audit ticked
 *   B  what the native trail has captured since auditing was switched on
 *   C  the "Audit History" UI Actions - and why only admins see them
 *   D  who is allowed to read sys_audit today
 *   E  whether the CURRENT scope can read sys_audit at all (decides the widget approach)
 *
 * SAFETY: sys_audit is ~1 billion rows instance-wide. Every query below is pinned to one
 * tablename (indexed) and capped with setLimit(). Nothing counts the table. Nothing writes.
 */
(function () {
    var SCOPES = ['x_nose_nfotc_bsm', 'x_nose_nexai_dev', 'x_nose_nexai_test', 'x_nose_nexai_uat'];
    var SINCE = '2026-09-26 00:00:00';          // auditing was enabled on the 26th
    var out = [];
    function p(s) { out.push(s); }

    p('==================================================================');
    p('AUDIT TRAIL PROBE   running in scope: ' + gs.getCurrentScopeName());
    p('user: ' + gs.getUserName() + '   admin: ' + gs.hasRole('admin'));
    p('==================================================================');

    // ---------------------------------------------------------------- A. the Audit flag
    p('');
    p('A. AUDIT FLAG ON THE DICTIONARY COLLECTION ROW');
    p('   (the table-level row: element empty. This is what turns record auditing on.)');
    var auditedTables = [];
    for (var s = 0; s < SCOPES.length; s++) {
        var on = [], off = [];
        var d = new GlideRecord('sys_dictionary');
        d.addQuery('name', 'STARTSWITH', SCOPES[s] + '_');
        d.addNullQuery('element');
        d.orderBy('name');
        d.query();
        while (d.next()) {
            var nm = d.getValue('name');
            if (d.getValue('audit') === '1' || d.getValue('audit') === 'true') {
                on.push(nm.substring(SCOPES[s].length + 1));
                auditedTables.push(nm);
            } else {
                off.push(nm.substring(SCOPES[s].length + 1));
            }
        }
        p('   ' + SCOPES[s]);
        p('      AUDITED (' + on.length + '): ' + (on.join(', ') || '-'));
        p('      not     (' + off.length + '): ' + (off.join(', ') || '-'));
    }

    // ---------------------------------------------------------------- B. what it captured
    p('');
    p('B. WHAT THE NATIVE TRAIL HAS CAPTURED SINCE ' + SINCE);
    p('   (bounded: one tablename at a time, newest first, 40 rows max each)');
    if (!auditedTables.length) { p('   no audited tables found - nothing to check'); }
    for (var t = 0; t < auditedTables.length; t++) {
        var tbl = auditedTables[t];
        var fields = {}, users = {}, n = 0, samples = [];
        var a = new GlideRecord('sys_audit');
        a.addQuery('tablename', tbl);                 // indexed - keeps this cheap
        a.addQuery('sys_created_on', '>=', SINCE);
        a.orderByDesc('sys_created_on');
        a.setLimit(40);
        a.query();
        while (a.next()) {
            n++;
            var f = a.getValue('fieldname') || '(none)';
            var u = a.getValue('user') || '(none)';
            fields[f] = (fields[f] || 0) + 1;
            users[u] = (users[u] || 0) + 1;
            if (samples.length < 4) {
                samples.push('        ' + a.getValue('sys_created_on') + '  ' + f +
                    ' : ' + JSON.stringify((a.getValue('oldvalue') || '').substring(0, 30)) +
                    ' -> ' + JSON.stringify((a.getValue('newvalue') || '').substring(0, 30)) +
                    '   by ' + u);
            }
        }
        if (!n) { continue; }
        p('   ' + tbl + '   ' + n + ' row(s)');
        p('      fields : ' + Object.keys(fields).map(function (k) { return k + '(' + fields[k] + ')'; }).join(', '));
        p('      actors : ' + Object.keys(users).map(function (k) { return k + '(' + users[k] + ')'; }).join(', '));
        p('      reason field captured: ' + (fields['classification_reason'] ? 'YES' : 'no'));
        for (var si = 0; si < samples.length; si++) { p(samples[si]); }
    }

    // ---------------------------------------------------------------- C. the UI Actions
    p('');
    p('C. THE "AUDIT HISTORY" UI ACTIONS - why only admins see them');
    var ua = new GlideRecord('sys_ui_action');
    ua.addEncodedQuery('nameLIKEAudit^ORnameLIKEHistory');
    ua.orderBy('table');
    ua.query();
    var seen = 0;
    while (ua.next()) {
        var tb = ua.getValue('table') || '';
        if (tb.indexOf('x_nose_') !== 0) { continue; }
        seen++;
        p('   ' + ua.getValue('name') + '   table=' + tb);
        p('      active=' + ua.getValue('active') +
          '  list_banner=' + ua.getValue('list_banner_button') +
          '  form_button=' + ua.getValue('form_button'));
        p('      ROLES     : ' + (ua.getValue('roles') || '(none - open to anyone who can see the form)'));
        p('      CONDITION : ' + ((ua.getValue('condition') || '(none)').substring(0, 160)));
    }
    if (!seen) { p('   none found on x_nose_* tables'); }

    // ---------------------------------------------------------------- D. who can read sys_audit
    p('');
    p('D. WHO CAN READ sys_audit TODAY');
    var acl = new GlideRecord('sys_security_acl');
    acl.addQuery('name', 'STARTSWITH', 'sys_audit');
    acl.addQuery('operation', 'read');
    acl.query();
    var na = 0;
    while (acl.next()) {
        na++;
        var roles = [];
        var rr = new GlideRecord('sys_security_acl_role');
        rr.addQuery('sys_security_acl', acl.getUniqueValue());
        rr.query();
        while (rr.next()) { roles.push(rr.sys_user_role.getDisplayValue()); }
        p('   ' + acl.getValue('name') + '  active=' + acl.getValue('active') +
          '  admin_overrides=' + acl.getValue('admin_overrides'));
        p('      roles     : ' + (roles.join(', ') || '(none)'));
        p('      condition : ' + ((acl.getValue('condition') || '(none)').substring(0, 120)));
        p('      script    : ' + ((acl.getValue('script') || '(none)').replace(/\s+/g, ' ').substring(0, 120)));
    }
    if (!na) { p('   no read ACL rows named sys_audit* (platform default applies)'); }

    // ---------------------------------------------------------------- E. can THIS scope read it
    p('');
    p('E. CAN THIS SCOPE READ sys_audit?  (decides the portal-widget approach)');
    try {
        var probe = new GlideRecord('sys_audit');
        var canInit = probe.isValid();
        p('   GlideRecord valid in this scope : ' + canInit);
        if (canInit && auditedTables.length) {
            probe.addQuery('tablename', auditedTables[0]);
            probe.setLimit(1);
            probe.query();
            p('   read test on ' + auditedTables[0] + ' : ' +
              (probe.next() ? 'OK - returned a row' : 'query ran, no rows matched'));
        }
    } catch (e) {
        p('   BLOCKED: ' + e);
    }

    p('');
    p('==================================================================');
    gs.info('\n' + out.join('\n'));
})();
