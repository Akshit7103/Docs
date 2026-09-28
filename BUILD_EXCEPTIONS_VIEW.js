/**
 * BUILD THE EXCEPTIONS VIEW  -  run ONCE in Background Scripts on nomurabsmdev.
 *
 * RUN WITH: Application = NexAI OTC Test   (scope x_nose_nexai_test)
 *
 * Creates (or updates, if re-run) one Service Portal widget + one page showing every mail that
 * needs a human to look at it but appears nowhere else today:
 *
 *   NOTHING EXTRACTED  claimed and run, but extraction never stamped it   -> 9 today
 *   PARTIAL            completeness guard fired                           -> 2 today
 *   DROPPED            classified irrelevant, WITH the reason             -> 35 today
 *   UNCLAIMED          relevant but no work driver owns it                -> 0 today
 *   STUCK              composed_state still 'running'                     -> 0 today
 *
 * Bucket definitions come from measured data, not assumption:
 *   - 72 relevant mails all carry composed_run; only 63 carry wiz_extracted. The 9 that differ are
 *     exactly the 9 relevant mails with no cashflow rows, so "composed_run set, wiz_extracted
 *     empty" is the signature. The widget still verifies against a real cashflow count.
 *   - classification_reason is EMPTY on every dropped mail on this instance, so the reason is read
 *     from the audit event store (classification.decided), not from the column.
 *
 * Written as ES5 (no template literals / let / arrow functions) so it runs on the background
 * script engine. Idempotent: re-running updates in place rather than duplicating.
 */
