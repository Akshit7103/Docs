/**
 * COUNTERPARTY: ONE VALUE, AND AN HONEST ONE
 *
 * Scripts - Background.  "Execute in sandbox?" UNCHECKED.
 * APPLICATION = the environment to change. Run it ONCE PER SCOPE, unchanged:
 *     NexAI OTC BSM    x_nose_nfotc_bsm
 *     NexAI OTC Dev    x_nose_nexai_dev
 *     NexAI OTC Test   x_nose_nexai_test
 *     NexAI OTC UAT    x_nose_nexai_uat
 *
 * ONE RUN. There is nothing to set. It edits one widget (script + template) and one Script Include -
 * each only if every anchor it needs is found exactly once; otherwise that record is left untouched
 * and the output says what it actually saw.
 *
 * WHAT WAS WRONG
 *
 *   1. TWO VALUES FOR ONE FIELD. The case screen showed the directory name with the AI's reading
 *      beneath it in small grey type ("AI read: BNP PARIBAS"). Two answers to the one question that
 *      decides Tier 1 and Tier 2 - and the matcher was using the one in the footnote.
 *
 *   2. THE BADGE WAS A TEST OF EMPTINESS, NOT OF ORIGIN.
 *          counterpartySource = counterparty_name ? 'eve' : (ai ? 'ai' : '')
 *      It printed "Derived - EVE" whenever that column held anything at all.
 *
 *   3. AND THE ANALYST'S SAVE WROTE INTO THAT COLUMN. Correcting any field on the case screen sent
 *      the whole payload, so the counterparty box - which already held the AI's value when the
 *      directory had no entry - was written into counterparty_name. From then on an AI or typed name
 *      was indistinguishable from a directory answer: the screen badged it "Derived - EVE", and the
 *      matcher's directory fallback treated it as directory-confirmed. A name a person invented could
 *      produce a Tier 1 counterparty-exact match that no directory ever backed.
 *
 * WHAT IT CHANGES
 *   Case screen (save)      the correction is written to ai_counterparty, like every other corrected
 *                           field on that screen, and to EVERY cashflow of the mail - one mail has one
 *                           counterparty. counterparty_name is never written again, so it means only
 *                           what the Eve directory said.
 *   Case screen (display)   ONE value: the AI-read name, the directory only as the fallback - the same
 *                           order CompareMatch._counterpartyFor uses, so the screen can never show a
 *                           name the match was not made on. The grey second value is removed.
 *   Case screen (badge)     "Derived - EVE" only when the value really came from the directory.
 *   Board                   resolves the counterparty the same way, so board, case screen and matcher
 *                           agree.
 *
 * WHAT IT DOES NOT CHANGE
 *   No matcher code. CompareMatch already reads ai_counterparty first and the directory second; this
 *   makes the two screens tell the truth about that, rather than changing it.
 *
 * SAFETY
 *   - each anchor must occur EXACTLY ONCE in the record, or that record is not written
 *   - all of a record's edits apply, or none of them - never a partial change
 *   - every write is read back and verified
 *   - IDEMPOTENT: an already-changed record reports "already applied" and is skipped
 */
