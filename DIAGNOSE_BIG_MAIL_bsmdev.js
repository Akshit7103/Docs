/**
 * WHY DOES THE 61-ROW MAIL FAIL HERE WHEN IT WORKS ON EVAL?
 *
 * Scripts - Background.  "Execute in sandbox?" UNCHECKED.
 * APPLICATION = the environment that is failing, e.g.  NexAI OTC BSM   (x_nose_nfotc_bsm)
 *
 * READ-ONLY. It writes nothing and re-extracts nothing.
 *
 * THE FINDING THIS IS CHASING
 * "Nomura PAYMENT CONFIRMATION FOR VALUE 18-Aug-26" produced 61 cashflows on eval. Every other mail
 * in the same batch produced 6 or fewer. It is the ONLY mail in the set big enough to cross
 * extract.chunk_threshold, so it is the only one that gets split into several LLM calls - which is
 * why it is the only one that fails. The other 24 passing tells you nothing about the cause.
 *
 * At 61 rows and 13 fields the planner asks for 8 calls:
 *     perRow = 0.7 * (13/13)            = 0.7
 *     byTime = floor((15 - 9) / 0.7)    = 8 rows per call
 *     calls  = ceil(61 / 8)             = 8
 *
 * So there are four ways this dies here but not on eval, and they need different fixes:
 *   1. CHUNKING IS NOT INSTALLED HERE     - one call, 61 rows, killed by the 30s MID/ECC wall.
 *   2. CHUNKING RUNS BUT COMES BACK SHORT - fewer than 61 rows; the sizer counts rows, not row
 *                                           width, so wide rows overflow a chunk.
 *   3. THE ANSWER IS TRUNCATED            - max_tokens too low for a 61-row JSON reply; the reply
 *                                           is cut mid-JSON, fails to parse, and scores 0 rows.
 *   4. THE MODEL                          - 4.5-sonnet here vs 5-sonnet on eval: slower per row,
 *                                           so a chunk that fits in 15s there may not here.
 *
 * It prints the evidence for each, and says which one it is.
 */
