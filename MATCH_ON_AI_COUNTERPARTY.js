/**
 * MATCH ON THE AI-READ COUNTERPARTY, WITH EVE AS THE FALLBACK
 *
 * Scripts - Background.  "Execute in sandbox?" UNCHECKED.
 * APPLICATION = the environment to change. Run it ONCE PER SCOPE, unchanged:
 *     NexAI OTC BSM    x_nose_nfotc_bsm
 *     NexAI OTC Dev    x_nose_nexai_dev
 *     NexAI OTC Test   x_nose_nexai_test
 *     NexAI OTC UAT    x_nose_nexai_uat
 *
 * ONE RUN. There is nothing to set. It edits one live Script Include - but only if every anchor
 * it needs is found exactly once; otherwise it writes NOTHING and prints what it actually saw.
 *
 * WHAT IT CHANGES, and the problem it fixes
 * Compare & Match compared the counterparty taken from the EMAIL - the name derived from the sender
 * through the EVE directory. For a real mailbox the directory usually has no entry for the sender,
 * so that value was blank, and CompareMatch deliberately refuses the counterparty-aware tiers
 * without one. Every cashflow therefore landed at Tier 3 "counterparty-less" - even where the mail
 * plainly named the counterparty and a booking for exactly that counterparty existed.
 *
 * The name WAS being extracted all along; the matcher simply was not wired to it. After this change
 * the counterparty is resolved as:
 *
 *     the AI-read name (cashflow.ai_counterparty)   first
 *     the EVE-derived name (email.counterparty_name) as the fallback
 *     blank when neither is available
 *
 * NO TIER RULE CHANGES. An exact name (after case and punctuation are normalised) reaches Tier 1, a
 * close one Tier 2 at the configured similarity (`match.name_fuzzy_pct`, 0.85 by default), anything
 * further apart still falls through to Tier 3. "Barclays" against "BARCLAYS" is Tier 1;
 * "Barclays Bank PLC" against "BARCLAYS" is 0.53 similar and correctly does NOT claim a
 * counterparty-confirmed match.
 *
 * MEASURED ON EVAL before shipping this, over 124 cashflows and 286 bookings:
 *     before   109 matched - Tier 1   0,  Tier 3 109
 *     after    109 matched - Tier 1  85,  Tier 3  24
 * No new matches and none lost: the economics always agreed. 85 rows simply stop claiming to be
 * counterparty-less when the counterparty was in fact confirmed.
 *
 * WHAT IS NOT TOUCHED
 * Amount, currency, direction, value date, every tolerance, and the tier cascade itself. The only
 * difference is which field supplies the counterparty.
 *
 * SAFETY
 *   - each anchor must occur EXACTLY ONCE, or nothing is written
 *   - the record is written only if ALL three edits matched - never a partial change
 *   - the write is read back and verified
 *   - IDEMPOTENT: an already-changed record reports "already applied" and is skipped
 */