(function () {
    var SCOPE = 'x_nose_nexai_test';
    var WIDGET_ID = 'nexai-exceptions';
    var PAGE_ID = 'nexai_exceptions';
    var log = [];
    function p(s) { log.push(s); }

    p('=================================================================');
    p('BUILD EXCEPTIONS VIEW   scope: ' + gs.getCurrentScopeName());
    p('=================================================================');

    if (gs.getCurrentScopeName().indexOf(SCOPE) !== 0) {
        p('!! WRONG SCOPE. Set the Application picker to "NexAI OTC Test" and run again.');
        p('!! nothing was created.');
        gs.info('\n' + log.join('\n'));
        return;
    }

    // ------------------------------------------------------------------ server script
    var SERVER = [
        '(function () {',
        '    var SCOPE = "' + SCOPE + '";',
        '    var EMAIL = SCOPE + "_email";',
        '    var CASHFLOW = SCOPE + "_cashflow";',
        '    var AUDIT = SCOPE + "_audit";',
        '',
        '    data.buckets = [];',
        '    data.total = 0;',
        '    data.canView = true;',
        '',
        '    // Surface guard - the same one every other widget uses, so this page cannot become a',
        '    // way to see mail the analyst is not entitled to.',
        '    try {',
        '        var guard = new ' + SCOPE + '.AccessGuard();',
        '        data.role = guard.roleLabel();',
        '        data.name = guard.userDisplayName("User");',
        '        data.canView = guard.canViewAny();',
        '    } catch (e) { data.role = ""; data.name = ""; }',
        '    if (!data.canView) { return; }',
        '',
        '    // ONE aggregate for cashflow counts per mail, rather than a query per mail.',
        '    var haveRows = {};',
        '    var ag = new GlideAggregate(CASHFLOW);',
        '    ag.addAggregate("COUNT", "email");',
        '    ag.groupBy("email");',
        '    ag.query();',
        '    while (ag.next()) {',
        '        haveRows[ag.getValue("email")] = parseInt(ag.getAggregate("COUNT", "email"), 10) || 0;',
        '    }',
        '',
        '    // The drop reason lives in the audit event store, NOT on the mail record - the',
        '    // classification_reason column is empty on this instance.',
        '    var reasonOf = {};',
        '    var au = new GlideRecord(AUDIT);',
        '    au.addQuery("event_type", "classification.decided");',
        '    au.orderBy("sys_created_on");          // later rows overwrite earlier = newest wins',
        '    au.query();',
        '    while (au.next()) {',
        '        var eid = au.getValue("email_id");',
        '        if (!eid) { continue; }',
        '        var why = au.getValue("summary") || "";',
        '        var attrs = au.getValue("ai_attributes") || "";',
        '        var m = attrs.match(/"reason"\\s*:\\s*"([^"]+)"/);',
        '        reasonOf[eid] = {',
        '            reason: m ? m[1] : "",',
        '            label: au.getValue("ai_label") || "",',
        '            summary: why,',
        '            when: au.getValue("sys_created_on")',
        '        };',
        '    }',
        '',
        '    function row(gr) {',
        '        var id = gr.getUniqueValue();',
        '        var r = reasonOf[id] || {};',
        '        return {',
        '            sys_id: id,',
        '            name: gr.getValue("name") || "(no name)",',
        '            subject: gr.getValue("mail_subject") || "",',
        '            sender: gr.getValue("sender") || gr.getValue("mail_from") || "",',
        '            created: gr.getValue("sys_created_on") || "",',
        '            state: gr.getValue("composed_state") || "",',
        '            extraction: gr.getValue("extraction_status") || "",',
        '            classification: gr.getValue("classification") || "",',
        '            reason: r.reason || gr.getValue("classification_reason") || "",',
        '            reasonSummary: r.summary || "",',
        '            cashflows: haveRows[id] || 0',
        '        };',
        '    }',
        '',
        '    function collect(key, title, note, build, limit) {',
        '        var items = [];',
        '        var g = new GlideRecord(EMAIL);',
        '        build(g);',
        '        g.orderByDesc("sys_created_on");',
        '        g.setLimit(limit || 200);',
        '        g.query();',
        '        while (g.next()) { items.push(row(g)); }',
        '        data.buckets.push({ key: key, title: title, note: note, count: items.length, items: items });',
        '        data.total += items.length;',
        '    }',
        '',
        '    // 1. claimed and run, but extraction never stamped it. Verified against a real',
        '    //    cashflow count so a mail that DID produce rows can never appear here.',
        '    var nothing = [];',
        '    var n1 = new GlideRecord(EMAIL);',
        '    n1.addQuery("classification", "relevant");',
        '    n1.addNotNullQuery("composed_run");',
        '    n1.addNullQuery("wiz_extracted");',
        '    n1.orderByDesc("sys_created_on");',
        '    n1.query();',
        '    while (n1.next()) {',
        '        if (!haveRows[n1.getUniqueValue()]) { nothing.push(row(n1)); }',
        '    }',
        '    data.buckets.push({',
        '        key: "nothing", title: "Nothing extracted",',
        '        note: "The mail was claimed and the pipeline ran, but no cashflow was produced and nothing marks the attempt.",',
        '        count: nothing.length, items: nothing',
        '    });',
        '    data.total += nothing.length;',
        '',
        '    collect("partial", "Partial extraction",',
        '        "Fewer rows came back than the body appears to contain. The mail is flagged rather than reported complete.",',
        '        function (g) { g.addQuery("extraction_status", "partial"); });',
        '',
        '    collect("unclaimed", "Unclaimed",',
        '        "Relevant, but no work driver has claimed it - so it appears on no board.",',
        '        function (g) {',
        '            g.addQuery("classification", "relevant");',
        '            g.addNullQuery("composed_run");',
        '            g.addNullQuery("wiz_extracted");',
        '        });',
        '',
        '    collect("stuck", "Stuck in sync",',
        '        "Sync started and never finished. Nothing clears these on its own.",',
        '        function (g) { g.addQuery("composed_state", "running"); });',
        '',
        '    collect("dropped", "Dropped as irrelevant",',
        '        "Classified irrelevant and hidden from every board. The reason comes from the audit trail.",',
        '        function (g) { g.addQuery("classification", "irrelevant"); }, 300);',
        '})();'
    ].join('\n');

    // ------------------------------------------------------------------ template
    var TEMPLATE = [
        '<div class="nx-exc">',
        '  <div class="nx-head">',
        '    <div>',
        '      <h2>Exceptions</h2>',
        '      <p class="nx-sub">Mails that need a person to look at them, and appear on no other screen.</p>',
        '    </div>',
        '    <div class="nx-who" ng-if="data.name">{{data.name}}<span ng-if="data.role"> &middot; {{data.role}}</span></div>',
        '  </div>',
        '',
        '  <div ng-if="!data.canView" class="nx-empty">You do not have access to any work driver.</div>',
        '',
        '  <div class="nx-tiles" ng-if="data.canView">',
        '    <div class="nx-tile" ng-repeat="b in data.buckets"',
        '         ng-class="{\'is-zero\': b.count === 0, \'is-open\': c.open === b.key}"',
        '         ng-click="c.toggle(b.key)">',
        '      <div class="nx-n">{{b.count}}</div>',
        '      <div class="nx-t">{{b.title}}</div>',
        '    </div>',
        '  </div>',
        '',
        '  <div ng-if="data.canView && data.total === 0" class="nx-clear">Nothing outstanding.</div>',
        '',
        '  <div class="nx-sec" ng-repeat="b in data.buckets" ng-if="b.count > 0 && (!c.open || c.open === b.key)">',
        '    <h3>{{b.title}} <span class="nx-c">{{b.count}}</span></h3>',
        '    <p class="nx-note">{{b.note}}</p>',
        '    <table class="nx-tbl">',
        '      <thead>',
        '        <tr>',
        '          <th>Mail</th>',
        '          <th ng-if="b.key === \'dropped\'">Why it was dropped</th>',
        '          <th ng-if="b.key !== \'dropped\'">State</th>',
        '          <th class="nx-r">Cashflows</th>',
        '          <th>Received</th>',
        '          <th></th>',
        '        </tr>',
        '      </thead>',
        '      <tbody>',
        '        <tr ng-repeat="m in b.items">',
        '          <td>',
        '            <div class="nx-name">{{m.name}}</div>',
        '            <div class="nx-from" ng-if="m.sender">{{m.sender}}</div>',
        '          </td>',
        '          <td ng-if="b.key === \'dropped\'">',
        '            <span class="nx-tag" ng-if="m.reason">{{m.reason}}</span>',
        '            <span class="nx-none" ng-if="!m.reason">no reason recorded</span>',
        '          </td>',
        '          <td ng-if="b.key !== \'dropped\'">',
        '            <span class="nx-tag" ng-if="m.extraction">{{m.extraction}}</span>',
        '            <span class="nx-tag" ng-if="!m.extraction && m.state">{{m.state}}</span>',
        '          </td>',
        '          <td class="nx-r" ng-class="{\'nx-zero\': m.cashflows === 0}">{{m.cashflows}}</td>',
        '          <td class="nx-when">{{m.created}}</td>',
        '          <td><a class="nx-link" ng-href="?id=' + PAGE_ID + '&open={{m.sys_id}}"',
        '                 ng-click="c.audit(m.sys_id, $event)">Audit trail</a></td>',
        '        </tr>',
        '      </tbody>',
        '    </table>',
        '  </div>',
        '</div>'
    ].join('\n');

    // ------------------------------------------------------------------ client controller
    var CLIENT = [
        'function ($scope, $window) {',
        '    var c = this;',
        '    c.open = "";',
        '    c.toggle = function (key) { c.open = (c.open === key) ? "" : key; };',
        '    c.audit = function (sysId, ev) {',
        '        if (ev) { ev.preventDefault(); }',
        '        $window.location.href = "?id=bsm_nfotc_audit&eml=" + sysId;',
        '    };',
        '}'
    ].join('\n');

    // ------------------------------------------------------------------ css
    var CSS = [
        '.nx-exc { padding: 20px 24px; font-size: 13px; color: #1c2430; }',
        '.nx-head { display: flex; justify-content: space-between; align-items: flex-start; }',
        '.nx-head h2 { margin: 0; font-size: 20px; font-weight: 600; }',
        '.nx-sub { margin: 4px 0 0; color: #6b7684; }',
        '.nx-who { color: #6b7684; font-size: 12px; }',
        '.nx-tiles { display: flex; flex-wrap: wrap; gap: 10px; margin: 18px 0 8px; }',
        '.nx-tile { flex: 1 1 130px; border: 1px solid #dfe4ea; border-radius: 6px; padding: 12px 14px;',
        '           cursor: pointer; background: #fff; }',
        '.nx-tile:hover { border-color: #b9c2cd; }',
        '.nx-tile.is-open { border-color: #7a8794; box-shadow: inset 0 0 0 1px #7a8794; }',
        '.nx-tile.is-zero { opacity: .5; }',
        '.nx-n { font-size: 22px; font-weight: 600; line-height: 1.1; }',
        '.nx-t { color: #6b7684; margin-top: 2px; font-size: 12px; }',
        '.nx-sec { margin-top: 22px; }',
        '.nx-sec h3 { font-size: 15px; font-weight: 600; margin: 0; }',
        '.nx-c { color: #6b7684; font-weight: 400; }',
        '.nx-note { color: #6b7684; margin: 3px 0 10px; }',
        '.nx-tbl { width: 100%; border-collapse: collapse; }',
        '.nx-tbl th { text-align: left; font-weight: 600; font-size: 11px; text-transform: uppercase;',
        '             letter-spacing: .04em; color: #8a94a0; border-bottom: 1px solid #dfe4ea; padding: 6px 8px; }',
        '.nx-tbl td { border-bottom: 1px solid #eef1f4; padding: 8px; vertical-align: top; }',
        '.nx-r { text-align: right; }',
        '.nx-zero { color: #b3402f; font-weight: 600; }',
        '.nx-name { font-weight: 500; word-break: break-word; }',
        '.nx-from, .nx-when { color: #8a94a0; font-size: 12px; }',
        '.nx-tag { display: inline-block; background: #eef1f4; border-radius: 3px; padding: 1px 7px; font-size: 12px; }',
        '.nx-none { color: #b0b8c1; font-style: italic; }',
        '.nx-link { font-size: 12px; }',
        '.nx-clear, .nx-empty { margin-top: 20px; color: #6b7684; }'
    ].join('\n');

    // ------------------------------------------------------------------ create / update widget
    var w = new GlideRecord('sp_widget');
    w.addQuery('id', WIDGET_ID);
    w.query();
    var isNew = !w.next();
    if (isNew) { w.initialize(); w.setValue('id', WIDGET_ID); }
    w.setValue('name', 'NexAI Exceptions');
    w.setValue('description', 'Mails needing attention that appear on no other screen: nothing extracted, partial, unclaimed, stuck, dropped.');
    w.setValue('template', TEMPLATE);
    w.setValue('css', CSS);
    w.setValue('script', SERVER);
    w.setValue('client_script', CLIENT);
    w.setValue('public', false);
    w.setValue('roles', '');
    var wid = isNew ? w.insert() : (w.update(), w.getUniqueValue());
    p((isNew ? 'CREATED' : 'UPDATED') + ' widget  ' + WIDGET_ID + '  ' + wid);

    // ------------------------------------------------------------------ create / update page
    var pg = new GlideRecord('sp_page');
    pg.addQuery('id', PAGE_ID);
    pg.query();
    var pNew = !pg.next();
    if (pNew) { pg.initialize(); pg.setValue('id', PAGE_ID); }
    pg.setValue('title', 'Exceptions');
    pg.setValue('short_description', 'Mails that need a person to look at them');
    pg.setValue('public', false);
    var pid = pNew ? pg.insert() : (pg.update(), pg.getUniqueValue());
    p((pNew ? 'CREATED' : 'UPDATED') + ' page    ' + PAGE_ID + '  ' + pid);

    // ------------------------------------------------------------------ container / row / column / instance
    function findOrMake(table, query, fill) {
        var g = new GlideRecord(table);
        for (var k in query) { if (query.hasOwnProperty(k)) { g.addQuery(k, query[k]); } }
        g.query();
        if (g.next()) { return g.getUniqueValue(); }
        g.initialize();
        for (var k2 in query) { if (query.hasOwnProperty(k2)) { g.setValue(k2, query[k2]); } }
        if (fill) { fill(g); }
        return g.insert();
    }

    var cid = findOrMake('sp_container', { sp_page: pid, order: 100 }, function (g) {
        g.setValue('name', 'Exceptions');
        g.setValue('width', 'container-fluid');
    });
    var rid = findOrMake('sp_row', { sp_container: cid, order: 100 }, null);
    var colId = findOrMake('sp_column', { sp_row: rid, order: 100 }, function (g) {
        g.setValue('size', 12);
    });
    var instId = findOrMake('sp_instance', { sp_column: colId, sp_widget: wid }, function (g) {
        g.setValue('title', 'Exceptions');
        g.setValue('order', 100);
    });
    p('container ' + cid + '  row ' + rid + '  column ' + colId + '  instance ' + instId);

    // ------------------------------------------------------------------ where to find it
    p('');
    var portal = '';
    var sp = new GlideRecord('sp_portal');
    sp.addQuery('url_suffix', 'nexai');
    sp.query();
    if (sp.next()) { portal = sp.getValue('url_suffix'); }
    p('OPEN IT AT:');
    p('   https://' + gs.getProperty('instance_name') + '.service-now.com/' +
      (portal || 'nexai') + '?id=' + PAGE_ID);
    p('');
    p('=================================================================');
    gs.info('\n' + log.join('\n'));
})();
