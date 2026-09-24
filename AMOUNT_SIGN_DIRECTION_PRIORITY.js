/**
 * AMOUNT SIGN = DIRECTION PRIORITY
 *
 * Scripts - Background.  "Execute in sandbox?" UNCHECKED.
 * APPLICATION = the environment to change. Run it ONCE PER SCOPE, unchanged:
 *     NexAI OTC BSM    x_nose_nfotc_bsm
 *     NexAI OTC Dev    x_nose_nexai_dev
 *     NexAI OTC Test   x_nose_nexai_test
 *     NexAI OTC UAT    x_nose_nexai_uat
 *
 * ONE RUN. There is nothing to set. It edits three Script Includes and one widget - each only if
 * every anchor it needs is found exactly once; otherwise that record is left untouched and the
 * output says what it actually saw.
 *
 * THE RULE
 *
 *     1. The SENDER's direction is whatever the mail states. Where it states none, the amount's
 *        sign speaks for the sender: a minus means the sender pays.
 *     2. Nomura's direction is the opposite. Always.
 *     3. Nomura's AMOUNT takes its sign from Nomura's direction:  Receive -> +   Pay -> -
 *        The magnitude never changes.
 *
 *   mail says          stored as
 *   +500 Pay           +500 Receive
 *   -500 Receive       -500 Pay
 *   +500 Receive       -500 Pay          <- the sign in the mail is IGNORED when a direction is stated
 *   -500 Pay           +500 Receive
 *    500 (none)        -500 Pay          <- no direction: unsigned means the sender receives
 *   -500 (none)        +500 Receive
 *
 * WHY THE DIRECTION WINS AND NOT THE SIGN
 * Two thirds of real settlement mails write no minus sign at all, so deciding from the sign alone
 * contradicted the ground truth on 45 of 407 rows. Direction-priority reproduces the ground truth's
 * own Nomura Amount column on 411 of its 412 rows.
 *
 * WHY IT MATTERS MORE THAN PRESENTATION
 * Compare & Match compares the two amounts RAW:  |booking - cashflow| > tolerance  ->  reject.
 * The bank bookings carry the ground truth's sign (Pay negative). A cashflow storing an unsigned
 * magnitude is therefore out by TWICE its value on every Pay row - past the tolerance of every tier.
 * Those rows cannot match today and will after this runs. That, not the display, is the point.
 *
 * WHAT IT CHANGES
 *   WizardExtractor    derives the sign from the direction as each row is written, and where the
 *                      mail stated no direction at all, sets the direction from the sign.
 *   AmountDirection    stops hiding the sign and stops flipping the direction a second time. That
 *                      double-flip existed because the stored sign and direction could disagree;
 *                      they no longer can, so flipping would invert a correct value.
 *   TaggingDashboard   the board shows the pair as stored, matching the booking beside it.
 *   Case screen        confirming a cashflow no longer rewrites a negative amount to |amount|.
 *                      That rewrite would silently undo the sign on the very record about to be
 *                      matched.
 *
 * NOT RETROSPECTIVE. Cashflows already extracted keep the values they have. Re-sync the mails to
 * bring them onto the new convention.
 *
 * SAFETY
 *   - each anchor must occur EXACTLY ONCE in the record, or that record is not written
 *   - all of a record's edits apply, or none of them - never a partial change
 *   - every write is read back and verified
 *   - IDEMPOTENT: an already-changed record reports "already applied" and is skipped
 */
