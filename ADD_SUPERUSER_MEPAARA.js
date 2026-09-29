/**
 * GRANT SUPERUSER ACCESS  -  run ONCE in Background Scripts on nomurabsmdev.
 *
 * RUN WITH: Application = Global
 *   Roles (sys_user_has_role) and properties (sys_properties) are global tables, so ONE run covers
 *   every scope below. No per-scope run is needed - see "Why no work-driver assignment" further down.
 *
 * USER
 *   mepaara  -  arati.mepani2@nomura.com
 *
 * SCOPES - trim this list before running if she should not have all four.
 */
(function () {

    var USER_NAME = 'mepaara';
    var USER_EMAIL = 'arati.mepani2@nomura.com';

    var SCOPES = [
        'x_nose_nexai_test',
        'x_nose_nfotc_bsm',
        'x_nose_nexai_dev',
        'x_nose_nexai_uat'
    ];

    /**
     * WHAT SUPERUSER MEANS HERE, AND WHY THERE IS NO WORK-DRIVER ASSIGNMENT
     *
     * Three things gate access in this application:
     *   1. the role                     - grants table access through the ACLs
     *   2. assignment to a work driver  - decides WHOSE mail you can see
     *   3. the demo_users property      - the Manager/Analyst view toggle and the analyst picker
     *
     * (3) is not just a UI toggle. AccessGuard.isManagerOrAdmin() is
     *     gs.hasRole('admin') || _hasManagerRole() || isDemoUser()
     * and canViewAny(), canViewWizard() and canViewCashflow() all short-circuit on it. So a name in
     * demo_users sees EVERY work driver's mail with no assignment at all - it bypasses gate 2.
     *
     * That is exactly what "superuser" asks for, so this script does (1) and (3) and deliberately
     * skips (2): assigning her to one driver would add nothing she does not already have, and the
     * wizard table is scoped, which would force a separate run per scope for no benefit.
     *
     * If she should NOT see every driver's mail, do not run this - ask for analyst level instead.
     *
     * Pure ASCII. Idempotent - re-running grants nothing twice.
     */

    var log = [];
    function p(s) { log.push(s); }

    p('=================================================================');
    p('GRANT SUPERUSER   ' + USER_NAME);
    p('=================================================================');

    var here = gs.getCurrentScopeName();
    if (here !== 'global' && here !== 'rhino.global') {
        p('!! WRONG SCOPE - set the Application picker to Global and run again. Nothing changed.');
        gs.info('\n' + log.join('\n'));
        return;
    }

    // ---------------------------------------------------------------- find the user
    var u = new GlideRecord('sys_user');
    u.addQuery('user_name', USER_NAME);
    u.setLimit(1);
    u.query();
    if (!u.next()) {
        p('user_name "' + USER_NAME + '" not found - trying the email address');
        u = new GlideRecord('sys_user');
        u.addQuery('email', USER_EMAIL);
        u.setLimit(1);
        u.query();
        if (!u.next()) {
            p('');
            p('!! NO USER FOUND for user_name "' + USER_NAME + '" or email "' + USER_EMAIL + '".');
            p('   Nothing granted. Check the spelling on sys_user.list before re-running.');
            gs.info('\n' + log.join('\n'));
            return;
        }
    }
    var userId = u.getUniqueValue();
    var realName = u.getValue('user_name');
    p('');
    p('MATCHED USER');
    p('   name      : ' + u.getValue('name'));
    p('   user_name : ' + realName);
    p('   email     : ' + (u.getValue('email') || '(none)'));
    p('   active    : ' + u.getValue('active'));
    p('   sys_id    : ' + userId);
    if (u.getValue('active') !== 'true' && u.getValue('active') !== '1') {
        p('   !! this account is INACTIVE - the grants below will apply but she cannot sign in');
    }

    // ---------------------------------------------------------------- grant
    var grantedRoles = 0, skippedRoles = 0, propsChanged = 0;

    for (var s = 0; s < SCOPES.length; s++) {
        var scope = SCOPES[s];
        p('');
        p(scope);

        // --- 1. roles
        var wanted = [scope + '.analyst', scope + '.manager'];
        for (var w = 0; w < wanted.length; w++) {
            var roleName = wanted[w];
            var r = new GlideRecord('sys_user_role');
            r.addQuery('name', roleName);
            r.setLimit(1);
            r.query();
            if (!r.next()) {
                p('   role     ' + roleName + '  !! does not exist on this instance - skipped');
                continue;
            }
            var has = new GlideRecord('sys_user_has_role');
            has.addQuery('user', userId);
            has.addQuery('role', r.getUniqueValue());
            has.setLimit(1);
            has.query();
            if (has.next()) {
                p('   role     ' + roleName + '  already held');
                skippedRoles++;
                continue;
            }
            var ins = new GlideRecord('sys_user_has_role');
            ins.initialize();
            ins.setValue('user', userId);
            ins.setValue('role', r.getUniqueValue());
            if (ins.insert()) {
                p('   role     ' + roleName + '  GRANTED');
                grantedRoles++;
            } else {
                p('   role     ' + roleName + '  !! insert failed');
            }
        }

        // --- 2. demo_users
        // The code reads this with a hard-coded fallback, so a MISSING property is not the same as
        // an empty one: if the property does not exist the fallback user is a demo operator, and
        // creating it with only the new name would silently remove their access. So when it has to
        // be created, the fallback name is carried into it.
        var propName = scope + '.demo_users';
        var FALLBACK = 'akshit.mahajan';
        var pr = new GlideRecord('sys_properties');
        pr.addQuery('name', propName);
        pr.setLimit(1);
        pr.query();

        if (!pr.next()) {
            var seed = FALLBACK + ',' + realName;
            var np = new GlideRecord('sys_properties');
            np.initialize();
            np.setValue('name', propName);
            np.setValue('value', seed);
            np.setValue('type', 'string');
            np.setValue('description',
                'Comma-separated user names who get the Manager/Analyst view toggle and appear in the ' +
                'analyst picker. NOTE: a name here also grants manager-level READ across the application.');
            if (np.insert()) {
                p('   property ' + propName + '  CREATED = "' + seed + '"');
                p('            (the property did not exist; the code fallback "' + FALLBACK + '" was');
                p('             carried in so their existing access is not removed)');
                propsChanged++;
            } else {
                p('   property ' + propName + '  !! create failed');
            }
            continue;
        }

        var cur = '' + (pr.getValue('value') || '');
        var parts = cur.split(',');
        var found = false;
        for (var i = 0; i < parts.length; i++) {
            if (parts[i].replace(/^\s+|\s+$/g, '') === realName) { found = true; break; }
        }
        if (found) {
            p('   property ' + propName + '  already lists ' + realName);
        } else {
            var next = cur.replace(/^\s+|\s+$/g, '');
            next = next ? (next + ',' + realName) : realName;
            pr.setValue('value', next);
            pr.update();
            p('   property ' + propName + '  APPENDED -> "' + next + '"');
            propsChanged++;
        }
    }

    // ---------------------------------------------------------------- summary
    p('');
    p('=================================================================');
    p('roles granted     : ' + grantedRoles + '   (already held: ' + skippedRoles + ')');
    p('properties changed: ' + propsChanged);
    p('');
    if (grantedRoles || propsChanged) {
        p(realName + ' now has manager-level read across every scope listed above, plus the');
        p('Manager/Analyst toggle, and appears in the analyst picker.');
        p('');
        p('SHE DOES NOT NEED A WORK-DRIVER ASSIGNMENT - demo_users bypasses that gate. If she should');
        p('only see one driver, undo this and grant analyst level instead.');
    } else {
        p('Nothing to do - she already had everything.');
    }
    p('');
    p('TO UNDO: remove her name from each <scope>.demo_users property, and delete her');
    p('         sys_user_has_role rows for the .analyst / .manager roles.');
    p('=================================================================');
    gs.info('\n' + log.join('\n'));
})();
