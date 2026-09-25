/**
 * Did the four Script Includes actually land in THIS scope, and if they did, why is extraction still
 * empty?
 *
 * The check exists because of a real mistake: the XlsxCashflowExtractor and DemoExtractor files handed
 * over first were the x_nose_nfotc_bsm originals, not rewritten for this scope. Each carries four
 * x_nose_nfotc_bsm references - a class call and a table name. Pasted here they resolve to another
 * application, the call throws, the surrounding try/catch swallows it, and extraction produces exactly
 * the same empty result as before with nothing in the log to say why. A leftover scope reference is
 * therefore the FIRST thing to rule out, not the last.
 *
 * Section 2 then shows what the model was actually sent. The tell for this whole class of failure is a
 * single very large prompt answered with about 2 characters: 2 characters is "[]", and one big prompt
 * instead of several means no grid was built, so RowSegmenter found no rows and chunking never started.
 *
 * READ-ONLY. Nothing is written.
 *
 * Run: Background Scripts, Application "NexAI OTC Test", "Run in scoped application" ticked.
 */
(function () {
    var SCOPE = 'x_nose_nexai_test';
    var OLD = 'x_nose_nfotc_bsm';
    var MINUTES = 60;

    function line() { gs.info('------------------------------------------------------------------'); }
    var pass = 0, fail = 0;
    function P(l, d) { pass++; gs.info('   PASS  ' + l + (d ? '   ' + d : '')); }
    function F(l, d) { fail++; gs.error('   FAIL  ' + l + (d ? '   ' + d : '')); }

    var scope = '';
    try { scope = '' + gs.getCurrentScopeName(); } catch (e) { scope = '?'; }
    if (scope !== SCOPE) { gs.error('ABORT. Must run in ' + SCOPE + '; got "' + scope + '".'); return; }
    gs.info('Scope OK: ' + scope);

    // ---------------------------------------------------------------- 1. did the code land
    var WANT = [
        { n: 'WizardExtractor', min: 50000, marks: ["=== 'partial'", '_persistClassification',
            '_normaliseCounterparty', '_signFromDirection'] },
        { n: 'GenericFieldExtractor', min: 21000, marks: ['_collectChunks', 'lost.length < items.length'] },
        { n: 'XlsxCashflowExtractor', min: 35000, marks: ['_scanWorkbook', 'sawNegative', 'rows_seen',
            'sheets_raw', 'max_rows'] },
        { n: 'DemoExtractor', min: 6400, marks: ['xr.rows_sent', 'xr.rows_seen', 'xr.truncated',
            'attachmentText = xr.sheet_text'] }
    ];
    line();
    gs.info('1. DID THE FOUR SCRIPT INCLUDES LAND IN THIS SCOPE');
    for (var w = 0; w < WANT.length; w++) {
        var spec = WANT[w];
        gs.info('   --- ' + spec.n + ' ---');
        var src = null;
        try {
            var q = new GlideRecord('sys_script_include');
            q.addQuery('name', spec.n);
            q.query();
            while (q.next()) {
                if (('' + q.sys_scope.scope) === SCOPE) { src = '' + q.getValue('script'); }
            }
        } catch (eq) { gs.error('   could not read sys_script_include'); }
        if (src === null) { F(spec.n + ' not present in ' + SCOPE); continue; }

        gs.info('       length: ' + src.length + ' chars   (expected at least ' + spec.min + ')');
        if (src.length >= spec.min) { P('size looks like the new version'); }
        else { F('TOO SHORT - the old version is still here', src.length + ' < ' + spec.min); }

        var missing = [];
        for (var m = 0; m < spec.marks.length; m++) {
            if (src.indexOf(spec.marks[m]) === -1) { missing.push(spec.marks[m]); }
        }
        if (!missing.length) { P('all ' + spec.marks.length + ' markers present'); }
        else { F('missing marker(s)', missing.join(', ')); }

        // THE ONE THAT BIT US: a leftover reference to the other application.
        var leftovers = 0, at = src.indexOf(OLD);
        while (at > -1) { leftovers++; at = src.indexOf(OLD, at + 1); }
        if (leftovers === 0) { P('no leftover ' + OLD + ' reference'); }
        else {
            F(leftovers + ' leftover ' + OLD + ' reference(s)',
              'this file calls the WRONG application - re-paste the NEXAI_TEST_ version');
        }
        if (src.indexOf(SCOPE) > -1) { P('references this scope'); }
        else { F('does not reference ' + SCOPE + ' at all'); }
    }

    // ---------------------------------------------------------------- 2. what the model got
    line();
    gs.info('2. WHAT THE MODEL WAS SENT, FOR MAILS STILL PRODUCING NOTHING');
    var since = new GlideDateTime();
    since.addSeconds(-60 * MINUTES);
    var sinceStr = '' + since;

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
    var extracted = 0;
    while (eg.next()) {
        var id = eg.getUniqueValue();
        if (('' + (eg.getValue('wiz_extracted') || '')) !== '') { extracted++; continue; }
        stuck.push({ id: id, subj: '' + (eg.getValue('mail_subject') || eg.getValue('name') || ''),
                     rows: cf[id] || 0 });
    }
    gs.info('   extracted: ' + extracted + '    still pending: ' + stuck.length);
    gs.info('   cashflows in this scope: ' + (function () {
        var a = new GlideAggregate(SCOPE + '_cashflow'); a.addAggregate('COUNT'); a.query();
        return a.next() ? a.getAggregate('COUNT') : '?';
    })());

    // the spreadsheet mails - the ones the two new files are supposed to fix
    var SHEETY = ['Deutsche Bank', 'NGFP Payment', 'NFPS Payment', 'NIP Arrangement',
                  'Settlement Confirmation - 21'];
    var oneBig = 0, chunked = 0;
    for (var s = 0; s < stuck.length; s++) {
        var it = stuck[s], want = false;
        for (var k = 0; k < SHEETY.length; k++) {
            if (it.subj.indexOf(SHEETY[k]) > -1) { want = true; }
        }
        if (!want) { continue; }
        gs.info('');
        gs.info('   >>> ' + it.subj.substring(0, 74));
        var calls = 0, sizes = '';
        var lu = new GlideRecord(SCOPE + '_llm_usage');
        lu.addQuery('email_id', it.id);
        lu.addQuery('sys_created_on', '>=', sinceStr);
        lu.orderBy('sys_created_on');
        lu.query();
        while (lu.next()) {
            calls++;
            var pc = parseInt(lu.getValue('prompt_chars'), 10) || 0;
            var rc = parseInt(lu.getValue('response_chars'), 10) || 0;
            sizes += (sizes ? ', ' : '') + pc + '->' + rc;
            gs.info('       ' + ('' + lu.getValue('sys_created_on')).substring(11) +
                '  ' + (lu.getValue('field_name') || '-') +
                '  prompt=' + pc + 'ch  response=' + rc + 'ch  ok=' + lu.getValue('success'));
        }
        if (!calls) { gs.warn('       no calls in the last ' + MINUTES + ' minutes - the Sync did not reach it'); }
        else if (calls === 1) { oneBig++; gs.warn('       ONE call only - no grid was built, so no chunking'); }
        else { chunked++; gs.info('       ' + calls + ' calls - chunking IS happening'); }
    }

    // ---------------------------------------------------------------- verdict
    line();
    gs.info('VERDICT: ' + pass + ' passed, ' + fail + ' failed in section 1');
    if (fail) {
        gs.error('  The code is not right in this scope. Fix section 1 before reading anything into');
        gs.error('  section 2 - a file pointing at the wrong application fails silently and looks');
        gs.error('  exactly like a model problem.');
    } else if (oneBig && !chunked) {
        gs.warn('  Code is correct, but the spreadsheet mails are still going out as ONE big prompt.');
        gs.warn('  So no grid is being produced from the workbook even with the new extractor. Next');
        gs.warn('  step is to look at what XlsxCashflowExtractor.extract() actually returns for one of');
        gs.warn('  these mails - whether it finds the attachment at all.');
    } else if (chunked) {
        gs.info('  Chunking is happening now. If rows are still missing it is an extraction-quality');
        gs.info('  question rather than the plumbing.');
    } else {
        gs.info('  No calls in the window - press Sync and run this again.');
    }
})();
