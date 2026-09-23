/**
 * PUT THE AI COUNTERPARTY BACK - the exact inverse of the 21 September change
 *
 * Scripts - Background.  "Execute in sandbox?" UNCHECKED.
 * APPLICATION = the environment to revert. Run it ONCE PER SCOPE, unchanged:
 *     NexAI OTC BSM    x_nose_nfotc_bsm
 *     NexAI OTC Dev    x_nose_nexai_dev
 *     NexAI OTC Test   x_nose_nexai_test
 *     NexAI OTC UAT    x_nose_nexai_uat
 *
 * ONE RUN. There is nothing to set. It edits live Script Includes and widgets - but each record
 * only if every anchor it needs is found exactly once; otherwise that record is left untouched and
 * the output says what it actually saw.
 *
 * WHAT IT RESTORES
 * On 21 Sep the AI "Counterparty Name" field was removed so the counterparty could only be DERIVED
 * from the sender through the EVE directory. This puts the AI reading back, as a FALLBACK - exactly
 * the behaviour that existed before:
 *     the EVE-derived name is used when the directory has an entry;
 *     the AI-read name fills in when it does not, badged "AI" on the case screen;
 *     when both exist and disagree, the AI reading is shown underneath.
 *
 * THE MATCHER IS NOT TOUCHED. CompareMatch reads email.counterparty_name (the EVE value) and that
 * is deliberately left alone - the AI name has never driven matching and must not start now.
 *
 * WHERE THE RESTORED CODE COMES FROM
 * It is not reconstructed from memory. Every block was lifted VERBATIM from a scope that was never
 * patched, so what goes back is byte-for-byte what was there before.
 *
 * WHY EACH SITE HAS SEVERAL CANDIDATE FORMS
 * The original change went out by two different routes and left different text behind - one scope
 * was patched by an application install, the others by a background script, and their comments and
 * variable handling differ. A revert anchored on just one of those would silently skip the other.
 * So each site carries a list of candidate patched forms and the first that occurs EXACTLY ONCE is
 * the one replaced.
 *
 * SAFETY, same as the original patch script
 *   - a candidate must occur exactly once, or that site is skipped untouched
 *   - a record is written only if ALL of its sites matched; a partial revert is never saved
 *   - every write is read back and verified
 *   - IDEMPOTENT: an already-reverted record reports "already reverted" and is skipped
 *
 * IT ALSO RESTORES THE WORK DRIVERS: "Counterparty Name" goes back into input_fields at its original
 * position with its original prompt and examples (12 fields -> 13).
 */
