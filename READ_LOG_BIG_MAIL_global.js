/**
 * DID THE BIG MAIL EVER REACH THE MODEL, AND WHAT KILLED IT?
 *
 * Scripts - Background.  APPLICATION = **Global**.  "Execute in sandbox?" UNCHECKED.
 * Global because syslog is a global table and a scoped application is fenced out of it
 * (ScopeAccessNotGrantedException).
 *
 * READ-ONLY.
 *
 * WHY THIS IS THE DECIDING EVIDENCE
 * "Nomura PAYMENT CONFIRMATION FOR VALUE 18-Aug-26" is classified relevant but produced 0 cashflows,
 * and its wiz_extracted stamp is empty. That stamp is written AFTER a successful pass, so an empty
 * stamp cannot tell these two apart:
 *     a) extraction was never attempted at all      -> nothing to fix; sync the board
 *     b) extraction started and the transaction died -> the 30s MID/ECC wall, or a parse failure
 * Only the log separates them, because a killed transaction still leaves its lines behind.
 *
 * WHAT TO LOOK FOR, and what each one means:
 *   "ECCResponseTimeout" / "30 seconds"   the MID/ECC wall. A call ran past 30s and was abandoned.
 *                                         FIX: extract.chunk_budget_s 15 -> 12 (smaller chunks).
 *   "chunk 1 of 8" and similar            chunking RAN. Count how many chunks came back.
 *   "max_tokens" / truncated / unexpected end of JSON
 *                                         the reply was cut mid-JSON and would not parse -> 0 rows.
 *                                         FIX: raise max_tokens on the Chinou client (4096 -> 8192).
 *   "LLMError"                            Chinou itself refused. Read the raw body, not a regex.
 *   NOTHING AT ALL                        it was genuinely never attempted. Sync the board.
 */
(function () {

    var MAIL = 'Nomura PAYMENT CONFIRMATION';
    var HOURS = 72;          // how far back to read
    var LIMIT = 120;         // lines to print

    var scope = '' + gs.getCurrentScopeName();
    if (scope !== 'global' && scope !== 'rhino.global') {
        gs.error('[LOG] ABORT: run with Application = Global, not "' + scope + '".');
        gs.error('[LOG] A scoped app cannot read syslog - that is what the earlier error was.');
        return;
    }

    var since = new GlideDateTime();
    since.addSeconds(-HOURS * 3600);

    gs.info('[LOG] ================================================================');
    gs.info('[LOG] searching the last ' + HOURS + 'h for: ' + MAIL);
    gs.info('[LOG] ================================================================');

    // ---- 1. anything naming the mail itself
    var n1 = 0;
    var a = new GlideRecord('syslog');
    a.addQuery('sys_created_on', '>=', since);
    a.addQuery('message', 'CONTAINS', MAIL);
    a.orderBy('sys_created_on');
    a.setLimit(LIMIT);
    a.query();
    gs.info('[LOG] ---- lines naming this mail ----');
    while (a.next()) {
        gs.info('[LOG] ' + a.getValue('sys_created_on') + ' [' + a.getValue('level') + '] ' +
                ('' + a.getValue('message')).substring(0, 240));
        n1++;
    }
    if (!n1) { gs.info('[LOG] (none)'); }

    // ---- 2. the failure signatures, whether or not they name the mail
    var PATTERNS = [
        ['ECCResponseTimeout', 'the 30-second MID/ECC wall'],
        ['30 seconds', 'the 30-second MID/ECC wall'],
        ['max_tokens', 'reply length ceiling'],
        ['truncat', 'reply was cut short'],
        ['LLMError', 'Chinou refused the call'],
        ['chunk', 'chunking activity'],
        ['RowSegmenter', 'the chunk planner'],
        ['WizardExtractor', 'the extractor itself']
    ];

    gs.info('[LOG]');
    gs.info('[LOG] ---- failure signatures in the same window ----');
    var n2 = 0;
    for (var p = 0; p < PATTERNS.length; p++) {
        var g = new GlideRecord('syslog');
        g.addQuery('sys_created_on', '>=', since);
        g.addQuery('message', 'CONTAINS', PATTERNS[p][0]);
        g.orderByDesc('sys_created_on');
        g.setLimit(12);
        g.query();
        var seen = 0;
        while (g.next()) {
            if (!seen) { gs.info('[LOG] == "' + PATTERNS[p][0] + '"  (' + PATTERNS[p][1] + ')'); }
            gs.info('[LOG]    ' + g.getValue('sys_created_on') + ' [' + g.getValue('level') + '] ' +
                    ('' + g.getValue('message')).substring(0, 220));
            seen++; n2++;
        }
    }
    if (!n2) { gs.info('[LOG] (no failure signatures at all in the last ' + HOURS + 'h)'); }

    gs.info('[LOG]');
    gs.info('[LOG] ================================================================');
    gs.info('[LOG] HOW TO READ THIS');
    if (!n1 && !n2) {
        gs.info('[LOG] Nothing at all. The mail was almost certainly NEVER ATTEMPTED - open the board');
        gs.info('[LOG] for NexAI OTC Test and press Sync now, then re-run the big-mail diagnostic.');
    } else {
        gs.info('[LOG] ECCResponseTimeout / "30 seconds" -> lower extract.chunk_budget_s 15 to 12.');
        gs.info('[LOG] max_tokens / truncated / bad JSON  -> raise max_tokens on the Chinou client.');
        gs.info('[LOG] chunk lines present but few        -> chunking ran; count what came back.');
        gs.info('[LOG] LLMError                           -> Chinou-side, not our code.');
    }
    gs.info('[LOG] ================================================================');
})();
