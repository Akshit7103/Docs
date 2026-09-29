/**
 * FIX THE BOARD COUNTING NET ROWS  -  run ONCE in Background Scripts.
 *
 * RUN WITH: Application = Global    (sys_script_include refuses writes from a scoped app)
 *
 * DEFECT
 *   Switching a mail to Net writes a net cashflow row. The board had no notion of settlement
 *   granularity, so it counted the net AND its components - "Total Trades Assigned" climbed every
 *   time a mail was switched (289 -> 302), and the activity table showed the net as an extra line
 *   alongside the components it replaces.
 *
 * FIX
 *   TaggingDashboard._cashflows() is the single place the board reads a mail's cashflows. It feeds
 *   the activity table, "Total Trades Assigned" (= out.rows.length), the Pending / Matched /
 *   Mismatch / Allege tiles, and the "cf1 of N" labels. Filtering there fixes all of them at once,
 *   and nothing else has to learn about netting.
 *
 *   Rules applied, which are exactly NettingEngine's:
 *     gross (or unset) - the components settle; net rows are hidden
 *     net              - the net settles; a component survives ONLY if its own netting group never
 *                        produced a net (a single-cashflow group has nothing to net)
 *
 * COST
 *   Zero for any mail that was never switched: if no row carries is_net = true the function returns
 *   immediately, exactly as before, without reading the email record at all.
 *
 * EXPECT THE NUMBER TO FALL, NOT RETURN TO 289
 *   A 3-component mail settled as Net now counts 1, not 3 - and not 4. The tile reports what is
 *   being settled, which is the point of it.
 *
 * Pure ASCII - a curly quote breaks a background script on paste and node --check will not catch it.
 * Idempotent. ES5.
 */
