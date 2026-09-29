/**
 * PUT GROSS / NET ON THE REAL CASE SCREEN  -  run ONCE in Background Scripts.
 *
 * RUN WITH: Application = Global    (sp_widget refuses writes from a scoped app)
 *
 * The first install put the switch on its own page. This moves it where it belongs: onto the
 * OTC AI Extraction case screen, beside the cashflow navigator, and removes the standalone page.
 *
 * WHAT IT CHANGES on widget nexaitest-ai-extraction
 *   server    - after the cashflow navigator is built, the list is filtered to the rows the mail
 *               actually settles, and a set_granularity action is added
 *   template  - a Gross | Net segmented control above the navigator, shown only when the mail has
 *               something to net
 *   client    - c.setGranularity()
 *   css       - the control
 *
 * SAFETY
 *   Every edit is anchored on an exact string taken from the widget itself. If any anchor is not
 *   found the script changes NOTHING and prints which one failed - it will not patch blind.
 *   A copy of all four fields is written to the system log first, so the widget can be restored.
 *
 * Pure ASCII - a curly quote in a background script terminates the string on paste and the whole
 * thing fails to compile.
 *
 * Idempotent. ES5.
 */
(function () {

    var SCOPE = 'x_nose_nexai_test';
    var WIDGET = 'nexaitest-ai-extraction';
    var OLD_PAGE = 'nexai_grossnet';
    var OLD_WIDGET = 'nexai-grossnet';

    var CASHFLOW = SCOPE + '_cashflow';
    var log = [];
    function p(s) { log.push(s); }

    p('=================================================================');
    p('GROSS / NET ONTO THE CASE SCREEN   scope: ' + SCOPE);
    p('=================================================================');

    var here = gs.getCurrentScopeName();
    if (here !== 'global' && here !== 'rhino.global') {
        p('!! WRONG SCOPE - set the Application picker to Global and run again. Nothing changed.');
        gs.info('\n' + log.join('\n'));
        return;
    }

    var w = new GlideRecord('sp_widget');
    w.addQuery('id', WIDGET);
    w.setLimit(1);
    w.query();
    if (!w.next()) {
        p('!! widget ' + WIDGET + ' not found. Nothing changed.');
        gs.info('\n' + log.join('\n'));
        return;
    }

    var server = w.getValue('script') || '';
    var tpl = w.getValue('template') || '';
    var client = w.getValue('client_script') || '';
    var css = w.getValue('css') || '';

    p('widget : ' + w.getValue('name') + '  ' + w.getUniqueValue());
    p('sizes  : server ' + server.length + ' / template ' + tpl.length +
      ' / client ' + client.length + ' / css ' + css.length);

    if (server.indexOf('GROSS / NET') > -1) {
        p('');
        p('Already patched - nothing changed.');
        gs.info('\n' + log.join('\n'));
        return;
    }

    // ---------------------------------------------------------------- anchors
    var A_NAV = "    // Cashflow navigator (multi-trade mails).\n" +
                "    data.cfList = [];\n" +
                "    var lcf = new GlideRecord('" + CASHFLOW + "');\n" +
                "    lcf.addQuery('email', gr.getUniqueValue());\n" +
                "    lcf.orderBy('flow_index');\n" +
                "    lcf.query();\n" +
                "    while (lcf.next()) { data.cfList.push(lcf.getUniqueValue()); }";

    var A_WHICH = "    // Which record to show: ?cf -> parent email; ?eml -> email; else latest relevant.";

    var A_TPL = '<div class="cf-nav" ng-if="c.data.cfTotal > 1">';

    var missing = [];
    if (server.indexOf(A_NAV) === -1) { missing.push('server: the cashflow navigator block'); }
    if (server.indexOf(A_WHICH) === -1) { missing.push('server: the "Which record to show" comment'); }
    if (tpl.indexOf(A_TPL) === -1) { missing.push('template: the cf-nav container'); }
    if (client.indexOf('c.cfGo') === -1) { missing.push('client: c.cfGo (used to locate the controller)'); }

    if (missing.length) {
        p('');
        p('!! ANCHORS NOT FOUND - nothing was changed:');
        for (var mi = 0; mi < missing.length; mi++) { p('     - ' + missing[mi]); }
        p('   This widget differs from the one the patch was written against. Send me the widget');
        p('   source and the patch can be re-anchored.');
        gs.info('\n' + log.join('\n'));
        return;
    }
    p('anchors: all four found');

    // ---------------------------------------------------------------- backup
    gs.info('[grossnet-backup] widget=' + WIDGET + ' sys_id=' + w.getUniqueValue() +
            '\n---- SERVER ----\n' + server +
            '\n---- TEMPLATE ----\n' + tpl +
            '\n---- CLIENT ----\n' + client +
            '\n---- CSS ----\n' + css);
    p('backup : written to the system log, search [grossnet-backup]');

    // ---------------------------------------------------------------- server
    var NAV_PATCH = A_NAV + '\n' + [
        '',
        '    // GROSS / NET - show only the rows this mail actually settles. A mail set to Net shows',
        '    // its net; a mail set to Gross shows its components. Nothing is deleted either way, so',
        '    // the navigator count follows the choice rather than the raw row count.',
        '    data.gnGranularity = "gross";',
        '    data.gnNettable = false;',
        '    data.gnGroups = 0;',
        '    data.gnComponents = 0;',
        '    try {',
        '        var _eng = new ' + SCOPE + '.NettingEngine();',
        '        _eng.ensureNets(gr.getUniqueValue());   // a re-sync deletes the net; rebuild it on read',
        '        var _an = _eng.analyse(gr.getUniqueValue());',
        '        data.gnGranularity = _an.granularity;',
        '        data.gnGroups = _an.groups.length;',
        '        data.gnComponents = _an.components;',
        '        for (var _gi = 0; _gi < _an.groups.length; _gi++) {',
        '            if (_an.groups[_gi].nettable) { data.gnNettable = true; }',
        '        }',
        '        if (data.gnNettable) {',
        '            var _act = _eng.activeRows(gr.getUniqueValue()), _keep = {}, _f = [];',
        '            for (var _ai = 0; _ai < _act.length; _ai++) { _keep[_act[_ai]] = 1; }',
        '            for (var _ci = 0; _ci < data.cfList.length; _ci++) {',
        '                if (_keep[data.cfList[_ci]]) { _f.push(data.cfList[_ci]); }',
        '            }',
        '            if (_f.length) { data.cfList = _f; }   // never empty the navigator',
        '        }',
        '    } catch (e) { gs.warn("[gross/net] " + e); }'
    ].join('\n');

    var ACTION = [
        '    // GROSS / NET - the analyst chooses whether this mail settles as its components or as',
        '    // the net of each netting group. Switching clears the match on whichever side stops',
        '    // being settled, then lands the screen on a row that is actually settled.',
        '    if (input && input.action === "set_granularity" && input.gnMode) {',
        '        try {',
        '            var _emlGn = input.emlParam || "";',
        '            if (!_emlGn && input.cfParam) {',
        '                var _c0 = new GlideRecord("' + CASHFLOW + '");',
        '                if (_c0.get(input.cfParam)) { _emlGn = _c0.getValue("email"); }',
        '            }',
        '            if (_emlGn) {',
        '                var _e2 = new ' + SCOPE + '.NettingEngine();',
        '                _e2.setGranularity(_emlGn, input.gnMode);',
        '                var _rows = _e2.activeRows(_emlGn);',
        '                if (_rows.length) { input.cfParam = _rows[0]; }',
        '            }',
        '        } catch (e) { gs.warn("[gross/net] " + e); }',
        '    }',
        '',
        A_WHICH
    ].join('\n');

    server = server.replace(A_NAV, NAV_PATCH).replace(A_WHICH, ACTION);
    w.setValue('script', server);

    // ---------------------------------------------------------------- template
    var TPL_PATCH = [
        '<div class="gn-bar" ng-if="c.data.gnNettable">',
        '                  <span class="gn-bar-lbl">Settle at</span>',
        '                  <div class="gn-seg" ng-class="{net: c.data.gnGranularity === \'net\'}">',
        '                    <span class="gn-thumb"></span>',
        '                    <button type="button" ng-click="c.setGranularity(\'gross\')" ng-class="{on: c.data.gnGranularity !== \'net\'}">Gross</button>',
        '                    <button type="button" ng-click="c.setGranularity(\'net\')" ng-class="{on: c.data.gnGranularity === \'net\'}">Net</button>',
        '                  </div>',
        '                  <span class="gn-bar-note" ng-if="c.data.gnGranularity === \'net\'">settling the net of {{c.data.gnComponents}} components</span>',
        '                  <span class="gn-bar-note" ng-if="c.data.gnGranularity !== \'net\'">settling {{c.data.gnComponents}} components separately</span>',
        '                </div>',
        '                ' + A_TPL
    ].join('\n');

    tpl = tpl.replace(A_TPL, TPL_PATCH);
    w.setValue('template', tpl);

    // ---------------------------------------------------------------- client
    var CLIENT_PATCH = [
        '    // GROSS / NET',
        '    c.setGranularity = function (mode) {',
        '        if (c.data.gnGranularity === mode) { return; }',
        '        c.data.action = "set_granularity";',
        '        c.data.gnMode = mode;',
        '        c.server.update().then(function () { c.data.action = ""; });',
        '    };',
        '',
        '    c.cfGo'
    ].join('\n');
    client = client.replace('    c.cfGo', CLIENT_PATCH);
    w.setValue('client_script', client);

    // ---------------------------------------------------------------- css
    var CSS_PATCH = [
        '',
        '/* ---- Gross / Net switch ---- */',
        '.gn-bar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap;',
        '          padding: 9px 12px; margin-bottom: 10px; background: #fff;',
        '          border: 1px solid #E3E8EE; border-radius: 6px; }',
        '.gn-bar-lbl { font-size: 10.5px; text-transform: uppercase; letter-spacing: .09em;',
        '              color: #9AA4B0; font-weight: 600; }',
        '.gn-bar-note { font-size: 11.5px; color: #6B7684; }',
        '.gn-seg { position: relative; display: inline-flex; background: #EEF2F6;',
        '          border: 1px solid #E3E8EE; border-radius: 5px; padding: 3px; }',
        '.gn-seg button { position: relative; z-index: 2; appearance: none; background: none;',
        '                 border: 0; cursor: pointer; font-family: inherit; font-size: 12.5px;',
        '                 font-weight: 600; color: #6B7684; padding: 5px 20px; border-radius: 3px;',
        '                 transition: color .2s; }',
        '.gn-seg button.on { color: #14181F; }',
        '.gn-thumb { position: absolute; top: 3px; left: 3px; height: calc(100% - 6px);',
        '            width: calc(50% - 3px); background: #fff; border-radius: 3px;',
        '            box-shadow: 0 1px 3px rgba(20,24,31,.16);',
        '            transition: transform .28s cubic-bezier(.4,0,.2,1); }',
        '.gn-seg.net .gn-thumb { transform: translateX(100%); }'
    ].join('\n');
    w.setValue('css', css + CSS_PATCH);

    w.update();
    p('');
    p('PATCHED  server +' + (server.length) + ' chars, template, client and css updated');

    // ---------------------------------------------------------------- retire the standalone page
    p('');
    p('REMOVING THE STANDALONE PAGE');
    var removed = 0;

    var ow = new GlideRecord('sp_widget');
    ow.addQuery('id', OLD_WIDGET);
    ow.setLimit(1);
    ow.query();
    var owId = ow.next() ? ow.getUniqueValue() : '';

    var op = new GlideRecord('sp_page');
    op.addQuery('id', OLD_PAGE);
    op.setLimit(1);
    op.query();
    if (op.next()) {
        var pgId = op.getUniqueValue();
        var ct = new GlideRecord('sp_container');
        ct.addQuery('sp_page', pgId);
        ct.query();
        while (ct.next()) {
            var rw = new GlideRecord('sp_row');
            rw.addQuery('sp_container', ct.getUniqueValue());
            rw.query();
            while (rw.next()) {
                var cl = new GlideRecord('sp_column');
                cl.addQuery('sp_row', rw.getUniqueValue());
                cl.query();
                while (cl.next()) {
                    var inst = new GlideRecord('sp_instance');
                    inst.addQuery('sp_column', cl.getUniqueValue());
                    inst.query();
                    while (inst.next()) { inst.deleteRecord(); removed++; }
                    cl.deleteRecord();
                }
                rw.deleteRecord();
            }
            ct.deleteRecord();
        }
        op.deleteRecord();
        p('   page ' + OLD_PAGE + ' deleted (' + removed + ' widget instance(s) removed)');
    } else {
        p('   page ' + OLD_PAGE + ' not present');
    }

    if (owId) {
        var ow2 = new GlideRecord('sp_widget');
        if (ow2.get(owId)) { ow2.deleteRecord(); p('   widget ' + OLD_WIDGET + ' deleted'); }
    }

    p('');
    p('KEPT (this is the engine - do not remove):');
    p('   NettingEngine script include');
    p('   the four columns  netting_group / is_net / amount_origin / settle_granularity');
    p('   the Gross/Net match guard business rule');
    p('');
    p('TEST:');
    p('   open the board, click into a mail with several cashflows.');
    p('   A "Settle at  Gross | Net" control appears above the cashflow navigator, only when the');
    p('   mail has something to net. Press Net: the navigator collapses to one row per netting');
    p('   group and the screen lands on the net. Press Gross to go back.');
    p('');
    p('   If anything is wrong, the previous widget is in the system log under [grossnet-backup].');
    p('=================================================================');
    gs.info('\n' + log.join('\n'));
})();
