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
 *     gross (or unset) - the components settle; net rows are hidden
 *     net              - the net settles; a component survives ONLY if its own netting group never
 *                        produced a net (a single-cashflow group has nothing to net)
 *
 * ANCHORING
 *   v1 of this patch refused to apply: it anchored on the query block assuming `var out = []` and
 *   `var cf = new GlideRecord(...)` were adjacent, but this scope's copy reads the counterparty off
 *   the email in between. Both edits actually land at the END of the function, so this version uses
 *   ONE anchor spanning the last pushed field through the return - and asserts it occurs exactly
 *   once, so it cannot land in some other function that happens to end the same way.
 *
 * COST
 *   Zero for any mail that was never switched: with no net row present the function returns exactly
 *   as before, without reading the email record.
 *
 * EXPECT THE NUMBER TO FALL, NOT RETURN TO 289
 *   A 3-component mail settled as Net now counts 1, not 3 - and not 4.
 *
 * Pure ASCII. Idempotent. ES5.
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

    var si = new GlideRecord('sys_script_include');
    si.addQuery('name', 'TaggingDashboard');
    si.addQuery('sys_scope', sc.getUniqueValue());
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

    // ---------------------------------------------------------------- the one anchor
    // Spans the last field of the pushed object through the close of _cashflows. Unique because
    // ai_resolution is read once in this shape.
    var ANCHOR = [
        "                ai_review_confirmed: cf.getValue('ai_review_confirmed'), ai_resolution: cf.getValue('ai_resolution')",
        "            });",
        "        }",
        "        return out;",
        "    },"
    ].join('\n');

    var first = src.indexOf(ANCHOR);
    if (first === -1) {
        p('');
        p('!! ANCHOR NOT FOUND - nothing changed.');
        p('   Expected the last pushed field through the return of _cashflows.');
        p('   Run SHOW_CASHFLOWS_FN.js and send the output.');
        gs.info('\n' + log.join('\n'));
        return;
    }
    if (src.indexOf(ANCHOR, first + 1) !== -1) {
        p('');
        p('!! ANCHOR IS NOT UNIQUE - nothing changed, rather than patching the wrong function.');
        gs.info('\n' + log.join('\n'));
        return;
    }
    p('anchor           : found, and unique');

    // ---------------------------------------------------------------- backup
    gs.info('[boardcount-backup] TaggingDashboard sys_id=' + si.getUniqueValue() +
            '\n---- SCRIPT ----\n' + src);
    p('backup           : system log, search [boardcount-backup]');

    // ---------------------------------------------------------------- replacement
    var PATCH = [
        "                ai_review_confirmed: cf.getValue('ai_review_confirmed'), ai_resolution: cf.getValue('ai_resolution'),",
        "                is_net: cf.getValue('is_net'), netting_group: cf.getValue('netting_group')",
        "            });",
        "        }",
        "",
        "        // ---- GROSS / NET ------------------------------------------------------------",
        "        // This function feeds the activity table, \"Total Trades Assigned\" (out.rows.length),",
        "        // the Pending / Matched / Mismatch / Allege tiles and the \"cf1 of N\" labels. Filtering",
        "        // here is what stops a mail settled as Net counting as its net AND its components.",
        "        //",
        "        // Costs nothing for a mail that was never switched: with no net row present it returns",
        "        // immediately, without reading the email record.",
        "        var _hasNet = false, _i;",
        "        for (_i = 0; _i < out.length; _i++) {",
        "            if (('' + (out[_i].is_net || '')) === 'true') { _hasNet = true; break; }",
        "        }",
        "        if (!_hasNet) { return out; }",
        "",
        "        var _mode = 'gross';",
        "        try {",
        "            var _emg = new GlideRecord('" + SCOPE + "_email');",
        "            if (_emg.get(emailId)) { _mode = '' + (_emg.getValue('settle_granularity') || 'gross'); }",
        "        } catch (_e) { _mode = 'gross'; }",
        "",
        "        var _keep = [];",
        "        if (_mode !== 'net') {",
        "            // gross: the components settle; the nets are stored but not settled",
        "            for (_i = 0; _i < out.length; _i++) {",
        "                if (('' + (out[_i].is_net || '')) !== 'true') { _keep.push(out[_i]); }",
        "            }",
        "            return _keep;",
        "        }",
        "",
        "        // net: the net settles. A component survives only when its own netting group never",
        "        // produced a net - a group with a single cashflow has nothing to net, so that row is",
        "        // still the thing being settled.",
        "        var _netted = {};",
        "        for (_i = 0; _i < out.length; _i++) {",
        "            if (('' + (out[_i].is_net || '')) === 'true') { _netted['' + (out[_i].netting_group || '')] = 1; }",
        "        }",
        "        for (_i = 0; _i < out.length; _i++) {",
        "            var _isNet = ('' + (out[_i].is_net || '')) === 'true';",
        "            if (_isNet || !_netted['' + (out[_i].netting_group || '')]) { _keep.push(out[_i]); }",
        "        }",
        "        return _keep;",
        "    },"
    ].join('\n');

    src = src.replace(ANCHOR, PATCH);
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
