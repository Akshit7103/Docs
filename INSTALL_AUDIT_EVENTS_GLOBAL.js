/**
 * Install the "Audit History" UI Action and the decision-event Business Rules, for ALL FOUR scopes.
 *
 * Run: Background Scripts, Application "Global". ONE RUN.
 *
 * WHY GLOBAL - measured, twice
 * ----------------------------
 * Running this from inside x_nose_nexai_test on nomurabsmdev:
 *
 *   Create operation against 'sys_ui_action' from scope 'x_nose_nexai_test' has been refused
 *   Create operation against 'sys_script'    from scope 'x_nose_nexai_test' has been refused
 *                                                 ... due to the table's cross-scope access policy
 *
 * All 18 creates were refused. Same wall as sys_dictionary. A scoped application cannot CREATE platform
 * metadata records even for its own tables from a background script; only Global can.
 *
 * THE SECOND PROBLEM, AND HOW IT IS HANDLED
 * -----------------------------------------
 * AuditTrail is package_private in every scope. A Business Rule sitting in Global cannot call
 * `new AuditTrail()` at all - the same trap that forced the Chinou REST Message to be reached through a
 * public Global client. So:
 *
 *   1. Every rule is written with the FULLY QUALIFIED call, `new x_nose_nexai_test.AuditTrail()`, which
 *      is the form AuditTrail's own documentation uses. That works from inside the scope and from
 *      Global, so the rule is correct wherever it ends up.
 *   2. Each record is stamped into the owning application (sys_scope + sys_package) as it is created,
 *      so it belongs to the app and travels with it.
 *   3. The resulting scope is READ BACK and reported per record. If a record lands in Global anyway,
 *      the script says so and then widens AuditTrail to "Accessible from all application scopes" for
 *      the affected scopes - the minimum change that makes a Global caller legal. If everything lands
 *      correctly, AuditTrail is left exactly as it is.
 *
 * That last point is why access is only widened if it is actually needed, rather than pre-emptively:
 * it is someone else's application artifact.
 *
 * WHY THE WRITE ITSELF IS SAFE EITHER WAY
 * ---------------------------------------
 * The rule never writes to the scoped audit table directly - a Global caller would be refused, the same
 * way the scoped config table refuses Global writes. It calls AuditTrail, and the insert happens inside
 * that Script Include, in its own application's context, where the table is local.
 *
 * WHAT IS INSTALLED, per scope
 * ----------------------------
 *   8  "Audit History" UI Actions - list context-menu entry opening the out-of-box history page,
 *      copied from Nomura's own action on x_vort2_news_fees_rebate_payments in the NEWS application
 *  10  Business Rules writing the decisions the native trail cannot see:
 *
 *      config.changed      a threshold or toggle was edited, with old and new value
 *      wizard.changed      a prompt or identification rule was edited. Large JSON fields are recorded
 *                          as a FINGERPRINT, not copied - tamper-evident without duplicating it
 *      mail.processed      a mail finished extraction, and HOW MANY cashflows it produced. A mail that
 *                          produced nothing writes no cashflow.extracted event, so today it vanishes
 *      extraction.partial  the completeness guard fired
 *      thread.classified   thread state decided, including the quoting mails that get dropped
 *      analyst.decision    an analyst overrode or confirmed, with the AI value alongside theirs
 *      match.decided       match status, tier, confidence and candidate count
 *      mo.sent             sent to Middle Office - an outbound action
 *      cashflow.deleted    re-extraction DELETES a mail's rows before rewriting; without this a lost
 *                          chunk is silent
 *      email.deleted       a mail record was destroyed
 *
 * PREREQUISITE: ENABLE_AUDIT_GLOBAL.js. That ticks Audit on the dictionary; this makes the decisions
 * visible and gives the trail a front door.
 *
 * NOT COVERED: sync.run - who pressed Sync, over how many mails, how long, how many failed. No record
 * carries a run identifier to hang it from, so it needs a code change at the Sync entry point.
 * mail.processed gives the per-mail half today.
 *
 * Safe to run twice: an existing record is updated in place, never duplicated.
 */
