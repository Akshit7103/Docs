/**
 * COMMISSION A NEXAI ENVIRONMENT on bsmdev.
 *
 * *** RUN THIS IN GLOBAL SCOPE *** (Scripts - Background, Application = Global,
 * "Execute in sandbox?" UNCHECKED). Global is required because the script reads one scoped
 * application's tables and writes another's.
 *
 * *** THIS SCRIPT WRITES. *** It is idempotent: run it twice and the second run reports
 * "unchanged" for everything it already applied. Nothing is ever deleted.
 *
 * WHAT IT DOES. x_nose_nfotc_bsm on this instance now holds data that is proven working -
 * 680 bookings, 51 counterparties, the configuration keys, and the work driver carrying
 * 18,929 characters of tuned prompts. A freshly imported dev / uat / test scope holds none of
 * it: an update set carries metadata only. So rather than shipping hundreds of rows inside a
 * script, this copies scope to scope on the same instance. The target therefore gets exactly
 * what is known to work, not a second transcription of it.
 *
 * Record ids are PRESERVED across the copy, so "is dev identical to prod" stays answerable by
 * comparing ids rather than by eye.
 *
 * SET THE TARGET, then run. One scope per run.
 */
(function () {

    // ---------------------------------------------------------------- settings
    var TARGET = 'x_nose_nexai_dev';      // x_nose_nexai_dev | x_nose_nexai_uat | x_nose_nexai_test
    var SOURCE = 'x_nose_nfotc_bsm';

    var DO_DATA = true;     // bookings, counterparties, config, work driver
    var DO_SSO = true;      // create the target scope's two SSO properties from the source's
    var DO_ROLES = true;    // grant the target's roles to whoever holds the source's, and assign the board
    var DRY_RUN = false;    // true = report what WOULD happen and write nothing

    var TIME_BUDGET_SEC = 240;

    // ---------------------------------------------------------------- plumbing
    var scope = '' + gs.getCurrentScopeName();
    if (scope !== 'rhino.global' && scope !== 'global') {
        gs.error('[COMMISSION] ABORT: run with Application = Global, not ' + scope +
            '. Global is needed to read one scope and write another.');
        return;
    }
    if (TARGET === SOURCE) { gs.error('[COMMISSION] ABORT: target and source are the same scope.'); return; }

    var T0 = new GlideDateTime().getNumericValue();
    function now() { return new GlideDateTime().getNumericValue(); }
    function left() { return TIME_BUDGET_SEC - (now() - T0) / 1000; }

    gs.info('[COMMISSION] ============================================================');
    gs.info('[COMMISSION] ' + SOURCE + '  ->  ' + TARGET + (DRY_RUN ? '     *** DRY RUN, nothing is written ***' : ''));
    gs.info('[COMMISSION] ============================================================');

    function tableExists(t) {
        var g = new GlideRecord('sys_db_object');
        g.addQuery('name', t);
        g.query();
        return g.hasNext();
    }

    // The four tables, their natural key, and the fields worth carrying. sys_* fields are
    // deliberately excluded: created/updated stamps belong to the target instance.
    var SPEC = [
        { suffix: '_config', key: 'key', label: 'configuration keys',
          fields: ['key', 'label', 'value', 'type', 'config_group', 'description'] },
        { suffix: '_counterparty', key: 'email_address', label: 'counterparties (EVE)',
          fields: ['email_address', 'org_name', 'entity'] },
        { suffix: '_booking', key: 'cashflow_id', label: 'bank bookings (PCM)',
          fields: ['cashflow_id', 'bank_trade_ref', 'counterparty_trade_ref', 'counterparty_org_name',
                   'counterparty_entity', 'product_type', 'trade_system', 'cashflow_type', 'currency',
                   'amount', 'direction', 'value_date', 'status'] },
        { suffix: '_wizard', key: 'name', label: 'work driver (CARRIES THE TUNED PROMPTS)',
          fields: ['name', 'status', 'version', 'bu', 'sub_bu', 'service', 'work_driver', 'activity',
                   'input_format', 'ingestion_type', 'mailbox', 'frequency', 'target_system',
                   'input_fields', 'id_rules', 'mapping', 'tagging', 'writeback', 'config_overrides',
                   'description', 'assigned_users', 'assigned_count'] }
    ];

    var totals = { created: 0, updated: 0, same: 0, skipped: 0 };

    if (DO_DATA) {
        for (var s = 0; s < SPEC.length; s++) {
            var spec = SPEC[s];
            var src = SOURCE + spec.suffix, dst = TARGET + spec.suffix;

            if (!tableExists(dst)) {
                gs.error('[COMMISSION] ' + dst + ' does not exist. Import the ' + TARGET +
                    ' update set first, then re-run.');
                totals.skipped++;
                continue;
            }

            // Read the target ONCE into a map, so 680 rows cost one query rather than 680.
            var existing = {}, dg = new GlideRecord(dst);
            dg.query();
            while (dg.next()) { existing['' + dg.getValue(spec.key)] = dg.getUniqueValue(); }

            var created = 0, updated = 0, same = 0, read = 0;
            var sg = new GlideRecord(src);
            sg.query();
            while (sg.next()) {
                if (left() < 20) {
                    gs.warn('[COMMISSION]   time budget reached inside ' + spec.label +
                        ' after ' + read + ' rows - re-run to continue (it is idempotent).');
                    break;
                }
                read++;
                var keyVal = '' + sg.getValue(spec.key);
                var targetId = existing[keyVal];
                var f, i;

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
                    if (!DRY_RUN) { upd.update(); }
                    updated++;
                } else {
                    var ins = new GlideRecord(dst);
                    ins.initialize();
                    for (i = 0; i < spec.fields.length; i++) {
                        f = spec.fields[i];
                        ins.setValue(f, '' + (sg.getValue(f) || ''));
                    }
                    // keep the same record id in both scopes so the two can be compared directly
                    if (!DRY_RUN) {
                        ins.setNewGuidValue(sg.getUniqueValue());
                        ins.insert();
                    }
                    created++;
                }
            }

            gs.info('[COMMISSION] ' + spec.label);
            gs.info('[COMMISSION]   ' + src + ' -> ' + dst);
            gs.info('[COMMISSION]   read ' + read + '   created ' + created + '   updated ' + updated +
                '   unchanged ' + same);
            totals.created += created; totals.updated += updated; totals.same += same;

            // the work driver is the one worth proving rather than trusting
            if (spec.suffix === '_wizard' && !DRY_RUN) {
                var vg = new GlideRecord(dst);
                vg.query();
                while (vg.next()) {
                    var flds = [];
                    try { flds = JSON.parse('' + vg.getValue('input_fields')) || []; } catch (e) { flds = []; }
                    var wp = 0, we = 0, tot = 0, j;
                    for (j = 0; j < flds.length; j++) {
                        var p = '' + (flds[j].prompt || '');
                        if (p) { wp++; tot += p.length; }
                        if (flds[j].examples && flds[j].examples.length >= 3) { we++; }
                    }
                    gs.info('[COMMISSION]   VERIFIED "' + vg.getValue('name') + '" [' + vg.getValue('status') +
                        ']: ' + flds.length + ' fields, ' + wp + ' with a prompt, ' + we +
                        ' with 3+ examples, ' + tot + ' chars of prompt text');
                }
                gs.info('[COMMISSION]   EXPECTED: 13 fields, 13 with a prompt, 13 with 3+ examples, ~16351 chars');
            }
        }
    }

    // ---------------------------------------------------------------- SSO
    // The login widget in each scope reads ITS OWN properties. Without these the target portal
    // falls back to the local username and password form.
    if (DO_SSO) {
        var props = ['sso_idp', 'sso_auto'];
        for (var q = 0; q < props.length; q++) {
            var from = SOURCE + '.' + props[q], to = TARGET + '.' + props[q];
            var val = '' + gs.getProperty(from, '');
            if (!val) { gs.warn('[COMMISSION] SSO: ' + from + ' is empty - nothing to copy to ' + to); continue; }
            var pg = new GlideRecord('sys_properties');
            pg.addQuery('name', to);
            pg.query();
            if (pg.next()) {
                if (('' + pg.getValue('value')) === val) {
                    gs.info('[COMMISSION] SSO unchanged : ' + to);
                } else {
                    if (!DRY_RUN) { pg.setValue('value', val); pg.update(); }
                    gs.info('[COMMISSION] SSO UPDATED   : ' + to + ' = ' + val);
                }
            } else {
                if (!DRY_RUN) {
                    var np = new GlideRecord('sys_properties');
                    np.initialize();
                    np.setValue('name', to);
                    np.setValue('value', val);
                    np.setValue('type', 'string');
                    np.setValue('description', 'NexAI SSO setting for ' + TARGET + ', copied from ' + SOURCE);
                    np.insert();
                }
                gs.info('[COMMISSION] SSO CREATED   : ' + to + ' = ' + val);
            }
        }
    }

    // ---------------------------------------------------------------- roles and assignment
    // A role grants access to the application; the board additionally requires assignment.
    // Both are per scope, so neither carries across on its own.
    if (DO_ROLES) {
        var kinds = ['analyst', 'manager'], granted = 0, already = 0;
        for (var k = 0; k < kinds.length; k++) {
            var srcRole = SOURCE + '.' + kinds[k], dstRole = TARGET + '.' + kinds[k];

            var rg = new GlideRecord('sys_user_role');
            rg.addQuery('name', dstRole);
            rg.query();
            if (!rg.next()) { gs.warn('[COMMISSION] role ' + dstRole + ' not found - is the update set imported?'); continue; }
            var dstRoleId = rg.getUniqueValue();

            var sr = new GlideRecord('sys_user_role');
            sr.addQuery('name', srcRole);
            sr.query();
            if (!sr.next()) { gs.warn('[COMMISSION] role ' + srcRole + ' not found on this instance'); continue; }

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
                    ng.insert();
                }
                granted++;
            }
            gs.info('[COMMISSION] role ' + dstRole + ': granted ' + granted + ', already held ' + already);
        }
        gs.info('[COMMISSION] NOTE: assigned_users was copied with the work driver, so the same people');
        gs.info('[COMMISSION] are assigned to the board. Open the wizard list if you want to change that.');
    }

    // ---------------------------------------------------------------- summary
    gs.info('[COMMISSION] ============================================================');
    gs.info('[COMMISSION] ' + TARGET + ': ' + totals.created + ' created, ' + totals.updated +
        ' updated, ' + totals.same + ' unchanged' + (totals.skipped ? ', ' + totals.skipped + ' TABLE(S) MISSING' : ''));
    if (DRY_RUN) { gs.info('[COMMISSION] DRY RUN - nothing was written. Set DRY_RUN = false to apply.'); }
    gs.info('[COMMISSION] Then: open the work driver once in the builder, load the portal, and run one Sync.');
    gs.info('[COMMISSION] Change TARGET at the top and run again for the next environment.');
})();
