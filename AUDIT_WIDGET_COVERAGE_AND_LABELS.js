/**
 * AUDIT COVERAGE REPORT + LABEL FIX  -  run ONCE in Background Scripts.
 *
 * RUN WITH: Application = Global    (sp_widget refuses writes from a scoped app)
 *
 * Two jobs:
 *
 *  PART 1 (read-only) - which audit events carry email_id and which carry cashflow_id.
 *      This decides what the drill-down can show. An event with no cashflow_id can only ever
 *      appear at MAIL level; one with no email_id cannot appear at mail level at all. Before
 *      building a three-level drill I want this measured rather than assumed.
 *
 *  PART 2 (write) - add the two labels the audit widget is missing.
 *      match.computed (the automatic match result) and workflow.routed (write-back staged) are
 *      written to the table but have no entry in the widget's event-type label map, so they
 *      render raw. This adds them. Idempotent - re-running changes nothing.
 */
(function () {
    var SCOPE = 'x_nose_nexai_test';
    var AUDIT_PAGE = 'nexaitest_nfotc_audit';
    var log = [];
    function p(s) { log.push(s); }
    function pad(s, n) { s = '' + s; while (s.length < n) { s += ' '; } return s; }

    p('=================================================================');
    p('AUDIT COVERAGE + LABELS   running in: ' + gs.getCurrentScopeName());
    p('=================================================================');

    var here = gs.getCurrentScopeName();
    if (here !== 'global' && here !== 'rhino.global') {
        p('!! WRONG SCOPE - set the Application picker to Global and run again. Nothing changed.');
        gs.info('\n' + log.join('\n'));
        return;
    }

    // ---------------------------------------------------------------- PART 1: coverage
    p('');
    p('PART 1  EVENT COVERAGE  (what each event type can be filtered by)');
    p('');
    p('   ' + pad('EVENT TYPE', 26) + pad('ROWS', 7) + pad('has email_id', 15) +
      pad('has cashflow_id', 17) + 'shows at');

    var stats = {};
    var a = new GlideRecord(SCOPE + '_audit');
    a.orderBy('event_type');
    a.query();
    while (a.next()) {
        var ev = a.getValue('event_type') || '(none)';
        if (!stats[ev]) { stats[ev] = { n: 0, em: 0, cf: 0 }; }
        stats[ev].n++;
        if (a.getValue('email_id')) { stats[ev].em++; }
        if (a.getValue('cashflow_id')) { stats[ev].cf++; }
    }
    var keys = [];
    for (var k in stats) { if (stats.hasOwnProperty(k)) { keys.push(k); } }
    keys.sort();
    var total = 0;
    for (var i = 0; i < keys.length; i++) {
        var s = stats[keys[i]];
        total += s.n;
        var where = [];
        if (s.em) { where.push('mail'); }
        if (s.cf) { where.push('cashflow'); }
        if (!where.length) { where.push('NEITHER - invisible in both views'); }
        p('   ' + pad(keys[i], 26) + pad(s.n, 7) +
          pad(s.em + '/' + s.n, 15) + pad(s.cf + '/' + s.n, 17) + where.join(' + '));
    }
    p('');
    p('   TOTAL EVENTS: ' + total + '   distinct types: ' + keys.length);

    // ---------------------------------------------------------------- find the audit widget
    p('');
    p('PART 2  LABEL FIX');
    var pageId = '';
    var pg = new GlideRecord('sp_page');
    pg.addQuery('id', AUDIT_PAGE);
    pg.setLimit(1);
    pg.query();
    if (pg.next()) { pageId = pg.getUniqueValue(); }
    if (!pageId) {
        p('   !! page ' + AUDIT_PAGE + ' not found. Nothing changed.');
        gs.info('\n' + log.join('\n'));
        return;
    }

    // page -> container -> row -> column -> instance -> widget
    var widgetIds = {};
    var cont = new GlideRecord('sp_container');
    cont.addQuery('sp_page', pageId);
    cont.query();
    while (cont.next()) {
        var rw = new GlideRecord('sp_row');
        rw.addQuery('sp_container', cont.getUniqueValue());
        rw.query();
        while (rw.next()) {
            var cl = new GlideRecord('sp_column');
            cl.addQuery('sp_row', rw.getUniqueValue());
            cl.query();
            while (cl.next()) {
                var inst = new GlideRecord('sp_instance');
                inst.addQuery('sp_column', cl.getUniqueValue());
                inst.query();
                while (inst.next()) { widgetIds[inst.getValue('sp_widget')] = true; }
            }
        }
    }

    var patched = 0, looked = 0;
    for (var wsid in widgetIds) {
        if (!widgetIds.hasOwnProperty(wsid)) { continue; }
        var w = new GlideRecord('sp_widget');
        if (!w.get(wsid)) { continue; }
        looked++;
        var didThis = false;
        var FIELDS = ['script', 'client_script', 'template'];
        for (var f = 0; f < FIELDS.length; f++) {
            var src = w.getValue(FIELDS[f]) || '';
            if (src.indexOf("'classification.decided':") === -1) { continue; }
            p('   widget "' + w.getValue('name') + '" (' + w.getValue('id') + ') - label map in ' + FIELDS[f]);
            if (src.indexOf("'match.computed'") > -1 && src.indexOf("'workflow.routed'") > -1) {
                p('      both labels already present, left as is');
                continue;
            }
            var add = '';
            if (src.indexOf("'match.computed'") === -1) {
                add += "\n        'match.computed': 'Match Computed (automatic)',";
            }
            if (src.indexOf("'workflow.routed'") === -1) {
                add += "\n        'workflow.routed': 'Write-back Staged',";
            }
            src = src.replace("'classification.decided': 'Relevance Decision',",
                              "'classification.decided': 'Relevance Decision'," + add);
            w.setValue(FIELDS[f], src);
            didThis = true;
            p('      ADDED:' + add.replace(/\n\s+/g, ' '));
        }
        if (didThis) { w.update(); patched++; }
    }
    p('   widgets on the page: ' + looked + '   patched: ' + patched);
    if (!looked) { p('   !! no widgets resolved from the page layout - check by hand'); }

    p('');
    p('=================================================================');
    gs.info('\n' + log.join('\n'));
})();