(function () {
    var SCOPES = ['x_nose_nexai_test', 'x_nose_nexai_dev', 'x_nose_nexai_uat', 'x_nose_nfotc_bsm'];
    var AUDITED = ['email', 'cashflow', 'booking', 'counterparty',
                   'wizard', 'config', 'capability', 'work_item'];

    function line() { gs.info('=================================================================='); }
    function thin() { gs.info('   ----------------------------------------------------------------'); }
    var pass = 0, fail = 0;
    function P(l, d) { pass++; gs.info('   PASS  ' + l + (d ? '   ' + d : '')); }
    function F(l, d) { fail++; gs.error('   FAIL  ' + l + (d ? '   ' + d : '')); }
    function pad(s, n) { s = '' + s; while (s.length < n) { s = s + ' '; } return s; }
    function isOn(v) { v = '' + (v || ''); return v === 'true' || v === '1'; }
    function J(a) { return a.join('\n'); }

    var scope = '?';
    try { scope = '' + gs.getCurrentScopeName(); } catch (e) { scope = '?'; }
    gs.info('instance : ' + gs.getProperty('instance_name', '?'));
    gs.info('scope    : ' + scope);
    if (scope !== 'global' && scope !== 'rhino.global') {
        gs.error('ABORT. Run with Application = "Global".');
        gs.error('sys_ui_action and sys_script both refuse CREATE from a scoped application - measured.');
        return;
    }

    function appId(sc) {
        var g = new GlideRecord('sys_scope');
        g.addQuery('scope', sc);
        g.query();
        return g.next() ? g.getUniqueValue() : null;
    }

    var UI_SCRIPT =
        'var selSysIds;\n' +
        'function auditHistory() {\n' +
        "    selSysIds = g_sysId;\n" +
        "    g_navigation.openPopup('history.do?sysparm_sys_id=' + selSysIds +\n" +
        "                           '&sysparm_table=' + g_list.getTableName());\n" +
        '}\n';

    // ---------------------------------------------------------------- the rule definitions
    function rulesFor(SC) {
        var T_EMAIL = SC + '_email', T_CASH = SC + '_cashflow';
        var T_CONF = SC + '_config', T_WIZ = SC + '_wizard';
        var AT = 'new ' + SC + '.AuditTrail()';   // fully qualified - works from Global and in scope
        var R = [];

        R.push({ name: 'Audit - config changed', table: T_CONF, when: 'after',
            ins: true, upd: true, del: false, why: 'a threshold or toggle was edited',
            script: J([
            '(function executeRule(current, previous) {',
            '    try {',
            "        var oldV = previous ? ('' + previous.getValue('value')) : '';",
            "        var newV = '' + current.getValue('value');",
            '        if (oldV === newV) { return; }',
            '        ' + AT + ".log('config.changed', {",
            "            entityType: 'config',",
            "            entityId: '' + current.getUniqueValue(),",
            "            fieldName: 'value',",
            "            configKey: '' + current.getValue('key'),",
            '            configOld: oldV,',
            '            configNew: newV,',
            "            summary: 'Config ' + current.getValue('key') + ': ' +",
            "                     (oldV === '' ? '(new)' : oldV) + ' -> ' + newV,",
            '            actor: gs.getUserName()',
            '        });',
            "    } catch (e) { gs.warn('[audit config.changed] ' + e); }",
            '})(current, previous);']) });

        R.push({ name: 'Audit - wizard changed', table: T_WIZ, when: 'after',
            ins: false, upd: true, del: false, why: 'a prompt or identification rule was edited',
            script: J([
            '(function executeRule(current, previous) {',
            '    try {',
            '        if (!previous) { return; }',
            '        var at = ' + AT + ';',
            "        var WATCH = ['input_fields', 'id_rules', 'config_overrides', 'mapping', 'tagging',",
            "                     'writeback', 'status', 'version', 'work_driver', 'name'];",
            '        var changed = [], before = {}, after = {};',
            '        for (var i = 0; i < WATCH.length; i++) {',
            '            var f = WATCH[i];',
            "            var o = '' + previous.getValue(f);",
            "            var n = '' + current.getValue(f);",
            '            if (o === n) { continue; }',
            '            changed.push(f);',
            '            // a prompt is too big to copy into the trail, and copying it would duplicate',
            '            // the payload. A fingerprint proves it changed and proves what it was.',
            '            if (o.length > 200 || n.length > 200) {',
            '                before[f] = at.hash(o); after[f] = at.hash(n);',
            '            } else { before[f] = o; after[f] = n; }',
            '        }',
            '        if (!changed.length) { return; }',
            "        at.log('wizard.changed', {",
            "            entityType: 'wizard',",
            "            entityId: '' + current.getUniqueValue(),",
            "            fieldName: changed.join(','),",
            "            summary: 'Wizard \"' + current.getValue('name') + '\" changed: ' +",
            "                     changed.join(', '),",
            '            before: before, after: after,',
            '            actor: gs.getUserName(),',
            "            ai: { prompt_ref: 'wizard:' + current.getUniqueValue() }",
            '        });',
            "    } catch (e) { gs.warn('[audit wizard.changed] ' + e); }",
            '})(current, previous);']) });

        R.push({ name: 'Audit - mail processed', table: T_EMAIL, when: 'after',
            ins: false, upd: true, del: false,
            why: 'a mail finished extraction - including one that produced nothing',
            script: J([
            '(function executeRule(current, previous) {',
            '    try {',
            '        if (!previous) { return; }',
            "        var oldV = '' + previous.getValue('wiz_extracted');",
            "        var newV = '' + current.getValue('wiz_extracted');",
            "        if (oldV === newV || newV === '') { return; }",
            '        var n = 0;',
            "        var cf = new GlideAggregate('" + T_CASH + "');",
            "        cf.addQuery('email', current.getUniqueValue());",
            "        cf.addAggregate('COUNT');",
            '        cf.query();',
            "        if (cf.next()) { n = parseInt(cf.getAggregate('COUNT'), 10) || 0; }",
            "        var cls = '' + current.getValue('classification');",
            "        var st = '' + current.getValue('extraction_status');",
            '        ' + AT + ".log('mail.processed', {",
            "            entityType: 'email',",
            "            entityId: '' + current.getUniqueValue(),",
            "            emailId: '' + current.getUniqueValue(),",
            "            mailId: '' + current.getValue('name'),",
            "            counterparty: '' + current.getValue('counterparty_name'),",
            "            summary: 'Processed: ' + n + ' cashflow(s), classification ' + cls +",
            "                     (st ? (', extraction ' + st) : '') +",
            "                     (n === 0 ? ' - PRODUCED NOTHING' : ''),",
            '            after: { cashflows: n, classification: cls, extraction_status: st },',
            "            ai: { prompt_ref: 'wizard:' + newV, label: cls }",
            '        });',
            "    } catch (e) { gs.warn('[audit mail.processed] ' + e); }",
            '})(current, previous);']) });

        R.push({ name: 'Audit - extraction partial', table: T_EMAIL, when: 'after',
            ins: false, upd: true, del: false, why: 'the completeness guard fired',
            script: J([
            '(function executeRule(current, previous) {',
            '    try {',
            '        if (!previous) { return; }',
            "        var oldV = '' + previous.getValue('extraction_status');",
            "        var newV = '' + current.getValue('extraction_status');",
            "        if (oldV === newV || newV !== 'partial') { return; }",
            '        var n = 0;',
            "        var cf = new GlideAggregate('" + T_CASH + "');",
            "        cf.addQuery('email', current.getUniqueValue());",
            "        cf.addAggregate('COUNT');",
            '        cf.query();',
            "        if (cf.next()) { n = parseInt(cf.getAggregate('COUNT'), 10) || 0; }",
            '        ' + AT + ".log('extraction.partial', {",
            "            entityType: 'email',",
            "            entityId: '' + current.getUniqueValue(),",
            "            emailId: '' + current.getUniqueValue(),",
            "            mailId: '' + current.getValue('name'),",
            "            counterparty: '' + current.getValue('counterparty_name'),",
            "            fieldName: 'extraction_status',",
            "            summary: 'INCOMPLETE extraction - the completeness guard fired. ' + n +",
            "                     ' cashflow(s) kept. Rows may be missing.',",
            '            before: { extraction_status: oldV },',
            '            after: { extraction_status: newV, cashflows: n }',
            '        });',
            "    } catch (e) { gs.warn('[audit extraction.partial] ' + e); }",
            '})(current, previous);']) });

        R.push({ name: 'Audit - thread classified', table: T_EMAIL, when: 'after',
            ins: true, upd: true, del: false,
            why: 'thread state decided - this is what drops the quoting mails',
            script: J([
            '(function executeRule(current, previous) {',
            '    try {',
            "        var oldV = previous ? ('' + previous.getValue('thread_state')) : '';",
            "        var newV = '' + current.getValue('thread_state');",
            "        if (oldV === newV || newV === '') { return; }",
            '        ' + AT + ".log('thread.classified', {",
            "            entityType: 'email',",
            "            entityId: '' + current.getUniqueValue(),",
            "            emailId: '' + current.getUniqueValue(),",
            "            mailId: '' + current.getValue('name'),",
            "            fieldName: 'thread_state',",
            "            summary: 'Thread state: ' + (oldV || '(none)') + ' -> ' + newV +",
            "                     (newV === 'thread' ? ' (quotes an earlier mail)' : ''),",
            '            before: { thread_state: oldV },',
            '            after: { thread_state: newV },',
            '            ai: { label: newV }',
            '        });',
            "    } catch (e) { gs.warn('[audit thread.classified] ' + e); }",
            '})(current, previous);']) });

        R.push({ name: 'Audit - analyst decision', table: T_CASH, when: 'after',
            ins: false, upd: true, del: false, why: 'an analyst confirmed or overrode the model',
            script: J([
            '(function executeRule(current, previous) {',
            '    try {',
            '        if (!previous) { return; }',
            '        // analyst field paired with the AI field it overrides, so the trail shows both',
            '        var PAIRS = [',
            "            ['confirmed', 'ai_confirmed'],",
            "            ['review_confirmed', 'ai_review_confirmed'],",
            "            ['analyst_outcome', 'ai_analyst_outcome'],",
            "            ['resolution', 'ai_resolution']",
            '        ];',
            '        var at = ' + AT + ';',
            '        for (var i = 0; i < PAIRS.length; i++) {',
            '            var f = PAIRS[i][0], aif = PAIRS[i][1];',
            "            var o = '' + previous.getValue(f);",
            "            var n = '' + current.getValue(f);",
            '            if (o === n) { continue; }',
            "            var aiv = '' + current.getValue(aif);",
            "            at.log('analyst.decision', {",
            "                entityType: 'cashflow',",
            "                entityId: '' + current.getUniqueValue(),",
            "                cashflowId: '' + current.getUniqueValue(),",
            "                emailId: '' + current.getValue('email'),",
            "                counterparty: '' + current.getValue('ai_counterparty'),",
            '                fieldName: f,',
            '                aiValue: aiv,',
            '                analystValue: n,',
            "                summary: 'Analyst set ' + f + ': ' + (o || '(blank)') + ' -> ' +",
            "                         (n || '(blank)') + '   AI had: ' + (aiv || '(blank)'),",
            '                actor: gs.getUserName(),',
            '                before: { value: o },',
            '                after: { value: n }',
            '            });',
            '        }',
            "    } catch (e) { gs.warn('[audit analyst.decision] ' + e); }",
            '})(current, previous);']) });

        R.push({ name: 'Audit - match decided', table: T_CASH, when: 'after',
            ins: false, upd: true, del: false, why: 'Compare and Match reached a verdict',
            script: J([
            '(function executeRule(current, previous) {',
            '    try {',
            '        if (!previous) { return; }',
            "        var oS = '' + previous.getValue('ai_match_status');",
            "        var nS = '' + current.getValue('ai_match_status');",
            "        var oT = '' + previous.getValue('ai_match_tier');",
            "        var nT = '' + current.getValue('ai_match_tier');",
            '        if (oS === nS && oT === nT) { return; }',
            "        if (nS === '' && nT === '') { return; }",
            '        ' + AT + ".log('match.decided', {",
            "            entityType: 'cashflow',",
            "            entityId: '' + current.getUniqueValue(),",
            "            cashflowId: '' + current.getUniqueValue(),",
            "            emailId: '' + current.getValue('email'),",
            "            counterparty: '' + current.getValue('ai_counterparty'),",
            "            summary: 'Match ' + (nS || '(none)') + ' at tier ' + (nT || '-') + ', ' +",
            "                     (current.getValue('ai_candidate_count') || '0') + ' candidate(s)',",
            '            before: { status: oS, tier: oT },',
            '            after: {',
            '                status: nS, tier: nT,',
            "                booking: '' + current.getValue('ai_selected_booking'),",
            "                candidates: '' + current.getValue('ai_candidate_count')",
            '            },',
            '            ai: {',
            '                status: nS,',
            "                confidence: '' + current.getValue('ai_match_confidence'),",
            "                model_version: '' + current.getValue('ai_model')",
            '            }',
            '        });',
            "    } catch (e) { gs.warn('[audit match.decided] ' + e); }",
            '})(current, previous);']) });

        R.push({ name: 'Audit - sent to middle office', table: T_CASH, when: 'after',
            ins: false, upd: true, del: false, why: 'an outbound action left the system',
            script: J([
            '(function executeRule(current, previous) {',
            '    try {',
            '        if (!previous) { return; }',
            "        var o = '' + previous.getValue('ai_mo_sent');",
            "        var n = '' + current.getValue('ai_mo_sent');",
            "        if (o === n || n === '' || n === 'false' || n === '0') { return; }",
            '        ' + AT + ".log('mo.sent', {",
            "            entityType: 'cashflow',",
            "            entityId: '' + current.getUniqueValue(),",
            "            cashflowId: '' + current.getUniqueValue(),",
            "            emailId: '' + current.getValue('email'),",
            "            counterparty: '' + current.getValue('ai_counterparty'),",
            "            fieldName: 'ai_mo_sent',",
            "            summary: 'Sent to Middle Office: ' + current.getValue('currency') + ' ' +",
            "                     current.getValue('amount') + ' ' + current.getValue('direction'),",
            '            actor: gs.getUserName(),',
            '            before: { ai_mo_sent: o },',
            '            after: { ai_mo_sent: n }',
            '        });',
            "    } catch (e) { gs.warn('[audit mo.sent] ' + e); }",
            '})(current, previous);']) });

        R.push({ name: 'Audit - cashflow deleted', table: T_CASH, when: 'before',
            ins: false, upd: false, del: true,
            why: 're-extraction deletes a mail rows before rewriting - without this a lost chunk is silent',
            script: J([
            '(function executeRule(current, previous) {',
            '    try {',
            '        ' + AT + ".log('cashflow.deleted', {",
            "            entityType: 'cashflow',",
            "            entityId: '' + current.getUniqueValue(),",
            "            cashflowId: '' + current.getUniqueValue(),",
            "            emailId: '' + current.getValue('email'),",
            "            counterparty: '' + current.getValue('ai_counterparty'),",
            "            summary: 'Cashflow DELETED: ' + current.getValue('currency') + ' ' +",
            "                     current.getValue('amount') + ' ' + current.getValue('direction') +",
            "                     ' value ' + current.getValue('value_date'),",
            '            actor: gs.getUserName(),',
            '            before: {',
            "                amount: '' + current.getValue('amount'),",
            "                currency: '' + current.getValue('currency'),",
            "                direction: '' + current.getValue('direction'),",
            "                value_date: '' + current.getValue('value_date'),",
            "                reference: '' + current.getValue('reference'),",
            "                flow_index: '' + current.getValue('flow_index'),",
            "                match_status: '' + current.getValue('ai_match_status'),",
            "                confirmed: '' + current.getValue('confirmed')",
            '            }',
            '        });',
            "    } catch (e) { gs.warn('[audit cashflow.deleted] ' + e); }",
            '})(current, previous);']) });

        R.push({ name: 'Audit - email deleted', table: T_EMAIL, when: 'before',
            ins: false, upd: false, del: true, why: 'a mail record was destroyed',
            script: J([
            '(function executeRule(current, previous) {',
            '    try {',
            '        var n = 0;',
            "        var cf = new GlideAggregate('" + T_CASH + "');",
            "        cf.addQuery('email', current.getUniqueValue());",
            "        cf.addAggregate('COUNT');",
            '        cf.query();',
            "        if (cf.next()) { n = parseInt(cf.getAggregate('COUNT'), 10) || 0; }",
            '        ' + AT + ".log('email.deleted', {",
            "            entityType: 'email',",
            "            entityId: '' + current.getUniqueValue(),",
            "            emailId: '' + current.getUniqueValue(),",
            "            mailId: '' + current.getValue('name'),",
            "            counterparty: '' + current.getValue('counterparty_name'),",
            "            summary: 'Email DELETED: ' + current.getValue('mail_subject') +",
            "                     '   (' + n + ' cashflow(s) attached)',",
            '            actor: gs.getUserName(),',
            '            before: {',
            "                subject: '' + current.getValue('mail_subject'),",
            "                classification: '' + current.getValue('classification'),",
            "                extraction_status: '' + current.getValue('extraction_status'),",
            '                cashflows: n',
            '            }',
            '        });',
            "    } catch (e) { gs.warn('[audit email.deleted] ' + e); }",
            '})(current, previous);']) });

        return R;
    }

    // ---------------------------------------------------------------- install
    var totalUi = 0, totalBr = 0, landedGlobal = {}, anyGlobal = false;

    for (var s = 0; s < SCOPES.length; s++) {
        var SC = SCOPES[s];
        line();
        gs.info(SC);

        var APP = appId(SC);
        if (!APP) { F(SC, 'no sys_scope record - application not installed here'); continue; }
        gs.info('   application sys_id: ' + APP);

        // AuditTrail must exist, or every rule is inert
        var ai = new GlideRecord('sys_script_include');
        ai.addQuery('name', 'AuditTrail');
        ai.query();
        var atId = null, atAccess = '';
        while (ai.next()) {
            if (('' + ai.sys_scope.scope) === SC) { atId = ai.getUniqueValue(); atAccess = '' + ai.getValue('access'); }
        }
        if (!atId) { F(SC, 'no AuditTrail Script Include - every rule would be inert'); continue; }
        gs.info('   AuditTrail: present, access = ' + atAccess);

        // ---- UI actions
        var uiOk = 0;
        for (var u = 0; u < AUDITED.length; u++) {
            var utbl = SC + '_' + AUDITED[u];
            var uchk = new GlideRecord(utbl);
            if (!uchk.isValid()) { continue; }

            var ua = new GlideRecord('sys_ui_action');
            ua.addQuery('table', utbl);
            ua.addQuery('action_name', 'audit_history');
            ua.query();
            var uEx = ua.next();
            if (!uEx) { ua.initialize(); ua.setValue('sys_scope', APP); ua.setValue('sys_package', APP); }

            ua.setValue('name', 'Audit History');
            ua.setValue('table', utbl);
            ua.setValue('action_name', 'audit_history');
            ua.setValue('order', 100);
            ua.setValue('active', true);
            ua.setValue('client', true);
            ua.setValue('show_insert', true);
            ua.setValue('show_update', true);
            ua.setValue('onclick', 'auditHistory()');
            ua.setValue('script', UI_SCRIPT);
            ua.setValue('list_context_menu', true);
            ua.setValue('ui11_compatible', true);
            ua.setValue('ui16_compatible', false);
            ua.setValue('form_button', false);
            ua.setValue('form_context_menu', false);
            ua.setValue('form_link', false);
            ua.setValue('list_banner_button', false);
            ua.setValue('list_button', false);
            ua.setValue('list_choice', false);
            ua.setValue('list_link', false);
            ua.setValue('comments', 'Opens the out-of-box audit history for the selected record.');

            var uid = uEx ? (ua.update() ? ua.getUniqueValue() : null) : ua.insert();
            if (!uid) { F('UI Action ' + utbl, 'refused'); continue; }

            var uv = new GlideRecord('sys_ui_action');
            uv.get(uid);
            var uScope = '' + uv.sys_scope.scope;
            if (uScope !== SC) { anyGlobal = true; landedGlobal[SC] = true; }
            if (isOn(uv.getValue('list_context_menu')) && isOn(uv.getValue('ui11_compatible')) &&
                (('' + uv.getValue('script')).indexOf('g_navigation.openPopup') > -1)) {
                uiOk++; totalUi++;
            } else { F('UI Action ' + utbl, 'saved but reads back wrong'); }
        }
        gs.info('   UI actions ok: ' + uiOk + ' of ' + AUDITED.length);

        // ---- business rules
        var RULES = rulesFor(SC);
        var brOk = 0;
        for (var r = 0; r < RULES.length; r++) {
            var R = RULES[r];
            var chk = new GlideRecord(R.table);
            if (!chk.isValid()) { gs.warn('   skip ' + R.name + ' - ' + R.table + ' absent'); continue; }

            var br = new GlideRecord('sys_script');
            br.addQuery('name', R.name);
            br.addQuery('collection', R.table);
            br.query();
            var ex = br.next();
            if (!ex) { br.initialize(); br.setValue('sys_scope', APP); br.setValue('sys_package', APP); }

            br.setValue('name', R.name);
            br.setValue('collection', R.table);
            br.setValue('when', R.when);
            br.setValue('order', 1000);
            br.setValue('active', true);
            br.setValue('advanced', true);
            br.setValue('action_insert', !!R.ins);
            br.setValue('action_update', !!R.upd);
            br.setValue('action_delete', !!R.del);
            br.setValue('action_query', false);
            br.setValue('abort_action', false);
            br.setValue('add_message', false);
            br.setValue('script', R.script);
            br.setValue('description', 'Audit event: ' + R.why + '. Records a DECISION, which the ' +
                'native trail cannot see because nobody edited a field to make it. This rule only ' +
                'reads and inserts - deactivating it leaves the pipeline unchanged.');

            var id = ex ? (br.update() ? br.getUniqueValue() : null) : br.insert();
            if (!id) { F(R.name, 'refused'); continue; }

            var v = new GlideRecord('sys_script');
            v.get(id);
            var bScope = '' + v.sys_scope.scope;
            if (bScope !== SC) { anyGlobal = true; landedGlobal[SC] = true; }
            var ok = (('' + v.getValue('collection')) === R.table) &&
                     (('' + v.getValue('when')) === R.when) &&
                     isOn(v.getValue('active')) && isOn(v.getValue('advanced')) &&
                     (('' + v.getValue('script')).length === R.script.length) &&
                     (('' + v.getValue('script')).indexOf('.AuditTrail()') > -1);
            if (ok) { brOk++; totalBr++; gs.info('   ' + pad(R.name, 32) + pad(R.table, 32) + R.when + '  [' + bScope + ']'); }
            else { F(R.name, 'saved but reads back wrong'); }
        }
        gs.info('   business rules ok: ' + brOk + ' of ' + RULES.length);
    }

    // ---------------------------------------------------------------- the access question
    line();
    gs.info('AuditTrail ACCESS');
    if (!anyGlobal) {
        gs.info('   Every record landed in its own application, so a scoped rule calls a scoped Script');
        gs.info('   Include. AuditTrail is left package_private, exactly as it was.');
        P('no change needed to AuditTrail');
    } else {
        gs.warn('   Some records landed in Global rather than the application. A Global rule cannot');
        gs.warn('   call a package_private Script Include, so AuditTrail must be widened to');
        gs.warn('   "Accessible from all application scopes" or every rule will fail silently.');
        for (var sc2 in landedGlobal) {
            var g3 = new GlideRecord('sys_script_include');
            g3.addQuery('name', 'AuditTrail');
            g3.query();
            while (g3.next()) {
                if (('' + g3.sys_scope.scope) !== sc2) { continue; }
                if (('' + g3.getValue('access')) === 'public') {
                    gs.info('   ' + sc2 + ': already public');
                    continue;
                }
                g3.setValue('access', 'public');
                g3.update();
                var c3 = new GlideRecord('sys_script_include');
                c3.get(g3.getUniqueValue());
                if (('' + c3.getValue('access')) === 'public') { P(sc2 + ': AuditTrail widened to public'); }
                else { F(sc2 + ': could not widen AuditTrail', 'the rules there will not fire'); }
            }
        }
    }

    // ---------------------------------------------------------------- verify
    line();
    gs.info('VERIFY');
    for (var s3 = 0; s3 < SCOPES.length; s3++) {
        var SC3 = SCOPES[s3];
        var nu = 0, nb = 0, inactive = 0;
        var q1 = new GlideRecord('sys_ui_action');
        q1.addQuery('action_name', 'audit_history');
        q1.query();
        while (q1.next()) { if (('' + q1.getValue('table')).indexOf(SC3 + '_') === 0) { nu++; } }
        var q2 = new GlideRecord('sys_script');
        q2.addQuery('name', 'STARTSWITH', 'Audit - ');
        q2.query();
        while (q2.next()) {
            if (('' + q2.getValue('collection')).indexOf(SC3 + '_') !== 0) { continue; }
            nb++;
            if (!isOn(q2.getValue('active'))) { inactive++; }
        }
        if (nu === 8 && nb === 10 && !inactive) { P(SC3, '8 UI actions, 10 rules, all active'); }
        else { F(SC3, nu + ' UI actions, ' + nb + ' rules, ' + inactive + ' inactive'); }
    }

    line();
    gs.info('RESULT: ' + pass + ' passed, ' + fail + ' failed');
    gs.info('   UI actions installed  : ' + totalUi + ' of ' + (AUDITED.length * SCOPES.length));
    gs.info('   business rules        : ' + totalBr + ' of ' + (10 * SCOPES.length));
    if (fail) { gs.error('Clear the failures above.'); return; }
    gs.info('');
    gs.info('Nothing in the extraction path was touched. These rules only read the record and insert an');
    gs.info('event; deactivate them and the pipeline is byte-identical to what it was.');
    gs.info('');
    gs.info('Now: open a cashflow LIST, right-click a row, "Audit History". Change a field first - the');
    gs.info('field-change trail is not retrospective. The decision events start from the next Sync.');
})();
