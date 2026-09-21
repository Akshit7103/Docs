/**
 * MAKE THE COUNTERPARTY EVE-DERIVED ONLY - CODE **AND** DATA, IN ONE RUN PER SCOPE
 *
 * Scripts - Background.  "Execute in sandbox?" UNCHECKED.
 * APPLICATION = the environment to fix. Run it ONCE PER SCOPE, unchanged:
 *     NexAI OTC BSM    x_nose_nfotc_bsm
 *     NexAI OTC Dev    x_nose_nexai_dev
 *     NexAI OTC Test   x_nose_nexai_test
 *     NexAI OTC UAT    x_nose_nexai_uat
 *
 * >>> FIRST RUN IT WITH DRY_RUN = true (the default) AND READ THE OUTPUT. <<<
 * Then set DRY_RUN = false and run it again to apply. It edits live Script Includes and widgets,
 * which is worth looking at once before it happens.
 *
 * THE RULE BEING ENFORCED
 * The counterparty is DERIVED from the sender via the EVE directory. That is the value the matcher
 * uses (CompareMatch reads email.counterparty_name) and it is the only authoritative one. It is
 * NEVER AI-extracted. Production never offered an AI "Counterparty Name" field; the later 13-field
 * catalogue added one to the bsm line, which put TWO counterparties on the case screen - and the one
 * the analyst could see, badged "AI", was not the one the matcher used.
 *
 * SIX THINGS IT FIXES, per scope:
 *   1. WizardExtractor       drop the 'counterparty name' -> ai_counterparty column mapping, so no
 *                            wizard field can route a model-read name into the cashflow.
 *   2. ExtractionConfidence  counterparty is always graded 'derived', never as an AI text field.
 *   3. TaggingDashboard      the board read cf.ai_counterparty when cashflows existed but the
 *                            email's EVE name when they did not - so ONE mail showed two different
 *                            counterparties depending on whether extraction had run yet. Both
 *                            branches now read the EVE value.
 *   4. ai-extraction widget  the case screen reads EVE only; the AI fallback and the "AI read: x"
 *      (server)              second line are removed.
 *   5. ai-extraction widget  the "AI" badge and its confidence chip are removed; it always shows
 *      (template)            "Derived . EVE".
 *   6. wizard-builder widget "Counterparty Name" is removed from the pickable field catalogue, so
 *                            nobody can rebuild this by ticking a box.
 *   + the published WORK DRIVERS: the field is stripped from input_fields and mapping.
 *
 * SAFETY
 *   - Every edit checks its anchor text exists and is UNIQUE before touching anything.
 *   - A record is written only if ALL of its edits matched. A partial patch is never saved.
 *   - Every write is read back and verified.
 *   - IDEMPOTENT: an already-fixed record reports "already fixed" and is skipped.
 *   - The ai_counterparty COLUMN and any values already in it are left alone. Nothing reads them
 *     now; deleting data to tidy a display is not worth the risk and old records need the column.
 *
 * EXPECT THE COUNTERPARTY TO GO BLANK on real mail. The EVE directory is seeded with synthetic rows
 * (Counterparty1..19 at *.example) which match no real sender, so the derived value is empty and the
 * AI fallback was hiding that. Blank is the honest answer and the signal to seed EVE properly.
 */
