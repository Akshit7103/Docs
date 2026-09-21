/**
 * WHICH MAIL DID NOT EXTRACT, AND WHY
 *
 * Scripts - Background. "Execute in sandbox?" UNCHECKED.
 * APPLICATION = the environment you are testing:
 *     NexAI OTC BSM    x_nose_nfotc_bsm
 *     NexAI OTC Dev    x_nose_nexai_dev
 *     NexAI OTC Test   x_nose_nexai_test
 *     NexAI OTC UAT    x_nose_nexai_uat
 *
 * READ-ONLY. It writes nothing, deletes nothing, re-extracts nothing.
 *
 * "24 of 25" tells you a number. This tells you WHICH one and, as far as the records can say, why:
 * it lists every mail claimed by a work driver that has no cashflows, prints the state fields, and
 * then reads the system log back for that mail so you get the actual failure line rather than an
 * inference.
 *
 * The four usual causes, in order of likelihood:
 *   1. it is a .msg, not a .eml       - an Outlook OLE file has no MIME boundaries, so there is
 *                                       nothing for the extractor to parse. Flagged below.
 *   2. the 30-second MID/ECC wall     - big mails are abandoned mid-answer and yield nothing
 *   3. a PDF                          - the document path is weaker than the text path
 *   4. the model returned empty       - counted as a failure, not as "0 rows found"
 */
(function () {

    var SHOW_LOG_LINES = 6;      // log lines to print per failing mail; 0 to skip
    var LOG_HOURS = 24;          // how far back to read the log

    var SCOPE = '' + gs.getCurrentScopeName();
    if (SCOPE.indexOf('x_nose_n') !== 0) {
        gs.error('[FAIL] ABORT: Application is "' + SCOPE + '".');
        gs.error('[FAIL] Set it to the NexAI OTC environment you are testing and run again.');
        return;
    }

    var EMAIL = SCOPE + '_email';
    var CASHFLOW = SCOPE + '_cashflow';

    function pad(s, n) { s = '' + (s === null || s === undefined ? '' : s); while (s.length < n) { s += ' '; } return s.substring(0, n); }

    gs.info('[FAIL] ================================================================================');
    gs.info('[FAIL] environment: ' + SCOPE);
    gs.info('[FAIL] ================================================================================');

    // ---------------------------------------------------------------- walk the claimed mails
    var e = new GlideRecord(EMAIL);
    e.addQuery('wiz_assigned', '!=', '');       // claimed by a work driver
    e.orderBy('name');
    e.query();

    var ok = 0, bad = [], msgFiles = 0;

    while (e.next()) {
        var id = e.getUniqueValue();
        var name = '' + e.getValue('name');

        var c = new GlideAggregate(CASHFLOW);
        c.addQuery('email', id);
        c.addAggregate('COUNT');
        c.query();
        var rows = c.next() ? parseInt(c.getAggregate('COUNT'), 10) : 0;

        var extracted = '' + (e.getValue('wiz_extracted') || '');
        if (rows > 0 && extracted) { ok++; continue; }

        // What kind of file is attached? A .msg cannot be parsed at all - worth knowing before
        // anyone goes looking for a bug in the extractor.
        var att = '', kind = 'none';
        var ag = new GlideRecord('sys_attachment');
        ag.addQuery('table_name', EMAIL);
        ag.addQuery('table_sys_id', id);
        ag.orderBy('sys_created_on');
        ag.query();
        while (ag.next()) {
            var fn = ('' + ag.getValue('file_name')).toLowerCase();
            if (/\.msg$/.test(fn)) { kind = 'MSG - not parseable'; att = ag.getUniqueValue(); msgFiles++; break; }
            if (/\.eml$/.test(fn) || ag.getValue('content_type') === 'message/rfc822') { kind = 'eml'; att = ag.getUniqueValue(); break; }
        }

        bad.push({
            id: id, name: name, rows: rows, kind: kind,
            extracted: extracted,
            status: '' + (e.getValue('extraction_status') || ''),
            intake: '' + (e.getValue('wiz_intake_state') || ''),
            cls: '' + (e.getValue('classification') || '')
        });
    }

    // ---------------------------------------------------------------- report
    gs.info('[FAIL] extracted cleanly : ' + ok);
    gs.info('[FAIL] did NOT extract   : ' + bad.length + (msgFiles ? ('   (' + msgFiles + ' of them are .msg files)') : ''));

    if (!bad.length) {
        gs.info('[FAIL] Nothing to report - every claimed mail produced cashflows.');
        gs.info('[FAIL] ================================================================================');
        return;
    }

    var since = new GlideDateTime();
    since.addSeconds(-LOG_HOURS * 3600);

    for (var b = 0; b < bad.length; b++) {
        var m = bad[b];
        gs.info('[FAIL] --------------------------------------------------------------------------------');
        gs.info('[FAIL] ' + m.name);
        gs.info('[FAIL]   cashflows ' + m.rows + '   attachment: ' + m.kind);
        gs.info('[FAIL]   classification "' + m.cls + '"   intake "' + m.intake + '"');
        gs.info('[FAIL]   wiz_extracted "' + m.extracted + '"   extraction_status "' + m.status + '"');

        if (m.kind.indexOf('MSG') === 0) {
            gs.warn('[FAIL]   >>> This is an Outlook .msg, not a .eml. It is an OLE binary with no MIME');
            gs.warn('[FAIL]   >>> boundaries, so the extractor has nothing to parse. Nothing is wrong');
            gs.warn('[FAIL]   >>> with the code - drop the .eml version instead.');
        }

        // The log is where the real answer is. Match on the mail name, which every
        // [WizardExtractor] line carries.
        if (SHOW_LOG_LINES) {
            var shown = 0;
            var lg = new GlideRecord('syslog');
            lg.addQuery('sys_created_on', '>=', since);
            lg.addQuery('message', 'CONTAINS', m.name.substring(0, 50));
            lg.orderByDesc('sys_created_on');
            lg.setLimit(SHOW_LOG_LINES);
            lg.query();
            while (lg.next()) {
                gs.info('[FAIL]   log | ' + ('' + lg.getValue('message')).substring(0, 210));
                shown++;
            }
            if (!shown) {
                gs.info('[FAIL]   log | nothing in the last ' + LOG_HOURS + 'h mentioning this mail.');
                gs.info('[FAIL]   log | It may never have been attempted - check the board and Sync it.');
            }
        }
    }

    gs.info('[FAIL] ================================================================================');
    gs.info('[FAIL] READING THE RESULT');
    gs.info('[FAIL]   "ECCResponseTimeout ... 30 seconds"  -> the mail is too big for one call.');
    gs.info('[FAIL]                                           Chunking handles text; a PDF cannot be');
    gs.info('[FAIL]                                           chunked.');
    gs.info('[FAIL]   "empty_response" / "partial_failure" -> the model answered nothing or short.');
    gs.info('[FAIL]                                           Retried on the next Sync, never dropped.');
    gs.info('[FAIL]   nothing in the log at all            -> it was never attempted. Sync the board.');
    gs.info('[FAIL]   attachment says MSG                  -> wrong file format, not a code fault.');
    gs.info('[FAIL] ================================================================================');
})();
