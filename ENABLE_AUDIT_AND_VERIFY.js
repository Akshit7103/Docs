/**
 * Turn on the NATIVE audit trail for this scope's tables, then verify it took.
 *
 * Run once per scope, exactly like SET_CAP_AND_VERIFY.js: Background Scripts, Application picker set to
 * the scope, "Run in scoped application" ticked. NO EDITING NEEDED - it reads the current scope and works
 * on that one, so the same file is run four times with only the picker changed.
 *
 * WHY PER SCOPE AND NOT ONCE FROM GLOBAL
 * --------------------------------------
 * A table's dictionary record belongs to the application that owns the table. Editing it from another
 * application is refused by the cross-scope access policy - the same wall that stopped the chunk_cap
 * config being set from Global. So this is four runs, not one.
 *
 * WHAT "AUDIT" ACTUALLY IS
 * ------------------------
 * A single checkbox on the table's COLLECTION-level dictionary row: the row whose Column name is empty.
 * Ticking it makes the platform write one sys_audit row per changed field per update, and a
 * sys_audit_delete row when a record is deleted. There is no code and nothing to deploy. History then
 * appears per record through the form header context menu, History -> Record.
 *
 * TWO THINGS TO KNOW BEFORE RUNNING IT
 * ------------------------------------
 *   - It is NOT retrospective. Changes made before the tick are not recoverable; the trail starts at the
 *     moment this runs. That is the reason to do it before the next round of testing, not after.
 *   - It appears at TABLE / RECORD level, not on the portal. Surfacing it in the portal is separate work
 *     and was judged unnecessary if the out-of-box view suffices.
 *
 * EVERY TABLE IS NAMED BELOW WITH ITS REASON
 * ------------------------------------------
 * Rather than pattern-match on names, each of the twelve tables these applications actually own has an
 * explicit decision and a reason recorded against it. Four are deliberately left OFF:
 *
 *   llm_usage     one row per LLM call, insert-only. Audit records FIELD CHANGES, and an insert has no
 *                 field history, so auditing it roughly doubles the write volume of the busiest table in
 *                 the app and produces nothing anyone can read.
 *   audit         this is the application's OWN audit-event table, also insert-only. Auditing the audit
 *                 log is circular.
 *   mailbox_drop  ingestion staging, insert-only. sys_created_by and sys_created_on already record who
 *                 dropped what and when, which is the entire question anyone would ask of it.
 *   zip_drop      the same, for bulk upload.
 *
 * Anything NOT in the list is reported as UNKNOWN and left untouched - so a scope carrying an extra table
 * shows up as a named question rather than a silent guess.
 *
 * IT ALSO CREATES THE "Audit History" UI ACTION
 * ---------------------------------------------
 * Ticking Audit only makes the data exist. Nomura reach it through a UI Action of their own on each
 * audited table - a LIST CONTEXT MENU entry called "Audit History" that opens the out-of-box history.do
 * page in a popup. Their working example is on x_vort2_news_fees_rebate_payments in the NEWS
 * application; this reproduces it per table, same name, same action_name, same script, so it behaves
 * exactly like the one their users already know.
 *
 * Both halves in one run, because they are useless apart: the checkbox without the action leaves the
 * trail with no front door, and the action without the checkbox opens an empty page.
 *
 * Safe to run twice: a table already audited is reported and skipped.
 */