(function () {

    var DRY_RUN = true;          // <<< set to false to actually apply

    var ENVIRONMENTS = {
        'x_nose_nfotc_bsm':  'NexAI OTC BSM',
        'x_nose_nexai_dev':  'NexAI OTC Dev',
        'x_nose_nexai_test': 'NexAI OTC Test',
        'x_nose_nexai_uat':  'NexAI OTC UAT'
    };

    var SCOPE = '' + gs.getCurrentScopeName();
    if (!ENVIRONMENTS[SCOPE]) {
        gs.error('[CPFIX] ABORT: Application is "' + SCOPE + '", not a NexAI OTC environment.');
        for (var k in ENVIRONMENTS) {
            if (ENVIRONMENTS.hasOwnProperty(k)) { gs.error('[CPFIX]     ' + ENVIRONMENTS[k] + '   (' + k + ')'); }
        }
        return;
    }

    var EMAIL_T = SCOPE + '_email';
    var CASHFLOW_T = SCOPE + '_cashflow';
    var WIZ_T = SCOPE + '_wizard';

    gs.info('[CPFIX] ================================================================');
    gs.info('[CPFIX] environment : ' + ENVIRONMENTS[SCOPE] + '   (' + SCOPE + ')');
    gs.info('[CPFIX] mode        : ' + (DRY_RUN ? 'DRY RUN - nothing will be written' : 'APPLYING CHANGES'));
    gs.info('[CPFIX] ================================================================');

    var applied = 0, skipped = 0, failed = 0;

    // ------------------------------------------------------------------ edit engine
    // An edit is {find, replace, optional}. `find` must occur EXACTLY ONCE unless optional.
    function runEdits(src, edits, label) {
        var out = src, notes = [], i;
        for (i = 0; i < edits.length; i++) {
            var e = edits[i];
            var n = out.split(e.find).length - 1;
            if (n === 0) {
                if (e.optional) { notes.push('  - "' + e.name + '" not present (ok)'); continue; }
                return { err: 'anchor NOT FOUND: ' + e.name };
            }
            if (n > 1) { return { err: 'anchor NOT UNIQUE (' + n + 'x): ' + e.name }; }
            out = out.replace(e.find, e.replace);
            notes.push('  - ' + e.name);
        }
        return { text: out, notes: notes };
    }

    function patchRecord(table, query, field, edits, doneMarker, label) {
        var gr = new GlideRecord(table);
        gr.addEncodedQuery(query);
        gr.query();
        if (!gr.hasNext()) {
            gs.warn('[CPFIX] ' + label + ': no record matched (' + table + ' / ' + query + ')');
            return;
        }
        while (gr.next()) {
            var id = gr.getUniqueValue();
            var src = '' + (gr.getValue(field) || '');
            var who = label + '  [' + (gr.getValue('name') || gr.getValue('id') || id) + ']';

            if (doneMarker && src.indexOf(doneMarker) > -1) {
                gs.info('[CPFIX] ' + who + ': already fixed, skipped.');
                skipped++;
                continue;
            }

            var r = runEdits(src, edits, label);
            if (r.err) {
                gs.error('[CPFIX] ' + who + ': NOT PATCHED - ' + r.err);
                gs.error('[CPFIX]   Nothing was written to this record. The code here differs from the');
                gs.error('[CPFIX]   expected version - send this line back rather than editing by hand.');
                failed++;
                continue;
            }

            gs.info('[CPFIX] ' + who + ': ' + src.length + ' -> ' + r.text.length + ' chars');
            for (var j = 0; j < r.notes.length; j++) { gs.info('[CPFIX] ' + r.notes[j]); }

            if (DRY_RUN) { applied++; continue; }

            gr.setValue(field, r.text);
            if (!gr.update()) {
                gs.error('[CPFIX] ' + who + ': UPDATE REFUSED (read-only app, or wrong scope?)');
                failed++;
                continue;
            }
            // Read back - a refused scoped write can look exactly like success.
            var v = new GlideRecord(table);
            v.get(id);
            var back = '' + (v.getValue(field) || '');
            if (doneMarker && back.indexOf(doneMarker) === -1) {
                gs.error('[CPFIX] ' + who + ': WRITE DID NOT STICK.');
                failed++;
            } else {
                gs.info('[CPFIX] ' + who + ': applied and verified.');
                applied++;
            }
        }
    }

    // ================================================================== 1. WizardExtractor
    gs.info('[CPFIX]');
    gs.info('[CPFIX] ---- 1. WizardExtractor: stop storing an AI counterparty ----');
    patchRecord('sys_script_include', 'name=WizardExtractor^sys_scope.scope=' + SCOPE, 'script', [
        { name: 'remove the ai_counterparty column mapping',
          find: "        'counterparty name': 'ai_counterparty',",
          replace: "        // NO 'counterparty name' entry: the counterparty is derived from the sender via the\n" +
                   "        // EVE directory and is never AI-extracted, so no wizard field can write one.\n" +
                   "        // (removed 2026-09-21) 'counterparty name':" }
    ], "NO 'counterparty name' entry", 'WizardExtractor');

    // ================================================================== 2. ExtractionConfidence
    gs.info('[CPFIX]');
    gs.info('[CPFIX] ---- 2. ExtractionConfidence: counterparty is always "derived" ----');
    patchRecord('sys_script_include', 'name=ExtractionConfidence^sys_scope.scope=' + SCOPE, 'script', [
        // The line we KEEP ends with a reason string containing an em dash, so the whole block
        // cannot be matched literally. Match down to the start of that line instead and leave a bare
        // block behind: valid JS, minimal diff, and no dead `if (false)` for the next reader.
        { name: 'never grade the counterparty as AI',
          find: "        if (fields.counterpartySource === 'ai') {\n" +
                "            put('counterparty', 'text', fields.counterparty);\n" +
                "        } else {\n" +
                "            out.counterparty",
          replace: "        // Counterparty is ALWAYS derived from the sender via the EVE directory, so it never\n" +
                   "        // carries an AI confidence grade. Grading it would imply the model had a say in the\n" +
                   "        // value, which it does not.\n" +
                   "        {\n" +
                   "            out.counterparty" }
        // NOTE: this marker must be a phrase that sits WHOLLY ON ONE LINE of the replacement text.
        // A marker spanning a line break is never found on read-back, and a record that patched
        // perfectly well gets reported as "WRITE DID NOT STICK".
    ], 'ALWAYS derived from the sender via the EVE directory', 'ExtractionConfidence');

    // ================================================================== 3. TaggingDashboard
    gs.info('[CPFIX]');
    gs.info('[CPFIX] ---- 3. TaggingDashboard: the board shows the EVE counterparty ----');
    patchRecord('sys_script_include', 'name=TaggingDashboard^sys_scope.scope=' + SCOPE, 'script', [
        { name: 'look the EVE counterparty up once per email',
          find: "    _cashflows: function (emailId) {\n" +
                "        var out = [];\n" +
                "        var cf = new GlideRecord('" + CASHFLOW_T + "');",
          replace: "    _cashflows: function (emailId) {\n" +
                   "        var out = [];\n" +
                   "        // The counterparty is derived from the sender via EVE and lives on the EMAIL, not the\n" +
                   "        // cashflow. Read it once so every row carries the same authoritative value; the\n" +
                   "        // cashflow's ai_counterparty column is no longer written and must not be shown.\n" +
                   "        var cpty = '';\n" +
                   "        var _em = new GlideRecord('" + EMAIL_T + "');\n" +
                   "        if (_em.get(emailId)) { cpty = '' + (_em.getValue('counterparty_name') || ''); }\n" +
                   "        var cf = new GlideRecord('" + CASHFLOW_T + "');" },
        { name: 'row payload carries the EVE value',
          find: "                ai_counterparty: cf.getValue('ai_counterparty'),",
          replace: "                ai_counterparty: cpty," }
    ], 'no longer written and must not be shown', 'TaggingDashboard');

    // ================================================================== 4+5. ai-extraction widget
    gs.info('[CPFIX]');
    gs.info('[CPFIX] ---- 4. case screen (server): read EVE only ----');
    patchRecord('sp_widget', 'scriptLIKE_cpEve^sys_scope.scope=' + SCOPE, 'script', [
        { name: 'drop the AI fallback and the disagreement line',
          find: "    var _cpEve = gr.getValue('counterparty_name') || '';",
          replace: "    // Counterparty is DERIVED from the sender via EVE and that is its ONLY source - never\n" +
                   "    // AI-extracted. When the sender is not in the directory this stays BLANK: that is the\n" +
                   "    // honest answer, and the signal to add the sender to EVE rather than to guess.\n" +
                   "    var _cpEve = gr.getValue('counterparty_name') || '';" },
        { name: 'counterparty = EVE',
          find: "    data.counterparty = _cpEve || _cpAi;",
          replace: "    data.counterparty = _cpEve;" },
        { name: 'source is eve or nothing',
          find: "    data.counterpartySource = _cpEve ? 'eve' : (_cpAi ? 'ai' : '');",
          replace: "    data.counterpartySource = _cpEve ? 'eve' : '';" },
        { name: 'no second "AI read" value',
          find: "    data.counterpartyAi = (_cpEve && _cpAi && _cpEve.toLowerCase().replace(/[^a-z0-9]/g, '') !== _cpAi.toLowerCase().replace(/[^a-z0-9]/g, '')) ? _cpAi : '';",
          replace: "    data.counterpartyAi = '';" }
    ], 'that is its ONLY source', 'ai-extraction (server)');

    gs.info('[CPFIX]');
    gs.info('[CPFIX] ---- 5. case screen (template): remove the AI badge ----');
    patchRecord('sp_widget', 'templateLIKEcounterpartySource^sys_scope.scope=' + SCOPE, 'template', [
        { name: 'always show "Derived . EVE"',
          find: "Counterparty <span class=\"prov prov-pcm\" ng-if=\"c.data.counterpartySource !== 'ai'\">Derived &#183; EVE</span>",
          replace: "Counterparty <span class=\"prov prov-pcm\">Derived &#183; EVE</span>" },
        { name: 'remove the AI badge',
          find: "<span class=\"prov prov-ai\" ng-if=\"c.data.counterpartySource === 'ai'\" title=\"Not in the EVE directory - name read from the email by the AI\">AI</span>",
          replace: "",
          optional: true },
        { name: 'remove the confidence chip',
          find: "<span ng-if=\"c.data.counterpartySource === 'ai' &amp;&amp; c.data.conf.counterparty.level !== 'absent'\" class=\"conf conf-{{c.data.conf.counterparty.level}}\" title=\"{{c.data.conf.counterparty.reason}}\">{{c.data.conf.counterparty.label}}</span>",
          replace: "",
          optional: true },
        { name: 'remove the "AI read:" second line',
          find: "<span class=\"nom-fai\" ng-if=\"c.data.counterpartyAi\">AI read: {{c.data.counterpartyAi}}</span>",
          replace: "",
          optional: true }
    ], "prov prov-pcm\">Derived", 'ai-extraction (template)');

    // ================================================================== 6. wizard-builder catalogue
    gs.info('[CPFIX]');
    gs.info('[CPFIX] ---- 6. Wizard Builder: stop offering the field ----');
    var wb = new GlideRecord('sp_widget');
    wb.addEncodedQuery('scriptLIKECounterparty Name^sys_scope.scope=' + SCOPE);
    wb.query();
    while (wb.next()) {
        var wid = wb.getUniqueValue();
        var ws = '' + (wb.getValue('script') || '');
        var name = '' + (wb.getValue('id') || wid);

        var START = '{ name: "Counterparty Name", type: "string", mandatory: false,';
        if (ws.indexOf(START) === -1) {
            gs.info('[CPFIX] wizard-builder [' + name + ']: already fixed, skipped.');
            skipped++;
            continue;
        }
        // The entry ends where the NEXT catalogue entry begins. Anchoring on the next entry rather
        // than guessing the closing brace keeps the prompt text (which contains braces) intact.
        var NEXT = '{ name: "Nomura Entity", type: "string", mandatory: false,';
        var a = ws.indexOf(START), b = ws.indexOf(NEXT, a);
        if (b === -1) {
            gs.error('[CPFIX] wizard-builder [' + name + ']: cannot find the next catalogue entry.');
            gs.error('[CPFIX]   NOT PATCHED. The catalogue differs from the expected version.');
            failed++;
            continue;
        }
        var removed = b - a;
        var note = '// "Counterparty Name" is deliberately NOT offered: the counterparty is derived\n' +
                   '            // from the sender via EVE, the matcher ignores any AI-read name, and offering it\n' +
                   '            // here only puts a second, disagreeing value on the screen.\n            ';
        var newWs = ws.substring(0, a) + note + ws.substring(b);

        gs.info('[CPFIX] wizard-builder [' + name + ']: removing the catalogue entry (' + removed + ' chars)');
        if (DRY_RUN) { applied++; continue; }

        wb.setValue('script', newWs);
        if (!wb.update()) { gs.error('[CPFIX] wizard-builder [' + name + ']: UPDATE REFUSED.'); failed++; continue; }
        var vv = new GlideRecord('sp_widget');
        vv.get(wid);
        if (('' + vv.getValue('script')).indexOf(START) > -1) {
            gs.error('[CPFIX] wizard-builder [' + name + ']: WRITE DID NOT STICK.');
            failed++;
        } else {
            gs.info('[CPFIX] wizard-builder [' + name + ']: applied and verified.');
            applied++;
        }
    }

    // ================================================================== 7. the work drivers (DATA)
    gs.info('[CPFIX]');
    gs.info('[CPFIX] ---- 7. work drivers: stop asking the model for it ----');
    var drivers = 0;
    var w = new GlideRecord(WIZ_T);
    w.query();
    while (w.next()) {
        var dn = '' + w.getValue('name');
        var rawF = '' + (w.getValue('input_fields') || '[]');
        var rawM = '' + (w.getValue('mapping') || '{}');
        var fields, mapping;
        try { fields = JSON.parse(rawF); } catch (e1) { fields = null; }
        try { mapping = JSON.parse(rawM); } catch (e2) { mapping = null; }
        if (!(fields instanceof Array)) {
            gs.error('[CPFIX] driver "' + dn + '": input_fields is not readable JSON, SKIPPED.');
            continue;
        }

        var kept = [], dropped = [];
        for (var q = 0; q < fields.length; q++) {
            var f = fields[q] || {};
            if (('' + (f.name || '')).toLowerCase().replace(/^\s+|\s+$/g, '') === 'counterparty name') {
                dropped.push('' + f.name);
            } else { kept.push(f); }
        }
        var mapDrop = [];
        if (mapping && typeof mapping === 'object') {
            for (var mk in mapping) {
                if (mapping.hasOwnProperty(mk) && ('' + mk).toLowerCase() === 'counterparty name') {
                    mapDrop.push(mk); delete mapping[mk];
                }
            }
        }
        if (!dropped.length && !mapDrop.length) {
            gs.info('[CPFIX] driver "' + dn + '" [' + (w.getValue('status') || 'draft') + ']: nothing to do (' + fields.length + ' fields)');
            continue;
        }
        gs.info('[CPFIX] driver "' + dn + '" [' + (w.getValue('status') || 'draft') + ']: ' +
                fields.length + ' -> ' + kept.length + ' fields' +
                (mapDrop.length ? (', mapping entry removed') : ''));
        drivers++;
        if (DRY_RUN) { continue; }
        w.setValue('input_fields', JSON.stringify(kept));
        if (mapDrop.length && mapping) { w.setValue('mapping', JSON.stringify(mapping)); }
        if (!w.update()) { gs.error('[CPFIX] driver "' + dn + '": UPDATE REFUSED.'); failed++; }
    }

    // ================================================================== summary
    gs.info('[CPFIX]');
    gs.info('[CPFIX] ================================================================');
    gs.info('[CPFIX] ' + (DRY_RUN ? 'WOULD CHANGE' : 'changed') + ' : ' + applied + ' code record(s), ' + drivers + ' work driver(s)');
    gs.info('[CPFIX] already fixed : ' + skipped);
    gs.info('[CPFIX] FAILED        : ' + failed);
    if (DRY_RUN) {
        gs.info('[CPFIX]');
        gs.info('[CPFIX] This was a DRY RUN. Nothing was written. If the list above looks right,');
        gs.info('[CPFIX] set DRY_RUN = false at the top and run it again.');
    } else if (!failed) {
        gs.info('[CPFIX]');
        gs.info('[CPFIX] Done. Repeat with the Application set to each other NexAI OTC environment.');
        gs.info('[CPFIX] The case screen now shows only "Derived . EVE". Where the sender is not in the');
        gs.info('[CPFIX] EVE directory it will be BLANK - correct, and the cue to seed EVE.');
        gs.info('[CPFIX] Existing cashflows keep their old ai_counterparty value; nothing reads it.');
    } else {
        gs.warn('[CPFIX]');
        gs.warn('[CPFIX] Some records were NOT patched - see the lines above. Nothing partial was saved.');
    }
    gs.info('[CPFIX] ================================================================');
})();
