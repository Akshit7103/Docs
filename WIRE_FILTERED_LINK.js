/**
 * MAKE "-35 filtered" CLICKABLE  -  run ONCE in Background Scripts.
 *
 * RUN WITH: Application = Global    (sp_widget refuses writes from a scoped app)
 *
 * Two changes:
 *
 *  1. Exceptions widget accepts a "bucket" URL parameter, so a link can open it straight onto one
 *     section instead of showing all five. Keys: nothing | partial | unclaimed | stuck | dropped.
 *
 *  2. The board's funnel delta - "-35 filtered" - becomes a link to
 *         ?id=nexaitest_nfotc_audit&bucket=dropped
 *     so an analyst can see exactly which mails were filtered out, and why.
 *
 * The board widget is resolved by searching for its own markup rather than by guessing an id.
 * Idempotent. ES5.
 */
(function () {
    var SCOPE = 'x_nose_nexai_test';
    var EXC_WIDGET = 'nexai-exceptions';
    var AUDIT_PAGE = 'nexaitest_nfotc_audit';
    var log = [];
    function p(s) { log.push(s); }

    p('=================================================================');
    p('WIRE "filtered" LINK   running in: ' + gs.getCurrentScopeName());
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

    // ================================================================ 1. bucket param
    p('');
    p('1. EXCEPTIONS WIDGET - accept a "bucket" parameter');
    var ew = new GlideRecord('sp_widget');
    ew.addQuery('id', EXC_WIDGET);
    ew.setLimit(1);
    ew.query();
    if (!ew.next()) {
        p('   !! widget ' + EXC_WIDGET + ' not found. Nothing changed.');
        gs.info('\n' + log.join('\n'));
        return;
    }

    var es = ew.getValue('script') || '';
    if (es.indexOf('data.bucket') === -1) {
        var anchor = '    data.topLevel = !$sp.getParameter("eml") && !$sp.getParameter("cf");';
        if (es.indexOf(anchor) > -1) {
            es = es.replace(anchor, anchor +
                '\n    // a link may ask for one bucket to be open on arrival' +
                '\n    data.bucket = $sp.getParameter("bucket") || "";');
            ew.setValue('script', es);
            p('   server : data.bucket added');
        } else {
            p('   !! topLevel anchor not found - server not changed');
        }
    } else {
        p('   server : already present');
    }

    var CLIENT = [
        'function ($scope, $window) {',
        '    var c = this;',
        '    // open on the bucket the caller asked for, if any - this is what makes',
        '    // "-35 filtered" on the board land directly on the dropped mails',
        '    c.open = (c.data && c.data.bucket) ? c.data.bucket : "";',
        '    c.toggle = function (key) { c.open = (c.open === key) ? "" : key; };',
        '    c.audit = function (sysId) {',
        '        if (!c.data || !c.data.auditPage) { return; }',
        '        $window.location.href = "?id=" + c.data.auditPage + "&eml=" + sysId;',
        '    };',
        '}'
    ].join('\n');
    ew.setValue('client_script', CLIENT);
    ew.setValue('sys_scope', appId);
    ew.setValue('sys_package', appId);
    ew.update();
    p('   client : opens on data.bucket when supplied');

    // ================================================================ 2. the board link
    p('');
    p('2. BOARD - make the funnel delta a link');

    var OLD = '<span class="fn-delta" ng-if="c.data.funnel.filtered > 0">&#8722;{{c.data.funnel.filtered}} filtered</span>';
    var NEW = '<a class="fn-delta" style="cursor:pointer;text-decoration:underline" ' +
              'ng-if="c.data.funnel.filtered > 0" ' +
              'ng-href="?id=' + AUDIT_PAGE + '&amp;bucket=dropped" ' +
              'title="Show the mails that were filtered out, and why">' +
              '&#8722;{{c.data.funnel.filtered}} filtered</a>';

    var found = 0, patched = 0;
    var bw = new GlideRecord('sp_widget');
    bw.addQuery('sys_scope', appId);
    bw.query();
    while (bw.next()) {
        var tpl = bw.getValue('template') || '';
        if (tpl.indexOf('fn-delta') === -1) { continue; }
        found++;
        p('   widget "' + bw.getValue('name') + '" (' + bw.getValue('id') + ')');
        if (tpl.indexOf('bucket=dropped') > -1) {
            p('      already linked, left as is');
            continue;
        }
        if (tpl.indexOf(OLD) === -1) {
            p('      !! the funnel-delta markup differs from the expected form:');
            p('      !! ' + OLD.substring(0, 90) + '...');
            p('      !! not changed - inspect by hand');
            continue;
        }
        tpl = tpl.replace(OLD, NEW);
        bw.setValue('template', tpl);
        bw.update();
        patched++;
        p('      LINKED -> ?id=' + AUDIT_PAGE + '&bucket=dropped');
    }
    if (!found) { p('   !! no widget in this application contains "fn-delta"'); }

    p('');
    p('   widgets with a funnel: ' + found + '   patched: ' + patched);
    p('');
    p('Test it:');
    p('   open the board, click "-35 filtered"');
    p('   it should land on the Exceptions list with Dropped already open');
    p('');
    p('The same parameter works for the other buckets:');
    p('   &bucket=nothing   &bucket=partial   &bucket=unclaimed   &bucket=stuck');
    p('=================================================================');
    gs.info('\n' + log.join('\n'));
})();
