/**
 * GROSS / NET SETTLEMENT SWITCH  -  run ONCE in Background Scripts on nomurabsmdev.
 *
 * RUN WITH: Application = Global      (dictionary, Script Include and sp_* tables all refuse
 *                                      CREATE from a scoped application)
 *
 * SET THE SCOPE BELOW. Written for x_nose_nexai_test; change SCOPE to x_nose_nfotc_bsm (or any
 * other) and re-run to install it there. Nothing else in the script needs to change.
 *
 * WHAT IT INSTALLS
 *   1. Four columns   cashflow.netting_group / is_net / amount_origin, email.settle_granularity
 *   2. NettingEngine  Script Include - grouping, Nomura-side signing, net computation
 *   3. A page + widget showing one mail with a working Gross | Net switch
 *
 * DESIGN NOTES THAT MATTER
 *   - The net is COMPUTED LIVE, not pre-built. A net row is written only when an analyst actually
 *     switches that mail to Net. That keeps this whole install runnable from Global: a scoped data
 *     table refuses writes from Global, but the widget runs IN the scope, so it may write.
 *   - Amounts are summed on NOMURA's side, never as printed. A Barclays mail prints its legs
 *     negative because Barclays is paying; Nomura is receiving, so the stored values are positive
 *     and the net is +16,348.28, not -16,348.28. Direction wins over the printed sign, which is the
 *     existing rule in this application.
 *   - Netting is only valid inside a netting set, so the group key is
 *     currency + value date + Nomura entity + counterparty. A mail with two entities nets to TWO
 *     rows, not one - summing across entities would produce a number that settles nothing.
 *   - Nothing existing is modified. The case screen, the board and Compare & Match are untouched.
 *
 * Idempotent. ES5.
 */
