/**
 * ONE MAIL, ONE COUNTERPARTY  -  the code change AND the repair of rows already extracted
 *
 * Scripts - Background.  "Execute in sandbox?" UNCHECKED.
 * APPLICATION = the environment to change. Run it ONCE PER SCOPE, unchanged:
 *     NexAI OTC BSM    x_nose_nfotc_bsm
 *     NexAI OTC Dev    x_nose_nexai_dev
 *     NexAI OTC Test   x_nose_nexai_test
 *     NexAI OTC UAT    x_nose_nexai_uat
 *
 * ONE RUN. There is nothing to set. It does two things: patches the extractor so this cannot happen
 * again, and repairs the cashflows that are already wrong so no re-sync is needed.
 *
 * THE PROBLEM
 * The counterparty is a fact about the MAIL - one sender, one trading party - but the prompt asks for
 * it on every ROW, and a big mail is extracted in several concurrent calls. Each call decides it again
 * from scratch, and N answers do not always agree.
 *
 * Seen on the 61-row payment confirmation, split into 8 calls: seven returned "OCBC Bank" and one
 * returned nothing, leaving exactly its 8 consecutive rows blank. The SAME mail extracted again filled
 * all 61 - so this is variance between calls, not a mail the model cannot read. Hoping the calls agree
 * is not a fix; the rows have to be made to agree.
 *
 * THE RULE
 *   - the most frequent non-blank counterparty across the mail wins
 *   - a tie goes to the LONGER string - the fuller legal name, "OCBC Bank" over "OCBC"
 *   - where no call found a name at all, every row stays blank so the Eve directory fallback still
 *     applies; inventing one would be worse than admitting none
 *
 * It matches the rule the case screen already enforces - correcting the counterparty writes it to every
 * cashflow of the mail - so the extractor and the analyst now agree by construction rather than by luck.
 *
 * WHAT IT DOES
 *   1. CODE   adds the pass to WizardExtractor and calls it once a mail's rows are written. Every future
 *             extraction is self-consistent.
 *   2. REPAIR walks every mail already extracted in this scope and applies the same rule to its existing
 *             cashflows. This is why no re-sync is needed - the rows are corrected in place.
 *
 * The repair is the SAME rule as the code, deliberately, so a repaired mail and a freshly extracted one
 * cannot end up different.
 *
 * SAFETY
 *   - the code anchors must be found, or nothing is written
 *   - both code edits apply, or neither
 *   - the code write is read back and verified
 *   - the repair only ever writes a value that ANOTHER ROW OF THE SAME MAIL already carried; it never
 *     invents a name and never touches a mail where no row has one
 *   - IDEMPOTENT: an already-patched record is skipped, and a repaired mail reports 0 changes next time
 */
