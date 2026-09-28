/**
 * POINT "-35 filtered" AT THE EXCEPTIONS PAGE  -  run ONCE, Application = Global.
 *
 * Why: the link currently goes to ?id=nexaitest_nfotc_audit&bucket=dropped, but on that page the
 * audit widget sits in a container of order 1 and the Exceptions widget in a container of order 10,
 * so the audit trail's 300 events render FIRST and Exceptions is below the fold. Reordering does
 * not fix it either - the audit widget's root element is the whole application chrome (header,
 * logo, nav), so anything placed above it renders before the page header.
 *
 * Unifying the two properly means editing inside that working widget's template to separate its
 * chrome from its content. That is worth doing, but not blind and not at speed.
 *
 * So for now the link points at the standalone Exceptions page, which renders the list on its own
 * and already honours the bucket parameter. One line, no risk, and it does what was asked: click
 * "-35 filtered", see the 35 mails and why each was dropped.
 *
 * Idempotent. ES5.
 */
(function () {
    var SCOPE = 'x_nose_nexai_test';
    var TARGET = 'nexai_exceptions';          // standalone page - renders Exceptions alone
    var WRONG = 'nexaitest_nfotc_audit';      // audit page - chrome renders first
    var log = [];
    function p(s) { log.push(s); }

    p('=================================================================');
    p('REPOINT "filtered" LINK   running in: ' + gs.getCurrentScopeName());
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

    var OLD = 'ng-href="?id=' + WRONG + '&amp;bucket=dropped"';
    var NEW = 'ng-href="?id=' + TARGET + '&amp;bucket=dropped"';

    var found = 0, patched = 0;
    var w = new GlideRecord('sp_widget');
    w.addQuery('sys_scope', appId);
    w.query();
    while (w.next()) {
        var tpl = w.getValue('template') || '';
        if (tpl.indexOf('fn-delta') === -1) { continue; }
        found++;
        p('   widget "' + w.getValue('name') + '" (' + w.getValue('id') + ')');
        if (tpl.indexOf(NEW) > -1) {
            p('      already pointing at ' + TARGET);
            continue;
        }
        if (tpl.indexOf(OLD) === -1) {
            p('      !! expected link not found - not changed');
            continue;
        }
        tpl = tpl.replace(OLD, NEW);
        w.setValue('template', tpl);
        w.update();
        patched++;
        p('      REPOINTED -> ?id=' + TARGET + '&bucket=dropped');
    }
    p('');
    p('   funnels found: ' + found + '   repointed: ' + patched);

    // The Exceptions instance on the audit page is now a duplicate that only ever renders below
    // the fold. Remove the instance (the widget and the standalone page are untouched) so there
    // is exactly one place the list appears.
    p('');
    p('REMOVING THE BELOW-THE-FOLD DUPLICATE ON THE AUDIT PAGE');
    var removed = 0;
    var ew = new GlideRecord('sp_widget');
    ew.addQuery('id', 'nexai-exceptions');
    ew.setLimit(1);
    ew.query();
    if (ew.next()) {
        var wSysId = ew.getUniqueValue();
        var pg = new GlideRecord('sp_page');
        pg.addQuery('id', WRONG);
        pg.setLimit(1);
        pg.query();
        if (pg.next()) {
            var cont = new GlideRecord('sp_container');
            cont.addQuery('sp_page', pg.getUniqueValue());
            cont.query();
            while (cont.next()) {
                var r = new GlideRecord('sp_row');
                r.addQuery('sp_container', cont.getUniqueValue());
                r.query();
                while (r.next()) {
                    var col = new GlideRecord('sp_column');
                    col.addQuery('sp_row', r.getUniqueValue());
                    col.query();
                    while (col.next()) {
                        var inst = new GlideRecord('sp_instance');
                        inst.addQuery('sp_column', col.getUniqueValue());
                        inst.addQuery('sp_widget', wSysId);
                        inst.query();
                        while (inst.next()) {
                            inst.deleteRecord();
                            removed++;
                        }
                    }
                }
            }
        }
    }
    p('   exceptions instances removed from the audit page: ' + removed);
    p('   (the Mail Cashflows widget is left in place - it only renders at &eml= level)');

    p('');
    p('Test: open the board, click "-35 filtered".');
    p('   -> https://' + gs.getProperty('instance_name') + '.service-now.com/nexai?id=' +
      TARGET + '&bucket=dropped');
    p('   Dropped should be open, showing the 35 mails and the reason for each.');
    p('=================================================================');
    gs.info('\n' + log.join('\n'));
})();
