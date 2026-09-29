/**
 * WHY 64 HERE AND 62 ON EVAL  -  read-only. Run once, Application = Global.
 *
 * bsmdev x_nose_nexai_test and eval's /nexai app were migrated to match, yet the funnel reads 64
 * "Extracted into cashflows" here against 62 there - while the cashflow totals agree.
 *
 * Both can only be true if some mails carry wiz_extracted but produced NO cashflow: the funnel
 * counts them (it counts the STAMP, not the rows, despite the label), and they add nothing to the
 * trade total.
 *
 * This proves or disproves that, and names the mails. Nothing is changed.
 */
(function () {
    var SCOPE = 'x_nose_nexai_test';
    var EMAIL = SCOPE + '_email';
    var CASHFLOW = SCOPE + '_cashflow';
    var out = [];
    function p(s) { out.push(s); }
    function pad(s, n) { s = '' + s; while (s.length < n) { s += ' '; } return s; }

    p('=================================================================');
    p('WHY 64 vs 62   scope ' + SCOPE);
    p('=================================================================');

    // cashflows per mail, in one pass
    var per = {}, totalCf = 0;
    var c = new GlideRecord(CASHFLOW);
    c.query();
    while (c.next()) {
        totalCf++;
        var k = c.getValue('email') || '';
        per[k] = (per[k] || 0) + 1;
    }

    var mails = 0, relevant = 0, stamped = 0, composed = 0;
    var stampedZero = [], unstampedWith = [], netRows = 0;

    var g = new GlideRecord(EMAIL);
    g.orderBy('name');
    g.query();
    while (g.next()) {
        mails++;
        var id = g.getUniqueValue();
        var n = per[id] || 0;
        if ((g.getValue('classification') || '') === 'relevant') { relevant++; }
        if (g.getValue('composed_run')) { composed++; }
        if (g.getValue('wiz_extracted')) {
            stamped++;
            if (n === 0) { stampedZero.push(g.getValue('name') || '(no name)'); }
        } else if (n > 0) {
            unstampedWith.push((g.getValue('name') || '(no name)') + '  [' + n + ' cf]');
        }
    }

    // how many cashflow rows are computed nets rather than extracted ones
    var nr = new GlideRecord(CASHFLOW);
    nr.addQuery('is_net', 'true');
    nr.query();
    while (nr.next()) { netRows++; }

    p('');
    p('   ' + pad('mails', 34) + mails);
    p('   ' + pad('relevant', 34) + relevant);
    p('   ' + pad('composed_run set', 34) + composed);
    p('   ' + pad('wiz_extracted set', 34) + stamped + '   <-- the funnel "Extracted" figure');
    p('   ' + pad('cashflows (all)', 34) + totalCf);
    p('   ' + pad('  of which computed NETS', 34) + netRows);
    p('   ' + pad('  extracted cashflows', 34) + (totalCf - netRows));

    p('');
    p('THE ANSWER');
    p('   stamped extracted but ZERO cashflows : ' + stampedZero.length);
    if (stampedZero.length) {
        p('   These are counted by the funnel and contribute no trades. If this number is 2 more');
        p('   than eval has, that alone explains 64 vs 62 with identical cashflow totals.');
        for (var i = 0; i < stampedZero.length && i < 25; i++) {
            p('      ' + stampedZero[i].substring(0, 92));
        }
    } else {
        p('   None - so the stamp is not the explanation, and the two instances genuinely differ');
        p('   by two extracted mails. Compare the mail names between them next.');
    }

    p('');
    p('   has cashflows but NOT stamped        : ' + unstampedWith.length);
    for (var j = 0; j < unstampedWith.length && j < 15; j++) {
        p('      ' + unstampedWith[j].substring(0, 92));
    }

    p('');
    p('=================================================================');
    gs.info('\n' + out.join('\n'));
})();
