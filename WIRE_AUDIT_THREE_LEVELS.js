/**
 * WIRE THE AUDIT PAGE INTO THREE LEVELS  -  run ONCE in Background Scripts.
 *
 * RUN WITH: Application = Global    (the sp_* tables refuse CREATE/UPDATE from a scoped app)
 *
 * Turns the existing audit page into one destination with three states, driven by the URL:
 *
 *     ?id=nexaitest_nfotc_audit             ->  EXCEPTIONS   which mails need attention
 *     ?id=nexaitest_nfotc_audit&eml=<id>    ->  that MAIL's cashflows + that mail's events
 *     ?id=nexaitest_nfotc_audit&cf=<id>     ->  that CASHFLOW's events
 *
 * Deliberately does NOT touch the existing audit widget's template or server script. That widget
 * already handles all three parameter states correctly and analysts use it; the only change made
 * to it here is one label (see below). The new behaviour comes from two widgets added ABOVE it,
 * each of which renders only in its own state.
 *
 * Also:
 *   - reports what writes "match.decided" (36 rows exist, and it was not in any code I scanned)
 *   - adds a label for it so it stops rendering raw
 *
 * Coverage measured before building: every event type carries email_id (1712/1712), and all but
 * classification.decided carry cashflow_id - so the mail level shows everything and the cashflow
 * level shows everything except the classification, which belongs to the mail anyway.
 *
 * ES5 only. Idempotent.
 */
