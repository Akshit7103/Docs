/**
 * ADD USERS to a NexAI environment.
 *
 * *** TWO RUNS, TWO SCOPES *** - same reason as the commissioning script. Roles and system
 * properties live in Global tables; the work driver lives in the application's own table, and a
 * scoped table refuses writes from any other scope.
 *
 *   pass 1   Application = Global        DO_ROLES = true,  DO_ASSIGN = false
 *   pass 2   Application = SCOPE below   DO_ROLES = false, DO_ASSIGN = true
 *
 * Scripts - Background, "Execute in sandbox?" UNCHECKED, both times.
 *
 * *** THIS SCRIPT WRITES, BUT ONLY EVER ADDS. *** It never removes a role, never drops anyone
 * from the superuser list, and never unassigns anyone. Run it as often as you like; the second
 * run reports "already" for everything.
 *
 * WHY THREE THINGS PER USER, NOT ONE. A role by itself shows a person nothing:
 *
 *   role        gets them into the application
 *   assignment  the board and every write action check that this user is assigned to THIS work
 *               driver. Role without assignment = an empty landing page
 *   superuser   the demo_users property: manager-level view plus the Manager/Analyst view-as
 *               toggle. It is ALSO what makes someone appear in the analyst picker on the wizard
 *               list, so a user who is not in it cannot be assigned through the UI at all
 */