(function () {

    var SITES = [{"label":"WizardExtractor  (write the sign on extraction)","table":"sys_script_include","query":"name=WizardExtractor","field":"script","done":"_signFromDirection: function","edits":[{"name":"derive the amount sign from the direction","start":"            if (col === 'ai_direction') { v = this._flipDir(v); }","end":"    },","replace":"            if (col === 'ai_direction') { v = this._flipDir(v); }  // then flip to the bank POV\n            cf.setValue(col, v);\n        }\n        this._signFromDirection(cf);   // DIRECTION PRIORITY: the sign follows Nomura's side of the trade\n    },\n\n    // DIRECTION PRIORITY - the stored amount carries the sign of NOMURA's side of the trade.\n    //\n    // A mail states a direction, an amount, and sometimes a sign, and the three do not always agree:\n    // a counterparty writes \"500 Receive\" meaning IT receives, which is Nomura paying. Reading the sign\n    // alone contradicted the ground truth on 45 of 407 rows, because two thirds of real mails carry no\n    // sign at all. So the DIRECTION decides and the sign is derived from it:\n    //\n    //     Nomura Receive -> +amount            Nomura Pay -> -amount\n    //\n    // The sign is consulted only where the mail states no direction anywhere, and there it speaks for\n    // the SENDER: a minus means the sender pays, so Nomura receives.\n    //\n    // Measured against the ground truth's own Nomura Amount column, this convention holds on 411 of its\n    // 412 rows - and the bank bookings are seeded on the same one, which is what makes a cashflow and a\n    // booking comparable as raw numbers at all. An unsigned magnitude against a signed booking is out by\n    // twice its value on every Pay row, past the tolerance of every tier, so they simply never match.\n    _signFromDirection: function (cf) {\n        var raw = '' + (cf.getValue('ai_amount') || '');\n        if (!raw) { return; }\n        var n = parseFloat(raw.replace(/[, ]/g, ''));\n        if (isNaN(n)) { return; }\n        var dir = this._normDirection(cf.getValue('ai_direction'));   // already flipped to Nomura's side\n        if (!dir) {\n            dir = (n < 0) ? 'Receive' : 'Pay';        // nothing stated: the sender's sign is the evidence\n            cf.setValue('ai_direction', dir);\n        }\n        // Keep the magnitude EXACTLY as extracted - no float round-trip, so 1234.50 stays 1234.50.\n        cf.setValue('ai_amount', (dir === 'Pay' ? '-' : '') + raw.replace(/^[-+]/, ''));\n    },"}]},{"label":"AmountDirection  (stop hiding the sign)","table":"sys_script_include","query":"name=AmountDirection","field":"script","done":"dispDir: function (amt, dir) { return this.normDir(dir); }","edits":[{"name":"header: state the new rule","start":" * AmountDirection","end":" */","replace":" * AmountDirection \u2014 the ONE source of truth for how an amount and a direction are shown together.\n *\n * It used to hide the sign: a negative amount was treated as a direction inversion, so the screens showed\n * |amount| and flipped the direction a second time. That existed because the stored sign and the stored\n * direction could disagree \u2014 the model wrote whichever the mail happened to show.\n *\n * Under DIRECTION PRIORITY they no longer can. WizardExtractor derives the sign FROM the direction on the\n * way in (Nomura Receive -> +, Nomura Pay -> -), so the pair always agrees and the sign is part of the\n * answer rather than noise: it says which side of the trade Nomura is on, and the bank bookings carry the\n * same convention. Flipping it again here would invert a value that is already right, and hiding it would\n * make a cashflow and its matching booking look different when they agree exactly.\n *\n * So both methods now pass the stored values through. They are kept \u2014 rather than deleted and their call\n * sites edited \u2014 because this is the one place the rule is stated, and a future change of mind belongs\n * here too.\n */"},{"name":"absAmt: pass the stored value through","start":"    /** Display amount:","end":"    },","replace":"    /** Display amount: the stored value as-is, sign included. */\n    absAmt: function (a) { return '' + (a == null ? '' : a); },"},{"name":"dispDir: normalise only, never flip","start":"    /** Display/normalised direction","end":"    },","replace":"    /** Display/normalised direction: normalise only. `amt` is accepted so the call sites are unchanged,\n     *  and ignored because the sign was derived from this very direction. Empty stays empty. */\n    dispDir: function (amt, dir) { return this.normDir(dir); },"}]},{"label":"TaggingDashboard  (board shows the pair as stored)","table":"sys_script_include","query":"name=TaggingDashboard","field":"script","done":"DIRECTION PRIORITY: the sign says which side","edits":[{"name":"drop the never-negative display rule","start":"                // Never surface a negative amount:","end":"this._normDir(c.ai_direction);","replace":"                // DIRECTION PRIORITY: the sign says which side of the trade Nomura is on, and the stored\n                // direction was what produced it - so show the pair exactly as stored. The old double-flip\n                // existed only because the two could disagree; now they cannot, and flipping would invert\n                // a correct value and disagree with the bank booking beside it.\n                var _dispAmt = '' + (c.ai_amount || '');\n                var _dispDir = this._normDir(c.ai_direction);"}]},{"label":"Case screen  (confirm must not rewrite the sign)","table":"sp_widget","query":"idLIKEai-extraction","field":"script","done":"Confirm stores nothing but the confirmation itself","edits":[{"name":"confirm stops normalising a negative amount away","start":"            // Normalize the pair on confirm","end":"            ccg.setValue('ai_confirmed', 'true'); ccg.update();","replace":"            // Confirm stores nothing but the confirmation itself. It used to rewrite a negative amount to\n            // |amount| with a flipped direction, which under DIRECTION PRIORITY would silently undo the\n            // sign on the very record about to be matched - and the sign is what makes it comparable to a\n            // bank booking. The pair is already correct when it arrives here; confirming must not edit it.\n            ccg.setValue('ai_confirmed', 'true'); ccg.update();"}]}];

    var ENVIRONMENTS = {
        'x_nose_nfotc_bsm':  'NexAI OTC BSM',
        'x_nose_nexai_dev':  'NexAI OTC Dev',
        'x_nose_nexai_test': 'NexAI OTC Test',
        'x_nose_nexai_uat':  'NexAI OTC UAT'
    };

    var SCOPE = '' + gs.getCurrentScopeName();
    if (!ENVIRONMENTS[SCOPE]) {
        gs.error('[AMTSIGN] ABORT: Application is "' + SCOPE + '", not a NexAI OTC environment.');
        for (var k in ENVIRONMENTS) {
            if (ENVIRONMENTS.hasOwnProperty(k)) { gs.error('[AMTSIGN]     ' + ENVIRONMENTS[k] + '   (' + k + ')'); }
        }
        return;
    }

    gs.info('[AMTSIGN] ================================================================');
    gs.info('[AMTSIGN] environment : ' + ENVIRONMENTS[SCOPE] + '   (' + SCOPE + ')');
    gs.info('[AMTSIGN] mode        : applying - per record, every edit or none');
    gs.info('[AMTSIGN] ================================================================');

    var changed = 0, already = 0, failed = 0;

    for (var s = 0; s < SITES.length; s++) {
        var site = SITES[s];
        gs.info('[AMTSIGN]');
        gs.info('[AMTSIGN] ' + site.label);

        var gr = new GlideRecord(site.table);
        gr.addEncodedQuery(site.query + '^sys_scope.scope=' + SCOPE);
        gr.query();

        if (!gr.hasNext()) {
            gs.error('[AMTSIGN]   NOT FOUND in this scope (' + site.table + ': ' + site.query + ')');
            failed++;
            continue;
        }

        while (gr.next()) {
            var id = gr.getUniqueValue();
            var src = '' + (gr.getValue(site.field) || '');
            var who = '' + (gr.getValue('name') || gr.getValue('id') || site.table);

            if (src.indexOf(site.done) > -1) {
                gs.info('[AMTSIGN]   ' + who + ': already applied, skipped.');
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
                    gs.error('[AMTSIGN]   "' + ed.name + '": start anchor found ' + n + ' times, expected 1.');
                    ok = false;
                    break;
                }
                var i = out.indexOf(start);
                var j = out.indexOf(endAt, i);
                if (j === -1) {
                    gs.error('[AMTSIGN]   "' + ed.name + '": end anchor not found after the start.');
                    ok = false;
                    break;
                }
                out = out.substring(0, i) + repl + out.substring(j + endAt.length);
                gs.info('[AMTSIGN]   - ' + ed.name);
            }

            if (!ok) {
                gs.error('[AMTSIGN]   ' + who + ': NOT APPLIED - nothing written. This record differs from');
                gs.error('[AMTSIGN]   the version this script was built against. Send the line above back.');
                failed++;
                continue;
            }

            gs.info('[AMTSIGN]   ' + who + ': ' + src.length + ' -> ' + out.length + ' chars');

            gr.setValue(site.field, out);
            if (!gr.update()) {
                gs.error('[AMTSIGN]   ' + who + ': UPDATE REFUSED (read-only app, or wrong scope?)');
                failed++;
                continue;
            }
            // Read back - a refused scoped write looks exactly like success otherwise.
            var v = new GlideRecord(site.table);
            v.get(id);
            if (('' + (v.getValue(site.field) || '')).indexOf(site.done) === -1) {
                gs.error('[AMTSIGN]   ' + who + ': WRITE DID NOT STICK.');
                failed++;
            } else {
                gs.info('[AMTSIGN]   applied and verified.');
                changed++;
            }
        }
    }

    gs.info('[AMTSIGN]');
    gs.info('[AMTSIGN] ================================================================');
    gs.info('[AMTSIGN] changed : ' + changed + '   already applied: ' + already + '   FAILED: ' + failed);
    if (!failed) {
        gs.info('[AMTSIGN]');
        gs.info('[AMTSIGN] Done. Repeat with the Application set to each other environment.');
        gs.info('[AMTSIGN]');
        gs.info('[AMTSIGN] NEXT: RE-SYNC THE MAILS. Cashflows already extracted keep their old');
        gs.info('[AMTSIGN] unsigned amounts - the new rule applies as each row is written, so the');
        gs.info('[AMTSIGN] current corpus only moves onto it when it is extracted again.');
        gs.info('[AMTSIGN]');
        gs.info('[AMTSIGN] Then look at a Pay row on the board: the amount should read negative and');
        gs.info('[AMTSIGN] agree with the bank booking beside it. Those are the rows that could not');
        gs.info('[AMTSIGN] match before, because an unsigned magnitude against a signed booking is');
        gs.info('[AMTSIGN] out by twice its value.');
    } else {
        gs.warn('[AMTSIGN]');
        gs.warn('[AMTSIGN] Some records were NOT changed - see above. Nothing partial was saved.');
    }
    gs.info('[AMTSIGN] ================================================================');
})();