(function () {

    var SPEC = {"sites":[{"key":"wizardextractor","label":"WizardExtractor","table":"sys_script_include","query":"name=WizardExtractor","field":"script","done":"'counterparty name': 'ai_counterparty'","variants":[["        // NOTE: there is deliberately no 'counterparty name' entry. Counterparty is derived from the\n        // sender via the EVE directory and is never AI-extracted, so a wizard cannot route a model-read\n        // name into ai_counterparty.\n","        'counterparty name': 'ai_counterparty',     // AI-read name; the EVE-derived name on the email still drives matching\n"],["        // NO 'counterparty name' entry: the counterparty is derived from the sender via the\n        // EVE directory and is never AI-extracted, so no wizard field can write one.\n        // (removed 2026-09-21) 'counterparty name':     // AI-read name; the EVE-derived name on the email still drives matching\n","        'counterparty name': 'ai_counterparty',     // AI-read name; the EVE-derived name on the email still drives matching\n"]]},{"key":"extractionconfidence","label":"ExtractionConfidence","table":"sys_script_include","query":"name=ExtractionConfidence","field":"script","done":"counterpartySource === 'ai'","variants":[["\n        // Counterparty is ALWAYS derived from the sender via the EVE directory, so it never carries an\n        // AI confidence grade. Grading it would imply the model had a say in the value, which it does not.\n        out.counterparty = { level: 'derived', label: this.LABELS.derived, reason: 'Derived from the sender via the Eve directory \u2014 not AI-extracted.' };\n","\n        // Counterparty: DERIVED (EVE) by default. When the EVE directory has no entry and the name shown was\n        // read by the AI (wizard field \"Counterparty Name\"), grade it like any other AI text field.\n        if (fields.counterpartySource === 'ai') {\n            put('counterparty', 'text', fields.counterparty);\n        } else {\n            out.counterparty = { level: 'derived', label: this.LABELS.derived, reason: 'Derived from the sender via the Eve directory \u2014 not AI-extracted.' };\n        }\n"],["\n        // Counterparty: DERIVED (EVE) by default. When the EVE directory has no entry and the name shown was\n        // read by the AI (wizard field \"Counterparty Name\"), grade it like any other AI text field.\n        // Counterparty is ALWAYS derived from the sender via the EVE directory, so it never\n        // carries an AI confidence grade. Grading it would imply the model had a say in the\n        // value, which it does not.\n        {\n            out.counterparty = { level: 'derived', label: this.LABELS.derived, reason: 'Derived from the sender via the Eve directory \u2014 not AI-extracted.' };\n        }\n","\n        // Counterparty: DERIVED (EVE) by default. When the EVE directory has no entry and the name shown was\n        // read by the AI (wizard field \"Counterparty Name\"), grade it like any other AI text field.\n        if (fields.counterpartySource === 'ai') {\n            put('counterparty', 'text', fields.counterparty);\n        } else {\n            out.counterparty = { level: 'derived', label: this.LABELS.derived, reason: 'Derived from the sender via the Eve directory \u2014 not AI-extracted.' };\n        }\n"]]},{"key":"taggingdashboard","label":"TaggingDashboard","table":"sys_script_include","query":"name=TaggingDashboard","field":"script","done":"ai_counterparty: cf.getValue('ai_counterparty')","variants":[["        var out = [];\n        // Counterparty is derived from the sender via the EVE directory and lives on the EMAIL, not on the\n        // cashflow. Read it once here so every row carries the same authoritative value - the cashflow's\n        // ai_counterparty column is no longer written and must not be shown.\n        var cpty = '';\n        var em = new GlideRecord('x_nose_nfotc_bsm_email');\n        if (em.get(emailId)) { cpty = '' + (em.getValue('counterparty_name') || ''); }\n        var cf = new GlideRecord('x_nose_nfotc_bsm_cashflow');\n","        var out = [];\n        var cf = new GlideRecord('x_nose_nexai_dev_cashflow');\n"],["        var out = [];\n        // The counterparty is derived from the sender via EVE and lives on the EMAIL, not the\n        // cashflow. Read it once so every row carries the same authoritative value; the\n        // cashflow's ai_counterparty column is no longer written and must not be shown.\n        var cpty = '';\n        var _em = new GlideRecord('x_nose_nexai_dev_email');\n        if (_em.get(emailId)) { cpty = '' + (_em.getValue('counterparty_name') || ''); }\n        var cf = new GlideRecord('x_nose_nexai_dev_cashflow');\n","        var out = [];\n        var cf = new GlideRecord('x_nose_nexai_dev_cashflow');\n"],["                ai_counterparty: cpty, ai_reference: cf.getValue('ai_reference'),","                ai_counterparty: cf.getValue('ai_counterparty'), ai_reference: cf.getValue('ai_reference'),"]]},{"key":"aiextraction_server","label":"case screen (server)","table":"sp_widget","query":"idLIKEai-extraction","field":"script","done":"data.counterparty = _cpEve || _cpAi;","variants":[["    // Counterparty is DERIVED from the sender via the EVE directory (email-level) and that is its ONLY\n    // source - it is never AI-extracted. An AI-read name would be a second, unauthoritative counterparty on\n    // the screen, and the matcher reads the email's counterparty_name, so the two could disagree silently\n    // while the analyst confirms the wrong one. When the sender is not in the directory this stays BLANK:\n    // that is the honest answer, and it is the signal to add the sender to EVE rather than to guess.\n    data.counterparty = gr.getValue('counterparty_name') || '';\n    data.counterpartySource = data.counterparty ? 'eve' : '';\n","    // Counterparty is DERIVED from the sender via the counterparty directory (email-level), same as OTC, and\n    // that value drives matching. If the directory has no entry, show the name the AI read (wizard field\n    // \"Counterparty Name\", stored per cashflow in ai_counterparty) and badge it as AI. When both exist and\n    // differ, the AI reading is shown underneath for the analyst.\n    var _cpEve = gr.getValue('counterparty_name') || '';\n    var _cpAi = cfRec ? (cfRec.getValue('ai_counterparty') || '') : '';\n    data.counterparty = _cpEve || _cpAi;\n    data.counterpartySource = _cpEve ? 'eve' : (_cpAi ? 'ai' : '');\n    data.counterpartyAi = (_cpEve && _cpAi && _cpEve.toLowerCase().replace(/[^a-z0-9]/g, '') !== _cpAi.toLowerCase().replace(/[^a-z0-9]/g, '')) ? _cpAi : '';\n"],["    // Counterparty is DERIVED from the sender via the counterparty directory (email-level), same as OTC, and\n    // that value drives matching. If the directory has no entry, show the name the AI read (wizard field\n    // \"Counterparty Name\", stored per cashflow in ai_counterparty) and badge it as AI. When both exist and\n    // differ, the AI reading is shown underneath for the analyst.\n    // Counterparty is DERIVED from the sender via EVE and that is its ONLY source - never\n    // AI-extracted. When the sender is not in the directory this stays BLANK: that is the\n    // honest answer, and the signal to add the sender to EVE rather than to guess.\n    var _cpEve = gr.getValue('counterparty_name') || '';\n    var _cpAi = cfRec ? (cfRec.getValue('ai_counterparty') || '') : '';\n    data.counterparty = _cpEve;\n    data.counterpartySource = _cpEve ? 'eve' : '';\n    data.counterpartyAi = '';\n","    // Counterparty is DERIVED from the sender via the counterparty directory (email-level), same as OTC, and\n    // that value drives matching. If the directory has no entry, show the name the AI read (wizard field\n    // \"Counterparty Name\", stored per cashflow in ai_counterparty) and badge it as AI. When both exist and\n    // differ, the AI reading is shown underneath for the analyst.\n    var _cpEve = gr.getValue('counterparty_name') || '';\n    var _cpAi = cfRec ? (cfRec.getValue('ai_counterparty') || '') : '';\n    data.counterparty = _cpEve || _cpAi;\n    data.counterpartySource = _cpEve ? 'eve' : (_cpAi ? 'ai' : '');\n    data.counterpartyAi = (_cpEve && _cpAi && _cpEve.toLowerCase().replace(/[^a-z0-9]/g, '') !== _cpAi.toLowerCase().replace(/[^a-z0-9]/g, '')) ? _cpAi : '';\n"]]},{"key":"aiextraction_template","label":"case screen (template)","table":"sp_widget","query":"idLIKEai-extraction","field":"template","done":"counterpartySource === 'ai'","variants":[["                    <div class=\"nom-flabel\">Counterparty <span class=\"prov prov-pcm\">Derived &#183; EVE</span></div>","                    <div class=\"nom-flabel\">Counterparty <span class=\"prov prov-pcm\" ng-if=\"c.data.counterpartySource !== 'ai'\">Derived &#183; EVE</span><span class=\"prov prov-ai\" ng-if=\"c.data.counterpartySource === 'ai'\" title=\"Not in the EVE directory - name read from the email by the AI\">AI</span><span ng-if=\"c.data.counterpartySource === 'ai' &amp;&amp; c.data.conf.counterparty.level !== 'absent'\" class=\"conf conf-{{c.data.conf.counterparty.level}}\" title=\"{{c.data.conf.counterparty.reason}}\">{{c.data.conf.counterparty.label}}</span></div>"],["                    <span class=\"nom-fval\" ng-show=\"!c.editing\">{{c.data.counterparty || '\u2014'}}</span><input class=\"nom-inp on\" ng-show=\"c.editing\" ng-model=\"c.data.counterparty\" ng-change=\"c.markDirty()\"/>","                    <span class=\"nom-fval\" ng-show=\"!c.editing\">{{c.data.counterparty || '\u2014'}}<span class=\"nom-fai\" ng-if=\"c.data.counterpartyAi\">AI read: {{c.data.counterpartyAi}}</span></span><input class=\"nom-inp on\" ng-show=\"c.editing\" ng-model=\"c.data.counterparty\" ng-change=\"c.markDirty()\"/>"]]},{"key":"catalogue","label":"Wizard Builder catalogue","table":"sp_widget","query":"idLIKEwizard-builder","field":"script","done":"{ name: \"Counterparty Name\", type: \"string\", mandatory: false,","variants":[["            // \"Counterparty Name\" is deliberately NOT offered. The counterparty is derived from the\n            // sender via the EVE directory; an AI-read name is not authoritative and the matcher\n            // ignores it, so offering it here would only put a second, disagreeing value on screen.\n","            { name: \"Counterparty Name\", type: \"string\", mandatory: false,\n              prompt: \"Extract the legal name of the counterparty - the trading party on the other side from Nomura, i.e. the firm that sent this email or on whose behalf it was sent. Prefer, in this order: (1) the sending legal entity as stated in the email or its attachment ('FROM: <name>', 'Entity: <name>', '<name> is due to pay', a letterhead, 'For payments to <name>', the beneficiary of the sender's own payment instructions); (2) the bank or company line of the signature or legal footer; (3) the sender's display name. When a fund administrator, investment manager or adviser writes for a fund or client (a 'Fund', 'Fund Name', 'Client' or 'Book' column or line, or 'on behalf of'), return that fund or client. A shared-service or operations company in a signature (e.g. a name containing 'Business Services', 'Solutions' or 'Consulting') is not the trading party when the email names the trading bank or its booking entity elsewhere - return the trading bank. If a Nomura group entity writes to another Nomura entity, return the sending Nomura entity; otherwise never return a Nomura entity. Never return a person, a team or mailbox name, or a table value that names Nomura (columns such as Counterparty, CPTY, CP Name or Customer in the sender's table usually name Nomura). A value that is only a branch, city or desk (e.g. 'Sydney Branch') is not the name - use the legal entity name written elsewhere in the email, such as in its payment instructions or signature. Prefer a name written in Latin script; if the sender's name appears only in another script, return the sender's Latin-script code or BIC from the email (e.g. from the subject) instead. Return the name as written, without address or department. If only a short code or BIC identifies the sender, return that; if nothing does, return an empty string.\",\n              value: \"Goldman Sachs International\", examples: [\"Goldman Sachs International\", \"Standard Chartered Bank\", \"National Bank of Canada\"] },\n"],["// \"Counterparty Name\" is deliberately NOT offered: the counterparty is derived\n            // from the sender via EVE, the matcher ignores any AI-read name, and offering it\n            // here only puts a second, disagreeing value on the screen.\n            ","            { name: \"Counterparty Name\", type: \"string\", mandatory: false,\n              prompt: \"Extract the legal name of the counterparty - the trading party on the other side from Nomura, i.e. the firm that sent this email or on whose behalf it was sent. Prefer, in this order: (1) the sending legal entity as stated in the email or its attachment ('FROM: <name>', 'Entity: <name>', '<name> is due to pay', a letterhead, 'For payments to <name>', the beneficiary of the sender's own payment instructions); (2) the bank or company line of the signature or legal footer; (3) the sender's display name. When a fund administrator, investment manager or adviser writes for a fund or client (a 'Fund', 'Fund Name', 'Client' or 'Book' column or line, or 'on behalf of'), return that fund or client. A shared-service or operations company in a signature (e.g. a name containing 'Business Services', 'Solutions' or 'Consulting') is not the trading party when the email names the trading bank or its booking entity elsewhere - return the trading bank. If a Nomura group entity writes to another Nomura entity, return the sending Nomura entity; otherwise never return a Nomura entity. Never return a person, a team or mailbox name, or a table value that names Nomura (columns such as Counterparty, CPTY, CP Name or Customer in the sender's table usually name Nomura). A value that is only a branch, city or desk (e.g. 'Sydney Branch') is not the name - use the legal entity name written elsewhere in the email, such as in its payment instructions or signature. Prefer a name written in Latin script; if the sender's name appears only in another script, return the sender's Latin-script code or BIC from the email (e.g. from the subject) instead. Return the name as written, without address or department. If only a short code or BIC identifies the sender, return that; if nothing does, return an empty string.\",\n              value: \"Goldman Sachs International\", examples: [\"Goldman Sachs International\", \"Standard Chartered Bank\", \"National Bank of Canada\"] },\n"]]}],"field":{"name":"Counterparty Name","type":"string","prompt":"Extract the legal name of the counterparty - the trading party on the other side from Nomura, i.e. the firm that sent this email or on whose behalf it was sent. Prefer, in this order: (1) the sending legal entity as stated in the email or its attachment ('FROM: <name>', 'Entity: <name>', '<name> is due to pay', a letterhead, 'For payments to <name>', the beneficiary of the sender's own payment instructions); (2) the bank or company line of the signature or legal footer; (3) the sender's display name. When a fund administrator, investment manager or adviser writes for a fund or client (a 'Fund', 'Fund Name', 'Client' or 'Book' column or line, or 'on behalf of'), return that fund or client. A shared-service or operations company in a signature (e.g. a name containing 'Business Services', 'Solutions' or 'Consulting') is not the trading party when the email names the trading bank or its booking entity elsewhere - return the trading bank. If a Nomura group entity writes to another Nomura entity, return the sending Nomura entity; otherwise never return a Nomura entity. Never return a person, a team or mailbox name, or a table value that names Nomura (columns such as Counterparty, CPTY, CP Name or Customer in the sender's table usually name Nomura). A value that is only a branch, city or desk (e.g. 'Sydney Branch') is not the name - use the legal entity name written elsewhere in the email, such as in its payment instructions or signature. Prefer a name written in Latin script; if the sender's name appears only in another script, return the sender's Latin-script code or BIC from the email (e.g. from the subject) instead. Return the name as written, without address or department. If only a short code or BIC identifies the sender, return that; if nothing does, return an empty string.","example":"","value":"Goldman Sachs International","custom":false,"mapExclude":true,"examples":["Goldman Sachs International","Standard Chartered Bank","National Bank of Canada"]},"fieldPos":5};

    var ENVIRONMENTS = {
        'x_nose_nfotc_bsm':  'NexAI OTC BSM',
        'x_nose_nexai_dev':  'NexAI OTC Dev',
        'x_nose_nexai_test': 'NexAI OTC Test',
        'x_nose_nexai_uat':  'NexAI OTC UAT'
    };

    var SCOPE = '' + gs.getCurrentScopeName();
    if (!ENVIRONMENTS[SCOPE]) {
        gs.error('[CPREV] ABORT: Application is "' + SCOPE + '", not a NexAI OTC environment.');
        for (var k in ENVIRONMENTS) {
            if (ENVIRONMENTS.hasOwnProperty(k)) { gs.error('[CPREV]     ' + ENVIRONMENTS[k] + '   (' + k + ')'); }
        }
        return;
    }

    var WIZ_T = SCOPE + '_wizard';

    gs.info('[CPREV] ================================================================');
    gs.info('[CPREV] environment : ' + ENVIRONMENTS[SCOPE] + '   (' + SCOPE + ')');
    gs.info('[CPREV] mode        : applying - per record, every edit or none');
    gs.info('[CPREV] ================================================================');

    var reverted = 0, already = 0, failed = 0;

    // ---------------------------------------------------------------- the code sites
    for (var s = 0; s < SPEC.sites.length; s++) {
        var site = SPEC.sites[s];

        var gr = new GlideRecord(site.table);
        gr.addEncodedQuery(site.query + '^sys_scope.scope=' + SCOPE);
        gr.query();

        if (!gr.hasNext()) {
            gs.warn('[CPREV] ' + site.label + ': no record matched - skipped.');
            continue;
        }

        while (gr.next()) {
            var id = gr.getUniqueValue();
            var who = site.label + '  [' + (gr.getValue('name') || gr.getValue('id') || id) + ']';
            var src = '' + (gr.getValue(site.field) || '');

            // Nothing to do when the pre-change code is already present.
            if (src.indexOf(site.done) > -1) {
                gs.info('[CPREV] ' + who + ': already reverted, skipped.');
                already++;
                continue;
            }

            // Try each known patched form in turn; the first that occurs EXACTLY once wins.
            var out = src, hits = 0, used = -1;
            for (var v = 0; v < site.variants.length; v++) {
                var find = site.variants[v][0], repl = site.variants[v][1];
                var n = out.split(find).length - 1;
                if (n === 1) { out = out.replace(find, repl); hits++; if (used < 0) { used = v; } }
            }

            if (!hits) {
                gs.error('[CPREV] ' + who + ': NOT REVERTED - none of the known patched forms matched.');
                gs.error('[CPREV]   Nothing was written. This record differs from both known versions -');
                gs.error('[CPREV]   send this line back rather than editing it by hand.');
                failed++;
                continue;
            }

            gs.info('[CPREV] ' + who + ': ' + src.length + ' -> ' + out.length + ' chars   (' +
                    hits + ' block(s) restored, form ' + (used + 1) + ')');


            gr.setValue(site.field, out);
            if (!gr.update()) {
                gs.error('[CPREV] ' + who + ': UPDATE REFUSED (read-only app, or wrong scope?)');
                failed++;
                continue;
            }
            // Read back - a refused scoped write looks exactly like success otherwise.
            var v2 = new GlideRecord(site.table);
            v2.get(id);
            if (('' + (v2.getValue(site.field) || '')).indexOf(site.done) === -1) {
                gs.error('[CPREV] ' + who + ': WRITE DID NOT STICK.');
                failed++;
            } else {
                gs.info('[CPREV] ' + who + ': applied and verified.');
                reverted++;
            }
        }
    }

    // ---------------------------------------------------------------- the work drivers
    gs.info('[CPREV]');
    gs.info('[CPREV] ---- work drivers: put the field back ----');
    var drivers = 0;
    var w = new GlideRecord(WIZ_T);
    w.query();
    while (w.next()) {
        var dn = '' + w.getValue('name');
        var raw = '' + (w.getValue('input_fields') || '[]');
        var fields;
        try { fields = JSON.parse(raw); } catch (eJ) { fields = null; }
        if (!(fields instanceof Array)) {
            gs.error('[CPREV] driver "' + dn + '": input_fields is not readable JSON, SKIPPED.');
            continue;
        }

        var has = false;
        for (var f = 0; f < fields.length; f++) {
            if (('' + ((fields[f] || {}).name || '')).toLowerCase() === 'counterparty name') { has = true; }
        }
        if (has) {
            gs.info('[CPREV] driver "' + dn + '" [' + (w.getValue('status') || 'draft') + ']: already has it (' +
                    fields.length + ' fields)');
            continue;
        }

        // Re-insert at its original position so the Field Extraction step reads the way it did.
        var pos = SPEC.fieldPos;
        if (pos > fields.length) { pos = fields.length; }
        var rebuilt = [];
        for (var i = 0; i < pos; i++) { rebuilt.push(fields[i]); }
        rebuilt.push(SPEC.field);
        for (var j = pos; j < fields.length; j++) { rebuilt.push(fields[j]); }

        gs.info('[CPREV] driver "' + dn + '" [' + (w.getValue('status') || 'draft') + ']: ' +
                fields.length + ' -> ' + rebuilt.length + ' fields   (inserted at position ' + (pos + 1) + ')');
        drivers++;

        w.setValue('input_fields', JSON.stringify(rebuilt));
        if (!w.update()) { gs.error('[CPREV] driver "' + dn + '": UPDATE REFUSED.'); failed++; }
    }

    // ---------------------------------------------------------------- summary
    gs.info('[CPREV]');
    gs.info('[CPREV] ================================================================');
    gs.info('[CPREV] reverted       : ' + reverted + ' code site(s), ' + drivers + ' work driver(s)');
    gs.info('[CPREV] already back   : ' + already);
    gs.info('[CPREV] FAILED         : ' + failed);
    if (!failed) {
        gs.info('[CPREV]');
        gs.info('[CPREV] Done. Repeat with the Application set to each other environment.');
        gs.info('[CPREV] The case screen shows the EVE name when the directory has one, and the');
        gs.info('[CPREV] AI-read name badged "AI" when it does not. The MATCHER still uses the EVE');
        gs.info('[CPREV] value only - that was never changed and is not affected by this revert.');
        gs.info('[CPREV] Re-sync a mail to populate ai_counterparty again on new cashflows.');
    } else {
        gs.warn('[CPREV]');
        gs.warn('[CPREV] Some records were NOT reverted - see above. Nothing partial was saved.');
    }
    gs.info('[CPREV] ================================================================');
})();
