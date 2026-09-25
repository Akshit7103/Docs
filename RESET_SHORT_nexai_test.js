/**
 * Queue the five mails that came back SHORT of what eval produced, so the next Sync re-extracts them.
 *
 * These five are stamped as extracted, so syncWizard skips them - they can never improve on their own.
 * Clearing wiz_extracted is the whole fix; the mail is then picked up on the next press.
 *
 *     Bank of Nova Scotia            1 of 49   <- 87% of the entire remaining gap
 *     Natixis                        2 of 5
 *     SettlementNotice SN00002180389 1 of 3
 *     NIP Arrangement Fees           1 of 2
 *     TD vs NOIL_LDN                 3 of 4
 *
 * NOT included, deliberately: "GS Settlement 2026-05-11" and "Nomura - Swap Reset". Those look short in
 * the status report but are not. Each exists as TWO thread copies holding half the rows each, and the
 * eval figure they are compared against is the SUM across both copies - so 3 + 3 = 6 of 6, and
 * 1 + 1 = 2 of 2. Both are already correct and re-running them could only lose rows.
 *
 * The script decides for itself rather than trusting that list: it sums the rows across every copy of a
 * mail and only resets when the TOTAL is genuinely below the eval figure. If a Sync has already fixed
 * one since, it is left alone and says so.
 *
 * Re-extraction deletes a mail's rows and writes them again, so a mail can come back short a second
 * time - that is the defect reproducing, not a new problem, and another Sync restores it. Current row
 * counts and an amount checksum are printed first so there is a record either way.
 *
 * Run: Background Scripts, Application "NexAI OTC Test", "Run in scoped application" ticked.
 * Safe to run twice.
 */
(function () {
    var SCOPE = 'x_nose_nexai_test';

    // subject fragment -> cashflows the same mail produced on eval
    var TARGETS = [
        { frag: 'Nova Scotia',    exp: 49, label: 'Bank of Nova Scotia' },
        { frag: 'Natixis',        exp: 5,  label: 'Natixis IRD settlements' },
        { frag: 'SN00002180389',  exp: 3,  label: 'SettlementNotice SN00002180389' },
        { frag: 'NIP Arrangement', exp: 2, label: 'NIP Arrangement Fees' },
        { frag: 'TD vs NOIL',     exp: 4,  label: 'TD vs NOIL_LDN' }
    ];

    function line() { gs.info('------------------------------------------------------------------'); }

    var scope = '';
    try { scope = '' + gs.getCurrentScopeName(); } catch (e) { scope = '?'; }
    if (scope !== SCOPE) {
        gs.error('ABORT. Must run in ' + SCOPE + '; current scope is "' + scope + '".');
        gs.error('Set the Application picker to "NexAI OTC Test". Nothing was changed.');
        return;
    }
    gs.info('Scope OK: ' + scope);

    var cleared = 0, skipped = 0, notFound = 0;

    for (var t = 0; t < TARGETS.length; t++) {
        var spec = TARGETS[t];
        line();
        gs.info(spec.label + '   (eval produced ' + spec.exp + ')');

        // every relevant copy of this mail
        var copies = [];
        var eg = new GlideRecord(SCOPE + '_email');
        eg.addQuery('classification', 'relevant');
        eg.addQuery('mail_subject', 'CONTAINS', spec.frag);
        eg.query();
        while (eg.next()) {
            var id = eg.getUniqueValue();
            var cf = new GlideRecord(SCOPE + '_cashflow');
            cf.addQuery('email', id);
            cf.query();
            var cnt = 0, sum = 0;
            while (cf.next()) {
                cnt++;
                var a = parseFloat(cf.getValue('ai_amount'));
                if (!isNaN(a)) { sum += (a < 0 ? -a : a); }
            }
            copies.push({ id: id, subj: '' + eg.getValue('mail_subject'), rows: cnt,
                          sum: Math.round(sum * 100) / 100,
                          wx: '' + (eg.getValue('wiz_extracted') || ''),
                          st: '' + (eg.getValue('extraction_status') || '') });
        }

        if (!copies.length) {
            gs.error('   no relevant mail matching "' + spec.frag + '" - skipped.');
            notFound++;
            continue;
        }

        var totalRows = 0;
        for (var c = 0; c < copies.length; c++) {
            totalRows += copies[c].rows;
            gs.info('   copy ' + (c + 1) + ': ' + copies[c].rows + ' rows, checksum ' + copies[c].sum +
                (copies[c].st ? '  [' + copies[c].st + ']' : '') +
                (copies[c].wx ? '' : '  [already queued]'));
            gs.info('           ' + copies[c].subj.substring(0, 70));
        }
        if (copies.length > 1) {
            gs.info('   ' + copies.length + ' thread copies, ' + totalRows + ' rows between them');
        }

        // Only reset when the TOTAL across copies is genuinely below eval. This is what stops the
        // two split mails being re-run for no reason.
        if (totalRows >= spec.exp) {
            gs.info('   -> already at or above the eval figure (' + totalRows + ' of ' + spec.exp +
                '). Left alone.');
            skipped++;
            continue;
        }

        gs.info('   -> SHORT by ' + (spec.exp - totalRows) + '. Queueing for re-extraction.');
        for (var d = 0; d < copies.length; d++) {
            if (!copies[d].wx) { gs.info('      copy ' + (d + 1) + ' already queued.'); continue; }
            var u = new GlideRecord(SCOPE + '_email');
            if (!u.get(copies[d].id)) { continue; }
            u.setValue('wiz_extracted', '');
            u.update();
            var b = new GlideRecord(SCOPE + '_email');
            b.get(copies[d].id);
            if (('' + (b.getValue('wiz_extracted') || '')) === '') {
                gs.info('      copy ' + (d + 1) + ' cleared and verified.');
                cleared++;
            } else {
                gs.error('      copy ' + (d + 1) + ' STILL stamped - it will not be re-extracted.');
            }
        }
    }

    line();
    gs.info('SUMMARY');
    gs.info('   copies queued for re-extraction : ' + cleared);
    gs.info('   already correct, left alone     : ' + skipped);
    gs.info('   not found                       : ' + notFound);
    if (!cleared) {
        gs.info('   Nothing to do. Press Sync if anything was already queued.');
        return;
    }
    line();
    gs.info('NEXT STEP');
    gs.info('   Press "Sync now". The nine permanently failing mails are retried ahead of these on');
    gs.info('   every press, so give it time - and more than one press may be needed.');
    line();
    gs.info('WHAT GOOD LOOKS LIKE');
    gs.info('   Bank of Nova Scotia is the one that matters: 49 rows, not 1. It chunks into 7, so');
    gs.info('   1 row means the chunking produced almost nothing - a different failure from the');
    gs.info('   empty-answer problem just fixed, and it was NOT flagged partial, so the completeness');
    gs.info('   guard missed it too.');
    gs.info('   Run EXTRACTION_STATUS_nexai_test.js afterwards to see the totals again.');
})();
