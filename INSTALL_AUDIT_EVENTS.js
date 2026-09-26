/**
 * Install the missing audit EVENTS - the decisions the native trail cannot see.
 *
 * Run once per scope: Background Scripts, Application picker set to the scope, "Run in scoped
 * application" ticked. NO EDITING - it reads the current scope and works on that one.
 *
 * WHY THIS EXISTS
 * ---------------
 * The native audit trail records CHANGES TO RECORDS THAT EXIST. It cannot record a decision. A mail
 * judged irrelevant, a thread dropped, an extraction that came back partial, a match awarded at tier 3,
 * an analyst overriding the model - none of those are field edits anyone made, so none of them appear.
 *
 * The application already has the right home for them: the x_nose_*_audit table and its AuditTrail
 * writer, which is append-only and already carries columns for config changes, analyst-vs-AI values and
 * before/after state. Today only two event types are ever written - classification.decided and
 * cashflow.extracted. Everything below was modelled and never wired up.
 *
 * WHY BUSINESS RULES AND NOT EDITS TO THE EXTRACTION CODE
 * ------------------------------------------------------
 * Every decision worth auditing already lands in a column: ai_match_status, ai_match_tier,
 * ai_candidate_count, ai_mo_sent, extraction_status, thread_state, classification, and the
 * analyst/AI field pairs. A rule watching those columns captures the decision without a single line
 * changing inside WizardExtractor or GenericFieldExtractor - which were propagated across four scopes
 * yesterday and are the last thing that should be destabilised for a logging change.
 *
 * It also means this is completely reversible: deactivate the rules and the pipeline is untouched.
 *
 * WHAT IS INSTALLED
 * -----------------
 * First, the "Audit History" UI Action on each audited table - the list context-menu entry that
 * opens the out-of-box history page, copied from Nomura's own. Then ten business rules:
 *
 *    config.changed       a threshold or toggle was edited, with old and new value
 *    wizard.changed       a prompt or identification rule was edited. Large JSON fields are recorded
 *                         as a FINGERPRINT, not copied - tamper-evident without duplicating the payload
 *    mail.processed       a mail finished extraction, and HOW MANY cashflows it produced. A mail that
 *                         produced nothing writes no cashflow.extracted event today, so it currently
 *                         vanishes - this is the row that catches it
 *    extraction.partial   the completeness guard fired
 *    thread.classified    thread state decided, including the quoting mails that get dropped
 *    analyst.decision     an analyst overrode or confirmed, with the AI value alongside theirs
 *    match.decided        match status, tier, confidence and candidate count
 *    mo.sent              sent to Middle Office - an outbound action
 *    cashflow.deleted     a cashflow was destroyed. Re-extraction DELETES a mail's rows before
 *                         rewriting them, so without this a lost chunk is silent
 *    email.deleted        a mail record was destroyed
 *
 * STILL NOT COVERED, and honestly it needs a code change rather than a rule:
 *    sync.run             who pressed Sync, over how many mails, how long, how many failed. There is
 *                         no run identifier on any record to hang it from. mail.processed gives the
 *                         per-mail half of this today.
 *
 * PREREQUISITE: run ENABLE_AUDIT_GLOBAL.js from Global FIRST. It ticks Audit on the dictionary,
 * which sys_dictionary refuses to let a scoped script do - measured, not assumed. Without it the
 * rules below still record decisions, but the field-change trail behind the Audit History action
 * will be empty.
 *
 * Safe to run twice: a rule that already exists is updated in place, not duplicated.
 */