(function () {

    var MAIL = 'Nomura PAYMENT CONFIRMATION';   // matched with STARTSWITH
    var EVAL_ROWS = 61;                          // what eval produced for this mail
    var LOG_HOURS = 48;

    var ENVIRONMENTS = {
        'x_nose_nfotc_bsm':  'NexAI OTC BSM',
        'x_nose_nexai_dev':  'NexAI OTC Dev',
        'x_nose_nexai_test': 'NexAI OTC Test',
        'x_nose_nexai_uat':  'NexAI OTC UAT'
    };

    var SCOPE = '' + gs.getCurrentScopeName();
    if (!ENVIRONMENTS[SCOPE]) {
        gs.error('[BIG] ABORT: Application is "' + SCOPE + '", not a NexAI OTC environment.');
        return;
    }

    var EMAIL = SCOPE + '_email';
    var CASHFLOW = SCOPE + '_cashflow';
    var CONFIG = SCOPE + '_config';

    gs.info('[BIG] ================================================================');
    gs.info('[BIG] environment : ' + ENVIRONMENTS[SCOPE] + '   (' + SCOPE + ')');
    gs.info('[BIG] mail        : ' + MAIL + '...');
    gs.info('[BIG] eval result : ' + EVAL_ROWS + ' cashflows, extraction complete');
    gs.info('[BIG] ================================================================');

    // ---------------------------------------------------------------- the mail
    var e = new GlideRecord(EMAIL);
    e.addQuery('name', 'STARTSWITH', MAIL);
    e.orderBy('sys_created_on');
    e.query();
    // Never setLimit(1) here. If the mail was dropped more than once, picking one copy at random is
    // exactly how a working mail gets reported as "0 rows" - count the copies first and say so.
    var copies = e.getRowCount();
    if (!copies) {
        gs.error('[BIG] That mail is not in ' + EMAIL + ' at all. Drop the .eml (NOT the .msg) first.');
        return;
    }
    if (copies > 1) {
        gs.warn('[BIG] *** ' + copies + ' COPIES of this mail exist here. Reporting the NEWEST.');
        gs.warn('[BIG] *** Duplicates split the cashflows, so a per-copy count looks short.');
    }
    // Walk to the LAST row of the ordered result: that is the most recently created copy.
    var _seen = 0;
    while (e.next()) { _seen++; if (_seen === copies) { break; } }

    var id = e.getUniqueValue();
    var name = '' + e.getValue('name');
    var body = '' + (e.getValue('mail_body') || '');

    var c = new GlideAggregate(CASHFLOW);
    c.addQuery('email', id);
    c.addAggregate('COUNT');
    c.query();
    var rows = c.next() ? parseInt(c.getAggregate('COUNT'), 10) : 0;

    gs.info('[BIG] name              ' + name);
    gs.info('[BIG] sys_id            ' + id);
    gs.info('[BIG] mail_body         ' + body.length + ' chars');
    gs.info('[BIG] thread_state      ' + (e.getValue('thread_state') || '(not evaluated)'));
    gs.info('[BIG] classification    ' + (e.getValue('classification') || '(none)'));
    gs.info('[BIG] wiz_extracted     ' + (e.getValue('wiz_extracted') || '(none)'));
    gs.info('[BIG] extraction_status ' + (e.getValue('extraction_status') || '(empty = complete)'));
    gs.info('[BIG] CASHFLOWS HERE    ' + rows + '   vs ' + EVAL_ROWS + ' on eval');

    // An .msg has no MIME boundaries and cannot be parsed at all - rule it out before anything else.
    var ag = new GlideRecord('sys_attachment');
    ag.addQuery('table_name', EMAIL);
    ag.addQuery('table_sys_id', id);
    ag.query();
    while (ag.next()) {
        var fn = ('' + ag.getValue('file_name'));
        gs.info('[BIG] attachment        ' + fn + '   ' + ag.getValue('size_bytes') + ' bytes');
        if (/\.msg$/i.test(fn)) {
            gs.error('[BIG] *** This is an Outlook .msg - an OLE binary with no MIME boundaries.');
            gs.error('[BIG] *** Nothing can parse it. Drop the .eml version. Stop here.');
            return;
        }
    }

    // ---------------------------------------------------------------- is chunking even here?
    gs.info('[BIG]');
    gs.info('[BIG] ---------------- 1. is the chunking code installed? ----------------');
    var hasSegmenter = false, hasBatch = false;
    try { hasSegmenter = !!new GlideRecord('sys_script_include').get('name', 'RowSegmenter'); } catch (e1) { }
    var si = new GlideRecord('sys_script_include');
    si.addQuery('name', 'GenericFieldExtractor');
    si.query();
    while (si.next()) {
        if (('' + si.getValue('script')).indexOf('extractRecordsBatch') > -1) { hasBatch = true; }
    }
    gs.info('[BIG] RowSegmenter Script Include          ' + (hasSegmenter ? 'PRESENT' : '*** MISSING ***'));
    gs.info('[BIG] GenericFieldExtractor batch method   ' + (hasBatch ? 'PRESENT' : '*** MISSING ***'));
    if (!hasSegmenter || !hasBatch) {
        gs.error('[BIG] >>> CAUSE 1: chunking is NOT installed here. This mail is sent as ONE call of');
        gs.error('[BIG] >>> 61 rows and is abandoned at the 30-second MID/ECC wall, yielding nothing.');
        gs.error('[BIG] >>> FIX: deploy the chunking change to this environment.');
    }

    // ---------------------------------------------------------------- what would it plan?
    gs.info('[BIG]');
    gs.info('[BIG] ---------------- 2. what does the sizer plan here? ----------------');
    function cfg(key, dflt) {
        var g = new GlideRecord(CONFIG);
        g.addQuery('key', key);
        g.setLimit(1);
        g.query();
        return g.next() ? ('' + g.getValue('value')) : ('' + dflt + '  (default - no config row)');
    }
    var thr = cfg('extract.chunk_threshold', 12);
    var bud = cfg('extract.chunk_budget_s', 15);
    var ovh = cfg('extract.chunk_overhead_s', 9);
    var spr = cfg('extract.chunk_sec_per_row', 0);
    var cap = cfg('extract.chunk_cap', 4);
    gs.info('[BIG] extract.chunk_threshold   ' + thr);
    gs.info('[BIG] extract.chunk_budget_s    ' + bud);
    gs.info('[BIG] extract.chunk_overhead_s  ' + ovh);
    gs.info('[BIG] extract.chunk_sec_per_row ' + spr + '   (0 means derive from the field count)');
    gs.info('[BIG] extract.chunk_cap         ' + cap + '   (concurrency, NOT the number of chunks)');

    var budN = parseFloat(bud) || 15, ovhN = parseFloat(ovh) || 9, sprN = parseFloat(spr) || 0;
    var perRow = sprN || 0.7;
    if (perRow < 0.15) { perRow = 0.15; }
    var byTime = Math.floor((budN - ovhN) / perRow);
    if (byTime < 3) { byTime = 3; }
    var calls = Math.ceil(EVAL_ROWS / byTime);
    gs.info('[BIG] -> ' + byTime + ' rows per call, ' + calls + ' calls for a ' + EVAL_ROWS + '-row mail');
    if (EVAL_ROWS <= (parseFloat(thr) || 12)) {
        gs.warn('[BIG] *** threshold is above ' + EVAL_ROWS + ' rows, so this mail would NOT chunk here.');
    }

    // ---------------------------------------------------------------- what the model actually did
    gs.info('[BIG]');
    gs.info('[BIG] ---------------- 3. what did the model actually return? ----------------');
    var usage = SCOPE + '_llm_usage';
    var u;
    try { u = new GlideRecord(usage); } catch (eU) { u = null; }
    if (u && u.isValid()) {
        u.addQuery('email_id', id);
        u.orderBy('sys_created_on');
        u.query();
        var n = 0, totIn = 0, totOut = 0, slowest = 0;
        while (u.next()) {
            n++;
            var lat = parseFloat(u.getValue('latency_ms') || u.getValue('duration_ms') || 0) / 1000;
            if (lat > slowest) { slowest = lat; }
            totIn += parseInt(u.getValue('input_tokens') || 0, 10);
            totOut += parseInt(u.getValue('output_tokens') || 0, 10);
            gs.info('[BIG]   call ' + n + '   ' + lat.toFixed(1) + 's   in ' +
                    (u.getValue('input_tokens') || '?') + '  out ' + (u.getValue('output_tokens') || '?') +
                    '   rows ' + (u.getValue('row_count') || u.getValue('count') || '?'));
        }
        if (!n) {
            gs.warn('[BIG] no llm_usage rows for this mail - either it never ran, or usage tracking is');
            gs.warn('[BIG] not installed in this environment.');
        } else {
            gs.info('[BIG]   ' + n + ' calls, slowest ' + slowest.toFixed(1) + 's, tokens in ' + totIn + ' out ' + totOut);
            if (slowest >= 28) {
                gs.error('[BIG] >>> CAUSE 1/4: a call ran to ~30s. That is the MID/ECC wall, not the model.');
                gs.error('[BIG] >>> FIX: lower extract.chunk_budget_s (15 -> 12) so chunks are smaller.');
            }
            if (n === 1 && rows < EVAL_ROWS) {
                gs.error('[BIG] >>> Only ONE call was made for a ' + EVAL_ROWS + '-row mail: it did not chunk.');
            }
        }
    } else {
        gs.info('[BIG] no ' + usage + ' table here - token/latency tracking is not installed.');
    }

    // ---------------------------------------------------------------- the log
    gs.info('[BIG]');
    gs.info('[BIG] ---------------- 4. the log for this mail ----------------');
    // syslog is a GLOBAL table and a scoped application is fenced out of it. Reading it here throws
    // ScopeAccessNotGrantedException and would kill the script before the verdict prints, so it is
    // guarded: if it is refused, say so and carry on rather than losing the whole run.
    try {
        var since = new GlideDateTime();
        since.addSeconds(-LOG_HOURS * 3600);
        var shown = 0;
        var lg = new GlideRecord('syslog');
        lg.addQuery('sys_created_on', '>=', since);
        lg.addEncodedQuery('messageLIKE' + name.substring(0, 40) +
                           '^ORmessageLIKEECCResponseTimeout^ORmessageLIKEmax_tokens');
        lg.orderByDesc('sys_created_on');
        lg.setLimit(25);
        lg.query();
        while (lg.next()) {
            gs.info('[BIG]   ' + lg.getValue('sys_created_on') + ' | ' +
                    ('' + lg.getValue('message')).substring(0, 200));
            shown++;
        }
        if (!shown) {
            gs.info('[BIG]   nothing in the last ' + LOG_HOURS + 'h mentioning this mail.');
        }
    } catch (eLog) {
        gs.info('[BIG]   syslog is not readable from a scoped application (this is expected).');
        gs.info('[BIG]   To read it, run this one line with Application = Global:');
        gs.info('[BIG]     var l=new GlideRecord("syslog"); l.addEncodedQuery("messageLIKE' +
                name.substring(0, 30) + '"); l.orderByDesc("sys_created_on"); l.setLimit(20); l.query();');
        gs.info('[BIG]     while(l.next()){ gs.info(l.getValue("sys_created_on")+" | "+l.getValue("message")); }');
    }

    // ---------------------------------------------------------------- verdict
    gs.info('[BIG]');
    gs.info('[BIG] ================================================================');
    if (rows >= EVAL_ROWS) {
        gs.info('[BIG] VERDICT: ' + rows + ' rows - this mail is fine here now.');
    } else if (rows === 0) {
        gs.info('[BIG] VERDICT: ZERO rows. Read section 1 first - if chunking is missing, that is the');
        gs.info('[BIG] whole answer. If it is present, section 3 says whether the call hit the 30s');
        gs.info('[BIG] wall or the reply was truncated.');
    } else {
        gs.info('[BIG] VERDICT: SHORT - ' + rows + ' of ' + EVAL_ROWS + ' rows. Chunking ran but lost');
        gs.info('[BIG] rows. The sizer counts ROWS, not row WIDTH, so wide rows overflow a chunk.');
        gs.info('[BIG] FIX: set extract.chunk_budget_s to 12 (from 15) and re-sync this mail.');
    }
    gs.info('[BIG] ================================================================');
})();