(function () {

    var SPEC = {"edits":[{"name":"add the shared counterparty resolver","find":"    _cfValues: function (cfGr) {","replace":"    // The counterparty the matcher compares on: the AI-READ name first, the EVE-derived name as the\n    // fallback, blank when neither is available.\n    //\n    // Why this order. The EVE directory is the authoritative source, but it only answers for senders\n    // it actually holds \u2014 and for a real mailbox it frequently does not, which left `counterparty`\n    // blank and sent EVERY cashflow to Tier 3 (counterparty-less) even where the mail plainly named\n    // the counterparty and a booking for it existed. The AI reads that name off the mail, so using\n    // it lets the counterparty-aware tiers do their job, and nothing is lost where the directory\n    // does have an entry - EVE is still consulted whenever the AI found nothing.\n    //\n    // The tiers then behave exactly as before, with no special case for where the name came from:\n    // an exact name (after case/punctuation normalising) reaches Tier 1, a close one Tier 2 at the\n    // configured similarity (`match.name_fuzzy_pct`, 0.85 by default), anything further apart falls\n    // through to Tier 3. \"Barclays\" vs \"BARCLAYS\" is Tier 1; \"Barclays Bank PLC\" vs \"BARCLAYS\" is\n    // 0.53 similar and correctly does NOT claim a counterparty-confirmed match.\n    //\n    // Used by BOTH value builders on purpose: if the compare screen resolved the counterparty\n    // differently from the matcher, an analyst would confirm against a name the match never used.\n    _counterpartyFor: function (cfGr, em) {\n        return ('' + (cfGr.getValue('ai_counterparty') || '')) || em.counterparty;\n    },\n\n    _cfValues: function (cfGr) {"},{"name":"matcher path (_cfValuesAi) uses it","find":"            counterparty: em.counterparty,   // DERIVED (directory lookup), not AI","replace":"            counterparty: this._counterpartyFor(cfGr, em),   // AI-read name, EVE as the fallback"},{"name":"compare screen (_cfValues) uses it","find":"            value_date: cfGr.getValue('value_date'),\n            flow_index: cfGr.getValue('flow_index'),\n            counterparty: em.counterparty,","replace":"            value_date: cfGr.getValue('value_date'),\n            flow_index: cfGr.getValue('flow_index'),\n            counterparty: this._counterpartyFor(cfGr, em),"}],"done":"_counterpartyFor: function"};

    var ENVIRONMENTS = {
        'x_nose_nfotc_bsm':  'NexAI OTC BSM',
        'x_nose_nexai_dev':  'NexAI OTC Dev',
        'x_nose_nexai_test': 'NexAI OTC Test',
        'x_nose_nexai_uat':  'NexAI OTC UAT'
    };

    var SCOPE = '' + gs.getCurrentScopeName();
    if (!ENVIRONMENTS[SCOPE]) {
        gs.error('[CPMATCH] ABORT: Application is "' + SCOPE + '", not a NexAI OTC environment.');
        for (var k in ENVIRONMENTS) {
            if (ENVIRONMENTS.hasOwnProperty(k)) { gs.error('[CPMATCH]     ' + ENVIRONMENTS[k] + '   (' + k + ')'); }
        }
        return;
    }

    gs.info('[CPMATCH] ================================================================');
    gs.info('[CPMATCH] environment : ' + ENVIRONMENTS[SCOPE] + '   (' + SCOPE + ')');
    gs.info('[CPMATCH] mode        : applying - all three edits land together, or none does');
    gs.info('[CPMATCH] ================================================================');

    var gr = new GlideRecord('sys_script_include');
    gr.addEncodedQuery('name=CompareMatch^sys_scope.scope=' + SCOPE);
    gr.query();

    if (!gr.hasNext()) {
        gs.error('[CPMATCH] No CompareMatch Script Include in this scope. Nothing done.');
        return;
    }

    var changed = 0, already = 0, failed = 0;

    while (gr.next()) {
        var id = gr.getUniqueValue();
        var src = '' + (gr.getValue('script') || '');

        if (src.indexOf(SPEC.done) > -1) {
            gs.info('[CPMATCH] CompareMatch: already applied, skipped.');
            already++;
            continue;
        }

        // Apply all three, or none. A CompareMatch with the helper added but a builder still on the
        // old field would read as done while matching the old way - the worst kind of half-change.
        var out = src, ok = true;
        for (var e = 0; e < SPEC.edits.length; e++) {
            var ed = SPEC.edits[e];
            var n = out.split(ed.find).length - 1;
            if (n !== 1) {
                gs.error('[CPMATCH] "' + ed.name + '": anchor found ' + n + ' times, expected exactly 1.');
                ok = false;
                break;
            }
            out = out.replace(ed.find, ed.replace);
            gs.info('[CPMATCH]   - ' + ed.name);
        }

        if (!ok) {
            gs.error('[CPMATCH] NOT APPLIED - nothing was written. This CompareMatch differs from the');
            gs.error('[CPMATCH] version this script was built against. Send the line above back.');
            failed++;
            continue;
        }

        gs.info('[CPMATCH] CompareMatch: ' + src.length + ' -> ' + out.length + ' chars');

        gr.setValue('script', out);
        if (!gr.update()) {
            gs.error('[CPMATCH] UPDATE REFUSED (read-only app, or wrong scope?)');
            failed++;
            continue;
        }
        var v = new GlideRecord('sys_script_include');
        v.get(id);
        var back = '' + (v.getValue('script') || '');
        if (back.indexOf(SPEC.done) === -1) {
            gs.error('[CPMATCH] WRITE DID NOT STICK.');
            failed++;
        } else {
            gs.info('[CPMATCH] applied and verified.');
            changed++;
        }
    }

    gs.info('[CPMATCH]');
    gs.info('[CPMATCH] ================================================================');
    gs.info('[CPMATCH] changed : ' + changed +
            '   already applied: ' + already + '   FAILED: ' + failed);
    if (!failed) {
        gs.info('[CPMATCH]');
        gs.info('[CPMATCH] Done. Repeat with the Application set to each other environment.');
        gs.info('[CPMATCH]');
        gs.info('[CPMATCH] TO SEE THE EFFECT: matches already stored are NOT recomputed - the tier on');
        gs.info('[CPMATCH] an existing cashflow was written when it was last confirmed. Confirm a');
        gs.info('[CPMATCH] cashflow on the board to recompute and store it.');
        gs.info('[CPMATCH]');
        gs.info('[CPMATCH] Expect Tier 1 where the AI name equals the booking name, and Tier 3 to');
        gs.info('[CPMATCH] remain wherever the two spell it differently (e.g. "Barclays Bank PLC" vs');
        gs.info('[CPMATCH] "BARCLAYS"). Loosen match.name_fuzzy_pct in the config store if you want');
        gs.info('[CPMATCH] more of those to reach Tier 2.');
    } else {
        gs.warn('[CPMATCH]');
        gs.warn('[CPMATCH] NOT applied - see above. Nothing partial was saved.');
    }
    gs.info('[CPMATCH] ================================================================');
})();
