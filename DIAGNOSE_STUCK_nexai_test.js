/**
 * Why is Sync not finishing? Which mails are still pending, and what happened on the last attempt.
 *
 * A mail that fails extraction never gets wiz_extracted stamped, so it is retried on EVERY Sync - which
 * is why the pending count barely moves while the Sync still takes minutes. This lists exactly which
 * mails those are, then pulls the evidence for each from llm_usage and the system log so the cause can
 * be named rather than guessed at.
 *
 * The three things worth separating, because they look identical from the board:
 *   - the mail is genuinely unreadable (figures in an image, a password-protected workbook);
 *   - the model was called and the call FAILED (a lost chunk, a gateway error);
 *   - the model was never called at all, because the Sync ran out of transaction time first. With 10
 *     permanently failing mails retried ahead of the good ones on every press, this is very easy to hit.
 *
 * READ-ONLY. Nothing is written.
 *
 * Run: Background Scripts, Application "NexAI OTC Test", "Run in scoped application" ticked.
 */
(function () {
    var SCOPE = 'x_nose_nexai_test';
    var MINUTES = 90;          // how far back to read the evidence

    function line() { gs.info('------------------------------------------------------------------'); }

    var scope = '';
    try { scope = '' + gs.getCurrentScopeName(); } catch (e) { scope = '?'; }
    if (scope !== SCOPE) {
        gs.error('ABORT. Must run in ' + SCOPE + '; current scope is "' + scope + '".');
        return;
    }
    gs.info('Scope OK: ' + scope);

    var since = new GlideDateTime();
    since.addSeconds(-60 * MINUTES);
    var sinceStr = '' + since;
    gs.info('reading evidence since ' + sinceStr + '  (last ' + MINUTES + ' minutes)');

    // ---------------------------------------------------------------- 1. what is still pending
    line();
    gs.info('1. RELEVANT MAILS NOT YET EXTRACTED');
    var cf = {};
    var ag = new GlideAggregate(SCOPE + '_cashflow');
    ag.groupBy('email');
    ag.addAggregate('COUNT');
    ag.query();
    while (ag.next()) { cf['' + ag.getValue('email')] = parseInt(ag.getAggregate('COUNT'), 10); }

    var pending = [], done = 0;
    var eg = new GlideRecord(SCOPE + '_email');
    eg.addQuery('classification', 'relevant');
    eg.orderBy('mail_subject');
    eg.query();
    while (eg.next()) {
        var id = eg.getUniqueValue();
        var wx = '' + (eg.getValue('wiz_extracted') || '');
        if (wx) { done++; continue; }
        pending.push({ id: id, subj: '' + (eg.getValue('mail_subject') || eg.getValue('name') || ''),
                       rows: cf[id] || 0, st: '' + (eg.getValue('extraction_status') || '') });
    }
    gs.info('   already extracted (wiz_extracted set) : ' + done);
    gs.info('   STILL PENDING                         : ' + pending.length);
    for (var i = 0; i < pending.length; i++) {
        gs.info('     ' + (i + 1) + '. rows=' + pending[i].rows +
            (pending[i].st ? ' [' + pending[i].st + ']' : '') + '  ' + pending[i].subj.substring(0, 72));
    }

    // ---------------------------------------------------------------- 2. what the model did
    line();
    gs.info('2. LLM CALLS IN THE LAST ' + MINUTES + ' MINUTES');
    var byMail = {}, total = 0, failed = 0;
    var errs = {};
    try {
        var lu = new GlideRecord(SCOPE + '_llm_usage');
        lu.addQuery('sys_created_on', '>=', sinceStr);
        lu.orderBy('sys_created_on');
        lu.query();
        while (lu.next()) {
            total++;
            var em = '' + (lu.getValue('email_id') || '');
            var okv = ('' + lu.getValue('success')) === 'true';
            if (!byMail[em]) { byMail[em] = { n: 0, bad: 0, ms: 0 }; }
            byMail[em].n++;
            var rt = parseInt(lu.getValue('roundtrip_ms'), 10);
            if (!isNaN(rt)) { byMail[em].ms += rt; }
            if (!okv) {
                failed++;
                byMail[em].bad++;
                var e = ('' + (lu.getValue('error') || '')).substring(0, 90);
                errs[e] = (errs[e] || 0) + 1;
            }
        }
    } catch (e1) {
        gs.error('   could not read ' + SCOPE + '_llm_usage: ' + (e1.message || e1));
    }
    gs.info('   calls: ' + total + '   failed: ' + failed);
    if (total === 0) {
        gs.error('   NO CALLS AT ALL in this window. The Sync is not reaching the model.');
        gs.error('   That points at the Sync dying before it gets there, or at nothing being claimed.');
    }
    var k;
    if (failed) {
        gs.info('   distinct errors:');
        for (k in errs) { if (errs.hasOwnProperty(k)) { gs.info('     x' + errs[k] + '  ' + k); } }
    }

    gs.info('   per PENDING mail, what the model was asked in this window:');
    for (var p = 0; p < pending.length; p++) {
        var b = byMail[pending[p].id];
        if (!b) {
            gs.warn('     NO CALLS   ' + pending[p].subj.substring(0, 62));
        } else {
            gs.info('     ' + b.n + ' call(s), ' + b.bad + ' failed, ' + Math.round(b.ms / 1000) +
                's total   ' + pending[p].subj.substring(0, 52));
        }
    }

    // ---------------------------------------------------------------- 3. the log
    line();
    gs.info('3. SYSTEM LOG - extractor and transaction messages');
    var shown = 0, cancelled = 0;
    try {
        var sl = new GlideRecord('syslog');
        sl.addQuery('sys_created_on', '>=', sinceStr);
        var qc = sl.addQuery('message', 'CONTAINS', 'WizardExtractor');
        qc.addOrCondition('message', 'CONTAINS', 'GenericFieldExtractor');
        qc.addOrCondition('message', 'CONTAINS', 'ChinouClient');
        qc.addOrCondition('message', 'CONTAINS', 'cancelled');
        qc.addOrCondition('message', 'CONTAINS', 'maximum execution');
        qc.addOrCondition('message', 'CONTAINS', 'Transaction');
        sl.orderByDesc('sys_created_on');
        sl.setLimit(60);
        sl.query();
        while (sl.next()) {
            var msg = '' + sl.getValue('message');
            if (msg.indexOf('cancelled') > -1 || msg.indexOf('maximum execution') > -1) { cancelled++; }
            gs.info('   ' + ('' + sl.getValue('sys_created_on')).substring(11) + ' [' +
                sl.getValue('level') + '] ' + msg.substring(0, 150).replace(/\n/g, ' '));
            shown++;
        }
    } catch (e2) {
        gs.error('   could not read syslog: ' + (e2.message || e2));
    }
    if (!shown) { gs.warn('   nothing in syslog for this window'); }

    // ---------------------------------------------------------------- verdict
    line();
    gs.info('READING THIS');
    gs.info('  A pending mail with NO CALLS means the Sync never got to it - it ran out of');
    gs.info('  transaction time on the mails ahead of it. Press Sync again; each press gets a');
    gs.info('  little further, because anything that succeeded is skipped next time.');
    gs.info('  A pending mail WITH failed calls is a real extraction failure - the error text');
    gs.info('  above names it.');
    gs.info('  A pending mail with calls and NO failures returned an empty answer: the model read');
    gs.info('  it and found nothing, which is the image-only and password-protected set.');
    if (cancelled) {
        gs.warn('  ' + cancelled + ' transaction cancellation message(s) found - the Sync IS being cut short.');
    }
    gs.info('');
    gs.info('  Expected end state, from the same corpus on eval: 62 extracted, about 289');
    gs.info('  cashflows, and 10 mails that never extract.');
})();
