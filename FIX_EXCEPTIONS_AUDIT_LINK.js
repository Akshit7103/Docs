/**
 * FIX THE AUDIT TRAIL LINK ON THE EXCEPTIONS VIEW - run ONCE in Background Scripts.
 *
 * RUN WITH: Application = Global    (sp_widget refuses CREATE/UPDATE from a scoped app)
 *
 * Defect: the Exceptions widget linked to the page id "bsm_nfotc_audit", which belongs to the
 * x_nose_nfotc_bsm application. Clicking it from the Test portal landed the user on the BSM work
 * drivers page. The page id was hardcoded from the wrong scope's extract.
 *
 * Fix: the widget now resolves the audit page belonging to ITS OWN application at runtime and
 * passes the id to the client, so the link can never point at another app's page - and if no audit
 * page exists in that scope, the link is hidden rather than sending the user somewhere wrong.
 *
 * This script first PRINTS every portal page owned by the app, so the resolution can be checked
 * against reality rather than assumed.
 */
(function () {
    var SCOPE = 'x_nose_nexai_test';
    var WIDGET_ID = 'nexai-exceptions';
    var log = [];
    function p(s) { log.push(s); }

    p('=================================================================');
    p('FIX EXCEPTIONS AUDIT LINK   running in: ' + gs.getCurrentScopeName());
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
    if (!sc.next()) {
        p('!! application ' + SCOPE + ' not found. Nothing changed.');
        gs.info('\n' + log.join('\n'));
        return;
    }
    var appId = sc.getUniqueValue();
    p('application : ' + sc.getValue('name') + '  ' + appId);

    // ---------------------------------------------------------------- what pages does it own
    p('');
    p('PORTAL PAGES OWNED BY THIS APPLICATION');
    var guess = '';
    var pg = new GlideRecord('sp_page');
    pg.addQuery('sys_scope', appId);
    pg.orderBy('id');
    pg.query();
    var n = 0;
    while (pg.next()) {
        n++;
        var id = pg.getValue('id');
        var title = pg.getValue('title') || '';
        var isAudit = (id.toLowerCase().indexOf('audit') > -1 ||
                       title.toLowerCase().indexOf('audit') > -1);
        p('   ' + (isAudit ? '-> ' : '   ') + id + '   "' + title + '"');
        if (isAudit && !guess) { guess = id; }
    }
    if (!n) { p('   (none owned by this application)'); }
    p('');
    p('audit page resolved to : ' + (guess || '(NONE FOUND - the link will be hidden)'));

    // ---------------------------------------------------------------- patch the widget
    var w = new GlideRecord('sp_widget');
    w.addQuery('id', WIDGET_ID);
    w.setLimit(1);
    w.query();
    if (!w.next()) {
        p('');
        p('!! widget ' + WIDGET_ID + ' not found. Nothing changed.');
        gs.info('\n' + log.join('\n'));
        return;
    }

    // --- server: resolve the audit page from the widget's OWN scope, every load
    var server = w.getValue('script') || '';
    var RESOLVER = [
        '',
        '    // The audit page belongs to this application. Resolving it here rather than hardcoding',
        '    // an id stops the link pointing at another scope\'s page - which is exactly what the',
        '    // first version did, landing the user on the BSM work drivers page.',
        '    data.auditPage = "";',
        '    var _ap = new GlideRecord("sp_page");',
        '    _ap.addQuery("sys_scope", "' + appId + '");',
        '    _ap.addEncodedQuery("idLIKEaudit^ORtitleLIKEAudit");',
        '    _ap.setLimit(1);',
        '    _ap.query();',
        '    if (_ap.next()) { data.auditPage = _ap.getValue("id"); }',
        ''
    ].join('\n');

    if (server.indexOf('data.auditPage') === -1) {
        // insert right after the opening of the IIFE's variable block
        var anchor = '    data.buckets = [];';
        if (server.indexOf(anchor) > -1) {
            server = server.replace(anchor, RESOLVER + anchor);
        } else {
            server = server.replace('(function () {', '(function () {' + RESOLVER);
        }
        w.setValue('script', server);
        p('');
        p('server script : audit-page resolver added');
    } else {
        p('');
        p('server script : resolver already present, left as is');
    }

    // --- client: use the resolved id, and do nothing if there is none
    var CLIENT = [
        'function ($scope, $window) {',
        '    var c = this;',
        '    c.open = "";',
        '    c.toggle = function (key) { c.open = (c.open === key) ? "" : key; };',
        '    c.audit = function (sysId) {',
        '        // never navigate to a page id from another application',
        '        if (!c.data || !c.data.auditPage) { return; }',
        '        $window.location.href = "?id=" + c.data.auditPage + "&eml=" + sysId;',
        '    };',
        '}'
    ].join('\n');
    w.setValue('client_script', CLIENT);

    // --- template: hide the link entirely when there is no audit page to point at
    var tpl = w.getValue('template') || '';
    var oldCell = '<td><a class="nx-link" href="javascript:void(0)" ng-click="c.audit(m.sys_id)">Audit trail</a></td>';
    var newCell = '<td><a class="nx-link" ng-if="data.auditPage" href="javascript:void(0)" ng-click="c.audit(m.sys_id)">Audit trail</a></td>';
    if (tpl.indexOf(oldCell) > -1) {
        tpl = tpl.replace(oldCell, newCell);
        w.setValue('template', tpl);
        p('template      : link now hidden when no audit page exists');
    } else if (tpl.indexOf('ng-if="data.auditPage"') > -1) {
        p('template      : already guarded, left as is');
    } else {
        p('template      : !! link cell not matched - check the template by hand');
    }

    w.setValue('sys_scope', appId);
    w.setValue('sys_package', appId);
    w.update();

    p('');
    p('widget updated : ' + w.getUniqueValue());
    p('');
    p('Reload the page (hard refresh) and click an Audit trail link:');
    p('   https://' + gs.getProperty('instance_name') + '.service-now.com/nexai?id=nexai_exceptions');
    p('=================================================================');
    gs.info('\n' + log.join('\n'));
})();
