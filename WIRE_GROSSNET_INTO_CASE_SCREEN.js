[0:00:02.735] Script completed in scope global: script
Script execution history and recovery available here
Operation	Table	Row Count
update	sys_update_version	7
update	sys_update_xml	7
insert	sys_update_version	7
update	sys_metadata_customization	6
delete	sp_row	1
...and another 6 affected table(s)
View full summary here
*** Script: [grossnet-backup] widget=nexaitest-ai-extraction sys_id=62d8561211e948e29729a77664498a49
---- SERVER ----
/**
 * OTC AI Case Screen — Service Portal widget SERVER script.
 * Full replica of the OTC analyst screen (Extracted -> Compare & Match -> Decide next action, with
 * analyst-feedback writeback), but every extracted value comes from the AI fields (ai_*), the match
 * runs via CompareMatch.buildDataAi, and all analyst-feedback state is stored on the PARALLEL ai_*
 * workflow fields (ai_confirmed / ai_analyst_outcome / ai_review_confirmed / ai_resolution) so the AI
 * path is completely independent of the OTC path. AI extraction logic itself is untouched.
 */
(function () {
    // ── ACCESS GUARD (centralised: x_nose_nexai_test.AccessGuard) ──
    // A non-manager/admin analyst may open a case ONLY while they still have at least one PUBLISHED
    // work-driver assigned. Re-evaluated on every request, so once the manager deletes the work-driver or
    // unassigns the analyst, the next load/refresh bounces them to the landing page (client navigates away).
    data.redirect = '';
    if (!new x_nose_nexai_test.AccessGuard().canViewAny()) { data.redirect = '/nexaitest?id=nexaitest_work_drivers'; }
    if (data.redirect) { data.empty = true; return; }

    // READ-ONLY (FR-UI-022): only the ASSIGNED analyst of the cashflow's work-driver may act (confirm /
    // override / write-back). A manager/admin — or anyone arriving from a read-only board (?ro=1) — views it
    // read-only: every state-changing action is gated server-side below, and the buttons are hidden in the UI.
    var _ag = new x_nose_nexai_test.AccessGuard();
    data.role = _ag.roleLabel();
    // Header identity (name + avatar initials) from the ONE helper - was a hardcoded 'US' in the template.
    data.name = new x_nose_nexai_test.AccessGuard().userDisplayName('User');
    data.initials = new x_nose_nexai_test.AccessGuard().userInitials('User');
    function _canActCf(cfSysId) { if (!cfSysId) { return false; } var _g = new GlideRecord('x_nose_nexai_test_cashflow'); return _g.get('' + cfSysId) ? _ag.canActOnCashflow(_g) : false; }
    var _roParam = ('' + ($sp.getParameter('ro') || (input && input.ro) || '')) === '1';
    // $sp.getParameter is only reliable on the initial GET; on a server.update() POST the URL params are
    // gone, so fall back to the persisted client value (data.cfParam / data.ro) — otherwise readOnly would
    // flip to true after every Save/Confirm and hide all controls. Same fallback used at line ~295.
    var _cfForRo = $sp.getParameter('cf') || (input && input.cfParam) || '';
    data.readOnly = _roParam || !_canActCf(_cfForRo);
    data.ro = _roParam ? '1' : '';   // persist so the fallback above survives a server.update() POST

    var ex = new x_nose_nexai_test.EmlFieldExtractor();
    function setIf(gr, col, v) { if (v !== null && v !== undefined) { gr.setValue(col, '' + v); } }
    function vdDisp(v) { var m = ('' + (v || '')).match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? (m[3] + '-' + m[2] + '-' + m[1]) : ('' + (v || '')); }
    function vdIso(v) { v = '' + (v || ''); if (/^\d{4}-\d{2}-\d{2}$/.test(v)) { return v; } var m = v.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/); return m ? (m[3] + '-' + ('0' + m[1]).slice(-2) + '-' + ('0' + m[2]).slice(-2)) : v; }
    function fmtReceived(raw) {
        raw = '' + (raw || '');
        var m = raw.match(/(\d{1,2})\s+([A-Za-z]{3})[A-Za-z]*\s+(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
        if (!m) { return raw; }
        var mo = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' }[m[2].toLowerCase()] || '01';
        return ('0' + m[1]).slice(-2) + '-' + mo + '-' + m[3] + ' ' + ('0' + m[4]).slice(-2) + ':' + m[5] + ':' + (m[6] || '00');
    }
    function extractEmail(s) {
        s = '' + (s || '');
        var m = s.match(/<([^>]+)>/); if (m) { return m[1].trim(); }
        m = s.match(/[\w.+-]+@[\w.-]+\.\w+/); return m ? m[0] : '';
    }
    function fmtAmt(v) {
        var n = parseFloat(('' + (v || '')).replace(/,/g, ''));
        if (isNaN(n)) { return '' + (v || '-'); }
        var p = n.toFixed(2).split('.');
        p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        return p.join('.');
    }
    // Never-negative amount + direction double-flip rule — delegated to the SHARED AmountDirection Script
    // Include so the case screen and the board (TaggingDashboard) agree. Fixes the old inline divergences:
    // free-text directions ("COU RECEIVE") are now normalised before flipping, and an empty direction no
    // longer becomes a '-' sentinel. The AI's raw negative is accepted on extraction ("let it be"); this
    // only governs display + what we persist on an analyst action.
    var _adir = new x_nose_nexai_test.AmountDirection();
    function flipDir(d) { return _adir.flip(d); }
    function amtIsNeg(a) { return _adir.isNeg(a); }
    function amtAbs(a) { return _adir.absAmt(a); }
    function dispDir(amt, dir) { return _adir.dispDir(amt, dir); }
    function drow(label, val) { return '  ' + (label + '                    ').slice(0, 18) + ('' + (val === '' || val == null ? '-' : val)); }
    function detailBlock(ref, ccy, amt, dir, vd) {
        return drow('Trade reference', ref) + '\n' + drow('Currency', ccy) + '\n' +
            drow('Amount', fmtAmt(amt)) + '\n' + drow('Direction', dir) + '\n' + drow('Value date', vd);
    }

    // Step 3 draft — DRIVEN by the write-back action the manager configured for this outcome in the
    // onboarding wizard (Send to NEWS / Reply to Counterparty / Reply to Middle Office). Falls back to a
    // Middle Office referral when nothing is configured. The analyst still resolves with the Resolved
    // buttons; the write-back "send" is the configured side action.
    function buildDraft(action) {
        var ref = data.reference || '(no reference)';
        var ccy = data.currency || '', amt = data.amount || '', vd = data.value_date || '';
        var cp = data.counterparty || 'Counterparty';
        var subj = ref + ' (' + ccy + ', value ' + vd + ')';
        var bk = (data.cmp && data.cmp.booking) ? data.cmp.booking : null;
        var diffs = (data.cmp && data.cmp.banner) ? data.cmp.banner.diffs.concat(data.cmp.banner.miss).join(', ') : '';
        var cpBlk = detailBlock(ref, ccy, amt, data.direction, vd);
        var bkBlk = bk ? detailBlock(bk.bank_trade_ref || bk.reference || '-', bk.currency || ccy, bk.amount, bk.direction || data.direction, bk.value_date || vd) : '  (no matching booking found in our systems)';
        var lead = diffs
            ? ('The counterparty confirmation and our booking differ on the field(s): ' + diffs + '.')
            : (bk ? 'The counterparty confirmation and our booking agree on every field.'
                  : 'No matching booking was found in our systems for the cash flow below.');
        var tail = '\n\nCounterparty: ' + cp + '\nSource email: ' + data.ref + '\n\nCounterparty submitted:\n' + cpBlk + '\n\nBooked by the bank:\n' + bkBlk + '\n\nRegards,\nSettlements';

        // `action` (passed in) is ONE of the manager-configured write-back actions for this outcome
        // (Send to NEWS / Reply to Counterparty / Reply to Middle Office). May be '' when none configured.
        action = '' + (action || '');
        var senderEmail = gr.getValue('mail_from') || (cp + ' Settlements');

        // Default: Middle Office referral (no config, or a Middle Office action).
        // channel: 'email' = an actual message to a person (To/Subject/Body draft). 'system' = a
        // system write-back with NO mail intimation (just a status line) — used for NEWS.
        var d = {
            action: action, channel: 'email', title: 'Refer to Middle Office', to: 'middleoffice@abc.com',
            subject: 'Referral: Trade confirmation — ' + subj, body: lead + tail,
            sendLabel: 'Send to Middle Office', sentLabel: 'Sent to Middle Office'
        };
        if (/news/i.test(action)) {
            // NEWS is a SYSTEM write-back (the booking system), not an email — no mail intimation.
            d.channel = 'system'; d.title = 'Write-back to NEWS'; d.to = ''; d.subject = '';
            d.body = (bk && !diffs)
                ? 'Counterparty confirmation and our booking agree on every field. The confirmed settlement will be written back to NEWS — no email is sent.'
                : 'The confirmed settlement will be written back to NEWS — no email is sent.';
            d.sendLabel = 'Send to NEWS'; d.sentLabel = 'Sent to NEWS';
        } else if (/counterparty/i.test(action)) {
            d.title = 'Reply to Counterparty'; d.to = senderEmail; d.subject = 'Re: Trade confirmation — ' + subj;
            d.body = 'Hi ' + cp + ',\n\n' + lead + tail;
            d.sendLabel = 'Reply to Counterparty'; d.sentLabel = 'Reply sent to counterparty';
        } else if (/middle office/i.test(action)) {
            d.title = /reply/i.test(action) ? 'Reply to Middle Office' : 'Refer to Middle Office';
            d.sendLabel = /reply/i.test(action) ? 'Reply to Middle Office' : 'Send to Middle Office';
            d.sentLabel = /reply/i.test(action) ? 'Reply sent to Middle Office' : 'Sent to Middle Office';
        }
        // Embed the ORIGINAL inbound email underneath the reply — a real reply quotes the source message.
        // Applies to any EMAIL channel (Counterparty / Middle Office); the NEWS system write-back has no
        // email, so it is skipped. Reply on top, quoted original below (standard email reply format).
        if (d.channel === 'email') {
            var m = data.mail || {};
            if (m.body || m.subject) {
                d.body += '\n\n----------------- Original Message -----------------\n' +
                          'From:    ' + (m.from || '') + '\n' +
                          'To:      ' + (m.to || '') + '\n' +
                          (m.received ? ('Sent:    ' + m.received + '\n') : '') +
                          'Subject: ' + (m.subject || '') + '\n' +
                          '----------------------------------------------------\n\n' +
                          (m.body || '');
            }
        }
        return d;
    }

    // ---- Audit trail: append-only capture of analyst actions + AI inferences (BRD §Audit, FSD §15) ----
    var AUD = new x_nose_nexai_test.AuditTrail();
    function auditCf(cfGr, eventType, opts) {
        opts = opts || {};
        var emId = cfGr.getValue('email'), mailId = '', cp = '';
        var em = new GlideRecord('x_nose_nexai_test_email');
        if (em.get(emId)) { mailId = em.getValue('name'); cp = em.getValue('counterparty_name'); }
        opts.entityType = 'cashflow';
        opts.entityId = cfGr.getUniqueValue();
        opts.emailId = emId;
        opts.cashflowId = cfGr.getUniqueValue();
        opts.mailId = mailId;
        opts.counterparty = cp;
        AUD.log(eventType, opts);
    }

    // Save action: persist the edited AI fields back onto the cashflow (ai_* only — never the OTC fields).
    if (input && input.action === 'save' && input.cfSysId && _canActCf(input.cfSysId)) {
        if (input.cfSysId) {
            var cfg = new GlideRecord('x_nose_nexai_test_cashflow');
            if (cfg.get(input.cfSysId)) {
                // Counterparty is DERIVED (not AI) and read-only, so it is never written here. Compare
                // each incoming value to the stored one first, so a corrected field is audited as an
                // override (original AI value vs analyst-corrected value) per FSD override-transparency.
                var fmap = [
                    ['ai_nomura_entity', 'Nomura Entity', input.nomuraEntity],
                    ['ai_reference', 'Counterparty Reference', input.reference],
                    ['ai_product', 'Product', input.product],
                    ['ai_currency', 'Currency', input.currency],
                    ['ai_trade_date', 'Trade Date', vdIso(input.tradeDate)],
                    ['ai_value_date', 'Value Date', vdIso(input.value_date)],
                    ['ai_ssi_bank', 'SSI Bank / BIC', input.ssiBank],
                    ['ai_ssi_account', 'SSI Account', input.ssiAccount],
                    ['ai_ssi_beneficiary', 'SSI Beneficiary / BIC', input.ssiBeneficiary],
                    ['ai_ssi_intermediary', 'SSI Intermediary', input.ssiIntermediary]
                ];
                var overrides = [];
                for (var fi = 0; fi < fmap.length; fi++) {
                    var col = fmap[fi][0], lbl = fmap[fi][1], nv = fmap[fi][2];
                    if (nv === undefined || nv === null) { continue; }
                    var ov = cfg.getValue(col) || '';
                    if (('' + nv) !== ('' + ov)) { overrides.push({ label: lbl, before: ov, after: '' + nv }); }
                    setIf(cfg, col, nv);
                }
                // Amount + Direction are handled as a PAIR against the DISPLAYED (normalized) values the
                // analyst saw: the card shows |amount| + the double-flipped direction when the stored amount
                // is negative. Persist the normalized pair (never negative, net direction) so it stays stable
                // on re-open; audit only when the analyst genuinely changed what they saw.
                var _stAmtRaw = cfg.getValue('ai_amount'), _stDirRaw = cfg.getValue('ai_direction');
                var _stAmtDisp = amtAbs(_stAmtRaw), _stDirDisp = dispDir(_stAmtRaw, _stDirRaw);
                if (input.amount !== undefined && input.amount !== null) {
                    var _newAmt = amtAbs(input.amount);
                    // Compare against, and audit, the value the analyst actually SAW (the displayed/normalized
                    // one) — not the raw stored value — so we never log a spurious "X -> X" override.
                    if (('' + _newAmt) !== ('' + _stAmtDisp)) { overrides.push({ label: 'Amount', before: _stAmtDisp, after: _newAmt }); }
                    cfg.setValue('ai_amount', '' + _newAmt);
                }
                if (input.direction !== undefined && input.direction !== null) {
                    if (('' + input.direction) !== ('' + _stDirDisp)) { overrides.push({ label: 'Direction', before: _stDirDisp, after: '' + input.direction }); }
                    cfg.setValue('ai_direction', '' + input.direction);
                }
                cfg.update();
                for (var oi = 0; oi < overrides.length; oi++) {
                    var ovr = overrides[oi];
                    auditCf(cfg, 'extraction.overridden', {
                        summary: 'Analyst corrected ' + ovr.label,
                        fieldName: ovr.label, aiValue: ovr.before, analystValue: ovr.after
                    });
                }
            }
        }
        // Counterparty override. It is written to ai_counterparty, like every other corrected field on
        // this screen - NOT to the email's counterparty_name.
        //
        // That column carries one meaning: "the Eve directory answered this for this sender". Writing an
        // analyst's (or the AI's) value into it destroyed that meaning, and nothing on the record said so.
        // A typed name then came back badged "Derived - EVE" on reopen, and the matcher's directory
        // fallback treated it as directory-confirmed - so a name a person invented could produce a Tier 1
        // counterparty-exact match that no directory ever backed.
        //
        // Applied to EVERY cashflow of the mail: one mail has one counterparty, so correcting it on the
        // row in front of the analyst must not leave the other rows of the same mail disagreeing.
        //
        // AUTHORIZATION unchanged: the mail is resolved from the (already access-checked) cashflow, NEVER
        // from a client-supplied email id, so an analyst cannot reach another wizard's mail by posting a
        // foreign id.
        if (input.counterparty !== undefined && input.counterparty !== null && input.cfSysId) {
            var acg = new GlideRecord('x_nose_nexai_test_cashflow');
            if (acg.get(input.cfSysId)) {
                var oldCp = acg.getValue('ai_counterparty') || '';
                if (('' + input.counterparty) !== ('' + oldCp)) {
                    var sib = new GlideRecord('x_nose_nexai_test_cashflow');
                    sib.addQuery('email', acg.getValue('email'));
                    sib.query();
                    while (sib.next()) {
                        sib.setValue('ai_counterparty', '' + input.counterparty);
                        sib.update();
                    }
                    auditCf(acg, 'extraction.overridden', {
                        summary: 'Analyst corrected Counterparty (applied to every cashflow of this mail)',
                        fieldName: 'Counterparty', aiValue: oldCp, analystValue: '' + input.counterparty
                    });
                }
            }
        }
        data.saved = true;
    }

    // Confirm THIS cashflow's AI extraction (independent of OTC).
    if (input && input.action === 'confirm' && input.cfSysId && _canActCf(input.cfSysId)) {
        var ccg = new GlideRecord('x_nose_nexai_test_cashflow');
        if (ccg.get(input.cfSysId)) {
            // Confirm stores nothing but the confirmation itself. It used to rewrite a negative amount to
            // |amount| with a flipped direction, which under DIRECTION PRIORITY would silently undo the
            // sign on the very record about to be matched - and the sign is what makes it comparable to a
            // bank booking. The pair is already correct when it arrives here; confirming must not edit it.
            ccg.setValue('ai_confirmed', 'true'); ccg.update();
            auditCf(ccg, 'extraction.confirmed', {
                summary: 'Analyst confirmed the extracted fields',
                ai: { amount: ccg.getValue('ai_amount'), currency: ccg.getValue('ai_currency'), value_date: ccg.getValue('ai_value_date'), direction: ccg.getValue('ai_direction') }
            });
        }
    }

    // Analyst outcome writeback (HITL) — ai_* workflow fields only.
    if (input && input.action === 'outcome' && input.cfSysId && input.outcomeChoice && _canActCf(input.cfSysId)) {
        var og = new GlideRecord('x_nose_nexai_test_cashflow');
        if (og.get(input.cfSysId)) { og.setValue('ai_analyst_outcome', input.outcomeChoice); og.setValue('ai_review_confirmed', ''); og.setValue('ai_resolution', ''); og.setValue('ai_mo_sent', ''); og.update(); }
    }
    if (input && input.action === 'reset_outcome' && input.cfSysId && _canActCf(input.cfSysId)) {
        var rg = new GlideRecord('x_nose_nexai_test_cashflow');
        if (rg.get(input.cfSysId)) { rg.setValue('ai_analyst_outcome', ''); rg.setValue('ai_review_confirmed', ''); rg.setValue('ai_resolution', ''); rg.setValue('ai_mo_sent', ''); rg.update(); }
    }
    if (input && input.action === 'confirm_review' && input.cfSysId && _canActCf(input.cfSysId)) {
        var cvg = new GlideRecord('x_nose_nexai_test_cashflow');
        if (cvg.get(input.cfSysId)) {
            if (input.outcomeChoice) { cvg.setValue('ai_analyst_outcome', input.outcomeChoice); }
            cvg.setValue('ai_review_confirmed', 'true');
            cvg.update();
            auditCf(cvg, 'match.confirmed', { summary: 'Analyst confirmed the match outcome: ' + (cvg.getValue('ai_analyst_outcome') || ''), analystValue: cvg.getValue('ai_analyst_outcome') });
        }
    }
    // Analyst SELECTS which candidate booking to compare against — the selection (not the matcher's
    // best) drives the outcome. Matched if the chosen booking agrees on every field, else Mismatch.
    if (input && input.action === 'select_candidate' && input.cfSysId && input.candKey && _canActCf(input.cfSysId)) {
        var scg = new GlideRecord('x_nose_nexai_test_cashflow');
        if (scg.get(input.cfSysId)) {
            var cmpSel = new x_nose_nexai_test.CompareMatch().buildDataAi(input.cfSysId, '', input.candKey);
            var selOutcome = (cmpSel && cmpSel.systemOutcome === 'matched') ? 'matched' : 'mismatch';
            scg.setValue('ai_selected_booking', input.candKey);
            scg.setValue('ai_analyst_outcome', selOutcome);
            scg.setValue('ai_review_confirmed', ''); scg.setValue('ai_resolution', ''); scg.setValue('ai_mo_sent', '');
            scg.update();
            var topRef = '', selConf = '';
            var cl = (cmpSel && cmpSel.candidatesList) || [];
            for (var ci = 0; ci < cl.length; ci++) { if (cl[ci].best) { topRef = cl[ci].bankRef; } if (cl[ci].key === input.candKey) { selConf = cl[ci].confidence; } }
            auditCf(scg, 'match.selected', {
                summary: 'Selected booking ' + input.candKey + ' at ' + (cmpSel ? cmpSel.tierLabel : '') + ' — ' + selOutcome,
                aiValue: topRef, analystValue: input.candKey,
                ai: { tier: cmpSel ? cmpSel.tier : 0, tierLabel: cmpSel ? cmpSel.tierLabel : '', candidate: input.candKey, confidence: selConf, outcome: selOutcome, diffs: cmpSel ? cmpSel.diffCount : 0, candidates: cl.length }
            });
        }
    }
    // Analyst declares that none of the candidates match -> no-match path.
    if (input && input.action === 'mark_no_match' && input.cfSysId && _canActCf(input.cfSysId)) {
        var nmg = new GlideRecord('x_nose_nexai_test_cashflow');
        if (nmg.get(input.cfSysId)) {
            nmg.setValue('ai_selected_booking', 'none');
            nmg.setValue('ai_analyst_outcome', 'no_match');
            nmg.setValue('ai_review_confirmed', ''); nmg.setValue('ai_resolution', ''); nmg.setValue('ai_mo_sent', '');
            nmg.update();
            auditCf(nmg, 'match.no_match', { summary: 'Analyst marked the cashflow as no match', analystValue: 'no_match' });
        }
    }
    // Step 3 resolution — the analyst picks one; this is what the dashboard Workflow Status shows.
    if (input && input.action === 'resolve_matched' && input.cfSysId && _canActCf(input.cfSysId)) {
        var rm = new GlideRecord('x_nose_nexai_test_cashflow');
        if (rm.get(input.cfSysId)) { rm.setValue('ai_resolution', 'resolved_matched'); rm.update(); auditCf(rm, 'writeback', { summary: 'Resolved — Matched (sent to NEWS)', analystValue: 'resolved_matched' }); }
    }
    if (input && input.action === 'resolve_unmatched' && input.cfSysId && _canActCf(input.cfSysId)) {
        var ru = new GlideRecord('x_nose_nexai_test_cashflow');
        if (ru.get(input.cfSysId)) { ru.setValue('ai_resolution', 'resolved_unmatched'); ru.update(); auditCf(ru, 'writeback', { summary: 'Resolved — Unmatched', analystValue: 'resolved_unmatched' }); }
    }
    // Optional side action — records a local "sent" marker only; deliberately does NOT touch
    // ai_resolution, so the dashboard Workflow Status is unaffected by sending to Middle Office.
    if (input && input.action === 'send_mo' && input.cfSysId && _canActCf(input.cfSysId)) {
        var sd = new GlideRecord('x_nose_nexai_test_cashflow');
        var wbLabel = '' + (input.sendLabel || 'Send to Middle Office');
        if (sd.get(input.cfSysId)) { sd.setValue('ai_mo_sent', 'true'); sd.update(); auditCf(sd, 'writeback.mo', { summary: 'Write-back: ' + wbLabel, analystValue: wbLabel }); }
    }

    // Which record to show: ?cf -> parent email; ?eml -> email; else latest relevant.
    var cfParam = $sp.getParameter('cf') || (input && input.cfParam) || '';
    var emlParam = $sp.getParameter('eml') || (input && input.emlParam) || '';
    var emailFromCf = '';
    if (cfParam) { var cfr = new GlideRecord('x_nose_nexai_test_cashflow'); if (cfr.get(cfParam)) { emailFromCf = cfr.getValue('email'); } }
    var wantId = (input && input.id) || emailFromCf || emlParam || '';
    var gr = new GlideRecord('x_nose_nexai_test_email');
    var found = wantId ? gr.get(wantId) : false;
    if (!found) {
        var q = new GlideRecord('x_nose_nexai_test_email');
        q.addQuery('classification', 'relevant');
        q.orderByDesc('sys_created_on'); q.setLimit(1); q.query();
        if (q.next()) { gr = q; } else { data.empty = true; return; }
    }
    // PER-RECORD VIEW GUARD (compare/audit do the same): the caller must be able to view THIS mail's owning
    // work-driver (wiz_extracted||wiz_assigned). canViewAny() above only proves they're SOME analyst; without
    // this, a hand-typed ?cf=/?eml=/picker id — or the "latest relevant" fallback — exposes another wizard's
    // economics + SSI. Managers/admins pass.
    if (!_ag.canViewWizard('' + (gr.getValue('wiz_extracted') || gr.getValue('wiz_assigned')))) {
        data.redirect = '/nexaitest?id=nexaitest_work_drivers'; data.empty = true; return;
    }

    data.empty = false;
    data.id = gr.getUniqueValue();
    data.ref = ('' + (gr.getValue('name') || '')).replace(/\.eml$/i, '') || '(no id)';

    // Resolve the clicked cashflow (or the email's first) and read the AI-extracted fields.
    var cfRec = null;
    if (cfParam) { var cfg2 = new GlideRecord('x_nose_nexai_test_cashflow'); if (cfg2.get(cfParam) && cfg2.getValue('email') === gr.getUniqueValue()) { cfRec = cfg2; } }
    if (!cfRec) { var f1 = new GlideRecord('x_nose_nexai_test_cashflow'); f1.addQuery('email', gr.getUniqueValue()); f1.orderBy('flow_index'); f1.setLimit(1); f1.query(); if (f1.next()) { cfRec = f1; } }
    data.cfSysId = cfRec ? cfRec.getUniqueValue() : '';
    // Email-body highlighting was REMOVED on 2026-09-17: it relied on per-field "provenance" snippets that
    // the model had to copy into every answer (about half of each reply, and the reason a large mail could
    // not fit in one call). The body is shown plain. A deterministic highlighter (search the body for the
    // stored value) is the intended replacement; the ai_sources column is kept but no longer written.
    data.sources = null;
    data.analystOutcome = cfRec ? (cfRec.getValue('ai_analyst_outcome') || '') : '';
    data.reviewConfirmed = cfRec ? (cfRec.getValue('ai_review_confirmed') === 'true') : false;
    // Counterparty: the AI-read name FIRST, the Eve directory only as the fallback - the same order the
    // matcher uses (CompareMatch._counterpartyFor), so the screen can never show a name the match was not
    // made on. For a real mailbox the directory usually has no entry for the sender, which is why the AI
    // reading is the primary source rather than the exception.
    //
    // ONE value, deliberately. This used to show the directory name with the AI reading beneath it in grey
    // - two answers to one question, on the field that decides Tier 1 and Tier 2. The fallback is a
    // fallback, not a second opinion to be displayed.
    var _cpEve = gr.getValue('counterparty_name') || '';
    var _cpAi = cfRec ? (cfRec.getValue('ai_counterparty') || '') : '';
    data.counterparty = _cpAi || _cpEve;
    data.counterpartySource = _cpAi ? 'ai' : (_cpEve ? 'eve' : '');
    data.reference = cfRec ? cfRec.getValue('ai_reference') : gr.getValue('ai_reference');
    data.currency = cfRec ? cfRec.getValue('ai_currency') : gr.getValue('ai_currency');
    // Never surface a negative amount: show |amount|, and double-flip the direction when it was negative.
    var _rawAmt = cfRec ? cfRec.getValue('ai_amount') : gr.getValue('ai_amount');
    var _rawDir = cfRec ? cfRec.getValue('ai_direction') : gr.getValue('ai_direction');
    data.amount = amtAbs(_rawAmt);
    data.direction = dispDir(_rawAmt, _rawDir);
    data.value_date = cfRec ? cfRec.getValue('ai_value_date') : gr.getValue('ai_value_date');   // ISO YYYY-MM-DD
    // The remaining BRD/FSD fields (AI-extracted, per cashflow).
    data.nomuraEntity = cfRec ? cfRec.getValue('ai_nomura_entity') : '';
    data.product = cfRec ? cfRec.getValue('ai_product') : '';
    data.tradeDate = cfRec ? cfRec.getValue('ai_trade_date') : '';   // ISO YYYY-MM-DD
    data.ssiBank = cfRec ? cfRec.getValue('ai_ssi_bank') : '';
    data.ssiAccount = cfRec ? cfRec.getValue('ai_ssi_account') : '';
    data.ssiBeneficiary = cfRec ? cfRec.getValue('ai_ssi_beneficiary') : '';
    data.ssiIntermediary = cfRec ? cfRec.getValue('ai_ssi_intermediary') : '';
    data.confirmed = cfRec ? (cfRec.getValue('ai_confirmed') === 'true') : false;

    // Which fields to DISPLAY = the owning wizard's configured fields (the 4 mandatory + counterparty are
    // always shown; optional fields the wizard did NOT configure are hidden). Default = show all (for
    // cashflows not produced by a wizard).
    data.show = { counterparty: true, value_date: true, amount: true, currency: true, direction: true, reference: true, nomuraEntity: true, product: true, tradeDate: true, ssiBank: true, ssiAccount: true, ssiBeneficiary: true, ssiIntermediary: true };
    var showWiz = gr.getValue('wiz_extracted') || '';
    if (showWiz) {
        var wgShow = new GlideRecord('x_nose_nexai_test_wizard');
        if (wgShow.get(showWiz)) {
            var fldsShow = [];
            try { fldsShow = JSON.parse(wgShow.getValue('input_fields') || '[]'); } catch (eShow) { fldsShow = []; }
            if (fldsShow.length) {
                var FKEY = { 'value date': 'value_date', 'amount': 'amount', 'currency': 'currency', 'direction': 'direction', 'counterparty reference': 'reference', 'trade reference': 'reference', 'counterparty name': 'counterparty', 'nomura entity': 'nomuraEntity', 'product': 'product', 'trade date': 'tradeDate', 'ssi bank / bic': 'ssiBank', 'ssi account': 'ssiAccount', 'ssi beneficiary / bic': 'ssiBeneficiary', 'ssi intermediary': 'ssiIntermediary' };
                var show = { counterparty: true, value_date: true, amount: true, currency: true, direction: true };
                for (var si = 0; si < fldsShow.length; si++) { var sk = FKEY[('' + (fldsShow[si].name || '')).toLowerCase()]; if (sk) { show[sk] = true; } }
                data.show = show;
            }
        }
    }

    // Write-back actions configured in the owning wizard (per Compare & Match outcome) — surfaced so the
    // analyst sees what the workflow does for this cashflow's outcome (Matched / Mismatch / No Match).
    data.wb = { matched: [], mismatch: [], no_match: [] };
    if (showWiz) {
        var wgWb = new GlideRecord('x_nose_nexai_test_wizard');
        if (wgWb.get(showWiz)) {
            var wbCfg = [];
            try { wbCfg = JSON.parse(wgWb.getValue('writeback') || '[]'); } catch (eWb) { wbCfg = []; }
            for (var wi = 0; wi < wbCfg.length; wi++) {
                var scen = ('' + (wbCfg[wi].scenario || '')).toLowerCase();
                var wkey = (scen.indexOf('mismatch') > -1) ? 'mismatch' : (scen.indexOf('no') > -1 ? 'no_match' : (scen.indexOf('match') > -1 ? 'matched' : ''));
                if (wkey) { data.wb[wkey] = (wbCfg[wi].actions instanceof Array) ? wbCfg[wi].actions : (wbCfg[wi].action ? [wbCfg[wi].action] : []); }
            }
        }
    }
    data.cfParam = cfParam;
    data.emlParam = emlParam;

    // Cashflow navigator (multi-trade mails).
    data.cfList = [];
    var lcf = new GlideRecord('x_nose_nexai_test_cashflow');
    lcf.addQuery('email', gr.getUniqueValue());
    lcf.orderBy('flow_index');
    lcf.query();
    while (lcf.next()) { data.cfList.push(lcf.getUniqueValue()); }
    data.cfTotal = data.cfList.length;
    data.cfIndex = 0;
    for (var ni = 0; ni < data.cfList.length; ni++) { if (data.cfList[ni] === data.cfSysId) { data.cfIndex = ni + 1; break; } }

    // Mail contents from the raw .eml.
    data.mail = { to: '', from: '', cc: '', subject: '', body: '', attachment: '', received: '', html: '' };
    data.emlAttId = '';
    var attNames = [];
    var ag = new GlideRecord('sys_attachment');
    ag.addQuery('table_name', 'x_nose_nexai_test_email');
    ag.addQuery('table_sys_id', gr.getUniqueValue());
    ag.orderBy('sys_created_on');
    ag.query();
    while (ag.next()) {
        var ctype = ag.getValue('content_type') || '';
        var fname = ag.getValue('file_name') || '';
        if (!data.emlAttId && (ctype === 'message/rfc822' || /\.eml$/i.test(fname))) {
            data.emlAttId = ag.getUniqueValue();
        } else {
            attNames.push(fname);
        }
    }
    if (data.emlAttId) {
        var m = ex.mailContents(data.emlAttId) || {};
        data.mail.to = m.to || ''; data.mail.from = m.from || ''; data.mail.cc = m.cc || '';
        data.mail.subject = m.subject || ''; data.mail.body = m.body || '';
        data.mail.received = fmtReceived(m.date);
        // DISPLAY ONLY: the sender's own HTML, sanitised server-side to a whitelisted subset (no script,
        // style, images, links or remote content). Shows tables as tables instead of one wrapped line.
        // Empty when the mail has no HTML part — the page then falls back to the plain text.
        try { data.mail.html = ex.mailHtml(data.emlAttId) || ''; } catch (eHtml) { data.mail.html = ''; }
        data.mail.htmlRaw = data.mail.html;   // pre-highlight copy; the marks are added further down, once
                                              // the selected cashflow's values are known.
    } else {
        // No raw .eml (e.g. seeded demo data) — fall back to the stored mail_* fields on the email.
        data.mail.to = gr.getValue('mail_to') || '';
        data.mail.from = gr.getValue('mail_from') || '';
        data.mail.subject = gr.getValue('mail_subject') || '';
        data.mail.body = gr.getValue('mail_body') || '';
    }
    data.mail.attachment = attNames.join(', ');

    // ---- Deterministic highlighting (replaces the AI "provenance" snippets removed 2026-09-17) ----
    // Marks, inside the mail itself, the text each stored value was read from. The amount anchors the row;
    // the other fields are then searched INSIDE that row, so a value date repeated on 31 rows is marked once,
    // on the right one. Every mark round-trips through the same normaliser that produced the value, so a
    // wrong placement cannot occur - a value that cannot be placed is simply not marked.
    // DIRECTION is deliberately never marked: it is stored flipped to Nomura's side, so the word in the mail
    // is the opposite of what this screen shows, and under the sign convention it is often derived from an
    // unsigned amount with no direction text at all.
    // Costs nothing: no model call, no tokens, recomputed per view like the mail HTML itself.
    data.mail.marks = 0;
    data.mail.bodyHtml = '';
    data.mail.subjectHtml = '';
    data.mail.legend = [];       // [{kind, label}] — only the colours actually used on THIS case
    data.mail.legendRow = false;
    var _allMarks = [];
    try {
        var _vl = new x_nose_nexai_test.ValueLocator();
        var _cfVals = {
            amount: _rawAmt, currency: data.currency, value_date: data.value_date, reference: data.reference,
            trade_date: data.tradeDate, nomura_entity: data.nomuraEntity, product: data.product,
            ssi_bank: data.ssiBank, ssi_account: data.ssiAccount, ssi_beneficiary: data.ssiBeneficiary,
            ssi_intermediary: data.ssiIntermediary,
            // Direction needs BOTH sides. `_rawDir` is Nomura's (already flipped on extraction), so the word
            // the sender actually wrote is its opposite - that is what to look for in the mail.
            direction: data.direction,
            direction_sender: _rawDir ? flipDir(_adir.normDir(_rawDir)) : ''
        };
        if (data.mail.htmlRaw) {
            var _view = _vl.htmlView(data.mail.htmlRaw);
            var _loc = _vl.locate(_view.text, _cfVals, _view.rows);
            data.mail.html = _vl.markHtml(data.mail.htmlRaw, _view, _loc.marks, _loc.row);
            data.mail.marks = _loc.marks.length;
            data.mail.legendRow = !!_loc.row;
            _allMarks = _allMarks.concat(_loc.marks);
        } else if (data.mail.body) {
            var _sg = new x_nose_nexai_test.RowSegmenter();
            var _loc2 = _vl.locate(data.mail.body, _cfVals, _sg.windows(data.mail.body));
            data.mail.bodyHtml = _vl.markText(data.mail.body, _loc2.marks, _loc2.row);
            data.mail.marks += _loc2.marks.length;
            data.mail.legendRow = !!_loc2.row;
            _allMarks = _allMarks.concat(_loc2.marks);
        }
        if (data.mail.subject) {
            var _sMarks = _vl.subjectMarks(data.mail.subject, _cfVals);
            if (_sMarks.length) {
                // noAnchor: the scroll target belongs to the body, never the header line
                data.mail.subjectHtml = _vl.markInline(data.mail.subject, _sMarks, null, true);
                data.mail.marks += _sMarks.length;
                _allMarks = _allMarks.concat(_sMarks);
            }
        }

        // Legend — built from the marks that are actually on the page, never a fixed key. Colour is per
        // KIND (value date and trade date share one), so each entry names the field(s) it stands for on
        // THIS case; a case with no reference shows no reference swatch.
        var _lab = {
            amount: 'Amount', value_date: 'Value date', currency: 'Currency', reference: 'Reference',
            trade_date: 'Trade date', nomura_entity: 'Nomura entity', product: 'Product',
            ssi_bank: 'SSI bank', ssi_account: 'SSI account', ssi_beneficiary: 'SSI beneficiary',
            ssi_intermediary: 'SSI intermediary', counterparty: 'Counterparty',
            direction: 'Direction'
        };
        var _order = ['amount', 'date', 'currency', 'direction', 'text'], _byKind = {}, _k, _i2;
        for (_i2 = 0; _i2 < _allMarks.length; _i2++) {
            _k = _allMarks[_i2].kind || 'text';
            if (!_byKind[_k]) { _byKind[_k] = []; }
            var _fl = _lab[_allMarks[_i2].field] || _allMarks[_i2].field;
            if (_byKind[_k].join('|').indexOf(_fl) === -1) { _byKind[_k].push(_fl); }
        }
        for (_i2 = 0; _i2 < _order.length; _i2++) {
            if (_byKind[_order[_i2]]) { data.mail.legend.push({ kind: _order[_i2], label: _byKind[_order[_i2]].join(' / ') }); }
        }
    } catch (eHl) {
        // Highlighting is presentation only - never let it stop the case screen from rendering.
        gs.warn('[ai-extraction] highlighting skipped for ' + data.id + ': ' + eHl);
        data.mail.marks = 0; data.mail.bodyHtml = ''; data.mail.subjectHtml = ''; data.mail.legend = []; data.mail.legendRow = false;
    }

    // ---- Extraction confidence (grounding + validation per field) ----
    // Ground against the full text the AI read (body + parsed spreadsheet grid), rebuilt cheaply
    // (no AI call). Falls back to the body if the .eml can't be re-parsed.
    var confContent = data.mail.body || '';
    try {
        if (data.emlAttId) {
            var dxc = new x_nose_nexai_test.DemoExtractor().run(data.emlAttId, gr.getUniqueValue(), false);
            if (dxc && dxc.aiContent) { confContent = dxc.aiContent; }
        }
    } catch (ecc) { /* fall back to body */ }
    data.conf = new x_nose_nexai_test.ExtractionConfidence().score({
        counterparty: data.counterparty, counterpartySource: data.counterpartySource, nomuraEntity: data.nomuraEntity, product: data.product,
        reference: data.reference, tradeDate: data.tradeDate, valueDate: data.value_date,
        amount: data.amount, currency: data.currency, direction: data.direction,
        ssiBank: data.ssiBank, ssiAccount: data.ssiAccount, ssiBeneficiary: data.ssiBeneficiary, ssiIntermediary: data.ssiIntermediary
    }, confContent);

    // Back link → the SCOPED wizard board this case belongs to (NOT the global ai_dashboard, which lists
    // EVERY work-driver's mails, incl. CSG). Owning wizard = the mail's wiz_extracted / wiz_assigned; fall
    // back to the session's current board, then the landing page. This is what made "come back" show CSG.
    var _ownWiz = gr.getValue('wiz_extracted') || gr.getValue('wiz_assigned') || ('' + (gs.getSession().getClientData('nfotc_wiz_current') || ''));
    data.dashUrl = _ownWiz ? ('/nexaitest?id=nexaitest_nfotc_wiz_dash&wiz=' + _ownWiz) : '/nexaitest?id=nexaitest_work_drivers';

    // Step 2 (Compare & Match) — only after the analyst confirms the AI extraction. Uses the AI values.
    data.selectedRef = cfRec ? (cfRec.getValue('ai_selected_booking') || '') : '';
    data.cmp = null;
    if (data.confirmed) {
        var cm = new x_nose_nexai_test.CompareMatch();
        data.cmp = data.cfSysId ? cm.buildDataAi(data.cfSysId, '', data.selectedRef) : cm.buildDataAi('', gr.getUniqueValue(), data.selectedRef);
    }
    data.effectiveOutcome = data.analystOutcome || (data.cmp ? data.cmp.systemOutcome : '');
    data.resolution = cfRec ? (cfRec.getValue('ai_resolution') || '') : '';
    data.moSent = cfRec ? (cfRec.getValue('ai_mo_sent') === 'true') : false;
    // One draft PER manager-configured write-back action for this outcome (the analyst picks which to send).
    // If none configured, fall back to a single default draft (Middle Office referral, as before).
    data.drafts = [];
    if (data.confirmed && data.cmp && data.effectiveOutcome) {
        var _wbActs = (data.wb && data.wb[data.effectiveOutcome]) ? data.wb[data.effectiveOutcome] : [];
        if (_wbActs && _wbActs.length) { for (var _dfi = 0; _dfi < _wbActs.length; _dfi++) { data.drafts.push(buildDraft(_wbActs[_dfi])); } }
        else { data.drafts.push(buildDraft('')); }
    }
    data.draft = data.drafts.length ? data.drafts[0] : null;

    data.logo = new x_nose_nexai_test.CompareMatch().LOGO;
})();

---- TEMPLATE ----
<div>
  <div ng-if="c.data.empty" style="font-family:Arial;padding:50px;color:#555">
    No NexAI OTC Test records yet. Drop a relevant email first, then reload.
  </div>

  <div class="nom-app" ng-if="!c.data.empty">
    <header class="nom-top">
      <img class="nom-logo" ng-src="{{c.data.logo}}" alt="Nomura"/>
      <div class="nom-user">
        <div class="nom-user-btn" ng-click="c.userMenu = !c.userMenu">
          <span class="nom-role">{{c.data.role}}</span>
          <div class="nom-avatar">{{c.data.initials}}</div>
          <span class="nom-caret" ng-class="{open: c.userMenu}">&#9662;</span>
        </div>
        <div class="nom-backdrop" ng-if="c.userMenu" ng-click="c.userMenu = false"></div>
        <div class="nom-menu" ng-if="c.userMenu">
          <div class="nom-menu-hd">
            <div class="nom-avatar sm">{{c.data.initials}}</div>
            <div class="nom-menu-id"><div class="nm-name">{{c.data.name}}</div><div class="nm-sub">OTC Settlements</div></div>
          </div>
          <button type="button" class="nom-menu-item" ng-click="c.signOut()"><span class="nm-ico">&#9211;</span> Sign out</button>
        </div>
      </div>
    </header>

    <div ng-if="c.data.readOnly" style="margin:0;padding:10px 24px;background:#fdecef;color:#C8102E;font-size:13px;font-weight:600;border-bottom:1px solid #f6c9d2;">
      &#128065; Read-only &#8212; Manager view.
    </div>

    <div class="nom-body">
      <main class="nom-main">
        <div class="nom-head">
          <h1>{{c.data.ref}}</h1>
          <a ng-if="c.data.emlAttId" class="nom-dl" ng-href="/sys_attachment.do?sys_id={{c.data.emlAttId}}" title="Download this email (.eml)">Download</a>
          <a ng-if="c.data.cfSysId" class="nom-dl" ng-href="/nexaitest?id=nexaitest_nfotc_audit&amp;cf={{c.data.cfSysId}}" title="This cashflow's audit trail">Audit trail</a>
          <a class="nom-back" ng-href="{{c.data.dashUrl}}">&#8592; Dashboard</a>
        </div>

        <!-- ===== Step 1: Extracted from email (AI) ===== -->
        <div class="step">
          <div class="step-rail">
            <div class="step-badge" ng-class="{done: c.data.confirmed}">1</div>
            <div class="step-line" ng-if="c.data.confirmed"></div>
          </div>
          <div class="step-main">
            <div class="step-hd">Extracted from email</div>

            <div class="nom-cols">
              <section class="nom-card">
                <div class="nom-card-h">Mail contents</div>
                <div class="nom-meta">
                  <div><b>To:</b> {{c.data.mail.to}}</div>
                  <div><b>From:</b> {{c.data.mail.from}}</div>
                  <div ng-if="!c.subjectHtml"><b>Subject:</b> {{c.data.mail.subject}}</div>
                  <div ng-if="c.subjectHtml"><b>Subject:</b> <span ng-bind-html="c.subjectHtml"></span></div>
                  <div ng-if="c.data.mail.received"><b>Received:</b> {{c.data.mail.received}}</div>
                  <div ng-if="c.data.mail.attachment"><b>Attachment:</b> {{c.data.mail.attachment}}</div>
                </div>
                <div class="nom-hl-note" ng-if="c.data.mail.marks">
                  <span class="nom-hl-key" ng-repeat="k in c.data.mail.legend">
                    <span class="nom-hl-sw nom-hl" ng-class="'nom-hl-' + k.kind"></span>{{k.label}}
                  </span>
                  <span class="nom-hl-key" ng-if="c.data.mail.legendRow">
                    <span class="nom-hl-sw nom-hl-rowsw"></span>this cashflow's row
                  </span>
                </div>
                <div class="nom-mailbody" ng-if="!c.mailHtml &amp;&amp; !c.bodyHtml">{{c.data.mail.body}}</div>
                <div class="nom-mailbody nom-mailhtml" ng-if="!c.mailHtml &amp;&amp; c.bodyHtml" ng-bind-html="c.bodyHtml"></div>
                <div class="nom-mailbody nom-mailhtml" ng-if="c.mailHtml" ng-bind-html="c.mailHtml"></div>
              </section>

              <div class="nom-col-right">
                <div class="cf-nav" ng-if="c.data.cfTotal > 1">
                  <button class="cf-btn" ng-disabled="c.data.cfIndex <= 1" ng-click="c.cfGo(c.data.cfIndex - 1)">&#8592; Prev</button>
                  <div class="cf-mid">Cashflow
                    <input type="number" class="cf-inp" min="1" max="{{c.data.cfTotal}}" ng-model="c.cfNavInput" ng-keydown="c.cfKey($event)" ng-blur="c.cfGo(c.cfNavInput)"/>
                    of {{c.data.cfTotal}}
                  </div>
                  <button class="cf-btn" ng-disabled="c.data.cfIndex >= c.data.cfTotal" ng-click="c.cfGo(c.data.cfIndex + 1)">Next &#8594;</button>
                </div>

                <section class="nom-card">
                <div class="nom-card-h">Extracted fields<span ng-if="c.data.conf" class="conf-overall conf-{{c.data.conf.overall.level}}" title="{{c.data.conf.overall.reason}}">{{c.data.conf.overall.label}} confidence<span ng-if="c.data.conf.overall.low"> &#183; {{c.data.conf.overall.low}} to review</span></span>
                  <span class="nom-pills">
                    <span ng-if="c.data.confirmed" class="pill pill-green">&#10003; Confirmed by analyst</span>
                    <button ng-show="!c.editing &amp;&amp; !c.data.readOnly" class="nom-ebtn" ng-click="c.edit()">&#9998; <span ng-if="!c.data.confirmed">Edit</span><span ng-if="c.data.confirmed">Re-confirm fields</span></button>
                  </span>
                </div>

                <div class="nom-fields">
                  <div class="nom-frow">
                    <div class="nom-flabel">Counterparty <span class="prov prov-pcm" ng-if="c.data.counterpartySource === 'eve'" title="No name in the email - derived from the sender via the EVE directory">Derived &#183; EVE</span><span class="prov prov-ai" ng-if="c.data.counterpartySource === 'ai'" title="Read from the email by the AI - this is the name Compare &amp; Match uses">AI</span><span ng-if="c.data.counterpartySource === 'ai' &amp;&amp; c.data.conf.counterparty.level !== 'absent'" class="conf conf-{{c.data.conf.counterparty.level}}" title="{{c.data.conf.counterparty.reason}}">{{c.data.conf.counterparty.label}}</span></div>
                    <span class="nom-fval" ng-show="!c.editing">{{c.data.counterparty || '—'}}</span><input class="nom-inp on" ng-show="c.editing" ng-model="c.data.counterparty" ng-change="c.markDirty()"/>
                  </div>
                  <div class="nom-frow">
                    <div class="nom-flabel">Value Date (YYYY-MM-DD) <span class="prov prov-ai">AI</span><span ng-if="c.data.conf.valueDate.level !== 'absent'" class="conf conf-{{c.data.conf.valueDate.level}}" title="{{c.data.conf.valueDate.reason}}">{{c.data.conf.valueDate.label}}</span></div>
                    <span class="nom-fval" ng-show="!c.editing">{{c.data.value_date || '—'}}</span><input class="nom-inp on" ng-show="c.editing" ng-model="c.data.value_date" ng-change="c.markDirty()"/>
                  </div>
                  <div class="nom-frow">
                    <div class="nom-flabel">Amount <span class="prov prov-ai">AI</span><span ng-if="c.data.conf.amount.level !== 'absent'" class="conf conf-{{c.data.conf.amount.level}}" title="{{c.data.conf.amount.reason}}">{{c.data.conf.amount.label}}</span></div>
                    <span class="nom-fval" ng-show="!c.editing">{{c.fmtAmt(c.data.amount) || '—'}}</span><input class="nom-inp on" ng-show="c.editing" ng-model="c.data.amount" ng-change="c.markDirty()"/>
                  </div>
                  <div class="nom-frow">
                    <div class="nom-flabel">Currency <span class="prov prov-ai">AI</span><span ng-if="c.data.conf.currency.level !== 'absent'" class="conf conf-{{c.data.conf.currency.level}}" title="{{c.data.conf.currency.reason}}">{{c.data.conf.currency.label}}</span></div>
                    <span class="nom-fval" ng-show="!c.editing">{{c.data.currency || '—'}}</span><input class="nom-inp on" ng-show="c.editing" ng-model="c.data.currency" ng-change="c.markDirty()"/>
                  </div>
                  <div class="nom-frow">
                    <div class="nom-flabel">Nomura Direction <span class="prov prov-ai">AI</span><span ng-if="c.data.conf.direction.level !== 'absent'" class="conf conf-{{c.data.conf.direction.level}}" title="{{c.data.conf.direction.reason}}">{{c.data.conf.direction.label}}</span></div>
                    <span class="nom-fval" ng-show="!c.editing">{{c.data.direction || '—'}}</span><input class="nom-inp on" ng-show="c.editing" ng-model="c.data.direction" ng-change="c.markDirty()"/>
                  </div>
                  <div class="nom-frow" ng-if="c.data.show.nomuraEntity">
                    <div class="nom-flabel">Nomura Entity (O) <span class="prov prov-ai">AI</span><span ng-if="c.data.conf.nomuraEntity.level !== 'absent'" class="conf conf-{{c.data.conf.nomuraEntity.level}}" title="{{c.data.conf.nomuraEntity.reason}}">{{c.data.conf.nomuraEntity.label}}</span></div>
                    <span class="nom-fval" ng-show="!c.editing">{{c.data.nomuraEntity || '—'}}</span><input class="nom-inp on" ng-show="c.editing" ng-model="c.data.nomuraEntity" ng-change="c.markDirty()"/>
                  </div>
                  <div class="nom-frow" ng-if="c.data.show.product">
                    <div class="nom-flabel">Product (O) <span class="prov prov-ai">AI</span><span ng-if="c.data.conf.product.level !== 'absent'" class="conf conf-{{c.data.conf.product.level}}" title="{{c.data.conf.product.reason}}">{{c.data.conf.product.label}}</span></div>
                    <span class="nom-fval" ng-show="!c.editing">{{c.data.product || '—'}}</span><input class="nom-inp on" ng-show="c.editing" ng-model="c.data.product" ng-change="c.markDirty()"/>
                  </div>
                  <div class="nom-frow" ng-if="c.data.show.reference">
                    <div class="nom-flabel">Counterparty Reference (O) <span class="prov prov-ai">AI</span><span ng-if="c.data.conf.reference.level !== 'absent'" class="conf conf-{{c.data.conf.reference.level}}" title="{{c.data.conf.reference.reason}}">{{c.data.conf.reference.label}}</span></div>
                    <span class="nom-fval" ng-show="!c.editing">{{c.data.reference || '—'}}</span><input class="nom-inp on" ng-show="c.editing" ng-model="c.data.reference" ng-change="c.markDirty()"/>
                  </div>
                  <div class="nom-frow" ng-if="c.data.show.tradeDate">
                    <div class="nom-flabel">Trade Date (YYYY-MM-DD) (O) <span class="prov prov-ai">AI</span><span ng-if="c.data.conf.tradeDate.level !== 'absent'" class="conf conf-{{c.data.conf.tradeDate.level}}" title="{{c.data.conf.tradeDate.reason}}">{{c.data.conf.tradeDate.label}}</span></div>
                    <span class="nom-fval" ng-show="!c.editing">{{c.data.tradeDate || '—'}}</span><input class="nom-inp on" ng-show="c.editing" ng-model="c.data.tradeDate" ng-change="c.markDirty()"/>
                  </div>
                  <div class="nom-frow" ng-if="c.data.show.ssiBank">
                    <div class="nom-flabel">SSI Bank / BIC (O) <span class="prov prov-ai">AI</span><span ng-if="c.data.conf.ssiBank.level !== 'absent'" class="conf conf-{{c.data.conf.ssiBank.level}}" title="{{c.data.conf.ssiBank.reason}}">{{c.data.conf.ssiBank.label}}</span></div>
                    <span class="nom-fval" ng-show="!c.editing">{{c.data.ssiBank || '—'}}</span><input class="nom-inp on" ng-show="c.editing" ng-model="c.data.ssiBank" ng-change="c.markDirty()"/>
                  </div>
                  <div class="nom-frow" ng-if="c.data.show.ssiAccount">
                    <div class="nom-flabel">SSI Account (O) <span class="prov prov-ai">AI</span><span ng-if="c.data.conf.ssiAccount.level !== 'absent'" class="conf conf-{{c.data.conf.ssiAccount.level}}" title="{{c.data.conf.ssiAccount.reason}}">{{c.data.conf.ssiAccount.label}}</span></div>
                    <span class="nom-fval" ng-show="!c.editing">{{c.data.ssiAccount || '—'}}</span><input class="nom-inp on" ng-show="c.editing" ng-model="c.data.ssiAccount" ng-change="c.markDirty()"/>
                  </div>
                  <div class="nom-frow" ng-if="c.data.show.ssiBeneficiary">
                    <div class="nom-flabel">SSI Beneficiary / BIC (O) <span class="prov prov-ai">AI</span><span ng-if="c.data.conf.ssiBeneficiary.level !== 'absent'" class="conf conf-{{c.data.conf.ssiBeneficiary.level}}" title="{{c.data.conf.ssiBeneficiary.reason}}">{{c.data.conf.ssiBeneficiary.label}}</span></div>
                    <span class="nom-fval" ng-show="!c.editing">{{c.data.ssiBeneficiary || '—'}}</span><input class="nom-inp on" ng-show="c.editing" ng-model="c.data.ssiBeneficiary" ng-change="c.markDirty()"/>
                  </div>
                  <div class="nom-frow" ng-if="c.data.show.ssiIntermediary">
                    <div class="nom-flabel">SSI Intermediary (O) <span class="prov prov-ai">AI</span><span ng-if="c.data.conf.ssiIntermediary.level !== 'absent'" class="conf conf-{{c.data.conf.ssiIntermediary.level}}" title="{{c.data.conf.ssiIntermediary.reason}}">{{c.data.conf.ssiIntermediary.label}}</span></div>
                    <span class="nom-fval" ng-show="!c.editing">{{c.data.ssiIntermediary || '—'}}</span><input class="nom-inp on" ng-show="c.editing" ng-model="c.data.ssiIntermediary" ng-change="c.markDirty()"/>
                  </div>
                </div>

                <div class="nom-actbar" ng-show="!c.data.confirmed || c.editing">
                  <span ng-show="c.saveError" class="nom-saveerr">&#9888; {{c.saveError}}</span>
                  <span ng-show="c.data.saved &amp;&amp; !c.saveError" class="nom-saved">&#10003; Saved</span>
                  <button class="nom-btn nom-save" ng-disabled="!c.dirty" ng-hide="c.data.readOnly" ng-click="c.save()">Save</button>
                  <button class="nom-btn" ng-hide="c.data.readOnly" ng-disabled="c.dirty" title="{{c.dirty ? 'Save your changes first' : ''}}" ng-click="c.confirm()">&#10003; Confirm Extracted fields</button>
                </div>
              </section>
              </div>
            </div>
          </div>
        </div>

        <!-- ===== Feedback Loop (ILLUSTRATIVE placeholder — no backend / not wired) ===== -->
        <div class="step" ng-if="c.feedbackRowsList.length">
          <div class="step-rail"><div class="step-badge fb-badge" title="Illustrative placeholder">&#8635;</div></div>
          <div class="step-main">
            <div class="fb-card">
              <div class="fb-head">
                <span class="fb-title">Feedback Loop</span>
                <span class="fb-chip">Illustrative &#8212; placeholder, not wired to a backend</span>
              </div>
              <div class="fb-sub">Your corrections are shown here as the human-in-the-loop feedback a learning loop would capture — AI value vs. the analyst-corrected value, with an optional reason.</div>
              <div class="fb-tblwrap">
                <table class="fb-tbl">
                  <thead>
                    <tr><th>Field</th><th>AI Value</th><th>Actual Value</th><th>Reason</th></tr>
                  </thead>
                  <tbody>
                    <tr ng-repeat="r in c.feedbackRowsList track by r.key">
                      <td class="fb-field">{{r.label}}</td>
                      <td class="fb-ai">{{r.ai}}</td>
                      <td class="fb-actual">{{r.actual}}</td>
                      <td><input class="fb-reason" ng-model="c.fbReason[r.key]" placeholder="Why did the AI get it wrong? (optional)"/></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <!-- ===== Step 2: Compare & Match (after confirmation) ===== -->
        <div class="step" ng-if="c.data.confirmed &amp;&amp; c.data.cmp">
          <div class="step-rail">
            <div class="step-badge" ng-class="{done: c.data.reviewConfirmed}">2</div>
            <div class="step-line" ng-if="c.data.reviewConfirmed"></div>
          </div>
          <div class="step-main">
            <div class="step-hd">Compare &amp; Match</div>

            <div ng-if="c.data.cmp.found">
              <!-- No candidates at all: the only option is Mark as no match -->
              <div ng-if="c.data.cmp.status === 'no_match'" class="mm-wrap">
                <div class="mm-hd">
                  <div class="mm-title">Allege</div>
                  <div class="mm-sub">No candidate was found across Tier 1–3 (exact, then fuzzy, then counterparty-less) — this is an allege (no matching bank booking). Mark this cashflow as no match to continue.</div>
                </div>
                <div class="mm-foot">
                  <span class="mm-foot-note">This cashflow has no matching bank booking.</span>
                  <span ng-if="c.data.cmp.markedNoMatch" class="mm-chosen">&#10003; Marked as no match</span>
                  <button class="mm-nomatch" ng-class="{on: c.data.cmp.markedNoMatch}" ng-hide="c.data.readOnly" ng-click="c.markNoMatch()">Mark as no match</button>
                </div>
              </div>

              <!-- Candidate selection table -->
              <div ng-if="c.data.cmp.status !== 'no_match'" class="mm-wrap">
                <div class="mm-hd">
                  <div class="mm-title"><span>{{c.data.cmp.candidatesList.length}} possible booking {{c.data.cmp.candidatesList.length === 1 ? 'match' : 'matches'}} found</span><span class="mm-tier">{{c.data.cmp.tierLabel}}</span></div>
                  <div class="mm-sub">Compare the rows below and <strong>select</strong> the booking that matches — or mark the cashflow as no match. Nothing is auto-selected; differing values are highlighted in red.</div>
                </div>
                <div class="mm-scroll">
                  <table class="mm-tbl">
                    <thead><tr>
                      <th>Record</th><th>Counterparty</th><th>Currency</th><th>Amount</th><th>Direction</th><th>Value Date</th><th class="mm-selcol">Select match</th>
                    </tr></thead>
                    <tbody>
                      <tr class="mm-submitted">
                        <td><div class="mm-rec">Counterparty submitted</div><div class="mm-recsub">{{c.data.cmp.submitted.counterparty || '-'}}</div></td>
                        <td>{{c.data.cmp.submitted.counterparty || '-'}}</td>
                        <td>{{c.data.cmp.submitted.currency || '-'}}</td>
                        <td class="mm-mono">{{c.fmtAmt(c.data.cmp.submitted.amount) || '-'}}</td>
                        <td>{{c.data.cmp.submitted.direction || '-'}}</td>
                        <td class="mm-mono">{{c.data.cmp.submitted.value_date || '-'}}</td>
                        <td class="mm-selcol"></td>
                      </tr>
                      <tr ng-repeat="cand in c.data.cmp.candidatesList track by $index" ng-class="{'mm-selected': cand.selected}">
                        <td>
                          <div class="mm-rec">Candidate {{cand.rank}}<span ng-if="cand.best &amp;&amp; c.data.cmp.tier !== 1" class="mm-badge-top">AI top match</span><span ng-if="c.data.cmp.tier === 1" class="mm-badge-exact">Exact match</span></div>
                          <div class="mm-recsub mm-mono">{{cand.bankRef || '-'}}<span class="mm-sys">{{cand.system || 'System -'}}</span></div>
                          <div class="mm-recmis"><span ng-if="c.data.cmp.tier !== 1" class="mm-conf" ng-class="{'mm-conf-hi': cand.confLevel === 'hi', 'mm-conf-mid': cand.confLevel === 'mid', 'mm-conf-lo': cand.confLevel === 'lo'}">{{cand.confLabel}} confidence</span><span ng-if="cand.mismatchCount" class="mm-mis">{{cand.mismatchCount}} mismatch</span><span ng-if="!cand.mismatchCount" class="mm-allok">all agree</span></div>
                        </td>
                        <td ng-class="{'mm-bad': cand.flags.cp === 'bad'}">{{cand.counterparty || '-'}}</td>
                        <td ng-class="{'mm-bad': cand.flags.ccy === 'bad'}">{{cand.currency || '-'}}</td>
                        <td class="mm-mono" ng-class="{'mm-bad': cand.flags.amt === 'bad'}">{{c.fmtAmt(cand.amount) || '-'}}</td>
                        <td ng-class="{'mm-bad': cand.flags.dir === 'bad'}">{{cand.direction || '-'}}</td>
                        <td class="mm-mono" ng-class="{'mm-bad': cand.flags.vd === 'bad'}">{{cand.value_date || '-'}}</td>
                        <td class="mm-selcol">
                          <button class="mm-selbtn" ng-class="{on: cand.selected}" ng-hide="c.data.readOnly" ng-click="c.selectCandidate(cand.key)"><span ng-if="cand.selected">&#10003; Selected</span><span ng-if="!cand.selected">Select this match</span></button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div class="mm-foot">
                  <span class="mm-foot-note">If none of these is the right booking, mark the cashflow as no match.</span>
                  <span ng-if="c.data.cmp.markedNoMatch" class="mm-chosen">&#10003; Marked as no match</span>
                  <button class="mm-nomatch" ng-class="{on: c.data.cmp.markedNoMatch}" ng-hide="c.data.readOnly" ng-click="c.markNoMatch()">Mark as no match</button>
                </div>
              </div>

              <!-- Confirm decision (shown only after a selection or mark-no-match) -->
              <div class="ar-box" ng-if="c.data.cmp.selectedRef">
                <div class="ar-hd">Confirm match decision</div>
                <div class="ar-sub">
                  <span ng-if="c.data.cmp.markedNoMatch">Outcome: <strong>No match</strong> &#8212; this cashflow will follow the no-match path.</span>
                  <span ng-if="!c.data.cmp.markedNoMatch &amp;&amp; c.data.cmp.systemOutcome === 'matched'">Selected booking <strong>{{c.data.cmp.booking.bank_trade_ref}}</strong> agrees on every field &#8212; <strong>Matched</strong><span ng-if="c.data.cmp.tier !== 1" class="mm-conf-inline"> ({{c.data.cmp.selectedConfLabel}} confidence)</span>.</span>
                  <span ng-if="!c.data.cmp.markedNoMatch &amp;&amp; c.data.cmp.systemOutcome === 'mismatch'">Selected booking <strong>{{c.data.cmp.booking.bank_trade_ref}}</strong> differs on <strong>{{c.data.cmp.diffCount}}</strong> field<span ng-if="c.data.cmp.diffCount !== 1">s</span> &#8212; <strong>Mismatch</strong><span ng-if="c.data.cmp.tier !== 1" class="mm-conf-inline"> ({{c.data.cmp.selectedConfLabel}} confidence)</span>.</span>
                </div>
                <div class="ar-row">
                  <button ng-if="!c.data.reviewConfirmed" class="nom-btn ar-confirm" ng-hide="c.data.readOnly" ng-click="c.confirmReview()">Confirm</button>
                  <span ng-if="c.data.reviewConfirmed" class="ar-confirmed">&#10003; Confirmed</span>
                </div>
              </div>
            </div>

            <div ng-if="!c.data.cmp.found" class="cm-card"><div class="cm-empty">No matching cashflow to compare.</div></div>
          </div>
        </div>

        <!-- ===== Step 3: Decide next action (derived from the Step 2 outcome) ===== -->
        <div class="step" ng-if="c.data.reviewConfirmed &amp;&amp; c.data.draft">
          <div class="step-rail"><div class="step-badge">3</div></div>
          <div class="step-main">
            <div class="step-hd">Decide next action</div>

            <div class="na-picker" ng-if="c.data.drafts.length > 1">
              <span class="na-picker-lbl">Write-back action:</span>
              <button type="button" class="na-picker-btn" ng-repeat="d in c.data.drafts track by $index" ng-class="{on: c.data.draft === d}" ng-click="c.pickDraft(d)">{{d.sendLabel}}</button>
            </div>
            <div class="nom-card na-card">
              <div class="na-title">{{c.data.draft.title}}</div>
              <!-- EMAIL channel (Counterparty / Middle Office): an editable message draft -->
              <div ng-if="c.data.draft.channel !== 'system'">
                <div class="na-head">
                  <div class="na-hrow"><span class="na-lbl">To</span><span>{{c.data.draft.to}}</span></div>
                  <div class="na-hrow"><span class="na-lbl">Subject</span><span>{{c.data.draft.subject}}</span></div>
                </div>
                <textarea class="na-body" ng-model="c.data.draft.body"></textarea>
              </div>
              <!-- SYSTEM channel (NEWS): a single uneditable write-back block — no explanatory text -->
              <div ng-if="c.data.draft.channel === 'system'" class="na-wbbox">
                <span class="na-wbbox-lbl">Write-back</span>
                <span class="na-wbbox-val">{{c.data.draft.sentLabel}}</span>
              </div>
              <!-- EMAIL channel (Counterparty / Middle Office): keep the optional-send guidance -->
              <div class="na-hint" ng-if="c.data.draft.channel !== 'system'">Resolve this cashflow by choosing an outcome. <strong>{{c.data.draft.sendLabel}}</strong> is optional and does not change the status.</div>
              <div class="na-wb" ng-if="c.data.draft.channel !== 'system' &amp;&amp; c.data.wb[c.data.cmp.systemOutcome]">
                &#8635; Write-back for this outcome (<strong>{{c.data.cmp.systemOutcome}}</strong>) is <strong>{{c.data.wb[c.data.cmp.systemOutcome]}}</strong>
                <span class="na-wb-sub">— set in the onboarding wizard's Write-back step.</span>
              </div>
              <div class="na-actions">
                <button class="nom-btn na-resolve-m" ng-class="{on: c.data.resolution === 'resolved_matched'}" ng-hide="c.data.readOnly" ng-click="c.resolveMatched()">&#10003; Resolved &#8212; Matched</button>
                <button class="nom-btn na-resolve-u" ng-class="{on: c.data.resolution === 'resolved_unmatched'}" ng-hide="c.data.readOnly" ng-click="c.resolveUnmatched()">&#10003; Resolved &#8212; Unmatched</button>
                <button class="nom-btn na-grey" ng-if="c.data.draft.channel !== 'system'" ng-hide="c.data.readOnly" ng-click="c.sendMO()">&#9993; {{c.data.draft.sendLabel}}</button>
              </div>
              <div class="na-status">
                <span ng-if="c.data.resolution === 'resolved_matched'" class="na-done">&#10003; Resolved &#8212; Matched</span>
                <span ng-if="c.data.resolution === 'resolved_unmatched'" class="na-done na-done-amber">&#10003; Resolved &#8212; Unmatched</span>
                <span ng-if="c.data.moSent" class="na-sent"><span ng-if="c.data.draft.channel !== 'system'">&#9993; </span>{{c.data.draft.sentLabel}}</span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  </div>
</div>

---- CLIENT ----
function controller($window, $injector, $element) {
    var c = this;

    // International-format an amount for DISPLAY only (thousands separators). Leaves the raw value + the
    // numeric sort field untouched; preserves any trailing currency text and a leading sign.
    c.fmtAmt = function (v) {
        var s = ('' + (v == null ? '' : v)).trim();
        if (!s) { return ''; }
        var m = s.match(/^(-?)(\d[\d,]*)(\.\d+)?(.*)$/);
        if (!m) { return s; }
        return m[1] + m[2].replace(/,/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (m[3] || '') + (m[4] || '');
    };

    // Disable ngAnimate FOR THIS WIDGET ONLY. Service Portal loads ngAnimate; on ng-if/ng-show toggles it
    // can wait on a Bootstrap/theme transitionend that never fires and leave the "leaving" element stuck in
    // the DOM (symptoms: two "Saved" labels, two action bars). Scoping to $element avoids the global side
    // effect on other widgets / modals / dropdowns on the page. Wrapped so it can never break the widget.
    try {
        var _an = $injector.get('$animate');
        if (_an && _an.enabled) {
            if ($element && $element[0]) { _an.enabled($element, false); }   // scoped to this widget only
            else { _an.enabled(false); }                                     // fallback: global (only if no $element)
        }
    } catch (e) { /* ignore */ }

    // Access guard: the server sets data.redirect when the current user is no longer permitted here (no
    // published work-driver assigned, and not a manager/admin). Bounce to the landing page — on initial
    // load AND after any action round-trip, so a revoked analyst can neither open nor act on a case.
    function checkRedirect() {
        if (c.data && c.data.redirect) { $window.location.href = c.data.redirect; return true; }
        return false;
    }
    if (checkRedirect()) { return; }

    // User menu (avatar dropdown) + sign out.
    c.userMenu = false;
    c.signOut = function () {
        $window.location.href = '/logout.do?sysparm_goto_url=' + encodeURIComponent('/nexaitest');
    };

    c.editing = false;
    c.dirty = false;

    // Cashflow navigator (multi-trade mails): Prev / [X] / Next -> open that cashflow's AI case.
    c.cfNavInput = (c.data && c.data.cfIndex) || 1;
    c.cfGo = function (n) {
        var total = (c.data && c.data.cfTotal) || 0;
        if (total < 1) { return; }
        n = parseInt(n, 10);
        if (isNaN(n)) { n = c.data.cfIndex; }
        if (n < 1) { n = 1; }
        if (n > total) { n = total; }
        if (n === c.data.cfIndex) { c.cfNavInput = c.data.cfIndex; return; }
        var target = c.data.cfList[n - 1];
        if (target) { $window.location.href = '/nexaitest?id=nexaitest_ai_extraction&cf=' + target; }
    };
    c.cfKey = function (ev) {
        if (ev.key === 'Enter') { c.cfGo(c.cfNavInput); return; }
        if (['-', '+', 'e', 'E', '.'].indexOf(ev.key) !== -1) { ev.preventDefault(); }
    };

    // Enter edit mode — fields become editable.
    c.edit = function () { c.editing = true; };

    // A field changed — light up Save and refresh the (cached) feedback rows.
    c.markDirty = function () { c.dirty = true; c.data.saved = false; rebuildFeedback(); };

    // ---- Feedback Loop (ILLUSTRATIVE PLACEHOLDER — no backend / not wired) ----------------------------
    // Snapshot the AI-extracted values at load; when the analyst changes any field, surface a row
    // {Field | AI Value | Actual Value | Reason}. Reason is an editable text box, kept in the client only.
    // Nothing here is persisted or sent anywhere — it demonstrates the human-in-the-loop feedback that a
    // real learning loop would harvest (the AI-value ↔ analyst-value pairs ARE captured in the audit trail,
    // so this can become real later). Per-cashflow: cfGo does a full page nav, so the baseline resets.
    c._fbFields = [
        { k: 'counterparty', lbl: 'Counterparty' },
        { k: 'value_date', lbl: 'Value Date' },
        { k: 'amount', lbl: 'Amount' },
        { k: 'currency', lbl: 'Currency' },
        { k: 'direction', lbl: 'Direction' },
        { k: 'nomuraEntity', lbl: 'Nomura Entity' },
        { k: 'product', lbl: 'Product' },
        { k: 'reference', lbl: 'Counterparty Reference' },
        { k: 'tradeDate', lbl: 'Trade Date' },
        { k: 'ssiBank', lbl: 'SSI Bank / BIC' },
        { k: 'ssiAccount', lbl: 'SSI Account' },
        { k: 'ssiBeneficiary', lbl: 'SSI Beneficiary / BIC' },
        { k: 'ssiIntermediary', lbl: 'SSI Intermediary' }
    ];
    c._fbBaseline = {};
    for (var _fi = 0; _fi < c._fbFields.length; _fi++) {
        var _fk = c._fbFields[_fi].k;
        c._fbBaseline[_fk] = '' + ((c.data && c.data[_fk] != null) ? c.data[_fk] : '');
    }
    c.fbReason = {};              // client-only, per-field free text
    c.feedbackRowsList = [];      // CACHED — bound by ng-repeat/ng-if. Never bind ng-repeat to a function:
                                  // it would allocate a new array each digest and never stabilise ($rootScope:infdig).
    function rebuildFeedback() {
        var out = [];
        for (var i = 0; i < c._fbFields.length; i++) {
            var f = c._fbFields[i];
            var cur = '' + ((c.data && c.data[f.k] != null) ? c.data[f.k] : '');
            var base = c._fbBaseline[f.k] || '';
            if (cur !== base) { out.push({ key: f.k, label: f.lbl, ai: base || '—', actual: cur || '—' }); }
        }
        c.feedbackRowsList = out;
    }
    rebuildFeedback();

    // ---- Mail contents: render the sender's own HTML when we have it --------------------------------
    // The server returns data.mail.html already sanitised to a whitelisted subset (no script/style/img/
    // link/remote content, attributes stripped bar colspan/rowspan/align). Trusting it here only marks
    // that server output as renderable; nothing from the mail reaches the page unsanitised. Falls back to
    // the plain text when the mail has no HTML part.
    // The <mark> tags around the located values are added by the server too (ValueLocator), inside that same
    // sanitised output — so the highlighting is server-rendered and nothing new is trusted here.
    c.mailHtml = null; c.bodyHtml = null; c.subjectHtml = null;
    try {
        var _sceSvc = $injector.get('$sce');
        var _m = (c.data && c.data.mail) || {};
        if (_sceSvc) {
            if (_m.html) { c.mailHtml = _sceSvc.trustAsHtml(_m.html); }
            if (_m.bodyHtml) { c.bodyHtml = _sceSvc.trustAsHtml(_m.bodyHtml); }     // plain-text mail, marked
            if (_m.subjectHtml) { c.subjectHtml = _sceSvc.trustAsHtml(_m.subjectHtml); }
        }
    } catch (eHtml) { c.mailHtml = null; c.bodyHtml = null; c.subjectHtml = null; }

    // ---- Bring this cashflow's row into view -------------------------------------------------------
    // The mail pane is a fixed-height scroller (max-height 360px). On a 31-row table the highlighted row is
    // usually far below the fold, so the analyst sees a mail with no visible highlight and has to hunt for
    // it. The server puts id="nom-hl-anchor" on the row (or, when the cashflow has no row of its own, on its
    // amount); this centres that inside the PANE.
    // Deliberately scrolls the pane and never the window: moving the whole page under the analyst when a
    // case opens is disorienting, and the extracted fields on the right must stay where they are.
    // Cashflow navigation reloads the page (cfGo sets location.href), so running once on init is enough.
    try {
        var _timeout = $injector.get('$timeout');
        _timeout(function () {
            var root = $element && $element[0];
            if (!root) { return; }
            var box = root.querySelector('.nom-mailbody');
            var el = root.querySelector('#nom-hl-anchor');
            if (!box || !el) { return; }
            if (box.scrollHeight <= box.clientHeight + 4) { return; }          // nothing to scroll
            var rb = box.getBoundingClientRect(), re = el.getBoundingClientRect();
            if (re.top >= rb.top && re.bottom <= rb.bottom) { return; }        // already in view
            var delta = (re.top - rb.top) - (box.clientHeight / 2) + (re.height / 2);
            box.scrollTop = Math.max(0, box.scrollTop + delta);
        }, 0);
    } catch (eScroll) { /* scrolling is a convenience; never let it break the screen */ }

    // ---- Email-body highlighting: REMOVED 2026-09-17 (Akshit) ------------------------------------
    // The mail body is shown plain. Highlighting used to come from AI 'provenance' snippets that the
    // model returned per field (one verbatim snippet per field + a copy of the row), which cost roughly
    // half of every extraction answer and capped how many rows fitted in one call. To be revisited as a
    // DETERMINISTIC highlighter (search the body for the stored value: amount/date/number format variants,
    // row anchoring by best-matching line), which needs no AI output at all. Styles (.cf-hl-*) are kept.

    // Save edited AI fields (only when there are unsaved changes). Stays IN edit mode so the analyst can
    // then Confirm (or keep editing) — only Confirm leaves edit mode. `dirty` is cleared synchronously
    // (within this click's digest) so the Save button disables immediately.
    c.saveError = '';
    c.save = function () {
        if (!c.dirty) { return; }
        c.dirty = false; c.saveError = '';
        c.data.action = 'save';
        c.server.update().then(
            function () { if (checkRedirect()) { return; } c.data.action = ''; rebuildFeedback(); },
            function () { c.dirty = true; c.data.saved = false; c.saveError = 'Save failed — please try again.'; c.data.action = ''; }
        );
    };

    // Confirm the AI extracted fields. Leave edit mode so the card returns to the clean read-only view
    // (plain fields, no action bar, Re-confirm available). CRITICAL: set editing=false SYNCHRONOUSLY here
    // (not in the server .then) — in Service Portal the .then can run outside Angular's digest, so a
    // deferred assignment wouldn't re-render, leaving the inputs/action bar stuck on screen.
    c.confirm = function () {
        if (c.dirty) { return; }   // guarded in the UI too (Confirm disabled while dirty) — never confirm unsaved edits
        c.editing = false; c.saveError = '';
        c.data.action = 'confirm';
        c.server.update().then(
            function () { if (checkRedirect()) { return; } c.data.action = ''; rebuildFeedback(); },
            function () { c.editing = true; c.saveError = 'Confirm failed — please try again.'; c.data.action = ''; }
        );
    };

    // Analyst review (HITL) — write back the chosen match outcome for this cashflow (ai_* fields).
    c.setOutcome = function (o) {
        c.data.action = 'outcome';
        c.data.outcomeChoice = o;
        c.server.update().then(function () { if (checkRedirect()) { return; } c.data.action = ''; c.data.outcomeChoice = ''; });
    };
    c.resetOutcome = function () {
        c.data.action = 'reset_outcome';
        c.server.update().then(function () { if (checkRedirect()) { return; } c.data.action = ''; });
    };
    c.confirmReview = function () {
        c.data.action = 'confirm_review';
        c.server.update().then(function () { if (checkRedirect()) { return; } c.data.action = ''; });
    };

    // Step 2 — analyst manually SELECTS which candidate booking to compare against (drives the outcome),
    // or declares that none of them match. Nothing is auto-selected.
    c.selectCandidate = function (key) {
        c.data.action = 'select_candidate';
        c.data.candKey = key;
        c.server.update().then(function () { if (checkRedirect()) { return; } c.data.action = ''; c.data.candKey = ''; });
    };
    c.markNoMatch = function () {
        c.data.action = 'mark_no_match';
        c.server.update().then(function () { if (checkRedirect()) { return; } c.data.action = ''; });
    };

    // Step 3 — final resolution (this is what the dashboard Workflow Status reflects).
    c.resolveMatched = function () {
        c.data.action = 'resolve_matched';
        c.server.update().then(function () { if (checkRedirect()) { return; } c.data.action = ''; });
    };
    c.resolveUnmatched = function () {
        c.data.action = 'resolve_unmatched';
        c.server.update().then(function () { if (checkRedirect()) { return; } c.data.action = ''; });
    };
    // Analyst switches which configured write-back action's draft to view/send (>1 action for the outcome).
    c.pickDraft = function (d) { if (d) { c.data.draft = d; } };
    // Optional — perform the configured write-back "send". Does NOT change the workflow status.
    c.sendMO = function () {
        c.data.action = 'send_mo';
        c.data.sendLabel = (c.data.draft && c.data.draft.sendLabel) || 'Send to Middle Office';
        c.server.update().then(function () { if (checkRedirect()) { return; } c.data.action = ''; c.data.sendLabel = ''; c.data.moSent = true; });
    };
}

---- CSS ----
/* OTC AI Case Screen — widget CSS. Full copy of the OTC analyst screen styles (kept in sync). */
.nom-app * { box-sizing: border-box; }

/* --- ngAnimate guard (fixes duplicate/stale DOM on ng-if toggles) ---
   Service Portal loads ngAnimate; Bootstrap/theme transitions on buttons make ngAnimate wait for a
   transitionend that can fail to fire, leaving the "leaving" element stuck in the DOM. Symptom: entering
   edit mode showed TWO Save/Confirm rows and two "Re-confirm fields" buttons (and earlier, a value twice).
   Making enter/leave/move instant tells ngAnimate to add/remove the node immediately — no stale copies. */
.nom-app .ng-animate, .nom-app.ng-animate,
.nom-app .ng-enter, .nom-app .ng-enter-active,
.nom-app .ng-leave, .nom-app .ng-leave-active,
.nom-app .ng-move, .nom-app .ng-move-active,
.nom-app .ng-hide-add, .nom-app .ng-hide-remove {
    -webkit-transition: none 0s !important;
    transition: none 0s !important;
    -webkit-animation: none 0s !important;
    animation: none 0s !important;
}
.nom-app { font-family: "Segoe UI", Arial, sans-serif; background: #eef1f5; color: #20242c; min-height: 100vh; }
.nom-top { display: flex; align-items: center; gap: 28px; background: #fff; padding: 6px 26px; border-bottom: 3px solid #C8102E; box-shadow: 0 1px 4px rgba(0,0,0,.06); }
.nom-logo { height: 48px; width: auto; }
.nom-user { margin-left: auto; display: flex; align-items: center; gap: 10px; }
.nom-role { font-size: 13px; color: #5b6270; }
.nom-avatar { width: 30px; height: 30px; border-radius: 50%; background: #C8102E; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; }
/* --- user menu (avatar dropdown + sign out) --- */
.nom-top { position: relative; z-index: 30; }
.nom-user { position: relative; }
.nom-user-btn { display: flex; align-items: center; gap: 10px; cursor: pointer; padding: 4px 8px 4px 6px; border-radius: 9px; transition: background .12s; }
.nom-user-btn:hover { background: #f3f4f7; }
.nom-caret { color: #98a2b3; font-size: 10px; transition: transform .15s; }
.nom-caret.open { transform: rotate(180deg); }
.nom-backdrop { position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 900; background: transparent; }
.nom-menu { position: absolute; right: 0; top: calc(100% + 8px); z-index: 1000; width: 222px; background: #fff; border: 1px solid #e6e9ef; border-radius: 10px; box-shadow: 0 10px 30px rgba(20,30,60,.18); overflow: hidden; }
.nom-menu-hd { display: flex; align-items: center; gap: 11px; padding: 14px; border-bottom: 1px solid #f1f2f5; }
.nom-avatar.sm { width: 34px; height: 34px; font-size: 12px; }
.nom-menu-id .nm-name { font-size: 13.5px; font-weight: 600; color: #1a1a2e; }
.nom-menu-id .nm-sub { font-size: 11.5px; color: #8a909a; margin-top: 1px; }
.nom-menu-item { width: 100%; display: flex; align-items: center; gap: 10px; background: #fff; border: none; text-align: left; padding: 12px 14px; font-size: 13.5px; font-weight: 500; color: #C0392B; cursor: pointer; font-family: inherit; }
.nom-menu-item:hover { background: #fdf2f2; }
.nom-menu-item .nm-ico { font-size: 15px; line-height: 1; }

/* --- cashflow navigator (multi-trade mails) --- */
.cf-nav { display: flex; align-items: center; justify-content: space-between; gap: 10px; background: #fff; border: 1px solid #e6e9ef; border-radius: 10px; padding: 9px 12px; margin-bottom: 14px; box-shadow: 0 1px 6px rgba(20,30,60,.05); }
.cf-btn { background: #C8102E; color: #fff; border: none; border-radius: 8px; padding: 7px 14px; font-size: 12.5px; font-weight: 600; cursor: pointer; font-family: inherit; white-space: nowrap; }
.cf-btn:hover { background: #a50d26; }
.cf-btn:disabled { background: #e7e9ee; color: #9aa0a8; cursor: not-allowed; }
.cf-mid { font-size: 13.5px; font-weight: 600; color: #1a1a2e; display: flex; align-items: center; gap: 8px; }
.cf-inp { width: 50px; text-align: center; border: 1px solid #d7dbe2; border-radius: 6px; padding: 5px 4px; font-size: 13.5px; font-weight: 700; font-family: inherit; color: #1a1a2e; }
.cf-inp:focus { outline: none; border-color: #C8102E; box-shadow: 0 0 0 2px rgba(200,16,46,.12); }
.cf-inp::-webkit-inner-spin-button, .cf-inp::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }

/* --- stepped flow (1 = extracted, 2 = compare, 3 = decide) --- */
.step { display: flex; gap: 18px; }
.step-rail { display: flex; flex-direction: column; align-items: center; flex-shrink: 0; width: 36px; }
.step-badge { width: 36px; height: 36px; border-radius: 50%; background: #C8102E; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 15px; font-weight: 700; flex-shrink: 0; box-shadow: 0 1px 4px rgba(200,16,46,.3); }
.step-badge.done { background: #1E7E45; box-shadow: 0 1px 4px rgba(30,126,69,.3); }
.step-line { flex: 1; width: 2px; background: #d7dbe2; margin-top: 8px; min-height: 24px; }
.step-main { flex: 1; min-width: 0; padding-bottom: 26px; }
.step-hd { font-size: 17px; font-weight: 700; color: #1a1a2e; margin: 4px 0 14px; }
.step-sub { font-size: 12.5px; color: #6b7280; margin: -8px 0 16px; }

/* --- step 3: decide next action (derived draft) --- */
.na-card { padding: 24px 28px; }
.na-title { font-size: 16px; font-weight: 700; color: #1a1a2e; margin-bottom: 16px; }
.na-picker { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 12px; }
.na-picker-lbl { font-size: 13px; color: #4a5160; font-weight: 600; }
.na-picker-btn { border: 1px solid #d0d5dd; background: #fff; color: #344054; border-radius: 16px; padding: 5px 14px; font-size: 13px; font-weight: 600; cursor: pointer; }
.na-picker-btn:hover { border-color: #C8102E; color: #C8102E; }
.na-picker-btn.on { background: #C8102E; border-color: #C8102E; color: #fff; }
.na-sub { font-size: 12.5px; color: #6b7280; margin: 4px 0 16px; }
.na-head { background: #f7f8fa; border: 1px solid #eef0f4; border-radius: 8px; padding: 12px 16px; font-size: 13px; color: #2a2f39; margin-bottom: 14px; }
.na-hrow { display: flex; gap: 12px; padding: 3px 0; }
.na-lbl { color: #6b7280; min-width: 58px; flex-shrink: 0; }
.na-body { width: 100%; box-sizing: border-box; border: 1px solid #e6e9ef; border-radius: 8px; padding: 14px 16px; font-family: Consolas, monospace; font-size: 12.5px; color: #2a2f39; line-height: 1.65; background: #f7f8fa; resize: vertical; min-height: 320px; white-space: pre; }
.na-body:focus { outline: none; border-color: #C8102E; box-shadow: 0 0 0 2px rgba(200,16,46,.1); }
.na-body-short { min-height: 68px; font-weight: 700; }
.na-sysnote { background: #f2f7f4; border: 1px solid #d7e6dd; border-left: 3px solid #1E7E45; border-radius: 8px; padding: 14px 16px; font-size: 13px; color: #234; line-height: 1.6; margin-bottom: 4px; }
.na-actions { display: flex; align-items: center; gap: 12px; margin-top: 16px; }
.na-grey { background: #eef0f4; color: #3a3f4a; border: 1px solid #e0e3ea; box-shadow: none; }
.na-grey:hover { background: #e2e6ec; }
.na-done { color: #1e7a34; font-size: 13px; font-weight: 600; }
.pill-green { background: #e6f4ea; color: #1E7E45; }

/* --- analyst review (HITL writeback) box --- */
.ar-box { background: #fff; border: 1px solid #e6e9ef; border-radius: 12px; padding: 20px 24px; margin-top: 16px; box-shadow: 0 1px 6px rgba(20,30,60,.05); }
.ar-hd { font-size: 15px; font-weight: 700; color: #1a1a2e; }
.ar-sub { font-size: 12.5px; color: #6b7280; margin: 3px 0 14px; }
.ar-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.ar-btn { background: #eef0f4; color: #3a3f4a; border: 1px solid #e0e3ea; border-radius: 8px; padding: 9px 16px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; white-space: nowrap; }
.ar-btn:hover { background: #e2e6ec; }
.ar-btn.on { background: #C8102E; color: #fff; border-color: #C8102E; }
.ar-btn.on:hover { background: #a50d26; }
.ar-confirm { margin-left: auto; padding: 9px 24px; }
.ar-confirmed { margin-left: auto; color: #1e7a34; font-size: 14px; font-weight: 700; }

/* --- compare (cm-*) block, shared with the Compare & Match widget --- */
.cm-banner { border-radius: 12px; padding: 16px 20px; margin-bottom: 16px; border: 1px solid; }
.cm-banner.cm-ok { background: #eef8f1; border-color: #bfe3ca; }
.cm-banner.cm-warn { background: #fdf6e8; border-color: #f0dcae; }
.cm-banner.cm-bad { background: #fdeceb; border-color: #f2c3bd; }
.cm-b-title { font-weight: 700; font-size: 15px; margin-bottom: 3px; }
.cm-banner.cm-ok .cm-b-title { color: #1E7E45; }
.cm-banner.cm-warn .cm-b-title { color: #B7791F; }
.cm-banner.cm-bad .cm-b-title { color: #C0392B; }
.cm-b-msg { font-size: 12.5px; color: #5b6270; line-height: 1.9; }
.chip { display: inline-block; background: #fbe0dd; color: #C0392B; font-size: 11px; font-weight: 600; padding: 2px 9px; border-radius: 12px; margin-left: 6px; }
.chip-nf { background: #eef0f4; color: #6b7280; }
.cm-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
.cm-panel { background: #fbfaf3; border: 1px solid #e8e6d6; border-radius: 12px; padding: 22px 26px; }
.cm-p-title { font-size: 16px; font-weight: 700; color: #1a1a2e; }
.cm-p-sub { font-size: 13px; color: #6b7280; margin: 2px 0 16px; }
.cm-rows { display: flex; flex-direction: column; gap: 2px; }
.cm-row { display: flex; align-items: center; padding: 9px 0; border-bottom: 1px solid #efeee2; }
.cm-row:last-child { border-bottom: none; }
.cm-lbl { width: 170px; font-size: 12.5px; color: #6b7280; }
.cm-val { flex: 1; text-align: right; font-family: Consolas, monospace; font-size: 13px; color: #20242c; word-break: break-word; }
.cm-val-bad { color: #C0392B; }
.cm-ck { color: #1E7E45; font-weight: 700; margin-left: 8px; }
.cm-x { background: #f9d7d2; color: #C0392B; font-family: "Segoe UI", Arial; font-size: 10.5px; font-weight: 700; padding: 2px 7px; border-radius: 10px; margin-left: 8px; }
.cm-nf { background: #eef0f4; color: #6b7280; font-family: "Segoe UI", Arial; font-size: 10.5px; font-weight: 700; padding: 2px 9px; border-radius: 10px; letter-spacing: .3px; }
.cm-notfound { background: #fbe9e7; border: 1px solid #f2c3bd; border-radius: 12px; padding: 38px 30px; text-align: center; margin-top: 6px; }
.cm-nf-icon { width: 48px; height: 48px; line-height: 44px; margin: 0 auto 14px; border-radius: 50%; border: 2px solid #C0392B; color: #C0392B; font-size: 22px; font-weight: 700; }
.cm-nf-title { color: #C0392B; font-weight: 700; font-size: 15px; }
.cm-card { background: #fff; border: 1px solid #e6e9ef; border-radius: 10px; }
.cm-empty { text-align: center; color: #6b7280; padding: 30px 26px; font-size: 13.5px; }
@media (max-width: 900px) { .cm-grid { grid-template-columns: 1fr; } }
.cm-cand { background: #fff; border: 1px solid #e6e9ef; border-radius: 12px; padding: 18px 22px; margin-top: 16px; box-shadow: 0 1px 6px rgba(20,30,60,.05); }
.cm-cand-hd { font-size: 15px; font-weight: 700; color: #1a1a2e; display: flex; align-items: center; gap: 8px; }
.cm-cand-n { background: #eef0f4; color: #3a3f4a; font-size: 11.5px; font-weight: 700; padding: 1px 9px; border-radius: 10px; }
.cm-cand-sub { font-size: 12.5px; color: #6b7280; margin: 2px 0 12px; }
.cm-cand-scroll { overflow-x: auto; }
.cm-cand-tbl { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.cm-cand-tbl th { text-align: left; font-size: 11px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: .3px; padding: 7px 12px; border-bottom: 1px solid #e6e9ef; white-space: nowrap; }
.cm-cand-tbl td { padding: 9px 12px; border-bottom: 1px solid #f0f1f5; color: #20242c; white-space: nowrap; }
.cm-cand-tbl tr:last-child td { border-bottom: none; }
.cm-cand-best td { background: #f2f9f4; }
.cm-cand-rank { font-weight: 700; }
.cm-cand-tag { background: #1E7E45; color: #fff; font-size: 9.5px; font-weight: 700; padding: 1px 7px; border-radius: 9px; margin-left: 7px; text-transform: uppercase; letter-spacing: .3px; }
.cm-cand-cpx { color: #C0392B; font-weight: 700; margin-left: 6px; }
.cm-mono { font-family: Consolas, monospace; }

/* ===== Interactive candidate-selection table (Step 2) ===== */
.mm-wrap { background: #fff; border: 1px solid #e6e9ef; border-radius: 12px; padding: 20px 22px; box-shadow: 0 1px 6px rgba(20,30,60,.05); }
.mm-hd { margin-bottom: 14px; }
.mm-title { font-size: 16px; font-weight: 700; color: #1a1a2e; display: flex; align-items: center; gap: 10px; }
.mm-tier { font-size: 11.5px; font-weight: 700; color: #3a3f4a; background: #eef0f4; padding: 2px 10px; border-radius: 11px; }
.mm-sub { font-size: 12.5px; color: #6b7280; margin-top: 4px; line-height: 1.5; }
.mm-scroll { overflow-x: auto; border: 1px solid #eef0f4; border-radius: 10px; }
.mm-tbl { width: 100%; border-collapse: collapse; font-size: 12.5px; min-width: 900px; }
.mm-tbl th { text-align: left; font-size: 10.5px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: .4px; padding: 10px 14px; background: #f7f8fa; border-bottom: 1px solid #e6e9ef; white-space: nowrap; }
.mm-tbl td { padding: 12px 14px; border-bottom: 1px solid #f0f1f5; color: #20242c; vertical-align: top; white-space: nowrap; }
.mm-tbl tr:last-child td { border-bottom: none; }
.mm-submitted td { background: #fbfaf3; font-weight: 600; border-bottom: 2px solid #e8e6d6; }
.mm-selected td { background: #f2f9f4; }
.mm-selected td:first-child { box-shadow: inset 3px 0 0 #1E7E45; }
.mm-rec { font-weight: 700; color: #1a1a2e; display: flex; align-items: center; gap: 8px; }
.mm-recsub { font-size: 11.5px; color: #6b7280; margin-top: 3px; }
.mm-sys { display: inline-block; margin-left: 8px; font-family: "Segoe UI", Arial; font-size: 10.5px; font-weight: 700; color: #3F5170; background: #eef0f6; padding: 1px 8px; border-radius: 9px; }
.mm-recmis { margin-top: 5px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.mm-conf { font-size: 10.5px; font-weight: 700; padding: 2px 8px; border-radius: 9px; }
.mm-conf-hi { color: #1E7E45; background: #e6f4ea; }
.mm-conf-mid { color: #B7791F; background: #fdf1e3; }
.mm-conf-lo { color: #C0392B; background: #f9d7d2; }
.mm-conf-inline { color: #6b7280; font-weight: 600; }
.mm-mis { font-size: 10.5px; font-weight: 700; color: #C0392B; background: #f9d7d2; padding: 2px 8px; border-radius: 9px; }
.mm-allok { font-size: 10.5px; font-weight: 700; color: #1E7E45; background: #e6f4ea; padding: 2px 8px; border-radius: 9px; }
.mm-badge-top { font-size: 9.5px; font-weight: 700; color: #1F5FA8; background: #e7f0fb; padding: 2px 8px; border-radius: 9px; text-transform: uppercase; letter-spacing: .3px; }
.mm-badge-exact { font-size: 9.5px; font-weight: 700; color: #1E7E45; background: #e6f4ea; padding: 2px 8px; border-radius: 9px; text-transform: uppercase; letter-spacing: .3px; }
.mm-mono { font-family: Consolas, monospace; }
.mm-bad { background: #fbe9e7 !important; color: #C0392B !important; font-weight: 700; }
.mm-selcol { text-align: right; }
.mm-selbtn { background: #C8102E; color: #fff; border: none; border-radius: 6px; padding: 8px 16px; font-size: 12.5px; font-weight: 600; cursor: pointer; white-space: nowrap; box-shadow: 0 1px 3px rgba(200,16,46,.3); }
.mm-selbtn:hover { background: #a50d26; }
.mm-selbtn.on { background: #1E7E45; box-shadow: 0 1px 3px rgba(30,126,69,.3); }
.mm-foot { display: flex; align-items: center; gap: 14px; margin-top: 16px; flex-wrap: wrap; }
.mm-foot-note { font-size: 12px; color: #6b7280; flex: 1; min-width: 200px; }
.mm-chosen { font-size: 13px; font-weight: 600; color: #1e7a34; }
.mm-nomatch { background: #eef0f4; color: #3a3f4a; border: 1px solid #e0e3ea; border-radius: 6px; padding: 9px 18px; font-size: 13px; font-weight: 600; cursor: pointer; }
.mm-nomatch:hover { background: #e2e6ec; }
.mm-nomatch.on { background: #3a3f4a; color: #fff; border-color: #3a3f4a; }
.nom-body { display: flex; min-height: calc(100vh - 55px); }
.nom-main { flex: 1; padding: 26px 30px; overflow: auto; }
.nom-head { display: flex; align-items: center; gap: 16px; margin-bottom: 20px; }
.nom-head h1 { font-size: 22px; font-weight: 700; color: #1a1a2e; margin: 0; line-height: 1.1; }
.nom-dl { display: inline-flex; align-items: center; line-height: 1; font-size: 12px; font-weight: 600; color: #3a3f4a; background: #eef0f4; padding: 7px 14px; border-radius: 18px; text-decoration: none; white-space: nowrap; border: 1px solid #e0e3ea; }
.nom-back { margin-left: auto; display: inline-flex; align-items: center; line-height: 1; font-size: 13px; font-weight: 600; color: #C8102E; background: #fff; padding: 8px 16px; border-radius: 18px; text-decoration: none; white-space: nowrap; border: 1px solid #f0c8ce; }
.nom-back:hover { background: #fdeef0; text-decoration: none; }
.nom-dl:hover { background: #e2e6ec; text-decoration: none; color: #C8102E; }
.nom-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; align-items: start; }
.nom-card { background: #fff; border: 1px solid #e6e9ef; border-radius: 10px; box-shadow: 0 1px 6px rgba(20,30,60,.05); overflow: hidden; }
.nom-card-h { display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 14.5px; color: #1a1a2e; padding: 14px 18px; border-bottom: 1px solid #eef0f4; }
.nom-pills { margin-left: auto; display: flex; gap: 6px; }
.pill { font-size: 10.5px; padding: 3px 10px; border-radius: 20px; font-weight: 600; }
.nom-meta { padding: 14px 18px 6px; font-size: 13px; line-height: 1.9; color: #3a3f4a; }
.nom-meta b { color: #1a1a2e; font-weight: 600; display: inline-block; min-width: 82px; }
.nom-mailbody { padding: 6px 18px 20px; font-size: 13px; line-height: 1.6; color: #41474f; white-space: pre-wrap; word-break: break-word; max-height: 360px; overflow: auto; border-top: 1px solid #f2f3f6; margin-top: 8px; padding-top: 14px; }
.nom-mailhtml { white-space: normal; }

/* ---- Deterministic highlighting (ValueLocator) ----------------------------------------------------
   A mark means: THIS is the text the field above was read from. The amount is emphasised because it is
   the anchor that identifies the row; the row itself gets the faintest tint so the eye finds it first
   without the table turning into a colour chart. */
.nom-hl { background: #fff3bf; border-radius: 2px; padding: 0 1px; box-shadow: inset 0 -1px 0 rgba(0,0,0,.10); }
.nom-hl-amount { background: #ffd98a; font-weight: 600; }
.nom-hl-date { background: #d7ecff; }
.nom-hl-currency { background: #e4e0ff; }
.nom-hl-text { background: #e8f5d9; }
/* Direction is the sender's word, not ours — a distinct colour and an italic slant so it reads as
   "what they wrote" rather than as one of our values. The tooltip names both sides. */
.nom-hl-direction { background: #ffe0e6; font-style: italic; }
.nom-hl-row > td, .nom-hl-row > th { background: #fffdf2; }
tr.nom-hl-row { outline: 1px solid #f0d98a; }
span.nom-hl-row { background: #fffdf2; box-shadow: inset 2px 0 0 #f0d98a; display: inline-block; }
.nom-hl-plain { white-space: pre-wrap; font-family: inherit; margin: 0; background: none; border: 0; padding: 0; font-size: inherit; }
.nom-hl-note { font-size: 11.5px; color: #6b7280; margin: 2px 0 8px; display: flex; align-items: center; flex-wrap: wrap; gap: 4px 12px; }
.nom-hl-lead { color: #4a5160; }
.nom-hl-key { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
.nom-hl-sw { width: 11px; height: 11px; border-radius: 2px; display: inline-block; box-shadow: inset 0 0 0 1px rgba(0,0,0,.10); padding: 0; }
.nom-hl-rowsw { background: #fffdf2; box-shadow: inset 0 0 0 1px #f0d98a; }
.nom-mailhtml table { border-collapse: collapse; margin: 6px 0; max-width: 100%; }
.nom-mailhtml td, .nom-mailhtml th { border: 1px solid #d9dde3; padding: 4px 8px; font-size: 12.5px; vertical-align: top; }
.nom-mailhtml th { background: #f5f7fa; font-weight: 600; text-align: left; }
.nom-mailhtml p, .nom-mailhtml div { margin: 4px 0; }
.nom-mailhtml ul, .nom-mailhtml ol { margin: 4px 0 4px 18px; }
.nom-mailhtml pre { white-space: pre-wrap; font-family: inherit; margin: 4px 0; }
.nom-mailhtml h1, .nom-mailhtml h2, .nom-mailhtml h3, .nom-mailhtml h4 { font-size: 13.5px; font-weight: 700; margin: 8px 0 4px; }
/* ---- Source highlighting (DEV): colour-code the current cashflow's values in the body ---- */
.cf-hl { border-radius: 3px; padding: 0 2px; font-weight: 600; -webkit-box-decoration-break: clone; box-decoration-break: clone; }
.cf-hl-amount { background: #d7f5dd; color: #0a7a33; }
.cf-hl-date   { background: #d9ecff; color: #0b5cad; }
.cf-hl-ccy    { background: #d3f2ee; color: #0a6b63; }
.cf-hl-dir    { background: #ffe6cc; color: #b25a00; }
.cf-hl-cpty   { background: #ffdfe6; color: #b0184a; }
.cf-hl-ref    { background: #ece0ff; color: #5b32c0; }
.cf-hl-ssi    { background: #e9edf2; color: #47566b; }
/* custom-field highlight palette (one distinct colour per custom field, assigned in order) */
.cf-hl-c1 { background: #ffe9d6; color: #a6560a; }
.cf-hl-c2 { background: #e0f0d8; color: #3a6b1f; }
.cf-hl-c3 { background: #fde2ef; color: #b01b6a; }
.cf-hl-c4 { background: #dceafc; color: #1c56a0; }
.cf-hl-c5 { background: #f3e6cf; color: #856012; }
.cf-hl-c6 { background: #e6e0f7; color: #5236a8; }
.cf-hl-active { background: #fdfcef; border-radius: 3px; -webkit-box-decoration-break: clone; box-decoration-break: clone; }
.cf-hl-legend { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; padding: 10px 18px 0; font-size: 11.5px; }
.cf-hl-legend-lbl { font-weight: 700; color: #4a5568; }
.cf-hl-chip { display: inline-flex; align-items: center; gap: 4px; color: #5a6472; }
.cf-hl-sw { width: 12px; height: 12px; border-radius: 3px; display: inline-block; border: 1px solid rgba(0,0,0,.06); }
.nom-fields { padding: 6px 18px; }
.nom-frow { display: flex; justify-content: space-between; align-items: center; padding: 11px 2px; border-bottom: 1px solid #f1f2f5; font-size: 13px; }
.nom-frow:last-child { border-bottom: none; }
.nom-flabel { color: #6b7280; }
.prov { font-size: 9.5px; font-weight: 700; padding: 1px 7px; border-radius: 9px; margin-left: 7px; letter-spacing: .3px; vertical-align: middle; }
.prov-ai { background: #f1edfb; color: #6B46C1; }
.prov-pcm { background: #e7f0fb; color: #1F5FA8; }
/* per-field extraction confidence */
.conf { font-size: 9.5px; font-weight: 700; padding: 1px 7px; border-radius: 9px; margin-left: 6px; letter-spacing: .2px; vertical-align: middle; cursor: help; }
.conf-hi { background: #e6f4ea; color: #1E7E45; }
.conf-mid { background: #fdf1e3; color: #B7791F; }
.conf-lo { background: #fbe9e7; color: #C0392B; }
.conf-overall { margin-left: 10px; font-size: 11px; font-weight: 700; padding: 2px 10px; border-radius: 11px; cursor: help; }
.conf-overall.conf-hi { background: #e6f4ea; color: #1E7E45; }
.conf-overall.conf-mid { background: #fdf1e3; color: #B7791F; }
.conf-overall.conf-lo { background: #fbe9e7; color: #C0392B; }
.nom-fval { color: #1a1a2e; font-weight: 600; text-align: right; max-width: 60%; word-break: break-word; }
.nom-empty { color: #c2c6cd; font-weight: 400; }
.nom-fai { display: block; margin-top: 2px; font-size: 11px; font-weight: 500; color: #6b7280; }
.nom-actbar { padding: 16px 18px; display: flex; justify-content: flex-end; align-items: center; gap: 10px; border-top: 1px solid #eef0f4; }
.nom-btn { background: #C8102E; color: #fff; border: none; border-radius: 6px; padding: 10px 20px; font-size: 13.5px; font-weight: 600; cursor: pointer; box-shadow: 0 1px 3px rgba(200,16,46,.3); }
.nom-btn:hover { background: #a50d26; }
.na-resolve-m { background: #1E7E45; box-shadow: 0 1px 3px rgba(30,126,69,.3); }
.na-resolve-m:hover { background: #196b3a; }
.na-resolve-u { background: #B7791F; box-shadow: 0 1px 3px rgba(183,121,31,.3); }
.na-resolve-u:hover { background: #9c661a; }
.na-resolve-m.on, .na-resolve-u.on { box-shadow: 0 0 0 3px rgba(20,30,60,.18); }
.na-hint { font-size: 12px; color: #6b7280; margin: 14px 0 2px; }
.na-wb { font-size: 12.5px; color: #1F5FA8; background: #eef4fb; border: 1px solid #d5e3f4; border-radius: 8px; padding: 9px 12px; margin: 8px 0 10px; }
.na-wb-sub { color: #6b7280; font-weight: 400; }
/* System write-back: a single uneditable block (no explanatory text) */
.na-wbbox { display: flex; align-items: center; gap: 12px; background: #f4f5f7; border: 1px solid #e0e3e9; border-radius: 8px; padding: 12px 16px; margin: 4px 0 14px; }
.na-wbbox-lbl { font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: #6b7280; }
.na-wbbox-val { font-size: 14px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: #1a1a2e; }

/* --- Feedback Loop (illustrative placeholder) --- */
.step-badge.fb-badge { background: #ede9f6; color: #6B46C1; box-shadow: none; font-size: 18px; }
.fb-card { background: #faf9fd; border: 1px dashed #d6cdec; border-radius: 12px; padding: 18px 20px 8px; }
.fb-head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.fb-title { font-size: 15px; font-weight: 700; color: #1a1a2e; }
.fb-chip { font-size: 10.5px; font-weight: 700; letter-spacing: .02em; text-transform: uppercase; color: #8a6516; background: #fdf1e3; border: 1px solid #f2d9b8; border-radius: 20px; padding: 3px 10px; }
.fb-sub { font-size: 12px; color: #6b7280; margin: 6px 0 14px; line-height: 1.5; }
.fb-tblwrap { overflow-x: auto; }
.fb-tbl { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.fb-tbl th { text-align: left; color: #6b7280; font-weight: 700; font-size: 11px; letter-spacing: .04em; text-transform: uppercase; padding: 8px 12px; border-bottom: 1px solid #e6e2f0; white-space: nowrap; }
.fb-tbl td { padding: 10px 12px; border-bottom: 1px solid #efecf6; color: #2a2f39; vertical-align: middle; }
.fb-field { font-weight: 600; color: #1a1a2e; white-space: nowrap; }
.fb-ai { font-family: Consolas, monospace; color: #9aa0a8; text-decoration: line-through; }
.fb-actual { font-family: Consolas, monospace; color: #1E7E45; font-weight: 700; }
.fb-reason { width: 100%; min-width: 180px; box-sizing: border-box; border: 1px solid #d7dbe2; border-radius: 6px; padding: 6px 10px; font-size: 12px; color: #1a1a2e; background: #fff; font-family: inherit; }
.fb-reason:focus { outline: none; border-color: #6B46C1; }
.na-status { display: flex; align-items: center; gap: 18px; margin-top: 12px; min-height: 16px; }
.na-done-amber { color: #B7791F; }
.na-sent { color: #1F5FA8; font-size: 13px; font-weight: 600; }
.nom-inp { border: 1px solid transparent; background: transparent; color: #1a1a2e; font-weight: 600; font-size: 13.5px; font-family: inherit; text-align: right; padding: 5px 8px; border-radius: 6px; width: 58%; max-width: 58%; }
.nom-inp.on { border-color: #d7dbe2; background: #fff; }
.nom-inp.on:focus { outline: none; border-color: #C8102E; box-shadow: 0 0 0 2px rgba(200,16,46,.12); }
.nom-ebtn { margin-left: 8px; background: #eef0f4; color: #3a3f4a; border: none; border-radius: 16px; padding: 5px 13px; font-size: 12px; font-weight: 600; cursor: pointer; }
.nom-ebtn:hover { background: #e2e6ec; }
.nom-save:disabled { background: #e7e9ee; color: #9aa0a8; cursor: not-allowed; box-shadow: none; }
.nom-save:disabled:hover { background: #e7e9ee; }
.nom-saved { color: #1e7a34; font-size: 12.5px; font-weight: 600; display: flex; align-items: center; margin-right: 2px; }
.nom-saveerr { color: #C0392B; font-size: 12.5px; font-weight: 600; display: flex; align-items: center; margin-right: 2px; }

[CacheFlushLog] event=sp_widget, count=1, ms=0: Flushing catalog sp_widget
[CacheFlushLog] event=sp_instance, count=1, ms=618: Flushing catalog sp_instance
[CacheFlushLog] event=sp_column, count=1, ms=172: Flushing catalog sp_column
[CacheFlushLog] event=sp_row, count=1, ms=140: Flushing catalog sp_row
[CacheFlushLog] event=sp_container, count=1, ms=123: Flushing catalog sp_container
[CacheFlushLog] event=sp_page, count=1, ms=1072: Flushing catalog sp_page
*** Script: 
=================================================================
GROSS / NET ONTO THE CASE SCREEN   scope: x_nose_nexai_test
=================================================================
widget : OTC AI Extraction  62d8561211e948e29729a77664498a49
sizes  : server 41479 / template 26732 / client 13067 / css 27287
anchors: all four found
backup : written to the system log, search [grossnet-backup]

PATCHED  server +43775 chars, template, client and css updated

REMOVING THE STANDALONE PAGE
   page nexai_grossnet deleted (1 widget instance(s) removed)
   widget nexai-grossnet deleted

KEPT (this is the engine - do not remove):
   NettingEngine script include
   the four columns  netting_group / is_net / amount_origin / settle_granularity
   the Gross/Net match guard business rule

TEST:
   open the board, click into a mail with several cashflows.
   A "Settle at  Gross | Net" control appears above the cashflow navigator, only when the
   mail has something to net. Press Net: the navigator collapses to one row per netting
   group and the screen lands on the net. Press Gross to go back.

   If anything is wrong, the previous widget is in the system log under [grossnet-backup].
=================================================================
