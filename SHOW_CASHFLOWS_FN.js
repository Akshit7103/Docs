/**
 * SHOW TaggingDashboard._cashflows  -  read-only. Run once, Application = Global.
 *
 * The board-count patch refused to apply: its first anchor (the _cashflows query block) does not
 * match this scope's copy, though the other two anchors did. This prints the function verbatim so
 * the patch can be re-anchored against what is actually there rather than guessed at.
 *
 * Nothing is changed.
 */
(function () {
    var SCOPE = 'x_nose_nexai_test';
    var out = [];
    function p(s) { out.push(s); }

    var sc = new GlideRecord('sys_scope');
    sc.addQuery('scope', SCOPE);
    sc.setLimit(1);
    sc.query();
    if (!sc.next()) { gs.info('app not found'); return; }

    var si = new GlideRecord('sys_script_include');
    si.addQuery('name', 'TaggingDashboard');
    si.addQuery('sys_scope', sc.getUniqueValue());
    si.setLimit(1);
    si.query();
    if (!si.next()) { gs.info('TaggingDashboard not found'); return; }

    var s = si.getValue('script') || '';
    p('=================================================================');
    p('TaggingDashboard  ' + si.getUniqueValue() + '   ' + s.length + ' chars');
    p('=================================================================');

    var i = s.indexOf('_cashflows: function');
    if (i < 0) {
        p('!! no "_cashflows: function" in this script.');
        p('   Occurrences of "_cashflows": ' + s.split('_cashflows').length);
        gs.info('\n' + out.join('\n'));
        return;
    }

    // print from the function header to a little past its return, with visible line numbers
    var chunk = s.substring(i, i + 2200);
    var lines = chunk.split('\n');
    p('');
    p('--- _cashflows, verbatim (first 60 lines) ---');
    for (var n = 0; n < lines.length && n < 60; n++) {
        p(('   ' + (n + 1)).slice(-4) + ' | ' + lines[n]);
    }

    p('');
    p('--- exact-match probes ---');
    var probes = [
        "_cashflows: function (emailId) {",
        "var cf = new GlideRecord('" + SCOPE + "_cashflow');",
        "cf.addQuery('email', emailId);",
        "cf.orderBy('flow_index');",
        "ai_resolution: cf.getValue('ai_resolution')",
        "        }\n        return out;\n    },"
    ];
    for (var q = 0; q < probes.length; q++) {
        p('   ' + (s.indexOf(probes[q]) > -1 ? 'FOUND   ' : 'MISSING ') +
          JSON.stringify(probes[q]).substring(0, 90));
    }

    gs.info('\n' + out.join('\n'));
})();
