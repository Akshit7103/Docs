/**
 * SYNC ALL NEXAI ENVIRONMENTS from prod. One script, no editing between runs.
 *
 * Scripts - Background, "Execute in sandbox?" UNCHECKED. Run it FOUR times, changing only the
 * Application dropdown:
 *
 *      1.  Application = Global                -> roles + properties for ALL THREE environments
 *      2.  Application = NexAI OTC Dev         -> dev's data
 *      3.  Application = NexAI OTC UAT         -> uat's data
 *      4.  Application = NexAI OTC Test        -> test's data
 *
 * The script reads the scope it is running in and does the right thing. Nothing to edit.
 *
 * WHY NOT ONE RUN. A scoped application's tables refuse create and update from any other scope,
 * Global included ("refused due to the table's cross-scope access policy"). A script may always
 * write its OWN scope's tables, and reading another scope is permitted and auto-granted. So the
 * work splits: everything in Global tables (role grants, system properties) can be done for all
 * three environments at once; each environment's own data must be written from inside it.
 *
 * *** THIS SCRIPT WRITES, AND ONLY EVER ADDS OR UPDATES. *** Nothing is deleted, no role is
 * revoked, nobody is unassigned. It is idempotent - a second run reports "unchanged" throughout.
 *
 * WHAT IT SYNCS, always from x_nose_nfotc_bsm as the source of truth:
 *   Global run      the analyst/manager roles (granted to whoever currently holds prod's), and
 *                   the sso_idp, sso_auto and demo_users properties
 *   per-scope run   configuration keys, counterparties, bank bookings, and the work driver -
 *                   which carries both the tuned prompts and the current assigned_users, so
 *                   re-running picks up people added to prod since the last sync
 */