(function () {
    var ALLOWED = ['x_nose_nexai_dev', 'x_nose_nexai_uat', 'x_nose_nfotc_bsm', 'x_nose_nexai_test'];

    function line() { gs.info('------------------------------------------------------------------'); }
    var pass = 0, fail = 0;
    function P(l, d) { pass++; gs.info('   PASS  ' + l + (d ? '   ' + d : '')); }
    function F(l, d) { fail++; gs.error('   FAIL  ' + l + (d ? '   ' + d : '')); }
    function pad(s, n) { s = '' + s; while (s.length < n) { s = s + ' '; } return s; }
    function isOn(v) { v = '' + (v || ''); return v === 'true' || v === '1'; }
    function J(lines) { return lines.join('\n'); }

    var SCOPE = '';
    try { SCOPE = '' + gs.getCurrentScopeName(); } catch (e) { SCOPE = '?'; }
    var okScope = false;
    for (var a = 0; a < ALLOWED.length; a++) { if (ALLOWED[a] === SCOPE) { okScope = true; } }
    if (!okScope) {
        gs.error('ABORT. Current scope is "' + SCOPE + '", not one of the NexAI applications.');
        gs.error('Expected one of: ' + ALLOWED.join(', '));
        return;
    }
    gs.info('instance : ' + gs.getProperty('instance_name', '?'));
    gs.info('scope    : ' + SCOPE);

    var T_EMAIL = SCOPE + '_email';
    var T_CASH = SCOPE + '_cashflow';
    var T_CONF = SCOPE + '_config';
    var T_WIZ = SCOPE + '_wizard';
    var T_AUD = SCOPE + '_audit';

    // ---------------------------------------------------------------- 0. prerequisites
    line();
    gs.info('0. PREREQUISITES');
    var at = new GlideRecord('sys_script_include');
    at.addQuery('name', 'AuditTrail');
    at.query();
    var found = false;
    while (at.next()) { if (('' + at.sys_scope.scope) === SCOPE) { found = true; } }
    if (!found) {
        gs.error('ABORT. No AuditTrail Script Include in ' + SCOPE + '. Every rule below calls it.');
        return;
    }
    P('AuditTrail present in this scope');

    var ag = new GlideRecord(T_AUD);
    if (!ag.isValid()) { F(T_AUD + ' is not a valid table'); return; }
    P(T_AUD + ' is writable from here');

    // ---------------------------------------------------------------- 1. the Audit History UI Action
    //
    // Ticking Audit (ENABLE_AUDIT_GLOBAL.js, run from Global) makes the data exist. This is how anyone
    // reaches it. Copied from Nomura's own "Audit History" action on x_vort2_news_fees_rebate_payments
    // in the NEWS application: a LIST CONTEXT MENU entry opening the out-of-box history.do page in a
    // popup for the row you right-clicked. Same name, same action_name, same script, so it behaves like
    // the one their users already know.
    //
    // This half lives in the per-scope script rather than the Global one because a UI Action created
    // from Global would be stamped Global, and would not travel with the application.
    //
    // ui11_compatible is the field labelled "List v2 Compatible" - the classic list, which is where
    // these tables are viewed. ui16_compatible is left false exactly as their sample has it.
    line();
    gs.info('1. "Audit History" UI ACTION');

    var AUDITED = ['email', 'cashflow', 'booking', 'counterparty',
                   'wizard', 'config', 'capability', 'work_item'];

    var UI_SCRIPT =
        'var selSysIds;\n' +
        'function auditHistory() {\n' +
        "    selSysIds = g_sysId;\n" +
        "    g_navigation.openPopup('history.do?sysparm_sys_id=' + selSysIds +\n" +
        "                           '&sysparm_table=' + g_list.getTableName());\n" +
        '}\n';

    var uiMade = 0, uiUpd = 0, uiSkip = 0;
    for (var u = 0; u < AUDITED.length; u++) {
        var utbl = SCOPE + '_' + AUDITED[u];
        var uchk = new GlideRecord(utbl);
        if (!uchk.isValid()) { uiSkip++; continue; }

        var ua = new GlideRecord('sys_ui_action');
        ua.addQuery('table', utbl);
        ua.addQuery('action_name', 'audit_history');
        ua.query();
        var uExisted = ua.next();
        if (!uExisted) { ua.initialize(); }

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
        ua.setValue('comments', 'Opens the out-of-box audit history for the selected record. Needs ' +
            'Audit ticked on this table dictionary entry, which ENABLE_AUDIT_GLOBAL.js does.');

        var uid = uExisted ? (ua.update() ? ua.getUniqueValue() : null) : ua.insert();
        if (!uid) { F('UI Action for ' + utbl, 'could not save'); continue; }

        var uv = new GlideRecord('sys_ui_action');
        uv.get(uid);
        var uok = (('' + uv.getValue('table')) === utbl) &&
                  isOn(uv.getValue('active')) && isOn(uv.getValue('client')) &&
                  isOn(uv.getValue('list_context_menu')) && isOn(uv.getValue('ui11_compatible')) &&
                  (('' + uv.getValue('onclick')) === 'auditHistory()') &&
                  (('' + uv.getValue('script')).indexOf('g_navigation.openPopup') > -1);
        if (!uok) { F('UI Action for ' + utbl, 'saved but does not read back correctly'); continue; }

        if (uExisted) { uiUpd++; gs.info('   updated  ' + pad(utbl, 36) + 'Audit History'); }
        else { uiMade++; gs.info('   CREATED  ' + pad(utbl, 36) + 'Audit History'); }
        pass++;
    }
    gs.info('   created ' + uiMade + ', updated ' + uiUpd +
        (uiSkip ? (', ' + uiSkip + ' table(s) not present in this scope') : ''));

    // ---------------------------------------------------------------- the rules
    var RULES = [];

    // 1 ------------------------------------------------------------- config.changed
    RULES.push({
        name: 'Audit - config changed', table: T_CONF, when: 'after',
        ins: true, upd: true, del: false,
        why: 'a threshold or toggle was edited',
        script: J([
        '(function executeRule(current, previous) {',
        '    try {',
        "        var oldV = previous ? ('' + previous.getValue('value')) : '';",
        "        var newV = '' + current.getValue('value');",
        '        if (oldV === newV) { return; }',
        "        new AuditTrail().log('config.changed', {",
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
        '})(current, previous);'])
    });

    // 2 ------------------------------------------------------------- wizard.changed
    RULES.push({
        name: 'Audit - wizard changed', table: T_WIZ, when: 'after',
        ins: false, upd: true, del: false,
        why: 'a prompt or identification rule was edited',
        script: J([
        '(function executeRule(current, previous) {',
        '    try {',
        '        if (!previous) { return; }',
        '        var at = new AuditTrail();',
        "        var WATCH = ['input_fields', 'id_rules', 'config_overrides', 'mapping', 'tagging',",
        "                     'writeback', 'status', 'version', 'work_driver', 'name'];",
        '        var changed = [], before = {}, after = {};',
        '        for (var i = 0; i < WATCH.length; i++) {',
        '            var f = WATCH[i];',
        "            var o = '' + previous.getValue(f);",
        "            var n = '' + current.getValue(f);",
        '            if (o === n) { continue; }',
        '            changed.push(f);',
        '            // a prompt is far too big to copy into the trail, and copying it would duplicate',
        '            // the payload anyway. A fingerprint proves it changed and proves what it was.',
        '            if (o.length > 200 || n.length > 200) {',
        '                before[f] = at.hash(o); after[f] = at.hash(n);',
        '            } else { before[f] = o; after[f] = n; }',
        '        }',
        '        if (!changed.length) { return; }',
        "        at.log('wizard.changed', {",
        "            entityType: 'wizard',",
        "            entityId: '' + current.getUniqueValue(),",
        "            fieldName: changed.join(','),",
        "            summary: 'Wizard \"' + current.getValue('name') + '\" changed: ' + changed.join(', '),",
        '            before: before, after: after,',
        '            actor: gs.getUserName(),',
        "            ai: { prompt_ref: 'wizard:' + current.getUniqueValue() }",
        '        });',
        "    } catch (e) { gs.warn('[audit wizard.changed] ' + e); }",
        '})(current, previous);'])
    });

    // 3 ------------------------------------------------------------- mail.processed
    RULES.push({
        name: 'Audit - mail processed', table: T_EMAIL, when: 'after',
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
        "        new AuditTrail().log('mail.processed', {",
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
        '})(current, previous);'])
    });

    // 4 ------------------------------------------------------------- extraction.partial
    RULES.push({
        name: 'Audit - extraction partial', table: T_EMAIL, when: 'after',
        ins: false, upd: true, del: false,
        why: 'the completeness guard fired',
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
        "        new AuditTrail().log('extraction.partial', {",
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
        '})(current, previous);'])
    });

    // 5 ------------------------------------------------------------- thread.classified
    RULES.push({
        name: 'Audit - thread classified', table: T_EMAIL, when: 'after',
        ins: true, upd: true, del: false,
        why: 'thread state decided - this is what drops the quoting mails',
        script: J([
        '(function executeRule(current, previous) {',
        '    try {',
        "        var oldV = previous ? ('' + previous.getValue('thread_state')) : '';",
        "        var newV = '' + current.getValue('thread_state');",
        "        if (oldV === newV || newV === '') { return; }",
        "        new AuditTrail().log('thread.classified', {",
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
        '})(current, previous);'])
    });

    // 6 ------------------------------------------------------------- analyst.decision
    RULES.push({
        name: 'Audit - analyst decision', table: T_CASH, when: 'after',
        ins: false, upd: true, del: false,
        why: 'an analyst confirmed or overrode the model',
        script: J([
        '(function executeRule(current, previous) {',
        '    try {',
        '        if (!previous) { return; }',
        '        // analyst field paired with the AI field it is overriding, so the trail shows both',
        '        var PAIRS = [',
        "            ['confirmed', 'ai_confirmed'],",
        "            ['review_confirmed', 'ai_review_confirmed'],",
        "            ['analyst_outcome', 'ai_analyst_outcome'],",
        "            ['resolution', 'ai_resolution']",
        '        ];',
        '        var at = new AuditTrail();',
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
        '})(current, previous);'])
    });

    // 7 ------------------------------------------------------------- match.decided
    RULES.push({
        name: 'Audit - match decided', table: T_CASH, when: 'after',
        ins: false, upd: true, del: false,
        why: 'Compare and Match reached a verdict',
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
        "        new AuditTrail().log('match.decided', {",
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
        '})(current, previous);'])
    });

    // 8 ------------------------------------------------------------- mo.sent
    RULES.push({
        name: 'Audit - sent to middle office', table: T_CASH, when: 'after',
        ins: false, upd: true, del: false,
        why: 'an outbound action left the system',
        script: J([
        '(function executeRule(current, previous) {',
        '    try {',
        '        if (!previous) { return; }',
        "        var o = '' + previous.getValue('ai_mo_sent');",
        "        var n = '' + current.getValue('ai_mo_sent');",
        "        if (o === n || n === '' || n === 'false' || n === '0') { return; }",
        "        new AuditTrail().log('mo.sent', {",
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
        '})(current, previous);'])
    });

    // 9 ------------------------------------------------------------- cashflow.deleted
    RULES.push({
        name: 'Audit - cashflow deleted', table: T_CASH, when: 'before',
        ins: false, upd: false, del: true,
        why: 're-extraction DELETES a mail rows before rewriting - without this a lost chunk is silent',
        script: J([
        '(function executeRule(current, previous) {',
        '    try {',
        "        new AuditTrail().log('cashflow.deleted', {",
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
        '})(current, previous);'])
    });

    // 10 ------------------------------------------------------------ email.deleted
    RULES.push({
        name: 'Audit - email deleted', table: T_EMAIL, when: 'before',
        ins: false, upd: false, del: true,
        why: 'a mail record was destroyed',
        script: J([
        '(function executeRule(current, previous) {',
        '    try {',
        '        var n = 0;',
        "        var cf = new GlideAggregate('" + T_CASH + "');",
        "        cf.addQuery('email', current.getUniqueValue());",
        "        cf.addAggregate('COUNT');",
        '        cf.query();',
        "        if (cf.next()) { n = parseInt(cf.getAggregate('COUNT'), 10) || 0; }",
        "        new AuditTrail().log('email.deleted', {",
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
        '})(current, previous);'])
    });

    // ---------------------------------------------------------------- install
    line();
    gs.info('2. INSTALLING ' + RULES.length + ' BUSINESS RULES');
    var made = 0, upd = 0;

    for (var r = 0; r < RULES.length; r++) {
        var R = RULES[r];

        var chk = new GlideRecord(R.table);
        if (!chk.isValid()) {
            F(R.name, R.table + ' does not exist in this scope - rule skipped');
            continue;
        }

        var br = new GlideRecord('sys_script');
        br.addQuery('name', R.name);
        br.addQuery('collection', R.table);
        br.query();
        var existed = br.next();
        if (!existed) { br.initialize(); }

        br.setValue('name', R.name);
        br.setValue('collection', R.table);
        br.setValue('when', R.when);
        br.setValue('order', 1000);            // late, so other rules have settled the values first
        br.setValue('active', true);
        br.setValue('advanced', true);         // required for the Script field to be used at all
        br.setValue('action_insert', !!R.ins);
        br.setValue('action_update', !!R.upd);
        br.setValue('action_delete', !!R.del);
        br.setValue('action_query', false);
        br.setValue('abort_action', false);
        br.setValue('add_message', false);
        br.setValue('script', R.script);
        br.setValue('description', 'Writes an audit event: ' + R.why + '. Captures a DECISION, which ' +
            'the native audit trail cannot see because no one edited a field to make it. Deactivate ' +
            'this rule and the pipeline is unaffected - it only reads.');

        var id = existed ? (br.update() ? br.getUniqueValue() : null) : br.insert();
        if (!id) { F(R.name, 'could not save'); continue; }

        // read back
        var v = new GlideRecord('sys_script');
        v.get(id);
        var ok = (('' + v.getValue('collection')) === R.table) &&
                 (('' + v.getValue('when')) === R.when) &&
                 isOn(v.getValue('active')) && isOn(v.getValue('advanced')) &&
                 (isOn(v.getValue('action_insert')) === !!R.ins) &&
                 (isOn(v.getValue('action_update')) === !!R.upd) &&
                 (isOn(v.getValue('action_delete')) === !!R.del) &&
                 (('' + v.getValue('script')).length === R.script.length) &&
                 (('' + v.getValue('script')).indexOf('new AuditTrail()') > -1);
        if (!ok) {
            F(R.name, 'saved but does not read back correctly');
            continue;
        }
        if (existed) { upd++; gs.info('   updated  ' + pad(R.name, 32) + pad(R.table, 32) + R.when); }
        else { made++; gs.info('   CREATED  ' + pad(R.name, 32) + pad(R.table, 32) + R.when); }
        pass++;
    }

    // ---------------------------------------------------------------- verify
    line();
    gs.info('3. VERIFY - every audit rule now on this scope tables');
    var seen = 0;
    var q = new GlideRecord('sys_script');
    q.addQuery('name', 'STARTSWITH', 'Audit - ');
    q.orderBy('collection');
    q.query();
    while (q.next()) {
        if (('' + q.getValue('collection')).indexOf(SCOPE + '_') !== 0) { continue; }
        seen++;
        var acts = [];
        if (isOn(q.getValue('action_insert'))) { acts.push('insert'); }
        if (isOn(q.getValue('action_update'))) { acts.push('update'); }
        if (isOn(q.getValue('action_delete'))) { acts.push('delete'); }
        gs.info('   ' + pad(q.getValue('name'), 32) + pad(q.getValue('collection'), 32) +
            pad(q.getValue('when'), 8) + acts.join('+') +
            (isOn(q.getValue('active')) ? '' : '   INACTIVE'));
    }
    if (seen === RULES.length) { P('all ' + RULES.length + ' rules present in ' + SCOPE); }
    else { F('found ' + seen + ' rules, expected ' + RULES.length); }

    // what the trail holds right now
    line();
    gs.info('4. EVENT TYPES IN ' + T_AUD + ' TODAY');
    var KNOWN = ['classification.decided', 'cashflow.extracted', 'config.changed', 'wizard.changed',
                 'mail.processed', 'extraction.partial', 'thread.classified', 'analyst.decision',
                 'match.decided', 'mo.sent', 'cashflow.deleted', 'email.deleted'];
    for (var k = 0; k < KNOWN.length; k++) {
        var n2 = 0;
        try {
            var ga = new GlideAggregate(T_AUD);
            ga.addQuery('event_type', KNOWN[k]);
            ga.addAggregate('COUNT');
            ga.query();
            if (ga.next()) { n2 = parseInt(ga.getAggregate('COUNT'), 10) || 0; }
        } catch (e2) { n2 = -1; }
        gs.info('   ' + pad(KNOWN[k], 26) + (n2 === 0 ? '0   (nothing has triggered it yet)' : n2));
    }

    line();
    gs.info('RESULT for ' + SCOPE + ': ' + pass + ' passed, ' + fail + ' failed');
    gs.info('   created ' + made + ', updated ' + upd);
    if (fail) { gs.error('Clear the failures above.'); return; }
    gs.info('');
    gs.info('These rules only READ the record and write an event. None of them aborts, changes a value,');
    gs.info('or touches the extraction code. Deactivating them leaves the pipeline exactly as it was.');
    gs.info('');
    gs.info('To see the events: ' + T_AUD + ' list, or the Audit History action on a record.');
    gs.info('Repeat in the remaining scopes by changing only the Application picker.');
})();