(function () {
    var ALLOWED = ['x_nose_nexai_dev', 'x_nose_nexai_uat', 'x_nose_nfotc_bsm', 'x_nose_nexai_test'];

    // suffix after the scope prefix -> [ON?, reason]
    var PLAN = {
        'email':        [true,  'business record - the settlement mail and its status'],
        'cashflow':     [true,  'business record - the money. the one that matters most'],
        'booking':      [true,  'golden-source rows Compare and Match runs against'],
        'counterparty': [true,  'directory that feeds matching - a wrong edit here breaks matching'],
        'wizard':       [true,  'prompts and field config - editing these changes what the model extracts'],
        'config':       [true,  'thresholds and toggles - same argument as the wizard'],
        'capability':   [true,  'capability registry - defines what the pipeline is allowed to do'],
        'work_item':    [true,  'agent work items - who or what acted on a case'],
        // these exist in some scopes only; harmless if absent
        'match':        [true,  'match results'],
        'match_result': [true,  'match results'],
        'allegation':   [true,  'allegation records'],
        'case':         [true,  'case records'],
        'ssi':          [true,  'standing settlement instructions'],
        'entity':       [true,  'Nomura entity directory'],

        'llm_usage':    [false, 'insert-only metrics, one row per LLM call. audit records field CHANGES,' +
                                ' and an insert has none, so this would double the write volume of the' +
                                ' busiest table and record nothing readable'],
        'audit':        [false, 'the application OWN audit-event table, insert-only. auditing the audit' +
                                ' log is circular'],
        'mailbox_drop': [false, 'ingestion staging, insert-only. sys_created_by and sys_created_on' +
                                ' already answer who dropped what and when'],
        'zip_drop':     [false, 'bulk upload staging, insert-only. same reason as mailbox_drop']
    };

    function line() { gs.info('------------------------------------------------------------------'); }
    var pass = 0, fail = 0;
    function P(l, d) { pass++; gs.info('   PASS  ' + l + (d ? '   ' + d : '')); }
    function F(l, d) { fail++; gs.error('   FAIL  ' + l + (d ? '   ' + d : '')); }
    function pad(s, n) { s = '' + s; while (s.length < n) { s = s + ' '; } return s; }

    function rows(t) {
        try {
            var a = new GlideAggregate(t);
            a.addAggregate('COUNT');
            a.query();
            return a.next() ? parseInt(a.getAggregate('COUNT'), 10) : 0;
        } catch (e) { return '?'; }
    }

    // The COLLECTION row - the one the walkthrough calls "type of collection". It is identified two
    // ways and both must hold: its Column name (element) is empty, AND its Type is "collection".
    // Checking only the empty column name would be an inference; Type is the actual statement that
    // this row describes the table rather than a field on it. Ticking Audit on a FIELD row is a
    // different setting with a different meaning, so this is worth being exact about.
    function dictRow(table) {
        var d = new GlideRecord('sys_dictionary');
        d.addQuery('name', table);
        d.query();
        while (d.next()) {
            var el = '' + (d.getValue('element') || '');
            var ty = '' + (d.getValue('internal_type') || '');
            if (el === '' && ty === 'collection') { return d.getUniqueValue(); }
        }
        return null;
    }
    function isOn(v) { v = '' + (v || ''); return v === 'true' || v === '1'; }

    var SCOPE = '';
    try { SCOPE = '' + gs.getCurrentScopeName(); } catch (e) { SCOPE = '?'; }
    var okScope = false;
    for (var a = 0; a < ALLOWED.length; a++) { if (ALLOWED[a] === SCOPE) { okScope = true; } }
    if (!okScope) {
        gs.error('ABORT. Current scope is "' + SCOPE + '", which is not one of the NexAI applications.');
        gs.error('Set the Application picker to the scope you are doing and tick "Run in scoped');
        gs.error('application". Expected one of: ' + ALLOWED.join(', '));
        return;
    }
    gs.info('instance : ' + gs.getProperty('instance_name', '?'));
    gs.info('scope    : ' + SCOPE);

    // ---------------------------------------------------------------- 0. is the subsystem alive
    line();
    gs.info('0. IS THE AUDIT SUBSYSTEM LIVE ON THIS INSTANCE');
    var subsystem = false;
    try {
        var sa = new GlideRecord('sys_audit');
        if (sa.isValid()) {
            subsystem = true;
            gs.info('   sys_audit readable, ' + rows('sys_audit') + ' rows on the instance');
            P('audit subsystem present');
        } else { F('sys_audit is not a valid table here'); }
    } catch (e0) { F('cannot read sys_audit from this scope'); }
    if (!subsystem) {
        gs.warn('   Continuing. A scoped script is often blocked from reading sys_audit even when the');
        gs.warn('   subsystem is perfectly healthy. The dictionary checks below are the decisive ones.');
    }

    // ---------------------------------------------------------------- 1. enumerate this scope's tables
    line();
    gs.info('1. TABLES OWNED BY THIS SCOPE');
    var tables = [];
    try {
        var o = new GlideRecord('sys_db_object');
        o.addQuery('name', 'STARTSWITH', SCOPE + '_');
        o.orderBy('name');
        o.query();
        while (o.next()) {
            var sup = '';
            try { if (o.getValue('super_class')) { sup = '' + o.super_class.name; } } catch (es) { sup = ''; }
            tables.push({ name: '' + o.getValue('name'), label: '' + (o.getValue('label') || ''), sup: sup });
        }
    } catch (e1) {
        gs.error('ABORT. Cannot read sys_db_object from this scope. Nothing was changed.');
        return;
    }
    if (!tables.length) {
        gs.error('ABORT. No table found with the prefix "' + SCOPE + '_". Wrong scope in the picker?');
        return;
    }
    gs.info('   found ' + tables.length + ' table(s)');

    // ---------------------------------------------------------------- 2. act
    line();
    gs.info('2. DECISION PER TABLE');
    var turnedOn = [], already = [], leftOff = [], unknown = [], broken = [];

    for (var i = 0; i < tables.length; i++) {
        var t = tables[i];
        var suffix = t.name.substring(SCOPE.length + 1);
        var plan = PLAN[suffix];

        if (!plan) { unknown.push(t); continue; }
        if (!plan[0]) { leftOff.push({ t: t, why: plan[1] }); continue; }

        var id = dictRow(t.name);
        if (!id) { broken.push({ t: t, why: 'no collection-level dictionary row found' }); continue; }

        var d = new GlideRecord('sys_dictionary');
        if (!d.get(id)) {
            broken.push({ t: t, why: 'dictionary row not readable from this scope' });
            continue;
        }
        if (isOn(d.getValue('audit'))) { already.push({ t: t, why: plan[1] }); continue; }

        d.setValue('audit', true);
        d.update();

        // read back - never trust the write
        var v = new GlideRecord('sys_dictionary');
        v.get(id);
        if (isOn(v.getValue('audit'))) { turnedOn.push({ t: t, why: plan[1] }); }
        else {
            broken.push({ t: t, why: 'write did not stick, audit still reads "' +
                ('' + v.getValue('audit')) + '"' });
        }
    }

    gs.info('');
    gs.info('   ' + pad('TABLE', 36) + pad('ROWS', 8) + 'RESULT');
    function show(list, verdict, unwrap) {
        for (var k = 0; k < list.length; k++) {
            var e = unwrap(list[k]);
            gs.info('   ' + pad(e.name, 36) + pad(rows(e.name), 8) + verdict);
            if (e.why) { gs.info('   ' + pad('', 44) + e.why); }
        }
    }
    var wrapped = function (x) { return { name: x.t.name, why: x.why }; };
    show(turnedOn, 'AUDIT TURNED ON', wrapped);
    show(already, 'already audited', wrapped);
    show(leftOff, 'left OFF on purpose', wrapped);
    show(unknown, 'UNKNOWN - left alone, tell me whether it needs auditing',
        function (x) { return { name: x.name, why: 'label: ' + x.label }; });
    show(broken, 'PROBLEM', wrapped);

    // ---------------------------------------------------------------- 3. the Audit History UI Action
    //
    // Ticking Audit makes the data exist. This is how anyone reaches it.
    //
    // Copied from Nomura's own "Audit History" action on x_vort2_news_fees_rebate_payments in the NEWS
    // application: a LIST CONTEXT MENU entry that opens the out-of-box history.do page in a popup for
    // the row you right-clicked. Same name, same action_name, same script, so it behaves identically to
    // the one their users already know.
    //
    // ui11_compatible (labelled "List v2 Compatible") is what puts it on the classic list, which is
    // where these tables are viewed. ui16_compatible is left false exactly as their sample has it -
    // tick it later if it is ever wanted on a workspace list too.
    line();
    gs.info('3. "Audit History" UI ACTION - how anyone actually reaches the trail');

    var UI_SCRIPT =
        'var selSysIds;\n' +
        'function auditHistory() {\n' +
        "    selSysIds = g_sysId;\n" +
        "    g_navigation.openPopup('history.do?sysparm_sys_id=' + selSysIds +\n" +
        "                           '&sysparm_table=' + g_list.getTableName());\n" +
        '}\n';

    var uiMade = 0, uiSame = 0, uiFail = 0;
    var auditedNow = [].concat(turnedOn, already);

    for (var u = 0; u < auditedNow.length; u++) {
        var tbl = auditedNow[u].t.name;
        var ua = new GlideRecord('sys_ui_action');
        ua.addQuery('table', tbl);
        ua.addQuery('action_name', 'audit_history');
        ua.query();
        var existed = ua.next();

        if (!existed) { ua.initialize(); }
        ua.setValue('name', 'Audit History');
        ua.setValue('table', tbl);
        ua.setValue('action_name', 'audit_history');
        ua.setValue('order', 100);
        ua.setValue('active', true);
        ua.setValue('client', true);
        ua.setValue('show_insert', true);
        ua.setValue('show_update', true);
        ua.setValue('onclick', 'auditHistory()');
        ua.setValue('script', UI_SCRIPT);
        ua.setValue('list_context_menu', true);   // right-click a row in the list
        ua.setValue('ui11_compatible', true);     // "List v2 Compatible" - the classic list
        ua.setValue('ui16_compatible', false);    // as per the sample
        ua.setValue('form_button', false);
        ua.setValue('form_context_menu', false);
        ua.setValue('form_link', false);
        ua.setValue('list_banner_button', false);
        ua.setValue('list_button', false);        // "List bottom button"
        ua.setValue('list_choice', false);
        ua.setValue('list_link', false);
        ua.setValue('comments', 'Opens the out-of-box audit history for the selected record. ' +
            'Requires Audit to be ticked on this table dictionary entry, which it is.');

        var uid = existed ? (ua.update() ? ua.getUniqueValue() : null) : ua.insert();
        if (!uid) { uiFail++; F('could not save the UI Action for ' + tbl); continue; }

        // read back
        var vv = new GlideRecord('sys_ui_action');
        vv.get(uid);
        var okUi = (('' + vv.getValue('table')) === tbl) &&
                   isOn(vv.getValue('active')) &&
                   isOn(vv.getValue('client')) &&
                   isOn(vv.getValue('list_context_menu')) &&
                   isOn(vv.getValue('ui11_compatible')) &&
                   (('' + vv.getValue('onclick')) === 'auditHistory()') &&
                   (('' + vv.getValue('script')).indexOf('g_navigation.openPopup') > -1);
        if (okUi) {
            if (existed) { uiSame++; gs.info('   updated  ' + pad(tbl, 36) + 'Audit History'); }
            else { uiMade++; gs.info('   CREATED  ' + pad(tbl, 36) + 'Audit History'); }
        } else {
            uiFail++;
            F('UI Action saved but does not read back correctly', tbl);
        }
    }
    if (!auditedNow.length) { gs.warn('   no audited table to attach it to'); }

    // ---------------------------------------------------------------- 4. verify
    line();
    gs.info('4. VERIFY - re-read every table that should now be audited');
    var want = [].concat(turnedOn, already);
    if (!want.length) {
        F('no table in this scope matched the audit plan',
          'read the UNKNOWN list above and say which ones to include');
    }
    for (var q = 0; q < want.length; q++) {
        var nm = want[q].t.name;
        var id2 = dictRow(nm);
        var g2 = new GlideRecord('sys_dictionary');
        if (id2 && g2.get(id2)) {
            if (isOn(g2.getValue('audit'))) { P('audit ON', nm); }
            else { F('audit reads back as "' + ('' + g2.getValue('audit')) + '"', nm); }
        } else { F('dictionary row not re-readable', nm); }
    }
    // confirm the four we meant to leave alone really are still off
    for (var r = 0; r < leftOff.length; r++) {
        var id3 = dictRow(leftOff[r].t.name);
        var g3 = new GlideRecord('sys_dictionary');
        if (id3 && g3.get(id3)) {
            if (!isOn(g3.getValue('audit'))) { P('still OFF as intended', leftOff[r].t.name); }
            else { F('is audited but should not be', leftOff[r].t.name); }
        }
    }
    for (var b = 0; b < broken.length; b++) { F(broken[b].t.name, broken[b].why); }

    // tables that EXTEND something - the parent may already carry the flag
    var ext = [];
    for (var x = 0; x < tables.length; x++) {
        if (tables[x].sup) { ext.push(tables[x].name + ' extends ' + tables[x].sup); }
    }
    if (ext.length) {
        gs.info('');
        gs.info('   these tables extend another table, so audit can be inherited from the parent:');
        for (var y = 0; y < ext.length; y++) { gs.info('      ' + ext[y]); }
    }

    line();
    gs.info('RESULT for ' + SCOPE + ': ' + pass + ' passed, ' + fail + ' failed');
    gs.info('   turned on now       : ' + turnedOn.length);
    gs.info('   already on          : ' + already.length);
    gs.info('   left off on purpose : ' + leftOff.length);
    gs.info('   unrecognised        : ' + unknown.length);
    gs.info('   UI Actions created  : ' + uiMade + '   updated: ' + uiSame + '   failed: ' + uiFail);
    if (fail) {
        gs.error('Clear the failures above before relying on the trail.');
        return;
    }
    line();
    gs.info('HOW TO SEE IT');
    gs.info('  Open the LIST for an audited table in the platform UI, right-click a row, and pick');
    gs.info('  "Audit History". That opens the same history.do page Nomura use on their own tables.');
    gs.info('  The out-of-box route still works too: open a record, right-click the form header,');
    gs.info('  History -> Record.');
    gs.info('');
    gs.info('  Change a field FIRST. The trail is not retrospective, so a record untouched since this');
    gs.info('  ran will correctly show nothing, which reads like a failure and is not one.');
    gs.info('');
    gs.info('  Field changes land in sys_audit. Deletions land in sys_audit_delete.');
    gs.info('');
    gs.info('  Repeat in the remaining scopes by changing only the Application picker.');
})();