(function () {

    // ---------------------------------------------------------------- settings
    var SOURCE = 'x_nose_nfotc_bsm';
    var SCOPES = ['x_nose_nexai_dev', 'x_nose_nexai_uat', 'x_nose_nexai_test'];
    var DRY_RUN = false;
    var TIME_BUDGET_SEC = 280;

    // ---------------------------------------------------------------- plumbing
    var here = '' + gs.getCurrentScopeName();
    var isGlobal = (here === 'rhino.global' || here === 'global');
    var T0 = new GlideDateTime().getNumericValue();
    function now() { return new GlideDateTime().getNumericValue(); }
    function left() { return TIME_BUDGET_SEC - (now() - T0) / 1000; }

    function tableExists(t) {
        var g = new GlideRecord('sys_db_object');
        g.addQuery('name', t);
        g.query();
        return g.hasNext();
    }

    gs.info('[SYNC] ============================================================');
    gs.info('[SYNC] running in: ' + here + (DRY_RUN ? '     *** DRY RUN ***' : ''));
    gs.info('[SYNC] ============================================================');

    // ================================================================ GLOBAL RUN
    if (isGlobal) {
        for (var n = 0; n < SCOPES.length; n++) {
            var TARGET = SCOPES[n];
            gs.info('[SYNC] ---------- ' + TARGET + ' : roles and properties ----------');

            // ---- roles: grant the target's role to everyone holding the source's
            var kinds = ['analyst', 'manager'];
            for (var k = 0; k < kinds.length; k++) {
                var srcRole = SOURCE + '.' + kinds[k], dstRole = TARGET + '.' + kinds[k];

                var dr = new GlideRecord('sys_user_role');
                dr.addQuery('name', dstRole);
                dr.query();
                if (!dr.next()) { gs.warn('[SYNC]   role ' + dstRole + ' not found - is the update set imported?'); continue; }
                var dstRoleId = dr.getUniqueValue();

                var sr = new GlideRecord('sys_user_role');
                sr.addQuery('name', srcRole);
                sr.query();
                if (!sr.next()) { gs.warn('[SYNC]   role ' + srcRole + ' not found'); continue; }

                // counters are per ROLE, not cumulative - an earlier version shared them across
                // both loops and reported numbers that mixed analysts and managers together
                var granted = 0, already = 0;
                var holders = new GlideRecord('sys_user_has_role');
                holders.addQuery('role', sr.getUniqueValue());
                holders.query();
                while (holders.next()) {
                    var userId = '' + holders.getValue('user');
                    var has = new GlideRecord('sys_user_has_role');
                    has.addQuery('user', userId);
                    has.addQuery('role', dstRoleId);
                    has.query();
                    if (has.hasNext()) { already++; continue; }
                    if (!DRY_RUN) {
                        var ng = new GlideRecord('sys_user_has_role');
                        ng.initialize();
                        ng.setValue('user', userId);
                        ng.setValue('role', dstRoleId);
                        if (!ng.insert()) { gs.error('[SYNC]   grant REFUSED: ' + dstRole); continue; }
                    }
                    granted++;
                }
                gs.info('[SYNC]   ' + dstRole + ': granted ' + granted + ', already held ' + already);
            }

            // ---- properties. demo_users matters as much as the SSO pair: it grants manager-level
            // view AND is the list the analyst picker reads, so without it the target's wizard list
            // cannot assign anyone at all.
            var props = ['sso_idp', 'sso_auto', 'demo_users'];
            for (var p = 0; p < props.length; p++) {
                var from = SOURCE + '.' + props[p], to = TARGET + '.' + props[p];
                var val = '' + gs.getProperty(from, '');
                if (!val) { gs.warn('[SYNC]   ' + from + ' is empty - nothing to copy'); continue; }

                var pg = new GlideRecord('sys_properties');
                pg.addQuery('name', to);
                pg.query();
                if (pg.next()) {
                    if (('' + pg.getValue('value')) === val) {
                        gs.info('[SYNC]   property unchanged : ' + to);
                    } else {
                        if (!DRY_RUN) { pg.setValue('value', val); pg.update(); }
                        gs.info('[SYNC]   property UPDATED   : ' + to + ' = ' + val.substring(0, 110));
                    }
                } else {
                    if (!DRY_RUN) {
                        var np = new GlideRecord('sys_properties');
                        np.initialize();
                        np.setValue('name', to);
                        np.setValue('value', val);
                        np.setValue('type', 'string');
                        np.setValue('description', 'NexAI ' + props[p] + ' for ' + TARGET + ', synced from ' + SOURCE);
                        np.insert();
                    }
                    gs.info('[SYNC]   property CREATED   : ' + to + ' = ' + val.substring(0, 110));
                }
            }
        }

        gs.info('[SYNC] ============================================================');
        gs.info('[SYNC] Global run complete. Now run this SAME script three more times,');
        gs.info('[SYNC] changing only the Application dropdown:');
        for (var m = 0; m < SCOPES.length; m++) { gs.info('[SYNC]     - ' + SCOPES[m]); }
        gs.info('[SYNC] ============================================================');
        return;
    }

    // ================================================================ PER-SCOPE RUN
    var idx = -1;
    for (var z = 0; z < SCOPES.length; z++) { if (SCOPES[z] === here) { idx = z; } }
    if (idx < 0) {
        gs.error('[SYNC] ABORT: run this in Global (roles + properties) or in one of:');
        for (var y = 0; y < SCOPES.length; y++) { gs.error('[SYNC]     - ' + SCOPES[y]); }
        gs.error('[SYNC] Current scope is ' + here + '.');
        return;
    }

    var SPEC = [
        { suffix: '_config', key: 'key', label: 'configuration keys',
          fields: ['key', 'label', 'value', 'type', 'config_group', 'description'] },
        { suffix: '_counterparty', key: 'email_address', label: 'counterparties (EVE)',
          fields: ['email_address', 'org_name', 'entity'] },
        { suffix: '_booking', key: 'cashflow_id', label: 'bank bookings (PCM)',
          fields: ['cashflow_id', 'bank_trade_ref', 'counterparty_trade_ref', 'counterparty_org_name',
                   'counterparty_entity', 'product_type', 'trade_system', 'cashflow_type', 'currency',
                   'amount', 'direction', 'value_date', 'status'] },
        { suffix: '_wizard', key: 'name', label: 'work driver (PROMPTS + ASSIGNED USERS)',
          fields: ['name', 'status', 'version', 'bu', 'sub_bu', 'service', 'work_driver', 'activity',
                   'input_format', 'ingestion_type', 'mailbox', 'frequency', 'target_system',
                   'input_fields', 'id_rules', 'mapping', 'tagging', 'writeback', 'config_overrides',
                   'description', 'assigned_users', 'assigned_count'] }
    ];

    var grand = { created: 0, updated: 0, same: 0 };

    for (var s = 0; s < SPEC.length; s++) {
        var spec = SPEC[s];
        var src = SOURCE + spec.suffix, dst = here + spec.suffix;

        if (!tableExists(dst)) {
            gs.error('[SYNC] ' + dst + ' does not exist - import the update set first.');
            continue;
        }

        var existing = {}, dg = new GlideRecord(dst);
        dg.query();
        while (dg.next()) { existing['' + dg.getValue(spec.key)] = dg.getUniqueValue(); }

        var created = 0, updated = 0, same = 0, read = 0, refused = 0, i, f;
        var sg = new GlideRecord(src);
        sg.query();
        while (sg.next()) {
            // fail fast: a refused write that is counted as a success is how a migration comes to
            // look finished while the database holds nothing
            if (refused > 0) {
                gs.error('[SYNC]   ABORTING ' + spec.label + ' after the first refusal.');
                break;
            }
            if (left() < 20) {
                gs.warn('[SYNC]   time budget reached in ' + spec.label + ' after ' + read +
                    ' rows - re-run (idempotent).');
                break;
            }
            read++;
            var keyVal = '' + sg.getValue(spec.key);
            var targetId = existing[keyVal];

            if (targetId) {
                var upd = new GlideRecord(dst);
                upd.get(targetId);
                var changed = false;
                for (i = 0; i < spec.fields.length; i++) {
                    f = spec.fields[i];
                    var a = '' + (sg.getValue(f) || ''), b = '' + (upd.getValue(f) || '');
                    if (a !== b) { upd.setValue(f, a); changed = true; }
                }
                if (!changed) { same++; continue; }
                if (!DRY_RUN && !upd.update()) {
                    refused++;
                    gs.error('[SYNC]   UPDATE REFUSED on ' + dst + ' (' + keyVal + ')');
                    continue;
                }
                updated++;
            } else {
                var ins = new GlideRecord(dst);
                ins.initialize();
                for (i = 0; i < spec.fields.length; i++) {
                    f = spec.fields[i];
                    ins.setValue(f, '' + (sg.getValue(f) || ''));
                }
                if (!DRY_RUN) {
                    ins.setNewGuidValue(sg.getUniqueValue());   // same id in both scopes, so they stay comparable
                    if (!ins.insert()) {
                        refused++;
                        gs.error('[SYNC]   INSERT REFUSED on ' + dst + ' (' + keyVal + ')');
                        continue;
                    }
                }
                created++;
            }
        }

        gs.info('[SYNC] ' + spec.label + ': read ' + read + '   created ' + created +
            '   updated ' + updated + '   unchanged ' + same + (refused ? '   *** REFUSED ***' : ''));
        grand.created += created; grand.updated += updated; grand.same += same;

        // prove the work driver rather than trusting it
        if (spec.suffix === '_wizard' && !DRY_RUN) {
            var vg = new GlideRecord(dst);
            vg.query();
            while (vg.next()) {
                var flds = [], asg = [];
                try { flds = JSON.parse('' + vg.getValue('input_fields')) || []; } catch (e1) { flds = []; }
                try { asg = JSON.parse('' + vg.getValue('assigned_users')) || []; } catch (e2) { asg = []; }
                var wp = 0, we = 0, tot = 0, j;
                for (j = 0; j < flds.length; j++) {
                    var pr = '' + (flds[j].prompt || '');
                    if (pr) { wp++; tot += pr.length; }
                    if (flds[j].examples && flds[j].examples.length >= 3) { we++; }
                }
                gs.info('[SYNC]   VERIFIED "' + vg.getValue('name') + '" [' + vg.getValue('status') + ']');
                gs.info('[SYNC]     prompts  : ' + flds.length + ' fields, ' + wp + ' with a prompt, ' +
                    we + ' with 3+ examples, ' + tot + ' chars');
                gs.info('[SYNC]     assigned : ' + asg.length + ' user(s)');
                for (j = 0; j < asg.length; j++) { gs.info('[SYNC]        - ' + asg[j].name); }
            }
            gs.info('[SYNC]   EXPECTED prompts: 13 fields, 13 with a prompt, 13 with 3+ examples, ~16351 chars');
        }
    }

    gs.info('[SYNC] ============================================================');
    gs.info('[SYNC] ' + here + ': ' + grand.created + ' created, ' + grand.updated +
        ' updated, ' + grand.same + ' unchanged.');
    gs.info('[SYNC] Then: load the portal for this environment and open the work driver once.');
    gs.info('[SYNC] ============================================================');
})();