(function () {

    var SITES = [{"label":"WizardExtractor  (one mail, one counterparty)","table":"sys_script_include","query":"name=WizardExtractor","field":"script","done":"_normaliseCounterparty: function","edits":[{"name":"call the pass once the mail's rows are written","start":"            res.cashflows++;\n        }\n","end":"            res.cashflows++;\n        }\n","replace":"            res.cashflows++;\n        }\n\n        this._normaliseCounterparty(_cfIds);"},{"name":"add the pass itself","start":"    // Run the body/Excel text-only extraction (no attachments). Best-effort: result or null on throw.","end":"    // Run the body/Excel text-only extraction (no attachments). Best-effort: result or null on throw.","replace":"    // ONE MAIL, ONE COUNTERPARTY.\n    //\n    // The counterparty is a fact about the MAIL - one sender, one trading party - but the prompt asks for\n    // it on every ROW, and a big mail is extracted in several concurrent calls. Each call therefore decides\n    // it again from scratch, and N answers do not always agree: on a 61-row mail split into 8 calls, seven\n    // returned \"OCBC Bank\" and one returned nothing, leaving exactly its 8 rows blank. The same mail run\n    // again filled all 61 - so this is variance between calls, not a mail the model cannot read.\n    //\n    // Rather than hope the calls agree, take the answer the mail as a whole gave and apply it to every row:\n    // the most frequent non-blank value wins, and a tie goes to the longer string (the fuller legal name,\n    // \"OCBC Bank\" over \"OCBC\"). Where no call found a name at all, leave every row blank so the Eve\n    // directory fallback still applies - inventing one would be worse than admitting none.\n    //\n    // This runs at extraction only, before any analyst has touched the rows, and it matches the rule the\n    // case screen already enforces: correcting the counterparty writes it to every cashflow of the mail.\n    // The extractor and the analyst now agree by construction rather than by luck.\n    _normaliseCounterparty: function (cfIds) {\n        if (!cfIds || !cfIds.length) { return; }\n        var rows = [], counts = {}, best = '', bestN = 0, v, i;\n        var gr = new GlideRecord('x_nose_nfotc_bsm_cashflow');\n        gr.addQuery('sys_id', 'IN', cfIds.join(','));\n        gr.query();\n        while (gr.next()) {\n            v = ('' + (gr.getValue('ai_counterparty') || '')).trim();\n            rows.push({ id: gr.getUniqueValue(), v: v });\n            if (v) { counts[v] = (counts[v] || 0) + 1; }\n        }\n        for (v in counts) {\n            if (!counts.hasOwnProperty(v)) { continue; }\n            if (counts[v] > bestN || (counts[v] === bestN && v.length > best.length)) { best = v; bestN = counts[v]; }\n        }\n        if (!best) { return; }\n        var fixed = 0;\n        for (i = 0; i < rows.length; i++) {\n            if (rows[i].v === best) { continue; }\n            var u = new GlideRecord('x_nose_nfotc_bsm_cashflow');\n            if (u.get(rows[i].id)) { u.setValue('ai_counterparty', best); u.update(); fixed++; }\n        }\n        if (fixed) {\n            gs.info('[WizardExtractor] counterparty normalised to \"' + best + '\" on ' + fixed +\n                    ' of ' + rows.length + ' cashflow(s) - the calls did not agree.');\n        }\n    },\n\n    // Run the body/Excel text-only extraction (no attachments). Best-effort: result or null on throw."}]}];

    var ENVIRONMENTS = {
        'x_nose_nfotc_bsm':  'NexAI OTC BSM',
        'x_nose_nexai_dev':  'NexAI OTC Dev',
        'x_nose_nexai_test': 'NexAI OTC Test',
        'x_nose_nexai_uat':  'NexAI OTC UAT'
    };

    var SCOPE = '' + gs.getCurrentScopeName();
    if (!ENVIRONMENTS[SCOPE]) {
        gs.error('[CP1] ABORT: Application is "' + SCOPE + '", not a NexAI OTC environment.');
        for (var k in ENVIRONMENTS) {
            if (ENVIRONMENTS.hasOwnProperty(k)) { gs.error('[CP1]     ' + ENVIRONMENTS[k] + '   (' + k + ')'); }
        }
        return;
    }

    gs.info('[CP1] ================================================================');
    gs.info('[CP1] environment : ' + ENVIRONMENTS[SCOPE] + '   (' + SCOPE + ')');
    gs.info('[CP1] ================================================================');

    var changed = 0, already = 0, failed = 0;

    // ---------------------------------------------------------------- 1. the code
    gs.info('[CP1]');
    gs.info('[CP1] ---- 1. patch the extractor ----');
    for (var s = 0; s < SITES.length; s++) {
        var site = SITES[s];
        var gr = new GlideRecord(site.table);
        gr.addEncodedQuery(site.query + '^sys_scope.scope=' + SCOPE);
        gr.query();
        if (!gr.hasNext()) { gs.error('[CP1]   NOT FOUND: ' + site.label); failed++; continue; }

        while (gr.next()) {
            var id = gr.getUniqueValue();
            var src = '' + (gr.getValue(site.field) || '');
            if (src.indexOf(site.done) > -1) {
                gs.info('[CP1]   ' + site.label + ': already applied, skipped.');
                already++;
                continue;
            }
            var out = src, ok = true;
            for (var e = 0; e < site.edits.length; e++) {
                var ed = site.edits[e];
                // The table names are baked into this record, so the cut code carries the scope it came
                // from; retarget before matching.
                var start = ed.start.split('x_nose_nfotc_bsm').join(SCOPE);
                var endAt = ed.end.split('x_nose_nfotc_bsm').join(SCOPE);
                var repl = ed.replace.split('x_nose_nfotc_bsm').join(SCOPE);
                var n = out.split(start).length - 1;
                if (n !== 1) {
                    gs.error('[CP1]   "' + ed.name + '": anchor found ' + n + ' times, expected 1.');
                    ok = false;
                    break;
                }
                var i = out.indexOf(start);
                var j = out.indexOf(endAt, i);
                if (j === -1) { gs.error('[CP1]   "' + ed.name + '": end anchor missing.'); ok = false; break; }
                out = out.substring(0, i) + repl + out.substring(j + endAt.length);
                gs.info('[CP1]   - ' + ed.name);
            }
            if (!ok) {
                gs.error('[CP1]   NOT APPLIED - nothing written. This record differs from the version this');
                gs.error('[CP1]   script was built against. Send the line above back.');
                failed++;
                continue;
            }
            gs.info('[CP1]   WizardExtractor: ' + src.length + ' -> ' + out.length + ' chars');
            gr.setValue(site.field, out);
            if (!gr.update()) { gs.error('[CP1]   UPDATE REFUSED.'); failed++; continue; }
            var v = new GlideRecord(site.table);
            v.get(id);
            if (('' + (v.getValue(site.field) || '')).indexOf(site.done) === -1) {
                gs.error('[CP1]   WRITE DID NOT STICK.');
                failed++;
            } else {
                gs.info('[CP1]   applied and verified.');
                changed++;
            }
        }
    }

    // ---------------------------------------------------------------- 2. repair what is already there
    gs.info('[CP1]');
    gs.info('[CP1] ---- 2. repair the cashflows already extracted ----');

    var CF = SCOPE + '_cashflow';
    var EM = SCOPE + '_email';

    // Group every cashflow by its parent mail. Reading in one pass and grouping in memory keeps this to
    // a single query however many mails there are.
    var byMail = {}, order = [], total = 0;
    var cg = new GlideRecord(CF);
    cg.orderBy('email');
    cg.orderBy('flow_index');
    cg.query();
    while (cg.next()) {
        var em = '' + (cg.getValue('email') || '');
        if (!em) { continue; }
        if (!byMail[em]) { byMail[em] = []; order.push(em); }
        byMail[em].push({ id: cg.getUniqueValue(), v: ('' + (cg.getValue('ai_counterparty') || '')).trim() });
        total++;
    }
    gs.info('[CP1]   ' + total + ' cashflow(s) across ' + order.length + ' mail(s)');

    var mailsFixed = 0, rowsFixed = 0, mailsBlank = 0, mailsOk = 0;
    for (var m = 0; m < order.length; m++) {
        var rows = byMail[order[m]];
        var counts = {}, best = '', bestN = 0, vv, r;

        for (r = 0; r < rows.length; r++) {
            vv = rows[r].v;
            if (vv) { counts[vv] = (counts[vv] || 0) + 1; }
        }
        for (vv in counts) {
            if (!counts.hasOwnProperty(vv)) { continue; }
            // most frequent wins; a tie goes to the longer string (the fuller legal name)
            if (counts[vv] > bestN || (counts[vv] === bestN && vv.length > best.length)) { best = vv; bestN = counts[vv]; }
        }

        if (!best) { mailsBlank++; continue; }        // no row has a name - leave it to the Eve fallback

        var diff = 0;
        for (r = 0; r < rows.length; r++) { if (rows[r].v !== best) { diff++; } }
        if (!diff) { mailsOk++; continue; }

        var mailId = '';
        var eg = new GlideRecord(EM);
        if (eg.get(order[m])) { mailId = '' + (eg.getValue('name') || ''); }

        var wrote = 0;
        for (r = 0; r < rows.length; r++) {
            if (rows[r].v === best) { continue; }
            var u = new GlideRecord(CF);
            if (u.get(rows[r].id)) {
                u.setValue('ai_counterparty', best);
                if (u.update()) { wrote++; }
            }
        }
        mailsFixed++;
        rowsFixed += wrote;
        gs.info('[CP1]   ' + mailId.substring(0, 52) + ' : ' + wrote + ' of ' + rows.length +
                ' row(s) set to "' + best + '"');
    }

    gs.info('[CP1]');
    gs.info('[CP1]   mails repaired        : ' + mailsFixed + '   (' + rowsFixed + ' cashflow(s) changed)');
    gs.info('[CP1]   mails already correct : ' + mailsOk);
    gs.info('[CP1]   mails with no name at all : ' + mailsBlank + '   (left blank for the Eve fallback)');

    // ---------------------------------------------------------------- summary
    gs.info('[CP1]');
    gs.info('[CP1] ================================================================');
    gs.info('[CP1] code: changed ' + changed + '   already applied ' + already + '   FAILED ' + failed);
    gs.info('[CP1] data: ' + rowsFixed + ' cashflow(s) across ' + mailsFixed + ' mail(s) repaired');
    if (!failed) {
        gs.info('[CP1]');
        gs.info('[CP1] Done. Repeat with the Application set to each other environment.');
        gs.info('[CP1]');
        gs.info('[CP1] NO RE-SYNC NEEDED - the existing rows were corrected in place, and every future');
        gs.info('[CP1] extraction normalises itself before the cashflows are handed on.');
        gs.info('[CP1] Open the big mail and page through it: every cashflow should now carry the same');
        gs.info('[CP1] counterparty, including the block that was blank.');
    } else {
        gs.warn('[CP1]');
        gs.warn('[CP1] Some steps FAILED - see above. Nothing partial was saved to the code.');
    }
    gs.info('[CP1] ================================================================');
})();
