/**
 * The calls succeed but return nothing usable. What model is answering, and what is it sending back?
 *
 * 123 calls, 1 failure, and six mails that extract fine on eval produced zero rows here. That rules out
 * the lost-chunk problem: the model is being reached and is replying. So the question is what it replies
 * WITH, and whether it is even the same model.
 *
 * The three columns that settle it are already recorded on every call: model, response_chars, and
 * prompt_chars. A reply of a few dozen characters to a 10,000 character prompt is a refusal or an empty
 * array, not an extraction.
 *
 * READ-ONLY. Nothing is written.
 *
 * NOTE on the previous script: its syslog section failed because a scoped application cannot read
 * syslog, and the catch block then touched e.message on the platform's own security exception, which is
 * itself fenced. This one never reads syslog and never touches a caught exception's members.
 *
 * Run: Background Scripts, Application "NexAI OTC Test", "Run in scoped application" ticked.
 */
(function () {
    var SCOPE = 'x_nose_nexai_test';
    var MINUTES = 120;

    function line() { gs.info('------------------------------------------------------------------'); }
    function safe(fn, label) {
        try { return fn(); } catch (e) { gs.warn('   (' + label + ' unavailable in this scope)'); return null; }
    }

    var scope = '';
    try { scope = '' + gs.getCurrentScopeName(); } catch (e) { scope = '?'; }
    if (scope !== SCOPE) { gs.error('ABORT. Must run in ' + SCOPE + '; got "' + scope + '".'); return; }
    gs.info('Scope OK: ' + scope);

    // ---------------------------------------------------------------- 1. which model
    line();
    gs.info('1. WHICH MODEL IS ANSWERING');
    var props = ['chinou.model.id', 'chinou.reg.id', 'x_nose_gmet_app.chinou.model.id',
                 SCOPE + '.chinou.model.id'];
    for (var p = 0; p < props.length; p++) {
        var v = gs.getProperty(props[p], null);
        gs.info('   ' + props[p] + ' = ' + (v === null || v === '' ? '(not set)' : v));
    }

    var since = new GlideDateTime();
    since.addSeconds(-60 * MINUTES);
    var sinceStr = '' + since;

    var models = {};
    var lu = new GlideRecord(SCOPE + '_llm_usage');
    lu.addQuery('sys_created_on', '>=', sinceStr);
    lu.query();
    var n = 0;
    while (lu.next()) {
        n++;
        var m = '' + (lu.getValue('model') || '(blank)');
        models[m] = (models[m] || 0) + 1;
    }
    gs.info('   models actually used across ' + n + ' calls in the last ' + MINUTES + ' min:');
    var k;
    for (k in models) { if (models.hasOwnProperty(k)) { gs.info('      ' + models[k] + ' x  ' + k); } }
    gs.info('   eval, for comparison, answers on anthropic-5-sonnet[Bedrock].');

    // ---------------------------------------------------------------- 2. what came back
    line();
    gs.info('2. WHAT THE MODEL SENT BACK, FOR THE MAILS THAT PRODUCED NOTHING');

    // the relevant mails with no rows and no wiz_extracted stamp
    var cf = {};
    var ag = new GlideAggregate(SCOPE + '_cashflow');
    ag.groupBy('email');
    ag.addAggregate('COUNT');
    ag.query();
    while (ag.next()) { cf['' + ag.getValue('email')] = parseInt(ag.getAggregate('COUNT'), 10); }

    var stuck = [];
    var eg = new GlideRecord(SCOPE + '_email');
    eg.addQuery('classification', 'relevant');
    eg.query();
    while (eg.next()) {
        var id = eg.getUniqueValue();
        if (('' + (eg.getValue('wiz_extracted') || '')) !== '') { continue; }
        stuck.push({ id: id, subj: '' + (eg.getValue('mail_subject') || eg.getValue('name') || ''),
                     res: '' + (eg.getValue('ai_result') || ''), rows: cf[id] || 0 });
    }
    gs.info('   mails with no rows: ' + stuck.length);

    // the six that WORK on eval - these are the interesting ones, the rest are known blocked
    var INTERESTING = ['Deutsche Bank', 'NGFP Payment', 'NFPS Payment', 'NIP Arrangement',
                       'Settlement Confirmation - 21'];
    for (var s = 0; s < stuck.length; s++) {
        var it = stuck[s];
        var want = false;
        for (var w = 0; w < INTERESTING.length; w++) {
            if (it.subj.indexOf(INTERESTING[w]) > -1) { want = true; }
        }
        if (!want) { continue; }
        gs.info('');
        gs.info('   >>> ' + it.subj.substring(0, 76));
        if (it.res) { gs.info('       ai_result on the record: ' + it.res.substring(0, 180)); }
        var q = new GlideRecord(SCOPE + '_llm_usage');
        q.addQuery('email_id', it.id);
        q.addQuery('sys_created_on', '>=', sinceStr);
        q.orderBy('sys_created_on');
        q.query();
        while (q.next()) {
            var pc = parseInt(q.getValue('prompt_chars'), 10) || 0;
            var rc = parseInt(q.getValue('response_chars'), 10) || 0;
            gs.info('       ' + ('' + q.getValue('sys_created_on')).substring(11) +
                '  ' + (q.getValue('field_name') || '-') +
                '  ok=' + q.getValue('success') +
                '  prompt=' + pc + 'ch  RESPONSE=' + rc + 'ch' +
                '  chinou=' + (q.getValue('chinou_ms') || 0) + 'ms' +
                '  model=' + ('' + q.getValue('model')).substring(0, 28));
            var er = '' + (q.getValue('error') || '');
            if (er) { gs.info('          error: ' + er.substring(0, 150)); }
        }
    }

    // ---------------------------------------------------------------- 3. the pattern
    line();
    gs.info('3. RESPONSE SIZE ACROSS EVERYTHING IN THE WINDOW');
    var buckets = { 'empty (0)': 0, 'tiny (1-40)': 0, 'small (41-200)': 0, 'real (200+)': 0 };
    var q2 = new GlideRecord(SCOPE + '_llm_usage');
    q2.addQuery('sys_created_on', '>=', sinceStr);
    q2.query();
    while (q2.next()) {
        var r2 = parseInt(q2.getValue('response_chars'), 10) || 0;
        if (r2 === 0) { buckets['empty (0)']++; }
        else if (r2 <= 40) { buckets['tiny (1-40)']++; }
        else if (r2 <= 200) { buckets['small (41-200)']++; }
        else { buckets['real (200+)']++; }
    }
    for (k in buckets) { if (buckets.hasOwnProperty(k)) { gs.info('   ' + k + ' : ' + buckets[k]); } }
    gs.info('');
    gs.info('   A large prompt answered with 0 or a handful of characters means the model replied');
    gs.info('   with nothing or an empty array - it was reached, it just did not extract. That is a');
    gs.info('   model or prompt problem, not a timeout and not a lost chunk.');
})();