(function () {
    var SCOPE = 'x_nose_nexai_test';
    var AUDIT_PAGE = 'nexaitest_nfotc_audit';
    var EXC_WIDGET = 'nexai-exceptions';
    var CF_WIDGET = 'nexaitest-mail-cashflows';
    var log = [];
    function p(s) { log.push(s); }

    p('=================================================================');
    p('WIRE AUDIT PAGE - THREE LEVELS   running in: ' + gs.getCurrentScopeName());
    p('=================================================================');

    var here = gs.getCurrentScopeName();
    if (here !== 'global' && here !== 'rhino.global') {
        p('!! WRONG SCOPE - set the Application picker to Global and run again. Nothing changed.');
        gs.info('\n' + log.join('\n'));
        return;
    }

    var sc = new GlideRecord('sys_scope');
    sc.addQuery('scope', SCOPE);
    sc.setLimit(1);
    sc.query();
    if (!sc.next()) { p('!! app not found'); gs.info('\n' + log.join('\n')); return; }
    var appId = sc.getUniqueValue();
    function own(gr) { gr.setValue('sys_scope', appId); gr.setValue('sys_package', appId); }

    // ================================================================ 1. what writes match.decided
    p('');
    p('1. WHAT WRITES "match.decided"');
    var hits = 0;
    function scan(table, nameField, fields, label) {
        var g = new GlideRecord(table);
        g.addQuery('sys_scope', appId);
        g.query();
        while (g.next()) {
            for (var i = 0; i < fields.length; i++) {
                var src = g.getValue(fields[i]) || '';
                if (src.indexOf('match.decided') === -1) { continue; }
                hits++;
                p('   ' + label + ' "' + g.getValue(nameField) + '"  (' + fields[i] + ')');
                var lines = src.split('\n');
                for (var L = 0; L < lines.length; L++) {
                    if (lines[L].indexOf('match.decided') > -1) {
                        p('      L' + (L + 1) + ': ' + lines[L].replace(/^\s+/, '').substring(0, 150));
                    }
                }
            }
        }
    }
    scan('sp_widget', 'name', ['script', 'client_script', 'template'], 'widget');
    scan('sys_script_include', 'name', ['script'], 'script include');
    scan('sys_script', 'name', ['script'], 'business rule');
    if (!hits) {
        p('   NOT FOUND in this application\'s widgets, script includes or business rules.');
        p('   The 36 rows were probably written by an earlier version of the code, or from a');
        p('   background script. Labelling it is still correct - the rows exist and users see them.');
    }

    // ================================================================ 2. label it
    p('');
    p('2. LABEL FOR match.decided');
    var aw = new GlideRecord('sp_widget');
    aw.addQuery('id', 'nexaitest-audit');
    aw.setLimit(1);
    aw.query();
    if (aw.next()) {
        var s = aw.getValue('script') || '';
        if (s.indexOf("'match.decided'") > -1) {
            p('   already present, left as is');
        } else if (s.indexOf("'classification.decided': 'Relevance Decision',") > -1) {
            // neutral, literal rendering of the event name - no claim about what produced it
            s = s.replace("'classification.decided': 'Relevance Decision',",
                          "'classification.decided': 'Relevance Decision',\n        'match.decided': 'Match Decision',");
            aw.setValue('script', s);
            aw.update();
            p('   ADDED  match.decided -> "Match Decision"');
        } else {
            p('   !! label map not found in nexaitest-audit script - add by hand');
        }
    } else {
        p('   !! widget nexaitest-audit not found');
    }

    // ================================================================ 3. exceptions: only at top level
    p('');
    p('3. EXCEPTIONS WIDGET - render only when no record is selected');
    var ew = new GlideRecord('sp_widget');
    ew.addQuery('id', EXC_WIDGET);
    ew.setLimit(1);
    ew.query();
    if (!ew.next()) {
        p('   !! widget ' + EXC_WIDGET + ' not found. Run BUILD_EXCEPTIONS_VIEW.js first.');
        gs.info('\n' + log.join('\n'));
        return;
    }
    var es = ew.getValue('script') || '';
    if (es.indexOf('data.topLevel') === -1) {
        var GATE = [
            '',
            '    // This widget is the landing state of the audit page. When a mail or cashflow is',
            '    // selected the audit widget below takes over, so this one renders nothing.',
            '    data.topLevel = !$sp.getParameter("eml") && !$sp.getParameter("cf");',
            '    if (!data.topLevel) { return; }',
            ''
        ].join('\n');
        es = es.replace('    data.buckets = [];', GATE + '    data.buckets = [];');
        ew.setValue('script', es);
        var et = ew.getValue('template') || '';
        if (et.indexOf('ng-if="data.topLevel"') === -1) {
            et = et.replace('<div class="nx-exc">', '<div class="nx-exc" ng-if="data.topLevel">');
            ew.setValue('template', et);
        }
        own(ew);
        ew.update();
        p('   gated on data.topLevel');
    } else {
        p('   already gated, left as is');
    }
    var excWidgetSysId = ew.getUniqueValue();

    // ================================================================ 4. the cashflow list widget
    p('');
    p('4. CASHFLOW LIST WIDGET (mail level -> drill into one cashflow)');

    var CF_SERVER = [
        '(function () {',
        '    var SCOPE = "' + SCOPE + '";',
        '    data.show = false;',
        '    var eml = $sp.getParameter("eml");',
        '    var cf = $sp.getParameter("cf");',
        '    // only at MAIL level: a mail is selected but no single cashflow is',
        '    if (!eml || cf) { return; }',
        '',
        '    try {',
        '        var guard = new ' + SCOPE + '.AccessGuard();',
        '        if (!guard.canViewAny()) { return; }',
        '    } catch (e) { /* guard unavailable - fall through to the ACLs */ }',
        '',
        '    var em = new GlideRecord(SCOPE + "_email");',
        '    if (!em.get(eml)) { return; }',
        '    data.show = true;',
        '    data.mail = em.getValue("name") || "";',
        '    data.subject = em.getValue("mail_subject") || "";',
        '    data.classification = em.getValue("classification") || "";',
        '    data.reason = em.getValue("classification_reason") || "";',
        '    data.auditPage = "' + AUDIT_PAGE + '";',
        '',
        '    // how many events each cashflow has, in one aggregate rather than one query per row',
        '    var evCount = {};',
        '    var ag = new GlideAggregate(SCOPE + "_audit");',
        '    ag.addQuery("email_id", eml);',
        '    ag.addNotNullQuery("cashflow_id");',
        '    ag.addAggregate("COUNT", "cashflow_id");',
        '    ag.groupBy("cashflow_id");',
        '    ag.query();',
        '    while (ag.next()) {',
        '        evCount[ag.getValue("cashflow_id")] = parseInt(ag.getAggregate("COUNT", "cashflow_id"), 10) || 0;',
        '    }',
        '',
        '    data.rows = [];',
        '    var g = new GlideRecord(SCOPE + "_cashflow");',
        '    g.addQuery("email", eml);',
        '    g.orderBy("sys_created_on");',
        '    g.query();',
        '    while (g.next()) {',
        '        var id = g.getUniqueValue();',
        '        data.rows.push({',
        '            sys_id: id,',
        '            amount: g.getValue("ai_amount") || "",',
        '            currency: g.getValue("ai_currency") || "",',
        '            direction: g.getValue("ai_direction") || "",',
        '            valueDate: g.getValue("ai_value_date") || "",',
        '            reference: g.getValue("ai_reference") || "",',
        '            status: g.getValue("ai_match_status") || "",',
        '            tier: g.getValue("ai_match_tier") || "",',
        '            bankRef: g.getValue("ai_match_booking") || "",',
        '            confirmed: (g.getValue("ai_confirmed") === "true" || g.getValue("ai_confirmed") === "1"),',
        '            events: evCount[id] || 0',
        '        });',
        '    }',
        '    data.count = data.rows.length;',
        '})();'
    ].join('\n');

    var CF_TEMPLATE = [
        '<div class="mcf" ng-if="data.show">',
        '  <div class="mcf-head">',
        '    <div>',
        '      <div class="mcf-crumb"><a href="?id=' + AUDIT_PAGE + '">Exceptions</a> &rsaquo; this mail</div>',
        '      <h3>{{data.mail}}</h3>',
        '      <p class="mcf-sub" ng-if="data.subject">{{data.subject}}</p>',
        '    </div>',
        '    <div class="mcf-cls">',
        '      <span class="mcf-tag">{{data.classification || "unclassified"}}</span>',
        '      <span class="mcf-tag" ng-if="data.reason">{{data.reason}}</span>',
        '    </div>',
        '  </div>',
        '',
        '  <div ng-if="data.count === 0" class="mcf-none">',
        '    No cashflows were extracted from this mail.',
        '  </div>',
        '',
        '  <table class="mcf-tbl" ng-if="data.count > 0">',
        '    <thead>',
        '      <tr>',
        '        <th>Amount</th><th>Ccy</th><th>Direction</th><th>Value date</th>',
        '        <th>Reference</th><th>Match</th><th class="mcf-r">Events</th><th></th>',
        '      </tr>',
        '    </thead>',
        '    <tbody>',
        '      <tr ng-repeat="r in data.rows">',
        '        <td class="mcf-amt">{{r.amount}}</td>',
        '        <td>{{r.currency}}</td>',
        '        <td>{{r.direction}}</td>',
        '        <td>{{r.valueDate}}</td>',
        '        <td class="mcf-ref">{{r.reference}}</td>',
        '        <td>',
        '          <span class="mcf-tag" ng-if="r.status">{{r.status}}<span ng-if="r.tier && r.tier != \'0\'"> &middot; tier {{r.tier}}</span></span>',
        '          <span class="mcf-ok" ng-if="r.confirmed">confirmed</span>',
        '        </td>',
        '        <td class="mcf-r">{{r.events}}</td>',
        '        <td><a class="mcf-link" ng-href="?id={{data.auditPage}}&cf={{r.sys_id}}">Trail</a></td>',
        '      </tr>',
        '    </tbody>',
        '  </table>',
        '</div>'
    ].join('\n');

    var CF_CSS = [
        '.mcf { padding: 18px 24px 4px; font-size: 13px; color: #1c2430; }',
        '.mcf-head { display: flex; justify-content: space-between; align-items: flex-start; }',
        '.mcf-crumb { font-size: 12px; color: #8a94a0; margin-bottom: 2px; }',
        '.mcf-head h3 { margin: 0; font-size: 16px; font-weight: 600; word-break: break-word; }',
        '.mcf-sub { margin: 2px 0 0; color: #6b7684; }',
        '.mcf-cls { text-align: right; }',
        '.mcf-tbl { width: 100%; border-collapse: collapse; margin-top: 12px; }',
        '.mcf-tbl th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .04em;',
        '              color: #8a94a0; border-bottom: 1px solid #dfe4ea; padding: 6px 8px; font-weight: 600; }',
        '.mcf-tbl td { border-bottom: 1px solid #eef1f4; padding: 7px 8px; }',
        '.mcf-r { text-align: right; }',
        '.mcf-amt { font-variant-numeric: tabular-nums; font-weight: 500; }',
        '.mcf-ref { color: #6b7684; }',
        '.mcf-tag { display: inline-block; background: #eef1f4; border-radius: 3px; padding: 1px 7px;',
        '           font-size: 12px; margin-left: 4px; }',
        '.mcf-ok { display: inline-block; color: #2d6a4f; font-size: 12px; margin-left: 6px; }',
        '.mcf-none { margin: 14px 0; color: #b3402f; }',
        '.mcf-link { font-size: 12px; }'
    ].join('\n');

    var cw = new GlideRecord('sp_widget');
    cw.addQuery('id', CF_WIDGET);
    cw.setLimit(1);
    cw.query();
    var cfWidgetSysId = '';
    if (cw.next()) {
        cw.setValue('template', CF_TEMPLATE);
        cw.setValue('css', CF_CSS);
        cw.setValue('script', CF_SERVER);
        own(cw);
        cw.update();
        cfWidgetSysId = cw.getUniqueValue();
        p('   UPDATED ' + CF_WIDGET);
    } else {
        cw.initialize();
        cw.setValue('id', CF_WIDGET);
        cw.setValue('name', 'NexAI Mail Cashflows');
        cw.setValue('description', 'Cashflows of one mail, each linking to its own audit trail.');
        cw.setValue('template', CF_TEMPLATE);
        cw.setValue('css', CF_CSS);
        cw.setValue('script', CF_SERVER);
        cw.setValue('public', false);
        own(cw);
        cfWidgetSysId = cw.insert();
        p('   ' + (cfWidgetSysId ? 'CREATED ' + CF_WIDGET + '  ' + cfWidgetSysId : '!! CREATE FAILED'));
    }

    // ================================================================ 5. put them on the audit page
    p('');
    p('5. PAGE LAYOUT');
    var pg = new GlideRecord('sp_page');
    pg.addQuery('id', AUDIT_PAGE);
    pg.setLimit(1);
    pg.query();
    if (!pg.next()) { p('   !! page not found'); gs.info('\n' + log.join('\n')); return; }
    var pageSysId = pg.getUniqueValue();

    function findOrMake(table, query, fill) {
        var g = new GlideRecord(table);
        for (var k in query) { if (query.hasOwnProperty(k)) { g.addQuery(k, query[k]); } }
        g.setLimit(1);
        g.query();
        if (g.next()) { return g.getUniqueValue(); }
        g.initialize();
        for (var k2 in query) { if (query.hasOwnProperty(k2)) { g.setValue(k2, query[k2]); } }
        if (fill) { fill(g); }
        own(g);
        return g.insert();
    }

    // order 10 puts this container above whatever the page already has
    var cont = findOrMake('sp_container', { sp_page: pageSysId, order: 10 }, function (g) {
        g.setValue('name', 'Context');
        g.setValue('width', 'container-fluid');
    });
    var row = cont ? findOrMake('sp_row', { sp_container: cont, order: 10 }, null) : '';
    var col = row ? findOrMake('sp_column', { sp_row: row, order: 10 }, function (g) {
        g.setValue('size', 12);
    }) : '';

    var i1 = (col && excWidgetSysId) ? findOrMake('sp_instance',
        { sp_column: col, sp_widget: excWidgetSysId }, function (g) {
            g.setValue('title', 'Exceptions');
            g.setValue('order', 10);
        }) : '';
    var i2 = (col && cfWidgetSysId) ? findOrMake('sp_instance',
        { sp_column: col, sp_widget: cfWidgetSysId }, function (g) {
            g.setValue('title', 'Cashflows');
            g.setValue('order', 20);
        }) : '';

    p('   container=' + cont + '  row=' + row + '  column=' + col);
    p('   exceptions instance=' + i1);
    p('   cashflows  instance=' + i2);

    p('');
    if (i1 && i2) {
        var host = gs.getProperty('instance_name');
        p('DONE. One page, three states:');
        p('   https://' + host + '.service-now.com/nexai?id=' + AUDIT_PAGE);
        p('      -> Exceptions: which mails need attention');
        p('   ...&eml=<mail sys_id>   -> that mail\'s cashflows, then its events below');
        p('   ...&cf=<cashflow sys_id> -> that cashflow\'s events');
        p('');
        p('The standalone page ' + '?id=nexai_exceptions' + ' still works and is now a duplicate.');
        p('Say the word and it can be removed.');
    } else {
        p('INCOMPLETE - see the !! lines above.');
    }
    p('=================================================================');
    gs.info('\n' + log.join('\n'));
})();