(function () {
    var SCOPE = 'x_nose_nexai_test';
    var log = [];
    function p(s) { log.push(s); }

    p('=================================================================');
    p('FIX BOARD COUNTS (gross/net)   scope: ' + SCOPE);
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

    var si = new GlideRecord('sys_script_include');
    si.addQuery('name', 'TaggingDashboard');
    si.addQuery('sys_scope', appId);
    si.setLimit(1);
    si.query();
    if (!si.next()) {
        p('!! TaggingDashboard not found in ' + SCOPE + '. Nothing changed.');
        gs.info('\n' + log.join('\n'));
        return;
    }

    var src = si.getValue('script') || '';
    p('TaggingDashboard : ' + si.getUniqueValue() + '   ' + src.length + ' chars');

    if (src.indexOf('GROSS / NET') > -1) {
        p('');
        p('Already patched - nothing changed.');
        gs.info('\n' + log.join('\n'));
        return;
    }

    // ---------------------------------------------------------------- anchors
    var A_OPEN = "_cashflows: function (emailId) {\n" +
                 "        var out = [];\n" +
                 "        var cf = new GlideRecord('" + SCOPE + "_cashflow');\n" +
                 "        cf.addQuery('email', emailId);\n" +
                 "        cf.orderBy('flow_index');\n" +
                 "        cf.query();";

    var A_FIELD = "ai_review_confirmed: cf.getValue('ai_review_confirmed'), ai_resolution: cf.getValue('ai_resolution')";

    var A_RETURN = "        }\n        return out;\n    },";

    var miss = [];
    if (src.indexOf(A_OPEN) === -1) { miss.push('the _cashflows query block'); }
    if (src.indexOf(A_FIELD) === -1) { miss.push('the last field in the pushed object'); }
    if (src.indexOf(A_RETURN) === -1) { miss.push('the close/return of _cashflows'); }
    if (miss.length) {
        p('');
        p('!! ANCHORS NOT FOUND - nothing changed:');
        for (var mi = 0; mi < miss.length; mi++) { p('     - ' + miss[mi]); }
        p('   This Script Include differs from the copy the patch was written against.');
        gs.info('\n' + log.join('\n'));
        return;
    }
    p('anchors          : all three found');

    // ---------------------------------------------------------------- backup
    gs.info('[boardcount-backup] TaggingDashboard sys_id=' + si.getUniqueValue() +
            '\n---- SCRIPT ----\n' + src);
    p('backup           : system log, search [boardcount-backup]');

    // ---------------------------------------------------------------- patch 1: carry the two fields
    src = src.replace(A_FIELD, A_FIELD + ",\n                is_net: cf.getValue('is_net')," +
                               " netting_group: cf.getValue('netting_group')");

    // ---------------------------------------------------------------- patch 2: filter on the way out
    var FILTER = [
        '        }',
        '',
        '        // ---- GROSS / NET -------------------------------------------------------------',
        '        // This function feeds the activity table, "Total Trades Assigned" (out.rows.length),',
        '        // the Pending / Matched / Mismatch / Allege tiles and the "cf1 of N" labels. Filtering',
        '        // here is what stops a mail settled as Net being counted as its net AND its components.',
        '        //',
        '        // Costs nothing for a mail that was never switched: with no net row present it returns',
        '        // immediately, without even reading the email record.',
        '        var _hasNet = false, _i;',
        '        for (_i = 0; _i < out.length; _i++) {',
        '            if (("" + (out[_i].is_net || "")) === "true") { _hasNet = true; break; }',
        '        }',
        '        if (!_hasNet) { return out; }',
        '',
        '        var _mode = "gross";',
        '        var _em = new GlideRecord("' + SCOPE + '_email");',
        '        if (_em.get(emailId)) { _mode = "" + (_em.getValue("settle_granularity") || "gross"); }',
        '',
        '        var _keep = [];',
        '        if (_mode !== "net") {',
        '            // gross: the components settle; the nets are stored but not settled',
        '            for (_i = 0; _i < out.length; _i++) {',
        '                if (("" + (out[_i].is_net || "")) !== "true") { _keep.push(out[_i]); }',
        '            }',
        '            return _keep;',
        '        }',
        '',
        '        // net: the net settles. A component survives only when its own netting group never',
        '        // produced a net - a group with a single cashflow has nothing to net, so that row is',
        '        // still the thing being settled.',
        '        var _netted = {};',
        '        for (_i = 0; _i < out.length; _i++) {',
        '            if (("" + (out[_i].is_net || "")) === "true") { _netted["" + (out[_i].netting_group || "")] = 1; }',
        '        }',
        '        for (_i = 0; _i < out.length; _i++) {',
        '            var _isNet = ("" + (out[_i].is_net || "")) === "true";',
        '            if (_isNet || !_netted["" + (out[_i].netting_group || "")]) { _keep.push(out[_i]); }',
        '        }',
        '        return _keep;',
        '    },'
    ].join('\n');

    src = src.replace(A_RETURN, FILTER);

    si.setValue('script', src);
    si.update();

    p('');
    p('PATCHED  _cashflows now returns only the rows the mail actually settles');
    p('         script is now ' + src.length + ' chars');
    p('');
    p('WHAT CHANGES ON THE BOARD');
    p('   Total Trades Assigned   counts settled rows only - it will FALL below the pre-netting');
    p('                           figure for any mail switched to Net (3 components -> 1 net),');
    p('                           not climb. That is the tile doing its job.');
    p('   Activity table          a netted mail shows one row per netting group instead of the');
    p('                           net plus every component.');
    p('   Pending / Matched /     derived from the same rows, so all four follow automatically.');
    p('   Mismatch / Allege');
    p('');
    p('   Untouched: Total Mails Assigned and the Scanned / Identified / Extracted funnel are');
    p('   mail-level counts and were never affected by net rows.');
    p('');
    p('   To undo: search the system log for [boardcount-backup] and paste the script back.');
    p('=================================================================');
    gs.info('\n' + log.join('\n'));
})();