(function () {

    // ================================================================ CONFIGURE
    var SCOPE = 'x_nose_nexai_test';          // <-- change to x_nose_nfotc_bsm for the BSM app
    var PAGE_ID = 'nexai_grossnet';
    var WIDGET_ID = 'nexai-grossnet';

    var log = [];
    var failed = false;
    function p(s) { log.push(s); }
    function fail(s) { failed = true; log.push('   !! ' + s); }

    p('=================================================================');
    p('GROSS / NET SWITCH   scope: ' + SCOPE + '   running in: ' + gs.getCurrentScopeName());
    p('=================================================================');

    var here = gs.getCurrentScopeName();
    if (here !== 'global' && here !== 'rhino.global') {
        p('!! WRONG SCOPE - set the Application picker to Global and run again. Nothing changed.');
        gs.info('\n' + log.join('\n'));
        return;
    }

    var sc = new GlideRecord('sys_scope');
    sc.addQuery('scope', SCOPE);
    sc.setLimit(1);
    sc.query();
    if (!sc.next()) {
        p('!! application with scope ' + SCOPE + ' not found. Nothing changed.');
        gs.info('\n' + log.join('\n'));
        return;
    }
    var appId = sc.getUniqueValue();
    p('application : ' + sc.getValue('name') + '  ' + appId);
    function own(gr) { gr.setValue('sys_scope', appId); gr.setValue('sys_package', appId); }

    var CASHFLOW = SCOPE + '_cashflow';
    var EMAIL = SCOPE + '_email';

    // ================================================================ 1. COLUMNS
    p('');
    p('1. COLUMNS');

    function column(table, element, label, type, len, hint) {
        var d = new GlideRecord('sys_dictionary');
        d.addQuery('name', table);
        d.addQuery('element', element);
        d.setLimit(1);
        d.query();
        if (d.next()) {
            p('   exists   ' + table + '.' + element);
            return true;
        }
        d.initialize();
        d.setValue('name', table);
        d.setValue('element', element);
        d.setValue('column_label', label);
        d.setValue('internal_type', type);
        if (len) { d.setValue('max_length', len); }
        if (hint) { d.setValue('comments', hint); }
        own(d);
        var id = d.insert();
        if (!id) { fail('could not create ' + table + '.' + element); return false; }
        p('   CREATED  ' + table + '.' + element + '  (' + label + ')');
        return true;
    }

    column(CASHFLOW, 'netting_group', 'Netting Group', 'string', 200,
        'currency | value date | Nomura entity | counterparty. Only rows sharing this key may be netted.');
    column(CASHFLOW, 'is_net', 'Is Net', 'string', 10,
        'true on a row that is the net of its netting group. Components are false or empty.');
    column(CASHFLOW, 'amount_origin', 'Amount Origin', 'string', 20,
        'extracted = read from the mail. computed = summed from the components, so it appears nowhere in the message.');
    column(EMAIL, 'settle_granularity', 'Settle Granularity', 'string', 10,
        'gross (default) or net. Chosen per mail by the analyst; decides which rows are settled and matched.');

    // ================================================================ 2. SCRIPT INCLUDE
    p('');
    p('2. SCRIPT INCLUDE  NettingEngine');

    var SI = [
        'var NettingEngine = Class.create();',
        'NettingEngine.prototype = {',
        '    initialize: function () {',
        '        this.SCOPE = "' + SCOPE + '";',
        '        this.CASHFLOW = this.SCOPE + "_cashflow";',
        '        this.EMAIL = this.SCOPE + "_email";',
        '        this.EPS = 0.01;                 // cents. Netting totals agree exactly in practice.',
        '    },',
        '',
        '    /**',
        '     * The amount on NOMURA\'s side, signed.',
        '     * The printed sign belongs to whoever wrote the mail - a Barclays leg prints negative',
        '     * because BARCLAYS pays, which means Nomura RECEIVES. Direction therefore wins over the',
        '     * printed sign; the printed sign is used only when no direction was established.',
        '     */',
        '    nomuraAmount: function (gr) {',
        '        var raw = "" + (gr.getValue("ai_amount") || gr.getValue("amount") || "");',
        '        var neg = /^\\s*\\(.*\\)\\s*$/.test(raw);      // (1,234.56) is negative',
        '        var n = parseFloat(raw.replace(/[()]/g, "").replace(/[^0-9.eE+-]/g, ""));',
        '        if (isNaN(n)) { return null; }',
        '        if (neg) { n = -Math.abs(n); }',
        '        var dir = ("" + (gr.getValue("ai_direction") || gr.getValue("direction") || "")).toLowerCase();',
        '        if (dir.indexOf("rec") === 0) { return Math.abs(n); }',
        '        if (dir.indexOf("pay") === 0) { return -Math.abs(n); }',
        '        return n;                                    // no direction stated - keep the sign as read',
        '    },',
        '',
        '    /** currency | value date | Nomura entity | counterparty. Netting is invalid across these. */',
        '    groupKey: function (gr, counterparty) {',
        '        return [',
        '            ("" + (gr.getValue("ai_currency") || gr.getValue("currency") || "?")).toUpperCase(),',
        '            ("" + (gr.getValue("ai_value_date") || gr.getValue("value_date") || "?")),',
        '            ("" + (gr.getValue("ai_nomura_entity") || "?")).toUpperCase(),',
        '            ("" + (counterparty || "?")).toUpperCase()',
        '        ].join(" | ");',
        '    },',
        '',
        '    /**',
        '     * Everything the screen needs for one mail: the groups, their components, the net of',
        '     * each (stated where the mail carries one, otherwise computed), and whether the two agree.',
        '     * Read-only - nothing is written here.',
        '     */',
        '    analyse: function (emailId) {',
        '        var out = { emailId: emailId, granularity: "gross", groups: [], components: 0, nets: 0 };',
        '        var em = new GlideRecord(this.EMAIL);',
        '        if (!em.get(emailId)) { return out; }',
        '        out.granularity = ("" + (em.getValue("settle_granularity") || "gross"));',
        '        out.mail = em.getValue("name");',
        '        out.subject = em.getValue("mail_subject");',
        '        var cpty = em.getValue("counterparty_name") || "";',
        '        out.counterparty = cpty;',
        '',
        '        var byKey = {};',
        '        var g = new GlideRecord(this.CASHFLOW);',
        '        g.addQuery("email", emailId);',
        '        g.orderBy("flow_index");',
        '        g.query();',
        '        while (g.next()) {',
        '            var amt = this.nomuraAmount(g);',
        '            if (amt === null) { continue; }',
        '            var isNet = ("" + (g.getValue("is_net") || "")) === "true";',
        '            var key = g.getValue("netting_group") || this.groupKey(g, cpty);',
        '            if (!byKey[key]) {',
        '                byKey[key] = { key: key, components: [], net: null,',
        '                               currency: g.getValue("ai_currency") || g.getValue("currency") || "",',
        '                               valueDate: g.getValue("ai_value_date") || g.getValue("value_date") || "",',
        '                               entity: g.getValue("ai_nomura_entity") || "" };',
        '            }',
        '            var row = {',
        '                sys_id: g.getUniqueValue(),',
        '                amount: amt,',
        '                display: this.fmt(amt),',
        '                direction: amt >= 0 ? "Receive" : "Pay",',
        '                reference: g.getValue("ai_reference") || g.getValue("reference") || "",',
        '                valueDate: g.getValue("ai_value_date") || g.getValue("value_date") || "",',
        '                currency: g.getValue("ai_currency") || g.getValue("currency") || "",',
        '                matchStatus: g.getValue("ai_match_status") || "",',
        '                matchTier: g.getValue("ai_match_tier") || "",',
        '                origin: g.getValue("amount_origin") || "extracted",',
        '                isNet: isNet',
        '            };',
        '            if (isNet) { byKey[key].net = row; } else { byKey[key].components.push(row); }',
        '        }',
        '',
        '        for (var k in byKey) {',
        '            if (!byKey.hasOwnProperty(k)) { continue; }',
        '            var grp = byKey[k];',
        '            var sum = 0;',
        '            for (var i = 0; i < grp.components.length; i++) { sum += grp.components[i].amount; }',
        '            grp.computed = Math.round(sum * 100) / 100;',
        '            grp.computedDisplay = this.fmt(grp.computed);',
        '            grp.computedDirection = grp.computed >= 0 ? "Receive" : "Pay";',
        '            grp.count = grp.components.length;',
        '            // a stated net that disagrees with the arithmetic is a data-quality signal, not a',
        '            // choice to make silently - surface both',
        '            grp.stated = grp.net ? grp.net.amount : null;',
        '            grp.agrees = (grp.stated === null) ? null :',
        '                         (Math.abs(grp.stated - grp.computed) <= this.EPS);',
        '            grp.nettable = grp.count > 1;',
        '            out.groups.push(grp);',
        '            out.components += grp.count;',
        '            if (grp.nettable) { out.nets++; }',
        '        }',
        '        return out;',
        '    },',
        '',
        '    /**',
        '     * Switch one mail between gross and net.',
        '     * Writes the net rows the first time a mail is switched to net, clears any match on the',
        '     * rows that stop being settled (so a net and its components can never both claim the same',
        '     * money), and records the choice in the audit trail.',
        '     * Must run IN the application scope - a scoped table refuses writes from Global.',
        '     */',
        '    setGranularity: function (emailId, mode) {',
        '        mode = (mode === "net") ? "net" : "gross";',
        '        var res = { mode: mode, netsWritten: 0, matchesCleared: 0 };',
        '        var em = new GlideRecord(this.EMAIL);',
        '        if (!em.get(emailId)) { return res; }',
        '        var cpty = em.getValue("counterparty_name") || "";',
        '        var a = this.analyse(emailId);',
        '',
        '        for (var i = 0; i < a.groups.length; i++) {',
        '            var grp = a.groups[i];',
        '            if (!grp.nettable) { continue; }',
        '            if (mode === "net" && !grp.net) {',
        '                var n = new GlideRecord(this.CASHFLOW);',
        '                n.initialize();',
        '                n.setValue("email", emailId);',
        '                n.setValue("ai_amount", "" + grp.computed);',
        '                n.setValue("ai_currency", grp.currency);',
        '                n.setValue("ai_value_date", grp.valueDate);',
        '                n.setValue("ai_direction", grp.computedDirection);',
        '                n.setValue("ai_nomura_entity", grp.entity);',
        '                n.setValue("netting_group", grp.key);',
        '                n.setValue("is_net", "true");',
        '                n.setValue("amount_origin", "computed");',
        '                n.setValue("ai_reference", "NET of " + grp.count);',
        '                if (n.insert()) { res.netsWritten++; }',
        '            }',
        '            // stamp the group on the components so the key is visible on the record',
        '            for (var c = 0; c < grp.components.length; c++) {',
        '                var cg = new GlideRecord(this.CASHFLOW);',
        '                if (!cg.get(grp.components[c].sys_id)) { continue; }',
        '                var dirty = false;',
        '                if (!cg.getValue("netting_group")) { cg.setValue("netting_group", grp.key); dirty = true; }',
        '                if (!cg.getValue("amount_origin")) { cg.setValue("amount_origin", "extracted"); dirty = true; }',
        '                if (!cg.getValue("is_net")) { cg.setValue("is_net", "false"); dirty = true; }',
        '                // the side that is no longer settled must not keep a match',
        '                if (mode === "net" && cg.getValue("ai_match_status")) {',
        '                    cg.setValue("ai_match_status", "");',
        '                    cg.setValue("ai_match_tier", "");',
        '                    cg.setValue("ai_match_computed", "");',
        '                    res.matchesCleared++;',
        '                    dirty = true;',
        '                }',
        '                if (dirty) { cg.update(); }',
        '            }',
        '            if (mode === "gross" && grp.net) {',
        '                var ng = new GlideRecord(this.CASHFLOW);',
        '                if (ng.get(grp.net.sys_id) && ng.getValue("ai_match_status")) {',
        '                    ng.setValue("ai_match_status", "");',
        '                    ng.setValue("ai_match_tier", "");',
        '                    ng.setValue("ai_match_computed", "");',
        '                    ng.update();',
        '                    res.matchesCleared++;',
        '                }',
        '            }',
        '        }',
        '',
        '        em.setValue("settle_granularity", mode);',
        '        em.update();',
        '',
        '        try {',
        '            new ' + SCOPE + '.AuditTrail().log("granularity.selected", {',
        '                entityType: "email", entityId: emailId, emailId: emailId,',
        '                mailId: em.getValue("name"), counterparty: cpty,',
        '                summary: "Settlement granularity set to " + mode.toUpperCase() +',
        '                         " (" + a.groups.length + " netting group(s), " + a.components + " components)",',
        '                analystValue: mode',
        '            });',
        '        } catch (e) { gs.warn("[NettingEngine] audit " + e); }',
        '        return res;',
        '    },',
        '',
        '    /** The rows that should be settled and matched, given the mail\'s current choice. */',
        '    activeRows: function (emailId) {',
        '        this.ensureNets(emailId);',
        '        var a = this.analyse(emailId), ids = [];',
        '        for (var i = 0; i < a.groups.length; i++) {',
        '            var grp = a.groups[i];',
        '            if (a.granularity === "net" && grp.nettable) {',
        '                if (grp.net) { ids.push(grp.net.sys_id); }',
        '            } else {',
        '                for (var c = 0; c < grp.components.length; c++) { ids.push(grp.components[c].sys_id); }',
        '            }',
        '        }',
        '        return ids;',
        '    },',
        '',
        '    /**',
        '     * SELF-HEALING. Re-extraction deletes a mail\'s cashflows and rewrites them, which takes any',
        '     * computed net with it. Rather than hooking the extraction path, the net is simply rebuilt',
        '     * here whenever it is missing and the mail is set to net. Every read goes through this, so a',
        '     * re-sync can never leave the mail settling at a granularity it no longer has rows for.',
        '     */',
        '    ensureNets: function (emailId) {',
        '        var em = new GlideRecord(this.EMAIL);',
        '        if (!em.get(emailId)) { return 0; }',
        '        if (("" + (em.getValue("settle_granularity") || "gross")) !== "net") { return 0; }',
        '        var a = this.analyse(emailId), made = 0;',
        '        for (var i = 0; i < a.groups.length; i++) {',
        '            var grp = a.groups[i];',
        '            if (!grp.nettable || grp.net) { continue; }',
        '            if (this._writeNet(emailId, grp)) { made++; }',
        '        }',
        '        if (made) { gs.info("[NettingEngine] rebuilt " + made + " net row(s) for " + emailId); }',
        '        return made;',
        '    },',
        '',
        '    _writeNet: function (emailId, grp) {',
        '        var n = new GlideRecord(this.CASHFLOW);',
        '        n.initialize();',
        '        n.setValue("email", emailId);',
        '        n.setValue("ai_amount", "" + grp.computed);',
        '        n.setValue("ai_currency", grp.currency);',
        '        n.setValue("ai_value_date", grp.valueDate);',
        '        n.setValue("ai_direction", grp.computedDirection);',
        '        n.setValue("ai_nomura_entity", grp.entity);',
        '        n.setValue("netting_group", grp.key);',
        '        n.setValue("is_net", "true");',
        '        n.setValue("amount_origin", "computed");',
        '        n.setValue("ai_reference", "NET of " + grp.count);',
        '        var id = n.insert();',
        '        if (!id) { return false; }',
        '        try {',
        '            new ' + SCOPE + '.AuditTrail().log("netting.computed", {',
        '                entityType: "cashflow", entityId: id, emailId: emailId, cashflowId: id,',
        '                summary: "Net computed from " + grp.count + " components: " +',
        '                         grp.computedDisplay + " " + grp.currency + " " + grp.computedDirection,',
        '                aiValue: grp.computedDisplay,',
        '                fieldName: grp.key',
        '            });',
        '        } catch (e) { /* audit is best-effort */ }',
        '        return true;',
        '    },',
        '',
        '    /**',
        '     * Is this row the granularity the mail is currently settling at?',
        '     * Used by the guard rule, so it takes a GlideRecord and never queries more than it must.',
        '     */',
        '    isActive: function (gr) {',
        '        var isNet = ("" + (gr.getValue("is_net") || "")) === "true";',
        '        var emId = gr.getValue("email");',
        '        if (!emId) { return true; }',
        '        var em = new GlideRecord(this.EMAIL);',
        '        if (!em.get(emId)) { return true; }',
        '        var mode = "" + (em.getValue("settle_granularity") || "gross");',
        '        if (mode !== "net") { return !isNet; }     // gross: components settle, nets do not',
        '        if (isNet) { return true; }',
        '        // a component is still active if its own group never produced a net',
        '        var key = gr.getValue("netting_group");',
        '        if (!key) { return true; }',
        '        var q = new GlideRecord(this.CASHFLOW);',
        '        q.addQuery("email", emId);',
        '        q.addQuery("netting_group", key);',
        '        q.addQuery("is_net", "true");',
        '        q.setLimit(1);',
        '        q.query();',
        '        return !q.hasNext();',
        '    },',
        '',
        '    /**',
        '     * Run Compare & Match over the rows this mail actually settles, and nothing else.',
        '     * Returns a small summary for the screen.',
        '     */',
        '    matchActive: function (emailId) {',
        '        var ids = this.activeRows(emailId);',
        '        var out = { asked: ids.length, matched: 0, no_match: 0, other: 0, errors: 0 };',
        '        var cm = new ' + SCOPE + '.CompareMatch();',
        '        for (var i = 0; i < ids.length; i++) {',
        '            try {',
        '                var r = cm.matchAndStore(ids[i]) || {};',
        '                var st = "" + (r.status || "");',
        '                if (st === "matched") { out.matched++; }',
        '                else if (st === "no_match") { out.no_match++; }',
        '                else { out.other++; }',
        '            } catch (e) {',
        '                out.errors++;',
        '                gs.warn("[NettingEngine] match " + ids[i] + " " + e);',
        '            }',
        '        }',
        '        return out;',
        '    },',
        '',
        '    fmt: function (n) {',
        '        var neg = n < 0;',
        '        var s = Math.abs(n).toFixed(2);',
        '        var parts = s.split(".");',
        '        parts[0] = parts[0].replace(/\\B(?=(\\d{3})+(?!\\d))/g, ",");',
        '        return (neg ? "-" : "") + parts.join(".");',
        '    },',
        '',
        '    type: "NettingEngine"',
        '};'
    ].join('\n');

    var si = new GlideRecord('sys_script_include');
    si.addQuery('name', 'NettingEngine');
    si.addQuery('sys_scope', appId);
    si.setLimit(1);
    si.query();
    if (si.next()) {
        si.setValue('script', SI);
        si.update();
        p('   UPDATED  NettingEngine  ' + si.getUniqueValue());
    } else {
        si.initialize();
        si.setValue('name', 'NettingEngine');
        si.setValue('api_name', SCOPE + '.NettingEngine');
        si.setValue('client_callable', false);
        si.setValue('access', 'package_private');
        si.setValue('active', true);
        si.setValue('description',
            'Groups a mail\'s cashflows into netting sets (currency | value date | Nomura entity | ' +
            'counterparty), sums them on Nomura\'s side, and switches a mail between settling the ' +
            'components and settling the net.');
        si.setValue('script', SI);
        own(si);
        var siId = si.insert();
        if (siId) { p('   CREATED  NettingEngine  ' + siId); }
        else { fail('could not create NettingEngine'); }
    }

    // ================================================================ 3. GUARD BUSINESS RULE
    p('');
    p('3. GUARD BUSINESS RULE');
    p('   Keeps matching honest without editing CompareMatch: if anything writes a match onto a row');
    p('   that is not the granularity the mail settles at, the match is cleared before it is saved.');

    var BR = [
        '/**',
        ' * Gross / Net guard.',
        ' *',
        ' * Compare & Match does not know this feature exists - it matches whatever cashflow it is',
        ' * given, whether that is a component or a net. This rule is what makes the mail\'s choice',
        ' * actually bind: a match written onto a row that is not currently settled is stripped before',
        ' * it is stored, so a net and its components can never both claim the same money.',
        ' *',
        ' * before insert/update, so clearing the values here does not trigger a further update.',
        ' */',
        '(function executeRule(current, previous /*null when async*/) {',
        '    try {',
        '        var eng = new ' + SCOPE + '.NettingEngine();',
        '        if (eng.isActive(current)) { return; }',
        '        current.setValue("ai_match_status", "");',
        '        current.setValue("ai_match_tier", "");',
        '        current.setValue("ai_match_computed", "");',
        '        current.setValue("ai_match_booking", "");',
        '        current.setValue("ai_match_confidence", "");',
        '        current.setValue("ai_candidate_count", "");',
        '    } catch (e) {',
        '        // never block a save because of this rule',
        '        gs.warn("[Gross/Net guard] " + e);',
        '    }',
        '})(current, previous);'
    ].join('\n');

    var br = new GlideRecord('sys_script');
    br.addQuery('name', 'NexAI: Gross/Net match guard');
    br.addQuery('collection', CASHFLOW);
    br.setLimit(1);
    br.query();
    if (br.next()) {
        br.setValue('script', BR);
        br.update();
        p('   UPDATED  business rule  ' + br.getUniqueValue());
    } else {
        br.initialize();
        br.setValue('name', 'NexAI: Gross/Net match guard');
        br.setValue('collection', CASHFLOW);
        br.setValue('when', 'before');
        br.setValue('action_insert', true);
        br.setValue('action_update', true);
        br.setValue('action_delete', false);
        br.setValue('active', true);
        br.setValue('order', 200);
        br.setValue('condition', 'current.ai_match_status != ""');
        br.setValue('script', BR);
        br.setValue('description',
            'Strips a match from any cashflow that is not the granularity its mail currently settles at.');
        own(br);
        var brId = br.insert();
        if (brId) { p('   CREATED  business rule  ' + brId); }
        else { fail('could not create the guard business rule'); }
    }

    // ================================================================ 4. WIDGET
    p('');
    p('4. WIDGET + PAGE');

    var SERVER = [
        '(function () {',
        '    var SCOPE = "' + SCOPE + '";',
        '    data.ready = false;',
        '    data.pageId = "' + PAGE_ID + '";',
        '',
        '    try {',
        '        var guard = new ' + SCOPE + '.AccessGuard();',
        '        data.who = guard.userDisplayName("User");',
        '        data.role = guard.roleLabel();',
        '        if (!guard.canViewAny()) { data.denied = true; return; }',
        '    } catch (e) { data.who = ""; data.role = ""; }',
        '',
        '    var eml = $sp.getParameter("eml") || "";',
        '',
        '    // no mail chosen - offer the ones that actually have something to net',
        '    if (!eml) {',
        '        data.picker = [];',
        '        var seen = {};',
        '        var g = new GlideRecord(SCOPE + "_cashflow");',
        '        g.addNotNullQuery("email");',
        '        g.orderByDesc("sys_created_on");',
        '        g.setLimit(1200);',
        '        g.query();',
        '        while (g.next()) {',
        '            var id = g.getValue("email");',
        '            seen[id] = (seen[id] || 0) + 1;',
        '        }',
        '        for (var k in seen) {',
        '            if (!seen.hasOwnProperty(k) || seen[k] < 2) { continue; }   // nothing to net',
        '            var em = new GlideRecord(SCOPE + "_email");',
        '            if (!em.get(k)) { continue; }',
        '            data.picker.push({ sys_id: k, name: em.getValue("name"),',
        '                               subject: em.getValue("mail_subject") || "",',
        '                               rows: seen[k],',
        '                               granularity: em.getValue("settle_granularity") || "gross" });',
        '        }',
        '        data.picker.sort(function (a, b) { return b.rows - a.rows; });',
        '        if (data.picker.length > 60) { data.picker.length = 60; }',
        '        return;',
        '    }',
        '',
        '    var eng = new ' + SCOPE + '.NettingEngine();',
        '',
        '    if (input && input.action === "setMode") {',
        '        eng.setGranularity(eml, input.mode);',
        '    }',
        '',
        '    if (input && input.action === "confirm") {',
        '        // settle at the chosen granularity: rebuild any missing net, match only the rows',
        '        // this mail actually settles, and leave the rest untouched',
        '        data.result = eng.matchActive(eml);',
        '    }',
        '',
        '    // every read heals a missing net, so a re-sync cannot leave the mail without one',
        '    eng.ensureNets(eml);',
        '    data.a = eng.analyse(eml);',
        '    data.ready = true;',
        '})();'
    ].join('\n');

    var TEMPLATE = [
        '<div class="gn">',
        '  <div ng-if="data.denied" class="gn-msg">You do not have access to any work driver.</div>',
        '',
        '  <!-- picker -->',
        '  <div ng-if="!data.ready && !data.denied">',
        '    <div class="gn-head"><div><h2>Gross / Net</h2>',
        '      <p class="gn-sub">Mails with more than one cashflow, newest first. Open one to choose how it settles.</p></div>',
        '      <div class="gn-who">{{data.who}}<span ng-if="data.role"> &middot; {{data.role}}</span></div></div>',
        '    <table class="gn-tbl"><thead><tr><th>Mail</th><th class="gn-r">Cashflows</th><th>Settles at</th><th></th></tr></thead>',
        '      <tbody><tr ng-repeat="m in data.picker">',
        '        <td><div class="gn-name">{{m.name}}</div><div class="gn-dim" ng-if="m.subject">{{m.subject}}</div></td>',
        '        <td class="gn-r gn-num">{{m.rows}}</td>',
        '        <td><span class="gn-tag" ng-class="{\'is-net\': m.granularity === \'net\'}">{{m.granularity}}</span></td>',
        '        <td><a class="gn-link" ng-href="?id={{data.pageId}}&eml={{m.sys_id}}">Open</a></td>',
        '      </tr></tbody></table>',
        '    <div class="gn-msg" ng-if="!data.picker.length">No mail has more than one cashflow yet.</div>',
        '  </div>',
        '',
        '  <!-- one mail -->',
        '  <div ng-if="data.ready">',
        '    <div class="gn-crumb"><a ng-href="?id={{data.pageId}}">Gross / Net</a> &rsaquo; this mail</div>',
        '    <div class="gn-head">',
        '      <div><h2>{{data.a.mail}}</h2><p class="gn-sub">{{data.a.subject}}</p>',
        '        <div class="gn-meta"><span>Counterparty <b>{{data.a.counterparty || \'not derived\'}}</b></span>',
        '          <span>{{data.a.groups.length}} netting group<span ng-if="data.a.groups.length!=1">s</span></span>',
        '          <span>{{data.a.components}} component<span ng-if="data.a.components!=1">s</span></span></div></div>',
        '      <div class="gn-who">{{data.who}}</div>',
        '    </div>',
        '',
        '    <div class="gn-switch">',
        '      <div class="gn-lbl">Settle at</div>',
        '      <div class="gn-seg" ng-class="{net: data.a.granularity === \'net\'}">',
        '        <span class="gn-thumb"></span>',
        '        <button ng-click="c.setMode(\'gross\')" ng-class="{on: data.a.granularity !== \'net\'}">Gross</button>',
        '        <button ng-click="c.setMode(\'net\')" ng-class="{on: data.a.granularity === \'net\'}">Net</button>',
        '      </div>',
        '      <div class="gn-note" ng-if="data.a.granularity === \'net\'">Components are kept and visible; only the net is settled and matched.</div>',
        '      <div class="gn-note" ng-if="data.a.granularity !== \'net\'">Each component is settled and matched on its own.</div>',
        '      <div class="gn-act">',
        '        <button class="gn-btn primary" ng-click="c.confirm()" ng-disabled="c.busy">',
        '          {{c.busy ? "Matching…" : "Confirm &amp; match"}}</button>',
        '      </div>',
        '    </div>',
        '',
        '    <div class="gn-result" ng-if="data.result">',
        '      Matched <b>{{data.result.matched}}</b> of <b>{{data.result.asked}}</b> settled row<span ng-if="data.result.asked!=1">s</span>',
        '      <span ng-if="data.result.no_match"> &middot; {{data.result.no_match}} with no booking</span>',
        '      <span ng-if="data.result.errors" class="gn-err"> &middot; {{data.result.errors}} error(s)</span>',
        '    </div>',
        '',
        '    <div class="gn-grp" ng-repeat="g in data.a.groups">',
        '      <div class="gn-grphead">',
        '        <span class="gn-key">{{g.key}}</span>',
        '        <span class="gn-dim" ng-if="!g.nettable">single cashflow &mdash; nothing to net</span>',
        '      </div>',
        '',
        '      <div ng-if="g.agrees === false" class="gn-warn">',
        '        The total stated in the mail ({{g.net.display}}) does not agree with the sum of its',
        '        {{g.count}} components ({{g.computedDisplay}}). Both are shown &mdash; a row may be missing or misread.',
        '      </div>',
        '',
        '      <table class="gn-tbl">',
        '        <thead><tr><th>Reference</th><th class="gn-r">Amount (Nomura)</th><th>Direction</th>',
        '          <th>Value date</th><th>Origin</th><th>Match</th></tr></thead>',
        '        <tbody>',
        '          <tr ng-if="data.a.granularity === \'net\' && g.nettable" class="gn-netrow">',
        '            <td><b>Net of {{g.count}}</b></td>',
        '            <td class="gn-r gn-amt">{{g.net ? g.net.display : g.computedDisplay}}</td>',
        '            <td><span class="gn-dir" ng-class="{pay: (g.net ? g.net.direction : g.computedDirection) === \'Pay\'}">{{g.net ? g.net.direction : g.computedDirection}}</span></td>',
        '            <td class="gn-num">{{g.valueDate}}</td>',
        '            <td><span class="gn-tag">{{g.net ? g.net.origin : \'computed\'}}</span></td>',
        '            <td><span class="gn-tag ok" ng-if="g.net && g.net.matchStatus">{{g.net.matchStatus}}</span>',
        '              <span class="gn-dim" ng-if="!g.net || !g.net.matchStatus">not matched yet</span></td>',
        '          </tr>',
        '          <tr ng-repeat="r in g.components" ng-class="{muted: data.a.granularity === \'net\' && g.nettable}">',
        '            <td class="gn-num">{{r.reference || \'&mdash;\'}}</td>',
        '            <td class="gn-r gn-amt">{{r.display}}</td>',
        '            <td><span class="gn-dir" ng-class="{pay: r.direction === \'Pay\'}">{{r.direction}}</span></td>',
        '            <td class="gn-num">{{r.valueDate}}</td>',
        '            <td><span class="gn-tag">{{r.origin}}</span></td>',
        '            <td><span class="gn-tag ok" ng-if="r.matchStatus">{{r.matchStatus}}<span ng-if="r.matchTier && r.matchTier != \'0\'"> &middot; tier {{r.matchTier}}</span></span>',
        '              <span class="gn-dim" ng-if="!r.matchStatus">&mdash;</span></td>',
        '          </tr>',
        '        </tbody>',
        '      </table>',
        '',
        '      <div class="gn-sum" ng-if="g.nettable">',
        '        Components sum to <b>{{g.computedDisplay}} {{g.currency}} {{g.computedDirection}}</b>',
        '        on Nomura’s side<span ng-if="g.agrees === true">, which agrees with the total stated in the mail</span>.',
        '      </div>',
        '    </div>',
        '  </div>',
        '</div>'
    ].join('\n');

    var CLIENT = [
        'function ($scope) {',
        '    var c = this;',
        '    c.busy = false;',
        '    c.setMode = function (mode) {',
        '        if (c.busy) { return; }',
        '        if (c.data.a && c.data.a.granularity === mode) { return; }',
        '        c.busy = true;',
        '        c.data.action = "setMode";',
        '        c.data.mode = mode;',
        '        c.data.result = null;',
        '        c.server.update().then(function () { c.data.action = ""; c.busy = false; });',
        '    };',
        '    c.confirm = function () {',
        '        if (c.busy) { return; }',
        '        c.busy = true;',
        '        c.data.action = "confirm";',
        '        c.server.update().then(function () { c.data.action = ""; c.busy = false; });',
        '    };',
        '}'
    ].join('\n');

    var CSS = [
        '.gn { padding: 20px 24px; font-size: 13px; color: #14181F; }',
        '.gn-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }',
        '.gn-head h2 { margin: 0; font-size: 18px; font-weight: 600; letter-spacing: -.01em; word-break: break-word; }',
        '.gn-sub { margin: 3px 0 0; color: #6B7684; }',
        '.gn-who { color: #6B7684; font-size: 12px; white-space: nowrap; }',
        '.gn-crumb { font-size: 12px; color: #9AA4B0; margin-bottom: 6px; }',
        '.gn-crumb a { color: #6B7684; text-decoration: none; }',
        '.gn-crumb a:hover { color: #C8102E; }',
        '.gn-meta { display: flex; gap: 16px; flex-wrap: wrap; margin-top: 7px; font-size: 12.5px; color: #6B7684; }',
        '.gn-meta b { color: #39424E; font-weight: 500; }',
        '.gn-switch { display: flex; align-items: center; gap: 18px; margin: 18px 0 14px; flex-wrap: wrap;',
        '             background: #fff; border: 1px solid #E3E8EE; border-radius: 6px; padding: 13px 16px; }',
        '.gn-lbl { font-size: 11px; text-transform: uppercase; letter-spacing: .09em; color: #9AA4B0; font-weight: 600; }',
        '.gn-seg { position: relative; display: inline-flex; background: #EEF2F6; border: 1px solid #E3E8EE;',
        '          border-radius: 5px; padding: 3px; }',
        '.gn-seg button { position: relative; z-index: 2; appearance: none; background: none; border: 0;',
        '                 cursor: pointer; font-family: inherit; font-size: 13px; font-weight: 600;',
        '                 color: #6B7684; padding: 6px 24px; border-radius: 3px; transition: color .2s; }',
        '.gn-seg button.on { color: #14181F; }',
        '.gn-thumb { position: absolute; top: 3px; left: 3px; height: calc(100% - 6px); width: calc(50% - 3px);',
        '            background: #fff; border-radius: 3px; box-shadow: 0 1px 3px rgba(20,24,31,.16);',
        '            transition: transform .28s cubic-bezier(.4,0,.2,1); }',
        '.gn-seg.net .gn-thumb { transform: translateX(100%); }',
        '.gn-note { font-size: 12px; color: #6B7684; }',
        '.gn-grp { background: #fff; border: 1px solid #E3E8EE; border-radius: 6px; margin-bottom: 14px; overflow: hidden; }',
        '.gn-grphead { padding: 10px 14px; border-bottom: 1px solid #EEF2F6; display: flex; gap: 12px;',
        '              align-items: center; background: #FAFBFC; }',
        '.gn-key { font-family: Consolas, monospace; font-size: 11.5px; color: #39424E; }',
        '.gn-tbl { width: 100%; border-collapse: collapse; }',
        '.gn-tbl thead th { background: #C8102E; color: #fff; text-align: left; font-size: 10.5px;',
        '                   font-weight: 600; text-transform: uppercase; letter-spacing: .07em; padding: 7px 14px; }',
        '.gn-tbl thead th.gn-r { text-align: right; }',
        '.gn-tbl td { padding: 9px 14px; border-bottom: 1px solid #EEF2F6; }',
        '.gn-tbl tbody tr:last-child td { border-bottom: 0; }',
        '.gn-tbl tbody tr.muted td { color: #9AA4B0; background: #FBFCFD; }',
        '.gn-tbl tbody tr.gn-netrow td { background: #F0F7F4; }',
        '.gn-r { text-align: right; }',
        '.gn-num { font-family: Consolas, monospace; font-variant-numeric: tabular-nums; font-size: 12.5px; }',
        '.gn-amt { font-family: Consolas, monospace; font-variant-numeric: tabular-nums; font-weight: 600; }',
        '.gn-dir { display: inline-block; font-size: 11px; padding: 2px 8px; border-radius: 3px;',
        '          background: #E8F3EE; color: #12654A; }',
        '.gn-dir.pay { background: #FBEDE6; color: #9A3412; }',
        '.gn-tag { display: inline-block; font-size: 11px; padding: 2px 8px; border-radius: 3px;',
        '          background: #EEF2F6; color: #39424E; }',
        '.gn-tag.ok { background: #E8F3EE; color: #12654A; font-weight: 500; }',
        '.gn-tag.is-net { background: #E8F3EE; color: #12654A; font-weight: 500; }',
        '.gn-sum { padding: 9px 14px; border-top: 1px solid #EEF2F6; font-size: 12.5px; color: #6B7684; background: #FAFBFC; }',
        '.gn-warn { margin: 10px 14px 0; padding: 9px 12px; border-radius: 4px; background: #FBF3E2;',
        '           border: 1px solid #F0DFB6; border-left: 3px solid #8A5A00; color: #6B5316; font-size: 12.5px; }',
        '.gn-name { font-weight: 500; word-break: break-word; }',
        '.gn-dim { color: #9AA4B0; font-size: 12px; }',
        '.gn-link { font-size: 12px; }',
        '.gn-msg { margin-top: 18px; color: #6B7684; }',
        '.gn-act { margin-left: auto; }',
        '.gn-btn { appearance: none; font-family: inherit; font-size: 12.5px; font-weight: 500;',
        '          padding: 8px 16px; border-radius: 4px; cursor: pointer; border: 1px solid #E3E8EE;',
        '          background: #fff; color: #39424E; transition: background .18s, border-color .18s; }',
        '.gn-btn.primary { background: #C8102E; border-color: #C8102E; color: #fff; }',
        '.gn-btn.primary:hover { background: #8E0B20; border-color: #8E0B20; }',
        '.gn-btn[disabled] { opacity: .55; cursor: default; }',
        '.gn-result { background: #F0F7F4; border: 1px solid #CFE3DA; border-left: 3px solid #12654A;',
        '             border-radius: 4px; padding: 10px 13px; margin-bottom: 14px; font-size: 12.5px; color: #1B4D3B; }',
        '.gn-err { color: #9B1C1C; }'
    ].join('\n');

    var w = new GlideRecord('sp_widget');
    w.addQuery('id', WIDGET_ID);
    w.setLimit(1);
    w.query();
    var wid = '';
    if (w.next()) {
        w.setValue('template', TEMPLATE);
        w.setValue('css', CSS);
        w.setValue('script', SERVER);
        w.setValue('client_script', CLIENT);
        own(w);
        w.update();
        wid = w.getUniqueValue();
        p('   UPDATED  widget ' + WIDGET_ID);
    } else {
        w.initialize();
        w.setValue('id', WIDGET_ID);
        w.setValue('name', 'NexAI Gross / Net');
        w.setValue('description', 'Choose whether a mail settles as its components or as the net of each netting group.');
        w.setValue('template', TEMPLATE);
        w.setValue('css', CSS);
        w.setValue('script', SERVER);
        w.setValue('client_script', CLIENT);
        w.setValue('public', false);
        own(w);
        wid = w.insert();
        if (wid) { p('   CREATED  widget ' + WIDGET_ID + '  ' + wid); }
        else { fail('could not create the widget'); }
    }

    var pid = '';
    if (wid) {
        var pg = new GlideRecord('sp_page');
        pg.addQuery('id', PAGE_ID);
        pg.setLimit(1);
        pg.query();
        if (pg.next()) {
            own(pg); pg.update(); pid = pg.getUniqueValue();
            p('   UPDATED  page ' + PAGE_ID);
        } else {
            pg.initialize();
            pg.setValue('id', PAGE_ID);
            pg.setValue('title', 'Gross / Net');
            pg.setValue('short_description', 'Choose how a mail settles');
            pg.setValue('public', false);
            own(pg);
            pid = pg.insert();
            if (pid) { p('   CREATED  page ' + PAGE_ID + '  ' + pid); }
            else { fail('could not create the page'); }
        }
    }

    function findOrMake(table, query, fill) {
        var g = new GlideRecord(table);
        for (var k in query) { if (query.hasOwnProperty(k)) { g.addQuery(k, query[k]); } }
        g.setLimit(1);
        g.query();
        if (g.next()) { return g.getUniqueValue(); }
        g.initialize();
        for (var k2 in query) { if (query.hasOwnProperty(k2)) { g.setValue(k2, query[k2]); } }
        if (fill) { fill(g); }
        own(g);
        return g.insert();
    }

    if (pid && wid) {
        var cont = findOrMake('sp_container', { sp_page: pid, order: 100 }, function (g) {
            g.setValue('name', 'Gross / Net'); g.setValue('width', 'container-fluid');
        });
        var row = cont ? findOrMake('sp_row', { sp_container: cont, order: 100 }, null) : '';
        var col = row ? findOrMake('sp_column', { sp_row: row, order: 100 }, function (g) {
            g.setValue('size', 12);
        }) : '';
        var inst = col ? findOrMake('sp_instance', { sp_column: col, sp_widget: wid }, function (g) {
            g.setValue('title', 'Gross / Net'); g.setValue('order', 100);
        }) : '';
        if (!inst) { fail('could not lay the widget onto the page'); }
        else { p('   layout ok'); }
    }

    // ================================================================ done
    p('');
    if (failed) {
        p('INSTALL INCOMPLETE - see the !! lines above.');
    } else {
        p('INSTALLED. Open it at:');
        p('   https://' + gs.getProperty('instance_name') + '.service-now.com/nexai?id=' + PAGE_ID);
        p('');
        p('   The landing list shows every mail with more than one cashflow.');
        p('   Open one, press Gross or Net, and the choice is saved on the mail.');
        p('');
        p('   Switching to Net writes one net row per netting group and clears any match on the');
        p('   components, so a net and its components can never both claim the same money.');
        p('   Switching back to Gross clears the net\'s match. Every switch writes a');
        p('   granularity.selected event to the audit trail.');
        p('');
        p('   END TO END, without editing any existing code:');
        p('     - Confirm & match runs Compare & Match over the settled rows ONLY.');
        p('     - The guard business rule strips a match from any row that is not settled, so even a');
        p('       run started from the flow or the board cannot leave a net and its components both');
        p('       claiming the same money.');
        p('     - Nets heal themselves: a re-sync deletes them, the next read rebuilds them, so the');
        p('       choice survives re-extraction. WizardExtractor is untouched.');
        p('     - Audit: granularity.selected on every switch, netting.computed on every net built.');
        p('');
        p('   STILL COUNTS EVERY ROW: the board tiles and the case screen have no notion of roles,');
        p('   so a mail switched to Net shows one extra row there until they are taught to filter on');
        p('   is_net. Only switched mails are affected - nothing else gains a row. That change edits');
        p('   working widgets, so it is deliberately a separate, deliberate step.');
    }
    p('=================================================================');
    gs.info('\n' + log.join('\n'));
})();
