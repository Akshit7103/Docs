/**
 * Tick Audit on the collection dictionary row for every NexAI table, across ALL FOUR scopes.
 *
 * Run: Background Scripts, Application "Global". ONE RUN, not four.
 *
 * WHY GLOBAL AND NOT PER SCOPE - the correction
 * ---------------------------------------------
 * MEASURED on nomurabsmdev, running this from inside x_nose_nexai_test:
 *
 *   Write operation against 'sys_dictionary' from scope 'x_nose_nexai_test' has been refused
 *   due to the table's cross-scope access policy
 *
 * All eight writes were refused and the earlier per-scope version reported 9 failures. sys_dictionary
 * is a protected PLATFORM table: it refuses writes from any scoped application, including the one that
 * owns the table, because a dictionary change alters the database schema. Global is not a scoped
 * caller, so it is allowed.
 *
 * This is the exact opposite of the scoped config table, which refuses writes FROM Global and has to be
 * set inside the scope. Two tables, two directions, and the only reliable way to tell them apart is to
 * try it. The precedent was already there: the Script Include propagator wrote into all three target
 * scopes from Global without trouble.
 *
 * "Switch the scope first" in the walkthrough is about the dictionary FORM in the UI, which will not let
 * you edit another application's record until you switch. It does not apply to a background script.
 *
 * WHAT "AUDIT" IS
 * ---------------
 * One checkbox on the COLLECTION row of the table's dictionary entry - the row whose Column name is
 * empty and whose Type is "collection". Ticking it makes the platform write one sys_audit row per
 * changed field per update, and a sys_audit_delete row on deletion. No code, nothing to deploy.
 *
 *   - NOT retrospective. The trail starts now; anything before is gone.
 *   - Record level, not portal.
 *
 * EIGHT TABLES ON, FOUR OFF, per scope. The four left off are all insert-only, and audit records field
 * CHANGES - an insert has none - so auditing them would double the write volume of the busiest tables
 * in the app and record nothing anyone could read.
 *
 * Anything not in the plan is reported as UNKNOWN and left alone.
 *
 * NOTE ON sys_audit: it holds over a BILLION rows on this instance - it is shared by the whole
 * platform. Never COUNT it unfiltered; an earlier version of this script did and took 2m40s on that
 * one query alone. Existence checks only, below.
 *
 * Safe to run twice: a table already ticked is reported and skipped.
 */
