/**
 * WHAT HAS AND HAS NOT BEEN EXTRACTED IN THIS SCOPE
 *
 * Scripts - Background.  "Execute in sandbox?" UNCHECKED.
 * APPLICATION = the environment to inspect (NexAI OTC Test, BSM, Dev, UAT).
 *
 * READ-ONLY. Writes nothing, extracts nothing.
 *
 * WHY
 * A mail with no cashflows and an EMPTY wiz_extracted was never ATTEMPTED - that is a very
 * different thing from a mail the extractor tried and failed on, and only the second one is a bug.
 * Before chasing a failure, find out which you have: if every mail in the scope is unextracted,
 * the scope was simply never synced and there is nothing wrong.
 *
 * One line per mail:
 *   rows        cashflows produced
 *   extracted   the work driver that extracted it, or (none) = never attempted
 *   claimed     the work driver that claimed it at routing
 */
(function () {

    var ENVIRONMENTS = {
        'x_nose_nfotc_bsm':  'NexAI OTC BSM',
        'x_nose_nexai_dev':  'NexAI OTC Dev',
        'x_nose_nexai_test': 'NexAI OTC Test',
        'x_nose_nexai_uat':  'NexAI OTC UAT'
    };

    var SCOPE = '' + gs.getCurrentScopeName();
    if (!ENVIRONMENTS[SCOPE]) {
        gs.error('[STATE] ABORT: Application is "' + SCOPE + '", not a NexAI OTC environment.');
        return;
    }

    var EMAIL = SCOPE + '_email';
    var CASHFLOW = SCOPE + '_cashflow';

    function pad(s, n) {
        s = '' + (s === null || s === undefined ? '' : s);
        while (s.length < n) { s += ' '; }
        return s.substring(0, n);
    }

    gs.info('[STATE] ================================================================');
    gs.info('[STATE] ' + ENVIRONMENTS[SCOPE] + '   (' + SCOPE + ')');
    gs.info('[STATE] ================================================================');
    gs.info('[STATE] ' + pad('ROWS', 6) + pad('EXTRACTED', 11) + pad('CLAIMED', 9) + pad('CLASS', 11) + 'MAIL');
    gs.info('[STATE] ' + pad('', 96).replace(/ /g, '-'));

    var total = 0, extracted = 0, neverRun = 0, ranButEmpty = 0, rowsAll = 0;

    var e = new GlideRecord(EMAIL);
    e.orderBy('name');
    e.query();
    while (e.next()) {
        total++;
        var id = e.getUniqueValue();

        var c = new GlideAggregate(CASHFLOW);
        c.addQuery('email', id);
        c.addAggregate('COUNT');
        c.query();
        var rows = c.next() ? parseInt(c.getAggregate('COUNT'), 10) : 0;
        rowsAll += rows;

        var wasRun = ('' + (e.getValue('wiz_extracted') || '')) !== '';
        var claimed = ('' + (e.getValue('wiz_assigned') || '')) !== '';

        if (rows > 0) { extracted++; }
        else if (!wasRun) { neverRun++; }
        else { ranButEmpty++; }

        gs.info('[STATE] ' + pad(rows, 6) + pad(wasRun ? 'yes' : '(none)', 11) +
                pad(claimed ? 'yes' : 'no', 9) +
                pad(e.getValue('classification') || '-', 11) +
                ('' + e.getValue('name')).substring(0, 52));
    }

    gs.info('[STATE] ' + pad('', 96).replace(/ /g, '-'));
    gs.info('[STATE] mails                     ' + total);
    gs.info('[STATE] produced cashflows        ' + extracted + '   (' + rowsAll + ' rows in total)');
    gs.info('[STATE] NEVER attempted           ' + neverRun);
    gs.info('[STATE] attempted but 0 rows      ' + ranButEmpty + '   <- only these are failures');
    gs.info('[STATE]');
    if (neverRun === total) {
        gs.warn('[STATE] NOTHING in this scope has been extracted. It was never synced - open the');
        gs.warn('[STATE] board for this environment and press Sync now. There is no bug to chase yet.');
    } else if (ranButEmpty) {
        gs.warn('[STATE] ' + ranButEmpty + ' mail(s) were attempted and produced nothing. Those are the real');
        gs.warn('[STATE] failures - run the big-mail diagnostic against them.');
    } else if (neverRun) {
        gs.info('[STATE] ' + neverRun + ' mail(s) were never attempted. Sync again to pick them up; they may');
        gs.info('[STATE] simply not have been claimed by this work driver (check the CLAIMED column).');
    } else {
        gs.info('[STATE] Every mail in this scope produced cashflows.');
    }
    gs.info('[STATE] ================================================================');
})();
