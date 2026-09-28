/**
 * DIAGNOSE THE AUDIT PAGE LAYOUT - read-only. Run once in Background Scripts, Application = Global.
 *
 * Clicking "-35 filtered" lands on ?id=nexaitest_nfotc_audit&bucket=dropped but shows the audit
 * widget's 300 events, not the Exceptions list. Either the Exceptions widget is not rendering, or
 * it is rendering below the audit widget and is off-screen.
 *
 * This prints the page's full layout in render order - every container, row, column and widget
 * instance with its order value - so the cause is visible rather than inferred. Nothing is changed.
 */
(function () {
    var PAGE = 'nexaitest_nfotc_audit';
    var out = [];
    function p(s) { out.push(s); }
    function pad(s, n) { s = '' + s; while (s.length < n) { s += ' '; } return s; }

    p('=================================================================');
    p('AUDIT PAGE LAYOUT   ' + PAGE);
    p('=================================================================');

    var pg = new GlideRecord('sp_page');
    pg.addQuery('id', PAGE);
    pg.setLimit(1);
    pg.query();
    if (!pg.next()) { p('!! page not found'); gs.info('\n' + out.join('\n')); return; }
    var pageId = pg.getUniqueValue();
    p('page sys_id : ' + pageId);
    p('');

    var nC = 0;
    var c = new GlideRecord('sp_container');
    c.addQuery('sp_page', pageId);
    c.orderBy('order');
    c.query();
    while (c.next()) {
        nC++;
        p('CONTAINER  order=' + pad(c.getValue('order'), 6) + ' name="' + (c.getValue('name') || '') + '"  ' + c.getUniqueValue());
        var r = new GlideRecord('sp_row');
        r.addQuery('sp_container', c.getUniqueValue());
        r.orderBy('order');
        r.query();
        while (r.next()) {
            p('   ROW      order=' + pad(r.getValue('order'), 6) + ' ' + r.getUniqueValue());
            var col = new GlideRecord('sp_column');
            col.addQuery('sp_row', r.getUniqueValue());
            col.orderBy('order');
            col.query();
            while (col.next()) {
                p('      COLUMN order=' + pad(col.getValue('order'), 6) + ' size=' + col.getValue('size'));
                var i = new GlideRecord('sp_instance');
                i.addQuery('sp_column', col.getUniqueValue());
                i.orderBy('order');
                i.query();
                var any = false;
                while (i.next()) {
                    any = true;
                    var wname = '(unknown)', wid = '';
                    var w = new GlideRecord('sp_widget');
                    if (w.get(i.getValue('sp_widget'))) {
                        wname = w.getValue('name');
                        wid = w.getValue('id');
                    }
                    p('         WIDGET order=' + pad(i.getValue('order'), 6) +
                      ' "' + wname + '"  (' + wid + ')');
                }
                if (!any) { p('         (no widget instances)'); }
            }
        }
        p('');
    }
    if (!nC) { p('!! this page has NO containers - it may use a different layout mechanism'); }

    // is the exceptions widget gated correctly?
    p('EXCEPTIONS WIDGET GATE');
    var ew = new GlideRecord('sp_widget');
    ew.addQuery('id', 'nexai-exceptions');
    ew.setLimit(1);
    ew.query();
    if (ew.next()) {
        var s = ew.getValue('script') || '';
        var t = ew.getValue('template') || '';
        p('   server has data.topLevel : ' + (s.indexOf('data.topLevel') > -1));
        p('   server has data.bucket   : ' + (s.indexOf('data.bucket') > -1));
        p('   template ng-if topLevel  : ' + (t.indexOf('ng-if="data.topLevel"') > -1));
        var m = s.match(/data\.topLevel\s*=\s*[^;]+;/);
        p('   gate line : ' + (m ? m[0] : '(not found)'));
    } else {
        p('   !! nexai-exceptions widget not found');
    }

    p('');
    p('=================================================================');
    gs.info('\n' + out.join('\n'));
})();