(function () {

    // ---------------------------------------------------------------- who
    var USERS = [
        { user_name: 'sriyer',   analyst: true, manager: true, superuser: true },   // Sriram Iyer
        { user_name: 'godavars', analyst: true, manager: true, superuser: true }    // Sandhya Godavarthy
    ];

    var SCOPE = 'x_nose_nfotc_bsm';                      // the environment to add them to
    var WIZ_NAME = 'OTC Settlement : Prematching';       // the work driver to assign them to

    var DO_ROLES = true;      // roles + the superuser list   -> run in GLOBAL
    var DO_ASSIGN = false;    // work driver assignment       -> run in the SCOPE above
    var DRY_RUN = false;

    // ---------------------------------------------------------------- plumbing
    var here = '' + gs.getCurrentScopeName();
    var isGlobal = (here === 'rhino.global' || here === 'global');
    if (DO_ROLES && !isGlobal) {
        gs.error('[USERS] ABORT: roles and the superuser property need Application = Global, not ' + here + '.');
        return;
    }
    if (DO_ASSIGN && here !== SCOPE) {
        gs.error('[USERS] ABORT: work driver assignment needs Application = ' + SCOPE + ', not ' + here + '.');
        return;
    }
    if (!DO_ROLES && !DO_ASSIGN) { gs.error('[USERS] ABORT: nothing enabled.'); return; }

    gs.info('[USERS] ============================================================');
    gs.info('[USERS] ' + SCOPE + (DRY_RUN ? '     *** DRY RUN, nothing is written ***' : ''));
    gs.info('[USERS] ============================================================');

    // resolve each person once, and refuse to guess if they are not found
    var resolved = [];
    for (var u = 0; u < USERS.length; u++) {
        var spec = USERS[u];
        var ug = new GlideRecord('sys_user');
        ug.addQuery('user_name', spec.user_name);
        ug.query();
        if (!ug.next()) {
            gs.error('[USERS] NOT FOUND: "' + spec.user_name + '" - check the User ID on the sys_user record.');
            continue;
        }
        if (('' + ug.getValue('active')) !== 'true') {
            gs.warn('[USERS] "' + spec.user_name + '" is INACTIVE - continuing, but they will not be able to sign in.');
        }
        resolved.push({
            spec: spec,
            id: ug.getUniqueValue(),
            name: '' + (ug.getValue('name') || spec.user_name),
            email: '' + (ug.getValue('email') || '')
        });
        gs.info('[USERS] resolved ' + spec.user_name + '  ->  ' + ug.getValue('name') + '  <' + ug.getValue('email') + '>');
    }
    if (!resolved.length) { gs.error('[USERS] nobody resolved - nothing to do.'); return; }

    // ---------------------------------------------------------------- pass 1: roles + superuser
    if (DO_ROLES) {
        var kinds = ['analyst', 'manager'];
        for (var k = 0; k < kinds.length; k++) {
            var kind = kinds[k], roleName = SCOPE + '.' + kind;
            var rg = new GlideRecord('sys_user_role');
            rg.addQuery('name', roleName);
            rg.query();
            if (!rg.next()) { gs.error('[USERS] role ' + roleName + ' does not exist on this instance.'); continue; }
            var roleId = rg.getUniqueValue();

            for (var r = 0; r < resolved.length; r++) {
                if (!resolved[r].spec[kind]) { continue; }
                var has = new GlideRecord('sys_user_has_role');
                has.addQuery('user', resolved[r].id);
                has.addQuery('role', roleId);
                has.query();
                if (has.hasNext()) {
                    gs.info('[USERS] role already : ' + resolved[r].spec.user_name + '  ' + roleName);
                    continue;
                }
                if (!DRY_RUN) {
                    var ng = new GlideRecord('sys_user_has_role');
                    ng.initialize();
                    ng.setValue('user', resolved[r].id);
                    ng.setValue('role', roleId);
                    if (!ng.insert()) {
                        gs.error('[USERS] role GRANT REFUSED : ' + resolved[r].spec.user_name + '  ' + roleName);
                        continue;
                    }
                }
                gs.info('[USERS] role GRANTED : ' + resolved[r].spec.user_name + '  ' + roleName);
            }
        }

        // the superuser list. Append-only: existing names are preserved exactly as they are.
        var propName = SCOPE + '.demo_users';
        var current = '' + gs.getProperty(propName, '');
        var list = current ? current.split(',') : [];
        var clean = [], seen = {}, i;
        for (i = 0; i < list.length; i++) {
            var v = ('' + list[i]).replace(/^\s+|\s+$/g, '');
            if (v && !seen[v.toLowerCase()]) { seen[v.toLowerCase()] = true; clean.push(v); }
        }
        var addedNames = [];
        for (i = 0; i < resolved.length; i++) {
            if (!resolved[i].spec.superuser) { continue; }
            var un = resolved[i].spec.user_name;
            if (seen[un.toLowerCase()]) {
                gs.info('[USERS] superuser already : ' + un);
                continue;
            }
            seen[un.toLowerCase()] = true;
            clean.push(un);
            addedNames.push(un);
        }
        if (addedNames.length) {
            var next = clean.join(',');
            if (!DRY_RUN) {
                var pg = new GlideRecord('sys_properties');
                pg.addQuery('name', propName);
                pg.query();
                if (pg.next()) { pg.setValue('value', next); pg.update(); }
                else {
                    var np = new GlideRecord('sys_properties');
                    np.initialize();
                    np.setValue('name', propName);
                    np.setValue('value', next);
                    np.setValue('type', 'string');
                    np.setValue('description', 'NexAI superusers: manager-level view and the analyst picker source.');
                    np.insert();
                }
            }
            gs.info('[USERS] superuser ADDED : ' + addedNames.join(', '));
            gs.info('[USERS] ' + propName + ' is now: ' + next);
        } else {
            gs.info('[USERS] superuser list unchanged: ' + (current || '(empty)'));
        }

        gs.info('[USERS] ------------------------------------------------------------');
        gs.info('[USERS] Pass 1 done. Now run pass 2: Application = ' + SCOPE +
            ', DO_ROLES = false, DO_ASSIGN = true.');
    }

    // ---------------------------------------------------------------- pass 2: work driver assignment
    if (DO_ASSIGN) {
        var wg = new GlideRecord(SCOPE + '_wizard');
        wg.addQuery('name', WIZ_NAME);
        wg.query();
        if (!wg.next()) {
            gs.error('[USERS] work driver "' + WIZ_NAME + '" not found in ' + SCOPE + '.');
            return;
        }

        var assigned = [];
        try { assigned = JSON.parse('' + (wg.getValue('assigned_users') || '[]')) || []; } catch (e) { assigned = []; }

        var byId = {}, j;
        for (j = 0; j < assigned.length; j++) { byId['' + assigned[j].id] = true; }

        var added = 0;
        for (j = 0; j < resolved.length; j++) {
            if (byId[resolved[j].id]) {
                gs.info('[USERS] assigned already : ' + resolved[j].spec.user_name);
                continue;
            }
            assigned.push({ id: resolved[j].id, name: resolved[j].name });
            byId[resolved[j].id] = true;
            added++;
            gs.info('[USERS] assigned ADDED   : ' + resolved[j].spec.user_name + '  (' + resolved[j].name + ')');
        }

        if (added) {
            if (!DRY_RUN) {
                wg.setValue('assigned_users', JSON.stringify(assigned));
                wg.setValue('assigned_count', assigned.length);
                if (!wg.update()) {
                    gs.error('[USERS] WORK DRIVER UPDATE REFUSED - are you in the ' + SCOPE + ' scope?');
                    return;
                }
            }
        }
        gs.info('[USERS] ------------------------------------------------------------');
        gs.info('[USERS] work driver "' + WIZ_NAME + '" now has ' + assigned.length + ' assigned user(s):');
        for (j = 0; j < assigned.length; j++) { gs.info('[USERS]    - ' + assigned[j].name); }
        gs.info('[USERS] ------------------------------------------------------------');
        gs.info('[USERS] Done. Ask them to sign in at the portal; they should land on Work Drivers');
        gs.info('[USERS] and see the board for this work driver.');
    }
})();