(function () {
    var SCOPES = ['x_nose_nexai_test', 'x_nose_nexai_dev', 'x_nose_nexai_uat', 'x_nose_nfotc_bsm'];

    var PLAN = {
        'email':        [true,  'the settlement mail and its status'],
        'cashflow':     [true,  'the money. the one that matters most'],
        'booking':      [true,  'golden-source rows Compare and Match runs against'],
        'counterparty': [true,  'directory that feeds matching'],
        'wizard':       [true,  'prompts and field config - editing these changes what is extracted'],
        'config':       [true,  'thresholds and toggles'],
        'capability':   [true,  'defines what the pipeline is allowed to do'],
        'work_item':    [true,  'who or what acted on a case'],
        'match':        [true,  'match results'],
        'match_result': [true,  'match results'],
        'allegation':   [true,  'allegation records'],
        'case':         [true,  'case records'],
        'ssi':          [true,  'standing settlement instructions'],
        'entity':       [true,  'Nomura entity directory'],

        'llm_usage':    [false, 'insert-only metrics, one row per LLM call'],
        'audit':        [false, 'the application own audit-event table, insert-only'],
        'mailbox_drop': [false, 'ingestion staging, insert-only'],
        'zip_drop':     [false, 'bulk upload staging, insert-only']
    };

    function line() { gs.info('=================================================================='); }
    function thin() { gs.info('   ----------------------------------------------------------------'); }
    var pass = 0, fail = 0;
    function P(l, d) { pass++; gs.info('   PASS  ' + l + (d ? '   ' + d : '')); }
    function F(l, d) { fail++; gs.error('   FAIL  ' + l + (d ? '   ' + d : '')); }
    function pad(s, n) { s = '' + s; while (s.length < n) { s = s + ' '; } return s; }
    function lpad(s, n) { s = '' + s; while (s.length < n) { s = ' ' + s; } return s; }
    function isOn(v) { v = '' + (v || ''); return v === 'true' || v === '1'; }

    function rows(t) {
        try {
            var a = new GlideAggregate(t);
            a.addAggregate('COUNT');
            a.query();
            return a.next() ? parseInt(a.getAggregate('COUNT'), 10) : 0;
        } catch (e) { return '?'; }
    }

    // The COLLECTION row: Column name empty AND Type "collection". Both, because ticking Audit on a
    // FIELD row is a different setting with a different meaning.
    function collectionRow(table) {
        var d = new GlideRecord('sys_dictionary');
        d.addQuery('name', table);
        d.query();
        while (d.next()) {
            if (('' + (d.getValue('element') || '')) === '' &&
                ('' + (d.getValue('internal_type') || '')) === 'collection') {
                return d.getUniqueValue();
            }
        }
        return null;
    }

    var scope = '?';
    try { scope = '' + gs.getCurrentScopeName(); } catch (e) { scope = '?'; }
    gs.info('instance : ' + gs.getProperty('instance_name', '?'));
    gs.info('scope    : ' + scope);
    if (scope !== 'global' && scope !== 'rhino.global') {
        gs.error('ABORT. Run with Application = "Global".');
        gs.error('sys_dictionary refuses writes from a scoped application - that is the whole reason');
        gs.error('this script exists in this form. Nothing was changed.');
        return;
    }

    // cheap liveness check - NEVER count this table
    var alive = false;
    try {
        var sa = new GlideRecord('sys_audit');
        sa.setLimit(1);
        sa.query();
        alive = sa.hasNext() || sa.next();
    } catch (e0) { alive = false; }
    gs.info('sys_audit: ' + (alive ? 'present and holding rows' : 'not readable or empty'));

    var gOn = 0, gAlready = 0, gOff = 0, gUnknown = 0, gBroken = 0;

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
            gs.error('   no table with this prefix - is the application installed on this instance?');
            gBroken++;
            continue;
        }

        gs.info('   ' + pad('TABLE', 34) + lpad('ROWS', 8) + '   RESULT');
        thin();

        for (var t = 0; t < tables.length; t++) {
            var tbl = tables[t];
            var suffix = tbl.substring(SC.length + 1);
            var plan = PLAN[suffix];
            var n = rows(tbl);

            if (!plan) {
                gUnknown++;
                gs.info('   ' + pad(tbl, 34) + lpad(n, 8) + '   UNKNOWN - left alone, tell me if it needs auditing');
                continue;
            }
            if (!plan[0]) {
                gOff++;
                gs.info('   ' + pad(tbl, 34) + lpad(n, 8) + '   left OFF - ' + plan[1]);
                continue;
            }

            var id = collectionRow(tbl);
            if (!id) {
                gBroken++;
                F(tbl, 'no collection-level dictionary row found');
                continue;
            }

            var d = new GlideRecord('sys_dictionary');
            if (!d.get(id)) { gBroken++; F(tbl, 'dictionary row not readable'); continue; }

            if (isOn(d.getValue('audit'))) {
                gAlready++;
                gs.info('   ' + pad(tbl, 34) + lpad(n, 8) + '   already audited');
                continue;
            }

            d.setValue('audit', true);
            d.update();

            // read back - never trust the write. This is exactly what caught the scoped-write refusal.
            var v = new GlideRecord('sys_dictionary');
            v.get(id);
            if (isOn(v.getValue('audit'))) {
                gOn++;
                gs.info('   ' + pad(tbl, 34) + lpad(n, 8) + '   AUDIT TURNED ON');
            } else {
                gBroken++;
                F(tbl, 'write did not stick, audit reads "' + v.getValue('audit') + '"');
            }
        }
    }

    // ---------------------------------------------------------------- verify
    line();
    gs.info('VERIFY - re-read every collection row');
    for (var s2 = 0; s2 < SCOPES.length; s2++) {
        var SC2 = SCOPES[s2];
        var onN = 0, offN = 0, bad = [];
        var o2 = new GlideRecord('sys_db_object');
        o2.addQuery('name', 'STARTSWITH', SC2 + '_');
        o2.query();
        while (o2.next()) {
            var tb = '' + o2.getValue('name');
            var sfx = tb.substring(SC2.length + 1);
            var pl = PLAN[sfx];
            if (!pl) { continue; }
            var i2 = collectionRow(tb);
            var g2 = new GlideRecord('sys_dictionary');
            if (!i2 || !g2.get(i2)) { bad.push(tb + ' (no row)'); continue; }
            var on = isOn(g2.getValue('audit'));
            if (pl[0]) { if (on) { onN++; } else { bad.push(tb + ' (should be ON)'); } }
            else { if (!on) { offN++; } else { bad.push(tb + ' (should be OFF)'); } }
        }
        if (!bad.length) { P(SC2, onN + ' audited, ' + offN + ' deliberately off'); }
        else { F(SC2, bad.join('; ')); }
    }

    line();
    gs.info('RESULT: ' + pass + ' passed, ' + fail + ' failed');
    gs.info('   turned on now       : ' + gOn);
    gs.info('   already on          : ' + gAlready);
    gs.info('   left off on purpose : ' + gOff);
    gs.info('   unrecognised        : ' + gUnknown);
    gs.info('   problems            : ' + gBroken);
    if (fail) {
        gs.error('');
        gs.error('If the failures say "refused due to the table cross-scope access policy", the');
        gs.error('Application picker is not on Global. That is the only cause of that message here.');
        return;
    }
    line();
    gs.info('NEXT: the checkbox only makes the data exist. Run INSTALL_AUDIT_EVENTS.js once in EACH');
    gs.info('scope to add the "Audit History" action - how anyone reaches the trail - and the ten');
    gs.info('business rules that record the DECISIONS the native trail cannot see.');
})();