(function () {

    var SITES = [{"label":"Case screen server  (save + display)","table":"sp_widget","query":"idLIKEai-extraction","field":"script","done":"sib.setValue('ai_counterparty'","edits":[{"name":"save writes ai_counterparty on every cashflow of the mail","start":"        // Counterparty is email-level (derived from the sender directory) and is the value the matcher","end":"\n            }","replace":"        // Counterparty override. It is written to ai_counterparty, like every other corrected field on\n        // this screen - NOT to the email's counterparty_name.\n        //\n        // That column carries one meaning: \"the Eve directory answered this for this sender\". Writing an\n        // analyst's (or the AI's) value into it destroyed that meaning, and nothing on the record said so.\n        // A typed name then came back badged \"Derived - EVE\" on reopen, and the matcher's directory\n        // fallback treated it as directory-confirmed - so a name a person invented could produce a Tier 1\n        // counterparty-exact match that no directory ever backed.\n        //\n        // Applied to EVERY cashflow of the mail: one mail has one counterparty, so correcting it on the\n        // row in front of the analyst must not leave the other rows of the same mail disagreeing.\n        //\n        // AUTHORIZATION unchanged: the mail is resolved from the (already access-checked) cashflow, NEVER\n        // from a client-supplied email id, so an analyst cannot reach another wizard's mail by posting a\n        // foreign id.\n        if (input.counterparty !== undefined && input.counterparty !== null && input.cfSysId) {\n            var acg = new GlideRecord('x_nose_nfotc_bsm_cashflow');\n            if (acg.get(input.cfSysId)) {\n                var oldCp = acg.getValue('ai_counterparty') || '';\n                if (('' + input.counterparty) !== ('' + oldCp)) {\n                    var sib = new GlideRecord('x_nose_nfotc_bsm_cashflow');\n                    sib.addQuery('email', acg.getValue('email'));\n                    sib.query();\n                    while (sib.next()) {\n                        sib.setValue('ai_counterparty', '' + input.counterparty);\n                        sib.update();\n                    }\n                    auditCf(acg, 'extraction.overridden', {\n                        summary: 'Analyst corrected Counterparty (applied to every cashflow of this mail)',\n                        fieldName: 'Counterparty', aiValue: oldCp, analystValue: '' + input.counterparty\n                    });\n                }\n            }"},{"name":"display the AI name first, EVE as the fallback","start":"    // Counterparty is DERIVED from the sender via the counterparty directory (email-level)","end":"data.counterpartyAi = (_cpEve && _cpAi && _cpEve.toLowerCase().replace(/[^a-z0-9]/g, '') !== _cpAi.toLowerCase().replace(/[^a-z0-9]/g, '')) ? _cpAi : '';","replace":"    // Counterparty: the AI-read name FIRST, the Eve directory only as the fallback - the same order the\n    // matcher uses (CompareMatch._counterpartyFor), so the screen can never show a name the match was not\n    // made on. For a real mailbox the directory usually has no entry for the sender, which is why the AI\n    // reading is the primary source rather than the exception.\n    //\n    // ONE value, deliberately. This used to show the directory name with the AI reading beneath it in grey\n    // - two answers to one question, on the field that decides Tier 1 and Tier 2. The fallback is a\n    // fallback, not a second opinion to be displayed.\n    var _cpEve = gr.getValue('counterparty_name') || '';\n    var _cpAi = cfRec ? (cfRec.getValue('ai_counterparty') || '') : '';\n    data.counterparty = _cpAi || _cpEve;\n    data.counterpartySource = _cpAi ? 'ai' : (_cpEve ? 'eve' : '');"}]},{"label":"Case screen template  (one value, honest badge)","table":"sp_widget","query":"idLIKEai-extraction","field":"template","done":"counterpartySource === 'eve'","edits":[{"name":"badge by origin, not by emptiness","start":"<span class=\"prov prov-pcm\" ng-if=\"c.data.counterpartySource !== 'ai'\">","end":"AI</span>","replace":"<span class=\"prov prov-pcm\" ng-if=\"c.data.counterpartySource === 'eve'\" title=\"No name in the email - derived from the sender via the EVE directory\">Derived &#183; EVE</span><span class=\"prov prov-ai\" ng-if=\"c.data.counterpartySource === 'ai'\" title=\"Read from the email by the AI - this is the name Compare &amp; Match uses\">AI</span>"},{"name":"remove the grey \"AI read:\" second value","start":"<span class=\"nom-fval\" ng-show=\"!c.editing\">{{c.data.counterparty","end":"</span></span>","replace":"<span class=\"nom-fval\" ng-show=\"!c.editing\">{{c.data.counterparty || '\u2014'}}</span>"}]},{"label":"Board  (same value as the case screen)","table":"sys_script_include","query":"name=TaggingDashboard","field":"script","done":"var cp = (c.ai_counterparty || detCp);","edits":[{"name":"board resolves AI first, EVE as the fallback","start":"            // Counterparty is DERIVED (sender email -> counterparty directory), same as OTC","end":"var cp = detCp;","replace":"            // Counterparty: the AI-read name first, the Eve directory as the fallback \u2014 the same order the\n            // case screen shows and the matcher matches on, so the board cannot disagree with either.\n            var detCp = gr.getValue('counterparty_name') || '';\n            for (var ci = 0; ci < flows.length; ci++) {\n                var c = flows[ci];\n                var cfNum = 'cf' + (ci + 1);\n                var cfSub = (flows.length > 1) ? ('of ' + flows.length) : '';\n                var cp = (c.ai_counterparty || detCp);"}]}];

    var ENVIRONMENTS = {
        'x_nose_nfotc_bsm':  'NexAI OTC BSM',
        'x_nose_nexai_dev':  'NexAI OTC Dev',
        'x_nose_nexai_test': 'NexAI OTC Test',
        'x_nose_nexai_uat':  'NexAI OTC UAT'
    };

    var SCOPE = '' + gs.getCurrentScopeName();
    if (!ENVIRONMENTS[SCOPE]) {
        gs.error('[CPTY] ABORT: Application is "' + SCOPE + '", not a NexAI OTC environment.');
        for (var k in ENVIRONMENTS) {
            if (ENVIRONMENTS.hasOwnProperty(k)) { gs.error('[CPTY]     ' + ENVIRONMENTS[k] + '   (' + k + ')'); }
        }
        return;
    }

    gs.info('[CPTY] ================================================================');
    gs.info('[CPTY] environment : ' + ENVIRONMENTS[SCOPE] + '   (' + SCOPE + ')');
    gs.info('[CPTY] mode        : applying - per record, every edit or none');
    gs.info('[CPTY] ================================================================');

    var changed = 0, already = 0, failed = 0;

    for (var s = 0; s < SITES.length; s++) {
        var site = SITES[s];
        gs.info('[CPTY]');
        gs.info('[CPTY] ' + site.label);

        var gr = new GlideRecord(site.table);
        gr.addEncodedQuery(site.query + '^sys_scope.scope=' + SCOPE);
        gr.query();

        if (!gr.hasNext()) {
            gs.error('[CPTY]   NOT FOUND in this scope (' + site.table + ': ' + site.query + ')');
            failed++;
            continue;
        }

        while (gr.next()) {
            var id = gr.getUniqueValue();
            var src = '' + (gr.getValue(site.field) || '');
            var who = '' + (gr.getValue('name') || gr.getValue('id') || site.table);

            if (src.indexOf(site.done) > -1) {
                gs.info('[CPTY]   ' + who + ': already applied, skipped.');
                already++;
                continue;
            }

            // Every edit, or none. A record carrying half the change would read as done while the
            // other half still inverted the value.
            var out = src, ok = true;
            for (var e = 0; e < site.edits.length; e++) {
                var ed = site.edits[e];
                // The table names are baked into these records, so text cut from one scope carries
                // that scope; retarget before matching.
                var start = ed.start.split('x_nose_nfotc_bsm').join(SCOPE);
                var endAt = ed.end.split('x_nose_nfotc_bsm').join(SCOPE);
                var repl = ed.replace.split('x_nose_nfotc_bsm').join(SCOPE);

                var n = out.split(start).length - 1;
                if (n !== 1) {
                    gs.error('[CPTY]   "' + ed.name + '": start anchor found ' + n + ' times, expected 1.');
                    ok = false;
                    break;
                }
                var i = out.indexOf(start);
                var j = out.indexOf(endAt, i);
                if (j === -1) {
                    gs.error('[CPTY]   "' + ed.name + '": end anchor not found after the start.');
                    ok = false;
                    break;
                }
                out = out.substring(0, i) + repl + out.substring(j + endAt.length);
                gs.info('[CPTY]   - ' + ed.name);
            }

            if (!ok) {
                gs.error('[CPTY]   ' + who + ': NOT APPLIED - nothing written. This record differs from');
                gs.error('[CPTY]   the version this script was built against. Send the line above back.');
                failed++;
                continue;
            }

            gs.info('[CPTY]   ' + who + ': ' + src.length + ' -> ' + out.length + ' chars');

            gr.setValue(site.field, out);
            if (!gr.update()) {
                gs.error('[CPTY]   ' + who + ': UPDATE REFUSED (read-only app, or wrong scope?)');
                failed++;
                continue;
            }
            // Read back - a refused scoped write looks exactly like success otherwise.
            var v = new GlideRecord(site.table);
            v.get(id);
            if (('' + (v.getValue(site.field) || '')).indexOf(site.done) === -1) {
                gs.error('[CPTY]   ' + who + ': WRITE DID NOT STICK.');
                failed++;
            } else {
                gs.info('[CPTY]   applied and verified.');
                changed++;
            }
        }
    }

    gs.info('[CPTY]');
    gs.info('[CPTY] ================================================================');
    gs.info('[CPTY] changed : ' + changed + '   already applied: ' + already + '   FAILED: ' + failed);
    if (!failed) {
        gs.info('[CPTY]');
        gs.info('[CPTY] Done. Repeat with the Application set to each other environment.');
        gs.info('[CPTY]');
        gs.info('[CPTY] The case screen and the board now show ONE counterparty - the AI-read name,');
        gs.info('[CPTY] with the Eve directory only as the fallback, which is the order the matcher');
        gs.info('[CPTY] already used. The grey second value is gone.');
        gs.info('[CPTY]');
        gs.info('[CPTY] EXISTING RECORDS ARE NOT REWRITTEN. Any mail whose counterparty_name was filled');
        gs.info('[CPTY] by an analyst Save before today still holds that value and will still badge');
        gs.info('[CPTY] "Derived - EVE". Only new saves are clean. To find the affected mails, list the');
        gs.info('[CPTY] email table on counterparty_name and compare against the counterparty directory -');
        gs.info('[CPTY] anything not in the directory got there from a Save.');
    } else {
        gs.warn('[CPTY]');
        gs.warn('[CPTY] Some records were NOT changed - see above. Nothing partial was saved.');
    }
    gs.info('[CPTY] ================================================================');
})();
