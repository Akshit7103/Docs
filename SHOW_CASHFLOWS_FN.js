[0:00:00.429] Script completed in scope global: script
Script execution history and recovery available here
Operation	Table	Row Count
update	sys_update_version	1
update	sys_update_xml	1
insert	sys_update_version	1
update	sys_script_include	1
*** Script: [boardcount-backup] TaggingDashboard sys_id=d96ad80b25f246d3abf63fcaea97e777
---- SCRIPT ----
/**
 * TaggingDashboard — renders the "Outlook Tagging" screen (Nomura-branded, no sidebar).
 * Data from the native x_nose_nexai_test_email records:
 *   - Total Mails Assigned = count of RELEVANT records (real). Other stat boxes = "-".
 *   - Activity table (relevant rows): Mail Id, Trade Id, Counterparty, Amount, VD,
 *     Tagging (email date vs value date: before -> Pre Settlement, same -> Settlement
 *     Date, after -> Post Settlement), Time Elapsed (now - email Date header, live), Outlook Tagging
 *     ("Awaiting Confirmation" until the analyst clicks Confirm on the analyst screen,
 *     then "Awaiting Review"). No Status / Match Confidence columns (per spec).
 * Served by the x_nose_nexai_test_tagging UI Page.
 */
var TAG_LOGO = 'data:image/png;base64,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';

var TAG_CSS =
'*{box-sizing:border-box;margin:0;padding:0}' +
'.nom-app{font-family:"Segoe UI",Arial,sans-serif;background:#eef1f5;color:#20242c;min-height:100vh}' +
'.nom-top{display:flex;align-items:center;gap:28px;background:#fff;padding:12px 26px;border-bottom:3px solid #C8102E;box-shadow:0 1px 4px rgba(0,0,0,.06)}' +
'.nom-logo{height:44px;width:auto}' +
'.nom-user{margin-left:auto;display:flex;align-items:center;gap:10px}' +
'.nom-role{font-size:13px;color:#5b6270}' +
'.nom-avatar{width:30px;height:30px;border-radius:50%;background:#C8102E;color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600}' +
'.tag-main{padding:24px 30px}' +
'.tag-head{display:flex;align-items:center;margin-bottom:18px}' +
'.tag-head h1{font-size:22px;font-weight:700;color:#1a1a2e}' +
'.tag-period{margin-left:auto;display:flex;gap:4px;background:#e7ebf1;border-radius:20px;padding:3px}' +
'.tag-period span{font-size:12px;color:#6b7280;padding:4px 14px;border-radius:16px}' +
'.tag-period span.on{background:#fff;color:#C8102E;font-weight:600}' +
'.stats{display:grid;grid-template-columns:repeat(7,1fr);gap:12px;margin-bottom:20px}' +
'.stat{background:#fff;border:1px solid #e6e9ef;border-radius:10px;padding:18px 14px 14px;box-shadow:0 1px 5px rgba(20,30,60,.05);position:relative}' +
'.stat-dot{width:8px;height:8px;border-radius:50%;background:#cfd4dc;position:absolute;top:15px;left:14px}' +
'.stat-dot.on{background:#C8102E}' +
'.stat-num{font-size:26px;font-weight:700;color:#1a1a2e;margin-top:2px}' +
'.stat-lbl{font-size:11.5px;color:#6b7280;margin-top:4px;line-height:1.3}' +
'.search{background:#fff;border:1px solid #e6e9ef;border-radius:10px;padding:14px 16px;margin-bottom:18px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;box-shadow:0 1px 5px rgba(20,30,60,.05)}' +
'.search-lbl{font-size:12px;font-weight:600;color:#6b7280}' +
'.s-field{padding:8px 11px;border:1px solid #d7dbe2;border-radius:6px;font-size:12.5px;color:#8b909a;background:#f8f9fb;min-width:180px}' +
'.card{background:#fff;border:1px solid #e6e9ef;border-radius:10px;box-shadow:0 1px 6px rgba(20,30,60,.05);overflow:hidden}' +
'.card-h{font-weight:600;font-size:14.5px;color:#1a1a2e;padding:14px 18px;border-bottom:1px solid #eef0f4}' +
'.tbl{width:100%;border-collapse:collapse;font-size:12.5px}' +
'.tbl th{text-align:left;background:#1F2A44;color:#fff;padding:10px 14px;font-weight:600;white-space:nowrap;cursor:pointer;user-select:none}' +
'.tbl th:hover{background:#26355a}' +
'.tbl td{padding:10px 14px;border-bottom:1px solid #f1f2f5;color:#2a2f39;white-space:nowrap}' +
'.tbl tbody tr:hover{background:#f8f9fb}' +
'.mono{font-family:Consolas,monospace;font-size:12px}' +
'.dash{color:#c2c6cd}' +
'.empty{text-align:center;color:#6b7280;padding:26px}' +
'.tg{font-size:11px;font-weight:600;padding:4px 10px;border-radius:20px}' +
'.tg-conf{background:#fdf1e3;color:#B7791F}' +
'.tg-rev{background:#e7f0fb;color:#1F5FA8}' +
'.tg-pre{background:#eef0f6;color:#3F5170}' +
'.tg-settle{background:#e6f4ea;color:#1E7E45}' +
'.tg-post{background:#f1edfb;color:#6B46C1}';

var TaggingDashboard = Class.create();
TaggingDashboard.prototype = {
    initialize: function () {},

    // LEGACY / DELISTED (review #14): the classic dashboard UI Page (x_nose_nexai_test_tagging.do) is superseded
    // by the Service-Portal dashboard (data() / dataAi() below). No navigation points here; retained pending removal.
    render: function () {
        var ex = new x_nose_nexai_test.EmlFieldExtractor();
        var nowMs = new GlideDateTime().getNumericValue();

        var rows = '', n = 0;
        var gr = new GlideRecord('x_nose_nexai_test_email');
        gr.addQuery('classification', 'relevant');
        gr.orderByDesc('sys_created_on');
        gr.setLimit(100);
        gr.query();
        while (gr.next()) {
            n++;
            var aid = this._attId(gr.getUniqueValue());
            var elapsed = '<span class="dash">-</span>', elapsedMin = -1;
            var emailIso = '';   // (A) the email's own date, yyyy-MM-dd
            if (aid) {
                var ds = ex.emailDate(aid);
                var ms = this._parseEmailDate(ds);
                emailIso = this._emailIso(ds);
                if (isNaN(ms)) { ms = new GlideDateTime(gr.getValue('sys_created_on')).getNumericValue(); }
                if (!emailIso) {   // Date header unreadable -> fall back to the record's arrival date
                    var d = new Date(ms);
                    emailIso = d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2);
                }
                elapsedMin = Math.floor((nowMs - ms) / 60000);
                elapsed = this._fmtElapsed(nowMs - ms);
            }
            var rs = gr.getValue('review_status') || 'awaiting_confirmation';
            var tag = (rs === 'awaiting_review')
                ? '<span class="tg tg-rev">Awaiting Review</span>'
                : '<span class="tg tg-conf">Awaiting Confirmation</span>';

            // One row per cashflow (multi-trade mails); a mail with no extracted flow (image /
            // PDF / partial / SSI) still gets a clickable row from its own summary. Every row is
            // self-contained (mail-level cells repeat) so the columns can be sorted client-side.
            var flows = this._cashflows(gr.getUniqueValue());
            if (!flows.length) {
                flows = [{
                    sys_id: '', reference: '', currency: '', amount: '', direction: '', value_date: ''
                }];
            }
            var mailId = this._v(gr.getValue('name'));
            var cpName = this._v(gr.getValue('counterparty_name'));
            for (var ci = 0; ci < flows.length; ci++) {
                var c = flows[ci];
                var href = c.sys_id
                    ? '/x_nose_nexai_test_compare.do?id=' + c.sys_id
                    : '/x_nose_nexai_test_compare.do?email=' + gr.getUniqueValue();
                var amtNum = parseFloat(('' + (c.amount || '')).replace(/,/g, '')); if (isNaN(amtNum)) { amtNum = 0; }
                rows += '<tr onclick="window.location.href=\'' + href + '\'" style="cursor:pointer">' +
                    '<td class="mono">' + mailId + '</td>' +
                    '<td class="mono">' + this._v(c.reference) + '</td>' +
                    '<td>' + cpName + '</td>' +
                    '<td data-s="' + amtNum + '">' + this._v(c.amount) + '</td>' +
                    '<td>' + this._v(c.currency) + '</td>' +
                    '<td>' + this._v(c.direction) + '</td>' +
                    '<td>' + this._v(c.value_date) + '</td>' +
                    '<td>' + this._vdTag(emailIso, c.value_date) + '</td>' +
                    '<td data-s="' + elapsedMin + '">' + elapsed + '</td>' +
                    '<td>' + tag + '</td>' +
                    '</tr>';
            }
        }
        if (!n) { rows = '<tr><td colspan="10" class="empty">No relevant emails yet — drop some on the Inbox.</td></tr>'; }

        return this._html(this._countRelevant(), rows);
    },

    // Structured data for the Service Portal widget — SAME content as render(), no HTML.
    // Reuses all the helpers below so the two dashboards can never drift apart.
    data: function () {
        var ex = new x_nose_nexai_test.EmlFieldExtractor();
        var cm = new x_nose_nexai_test.CompareMatch();
        var nowMs = new GlideDateTime().getNumericValue();

        // Card numbers. Email-level counts via aggregate (accurate at any volume); the match trio
        // (Matched / Mismatch / No Match) is tallied per cashflow during the row build below.
        var relevant = parseInt(this._countRelevant(), 10) || 0;
        var awaitRev = this._countReview('awaiting_review');
        var awaitConf = relevant - awaitRev; if (awaitConf < 0) { awaitConf = 0; }
        var matched = 0, mismatch = 0, noMatch = 0, pending = 0;
        var cpSet = {};

        var out = { logo: TAG_LOGO, stats: [], rows: [] };
        var gr = new GlideRecord('x_nose_nexai_test_email');
        gr.addQuery('classification', 'relevant');
        gr.orderByDesc('sys_created_on');
        gr.setLimit(100);
        gr.query();
        while (gr.next()) {
            var recId = gr.getUniqueValue();
            var aid = this._attId(recId);
            var elapsedText = '-', elapsedMin = -1, emailIso = '';
            if (aid) {
                var ds = ex.emailDate(aid);
                var ms = this._parseEmailDate(ds);
                emailIso = this._emailIso(ds);
                if (isNaN(ms)) { ms = new GlideDateTime(gr.getValue('sys_created_on')).getNumericValue(); }
                if (!emailIso) {
                    var dd = new Date(ms);
                    emailIso = dd.getUTCFullYear() + '-' + ('0' + (dd.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + dd.getUTCDate()).slice(-2);
                }
                elapsedMin = Math.floor((nowMs - ms) / 60000);
                elapsedText = this._fmtElapsedText(nowMs - ms);
            }
            var rs = gr.getValue('review_status') || 'awaiting_confirmation';
            var outlook = (rs === 'awaiting_review')
                ? { label: 'Awaiting Review', cls: 'tg-rev' }
                : { label: 'Awaiting Confirmation', cls: 'tg-conf' };
            var flows = this._cashflows(recId);
            if (!flows.length) {
                flows = [{
                    sys_id: '', reference: '', currency: '', amount: '', direction: '', value_date: '',
                    confirmed: (rs === 'awaiting_review') ? 'true' : '', analyst_outcome: '',
                    review_confirmed: '', resolution: ''
                }];
            }
            var mailId = gr.getValue('name') || '';
            var cpName = gr.getValue('counterparty_name') || '';
            if (cpName) { cpSet[cpName] = true; }
            for (var ci = 0; ci < flows.length; ci++) {
                var c = flows[ci];
                var cfNum = 'cf' + (ci + 1);
                var cfSub = (flows.length > 1) ? ('of ' + flows.length) : '';
                var href = c.sys_id ? '/nexaitest?id=nexaitest_nfotc_analyst&cf=' + c.sys_id : '/nexaitest?id=nexaitest_nfotc_analyst&eml=' + recId;
                var amtNum = parseFloat(('' + (c.amount || '')).replace(/,/g, '')); if (isNaN(amtNum)) { amtNum = 0; }
                // Match status is meaningful only after the analyst CONFIRMS the Step 2 review — until
                // then it is Pending Confirmation. Once review-confirmed, show the (locked) outcome.
                var mstatus = (c.review_confirmed !== 'true') ? 'pending'
                    : (c.analyst_outcome || cm.classify({
                        counterparty: cpName, reference: c.reference, currency: c.currency,
                        amount: c.amount, direction: c.direction, value_date: c.value_date
                    }));
                if (mstatus === 'matched') { matched++; }
                else if (mstatus === 'mismatch') { mismatch++; }
                else if (mstatus === 'no_match') { noMatch++; }
                else if (mstatus === 'pending') { pending++; }
                var mLabel, mCls;
                if (mstatus === 'pending') { mLabel = 'Pending Confirmation'; mCls = 'tg-pend'; }
                else if (mstatus === 'matched') { mLabel = 'Matched'; mCls = 'tg-ok'; }
                else if (mstatus === 'mismatch') { mLabel = 'Mismatch'; mCls = 'tg-warn'; }
                else { mLabel = 'Allege'; mCls = 'tg-bad'; }

                // Workflow status: Awaiting Confirmation (extracted fields not yet confirmed) ->
                // Awaiting Review (fields confirmed, up to and including Compare & Match review) ->
                // Escalated (email sent) / Resolved (closed).
                var wfLabel, wfCls;
                if (c.resolution === 'closed') { wfLabel = 'Resolved'; wfCls = 'tg-ok'; }
                else if (c.resolution === 'sent') { wfLabel = 'Escalated'; wfCls = 'tg-warn'; }
                else if (c.confirmed === 'true') { wfLabel = 'Awaiting Review'; wfCls = 'tg-rev'; }
                else { wfLabel = 'Awaiting Confirmation'; wfCls = 'tg-conf'; }
                out.rows.push({
                    mailId: mailId, cfLabel: cfNum, cfSub: cfSub, reference: c.reference || '', counterparty: cpName,
                    amount: c.amount || '', amountNum: amtNum, currency: c.currency || '',
                    direction: c.direction || '', value_date: c.value_date || '', value_date_disp: this._toDispDate(c.value_date),
                    tagging: this._vdTagData(emailIso, c.value_date),
                    elapsedText: elapsedText, elapsedMin: elapsedMin,
                    outlook: outlook, matchStatus: mstatus, matchLabel: mLabel, matchCls: mCls,
                    workflowLabel: wfLabel, workflowCls: wfCls, href: href
                });
            }
        }

        // `filter` makes the tile a control, not just a readout: clicking it filters the table below to
        // exactly the rows it counted. The value IS the row's matchStatus, so the tile and the "Compare
        // and Match Status" dropdown drive the same one field and can never disagree. The two totals
        // carry '' because "all mails" and "all trades" are not a subset of anything.
        out.stats = [
            { label: 'Total Mails Assigned', num: '' + relevant, on: true, numCls: '', filter: '' },
            { label: 'Total Trades Assigned', num: '' + out.rows.length, on: true, numCls: '', filter: '' },
            { label: 'Pending Confirmation', num: '' + pending, on: false, numCls: 'n-amber', filter: 'pending' },
            { label: 'Matched', num: '' + matched, on: false, numCls: 'n-green', filter: 'matched' },
            { label: 'Mismatch', num: '' + mismatch, on: false, numCls: 'n-amber', filter: 'mismatch' },
            { label: 'Allege', num: '' + noMatch, on: false, numCls: 'n-red', filter: 'no_match' }
        ];
        out.counterparties = Object.keys(cpSet).sort();
        return out;
    },

    // OTC AI variant — a FULL replica of data() (same cards, filters, columns, match & workflow status),
    // but every value is sourced from the AI-extracted fields and the analyst-feedback state uses the
    // parallel ai_* workflow fields, so the AI path is fully independent of the OTC path.
    // wizId (optional): scope the board to only the mails a published wizard has extracted, so it
    // shows exactly what that wizard has processed (not every relevant mail on the instance).
    dataAi: function (wizId, readOnly) {
        var ex = new x_nose_nexai_test.EmlFieldExtractor();
        var cm = new x_nose_nexai_test.CompareMatch();
        var nowMs = new GlideDateTime().getNumericValue();

        var relevant = parseInt(this._countRelevant(), 10) || 0;
        var matched = 0, mismatch = 0, noMatch = 0, pending = 0;
        var cpSet = {}, mailSet = {};

        var out = { logo: TAG_LOGO, stats: [], rows: [] };
        var gr = new GlideRecord('x_nose_nexai_test_email');
        gr.addQuery('classification', 'relevant');
        gr.orderByDesc('sys_created_on');
        gr.setLimit(100);
        gr.query();
        while (gr.next()) {
            if (wizId && gr.getValue('wiz_extracted') !== wizId) { continue; } // only this wizard's mails
            mailSet[gr.getUniqueValue()] = true;
            var recId = gr.getUniqueValue();
            var aid = this._attId(recId);
            var elapsedText = '-', elapsedMin = -1, emailIso = '';
            var createdMs = new GlideDateTime(gr.getValue('sys_created_on')).getNumericValue();
            // Time Elapsed = ageing since the mail was RECEIVED (its own Date header) up to now — NOT since
            // ingest / Sync. Fall back to the ingest time only when the Date header is missing/unreadable,
            // or (for a few synthetic mails) carries a FUTURE date that has no meaningful elapsed.
            var recvMs = NaN;
            if (aid) {
                var ds = ex.emailDate(aid);
                recvMs = this._parseEmailDate(ds);
                emailIso = this._emailIso(ds); // email Date header — also drives the Pre/Post-settlement tag
            }
            var baseMs = (!isNaN(recvMs) && recvMs > 0 && recvMs <= nowMs) ? recvMs : createdMs;
            if (baseMs > 0 && nowMs >= baseMs) {
                elapsedMin = Math.floor((nowMs - baseMs) / 60000);
                elapsedText = this._fmtElapsedText(nowMs - baseMs);
            }
            if (!emailIso) { var dd = new Date(createdMs); emailIso = dd.getUTCFullYear() + '-' + ('0' + (dd.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + dd.getUTCDate()).slice(-2); }
            var flows = this._cashflows(recId);
            if (!flows.length) {
                flows = [{
                    sys_id: '', ai_counterparty: gr.getValue('counterparty_name'), ai_reference: gr.getValue('ai_reference'),
                    ai_currency: gr.getValue('ai_currency'), ai_amount: gr.getValue('ai_amount'),
                    ai_direction: gr.getValue('ai_direction'), ai_value_date: gr.getValue('ai_value_date'),
                    ai_confirmed: '', ai_analyst_outcome: '', ai_review_confirmed: '', ai_resolution: ''
                }];
            }
            var mailId = gr.getValue('name') || '';
            // Counterparty: the AI-read name first, the Eve directory as the fallback — the same order the
            // case screen shows and the matcher matches on, so the board cannot disagree with either.
            var detCp = gr.getValue('counterparty_name') || '';
            for (var ci = 0; ci < flows.length; ci++) {
                var c = flows[ci];
                var cfNum = 'cf' + (ci + 1);
                var cfSub = (flows.length > 1) ? ('of ' + flows.length) : '';
                var cp = (c.ai_counterparty || detCp);
                if (cp) { cpSet[cp] = true; }
                var _roq = readOnly ? '&ro=1' : '';
                var href = c.sys_id ? '/nexaitest?id=nexaitest_ai_extraction&cf=' + c.sys_id + _roq : '/nexaitest?id=nexaitest_ai_extraction&eml=' + recId + _roq;
                var amtNum = parseFloat(('' + (c.ai_amount || '')).replace(/,/g, '')); if (isNaN(amtNum)) { amtNum = 0; }
                // DIRECTION PRIORITY: the sign says which side of the trade Nomura is on, and the stored
                // direction was what produced it - so show the pair exactly as stored. The old double-flip
                // existed only because the two could disagree; now they cannot, and flipping would invert
                // a correct value and disagree with the bank booking beside it.
                var _dispAmt = '' + (c.ai_amount || '');
                var _dispDir = this._normDir(c.ai_direction);
                // Match status is meaningful only after the analyst confirms the Step-2 review (ai_review_confirmed);
                // until then it is Pending Confirmation. Once review-confirmed, show the (locked) outcome.
                var mstatus = (c.ai_review_confirmed !== 'true') ? 'pending'
                    : (c.ai_analyst_outcome || cm.classify({
                        counterparty: cp, reference: c.ai_reference, currency: c.ai_currency,
                        amount: c.ai_amount, direction: c.ai_direction, value_date: c.ai_value_date
                    }));
                if (mstatus === 'matched') { matched++; }
                else if (mstatus === 'mismatch') { mismatch++; }
                else if (mstatus === 'no_match') { noMatch++; }
                else if (mstatus === 'pending') { pending++; }
                var mLabel, mCls;
                if (mstatus === 'pending') { mLabel = 'Pending Confirmation'; mCls = 'tg-pend'; }
                else if (mstatus === 'matched') { mLabel = 'Matched'; mCls = 'tg-ok'; }
                else if (mstatus === 'mismatch') { mLabel = 'Mismatch'; mCls = 'tg-warn'; }
                else { mLabel = 'Allege'; mCls = 'tg-bad'; }

                // Workflow status (OTC AI): Awaiting Confirmation -> Awaiting Review -> the analyst's
                // Step-3 resolution (Resolved — Matched / Resolved — Unmatched). "Send to Middle Office"
                // is an optional side action and never changes this status.
                var wfLabel, wfCls;
                if (c.ai_resolution === 'resolved_matched') { wfLabel = 'Resolved — Matched'; wfCls = 'tg-ok'; }
                else if (c.ai_resolution === 'resolved_unmatched') { wfLabel = 'Resolved — Unmatched'; wfCls = 'tg-warn'; }
                else if (c.ai_confirmed === 'true') { wfLabel = 'Awaiting Review'; wfCls = 'tg-rev'; }
                else { wfLabel = 'Awaiting Confirmation'; wfCls = 'tg-conf'; }

                out.rows.push({
                    mailId: mailId, cfLabel: cfNum, cfSub: cfSub, reference: c.ai_reference || '', counterparty: cp,
                    amount: _dispAmt, amountNum: Math.abs(amtNum), currency: c.ai_currency || '',
                    direction: _dispDir, value_date: c.ai_value_date || '', value_date_disp: c.ai_value_date || '',
                    tagging: this._vdTagData(emailIso, c.ai_value_date),
                    elapsedText: elapsedText, elapsedMin: elapsedMin,
                    matchStatus: mstatus, matchLabel: mLabel, matchCls: mCls,
                    workflowLabel: wfLabel, workflowCls: wfCls, href: href,
                    // End-to-end resolved (Resolved — Matched / Resolved — Unmatched). Drives the per-mail
                    // row highlight computed after the loop.
                    resolved: (c.ai_resolution === 'resolved_matched' || c.ai_resolution === 'resolved_unmatched'),
                    rowHl: ''
                });
            }
        }

        // Per-mail resolution highlight: once ANY cashflow of a mail is end-to-end resolved, that mail's
        // RESOLVED cashflows show light-green and its still-unresolved cashflows show light-pink. A mail with
        // no resolved cashflow yet gets no highlight. Row-level (travels with the row through client sort).
        var _mailResolved = {};
        for (var _ri = 0; _ri < out.rows.length; _ri++) { if (out.rows[_ri].resolved) { _mailResolved[out.rows[_ri].mailId] = true; } }
        for (var _rj = 0; _rj < out.rows.length; _rj++) {
            var _rw = out.rows[_rj];
            _rw.rowHl = _rw.resolved ? 'green' : (_mailResolved[_rw.mailId] ? 'pink' : '');
        }

        // `filter` makes the tile a control, not just a readout: clicking it filters the table below to
        // exactly the rows it counted. The value IS the row's matchStatus, so the tile and the "Compare
        // and Match Status" dropdown drive the same one field and can never disagree. The two totals
        // carry '' because "all mails" and "all trades" are not a subset of anything.
        out.stats = [
            { label: 'Total Mails Assigned', num: '' + relevant, on: true, numCls: '', filter: '' },
            { label: 'Total Trades Assigned', num: '' + out.rows.length, on: true, numCls: '', filter: '' },
            { label: 'Pending Confirmation', num: '' + pending, on: false, numCls: 'n-amber', filter: 'pending' },
            { label: 'Matched', num: '' + matched, on: false, numCls: 'n-green', filter: 'matched' },
            { label: 'Mismatch', num: '' + mismatch, on: false, numCls: 'n-amber', filter: 'mismatch' },
            { label: 'Allege', num: '' + noMatch, on: false, numCls: 'n-red', filter: 'no_match' }
        ];
        if (wizId) { out.stats[0].num = '' + Object.keys(mailSet).length; } // scope Total Mails to this wizard
        out.counterparties = Object.keys(cpSet).sort();
        return out;
    },

    // Direction normalise / flip — delegated to the SHARED AmountDirection Script Include so the board and
    // the case screen use one implementation (they had diverged). Same semantics as before.
    _ad: function () { if (!this.__ad) { this.__ad = new x_nose_nexai_test.AmountDirection(); } return this.__ad; },
    _normDir: function (raw) { return this._ad().normDir(raw); },
    _flipDir: function (d) { return this._ad().flip(d); },

    _countReview: function (rs) {
        var ga = new GlideAggregate('x_nose_nexai_test_email');
        ga.addQuery('classification', 'relevant');
        ga.addQuery('review_status', rs);
        ga.addAggregate('COUNT');
        ga.query();
        return ga.next() ? parseInt(ga.getAggregate('COUNT'), 10) : 0;
    },

    // Plain-value variants (the render() ones return HTML).
    _fmtElapsedText: function (diffMs) {
        if (!diffMs || diffMs < 0) { return '-'; }
        var totalMin = Math.floor(diffMs / 60000);
        var days = Math.floor(totalMin / 1440);
        var hours = Math.floor((totalMin % 1440) / 60);
        if (days > 0) { return days + 'd ' + hours + 'h'; }
        return hours + 'h ' + (totalMin % 60) + 'm';
    },
    _vdTagData: function (a, vd) {
        var b = this._toIso(vd);
        if (!a || !b) { return { label: '-', cls: 'dash' }; }
        if (a === b) { return { label: 'Settlement Date', cls: 'tg-settle' }; }
        if (a < b) { return { label: 'Pre Settlement', cls: 'tg-pre' }; }
        return { label: 'Post Settlement', cls: 'tg-post' };
    },

    // Value date for display only: normalise to ISO then render DD-MM-YYYY (stored value stays ISO).
    _toDispDate: function (v) {
        var m = ('' + (this._toIso(v) || '')).match(/^(\d{4})-(\d{2})-(\d{2})$/);
        return m ? (m[3] + '-' + m[2] + '-' + m[1]) : ('' + (v || ''));
    },

    // AI-vs-deterministic agreement for one cashflow — drives the OTC AI dashboard "Match" (Y/N).
    // Y only when EVERY extracted field agrees: amount numerically, value date as ISO, and
    // reference / currency / direction / counterparty as normalised strings. A missing reference or
    // an empty/unparseable amount on either side -> N (the AI has nothing confident to agree with).
    _aiMatch: function (det, ai) {
        function s(v) { return ('' + (v == null ? '' : v)).replace(/\s+/g, ' ').trim().toLowerCase(); }
        function nm(v) { return ('' + (v == null ? '' : v)).toLowerCase().replace(/[^a-z0-9]/g, ''); }
        function amt(v) { var n = parseFloat(('' + (v || '')).replace(/[,\s]/g, '')); return isNaN(n) ? null : n; }
        var da = amt(det.amount), aa = amt(ai.amount);
        if (da === null || aa === null || da !== aa) { return false; }
        if (this._toIso(det.value_date) !== this._toIso(ai.value_date)) { return false; }
        if (s(det.reference) === '' || s(det.reference) !== s(ai.reference)) { return false; }
        if (s(det.currency) !== s(ai.currency)) { return false; }
        if (s(det.direction) !== s(ai.direction)) { return false; }
        if (nm(det.counterparty) !== nm(ai.counterparty)) { return false; }
        return true;
    },

    _countRelevant: function () {
        var ga = new GlideAggregate('x_nose_nexai_test_email');
        ga.addQuery('classification', 'relevant');
        ga.addAggregate('COUNT');
        ga.query();
        return ga.next() ? ga.getAggregate('COUNT') : '0';
    },

    // Child cashflow rows for a mail, ordered by flow index (empty for partial/SSI mails).
    _cashflows: function (emailId) {
        var out = [];
        // The counterparty is derived from the sender via EVE and lives on the EMAIL, not the
        // cashflow. Read it once so every row carries the same authoritative value; the
        // cashflow's ai_counterparty column is no longer written and must not be shown.
        var cpty = '';
        var _em = new GlideRecord('x_nose_nexai_test_email');
        if (_em.get(emailId)) { cpty = '' + (_em.getValue('counterparty_name') || ''); }
        var cf = new GlideRecord('x_nose_nexai_test_cashflow');
        cf.addQuery('email', emailId);
        cf.orderBy('flow_index');
        cf.query();
        while (cf.next()) {
            out.push({
                sys_id: cf.getUniqueValue(),
                reference: cf.getValue('reference'), currency: cf.getValue('currency'),
                amount: cf.getValue('amount'), direction: cf.getValue('direction'),
                value_date: cf.getValue('value_date'), confirmed: cf.getValue('confirmed'),
                analyst_outcome: cf.getValue('analyst_outcome'),
                review_confirmed: cf.getValue('review_confirmed'), resolution: cf.getValue('resolution'),
                ai_counterparty: cf.getValue('ai_counterparty'), ai_reference: cf.getValue('ai_reference'),
                ai_currency: cf.getValue('ai_currency'), ai_amount: cf.getValue('ai_amount'),
                ai_direction: cf.getValue('ai_direction'), ai_value_date: cf.getValue('ai_value_date'),
                ai_confirmed: cf.getValue('ai_confirmed'), ai_analyst_outcome: cf.getValue('ai_analyst_outcome'),
                ai_review_confirmed: cf.getValue('ai_review_confirmed'), ai_resolution: cf.getValue('ai_resolution')
            });
        }
        return out;
    },

    // The raw .eml attachment on an email record. PREFER *.eml / message-rfc822 — a mail that carried a
    // spreadsheet has BOTH the .eml AND an extracted Cashflows.xlsx on the record, and picking the xlsx
    // (which has no Date header) broke the email-date read (Time Elapsed + Pre/Post tag fell back to ingest).
    _attId: function (recId) {
        var a = new GlideRecord('sys_attachment');
        a.addQuery('table_name', 'x_nose_nexai_test_email');
        a.addQuery('table_sys_id', recId);
        a.orderBy('sys_created_on');
        a.query();
        var first = '';
        while (a.next()) {
            var fn = ('' + a.getValue('file_name')).toLowerCase();
            if (!first) { first = a.getUniqueValue(); }
            if (/\.eml$/.test(fn) || a.getValue('content_type') === 'message/rfc822') { return a.getUniqueValue(); }
        }
        return first;
    },

    // Parse "Sun, 14 Jun 2026 17:12:23 -0000" -> epoch ms (UTC). Date.UTC is engine-safe.
    _parseEmailDate: function (ds) {
        if (!ds) { return NaN; }
        var m = ds.match(/(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
        if (m) {
            var months = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
            var mon = months[m[2].charAt(0).toUpperCase() + m[2].slice(1, 3).toLowerCase()];
            if (mon !== undefined) { return Date.UTC(+m[3], mon, +m[1], +m[4], +m[5], +m[6]); }
        }
        var p = Date.parse(ds);
        return isNaN(p) ? NaN : p;
    },

    _fmtElapsed: function (diffMs) {
        if (!diffMs || diffMs < 0) { return '<span class="dash">-</span>'; }
        var totalMin = Math.floor(diffMs / 60000);
        var days = Math.floor(totalMin / 1440);
        var hours = Math.floor((totalMin % 1440) / 60);
        if (days > 0) { return days + 'd ' + hours + 'h'; }
        return hours + 'h ' + (totalMin % 60) + 'm';
    },

    // "Tagging" compares (A) the email date against (B) the value date:
    //   A < B  -> Pre Settlement   (email sent before settlement)
    //   A > B  -> Post Settlement  (email sent after settlement)
    //   A == B -> Settlement Date
    // Both are yyyy-MM-dd, which sort chronologically, so plain string comparison is safe.
    _vdTag: function (a, vd) {
        var b = this._toIso(vd);
        if (!a || !b) { return '<span class="dash">-</span>'; }
        if (a === b) { return '<span class="tg tg-settle">Settlement Date</span>'; }
        if (a < b) { return '<span class="tg tg-pre">Pre Settlement</span>'; }
        return '<span class="tg tg-post">Post Settlement</span>';
    },

    // The email's own date (from its Date header, e.g. "Sun, 14 Jun 2026 ...") as yyyy-MM-dd.
    _emailIso: function (ds) {
        if (!ds) { return ''; }
        var m = ('' + ds).match(/(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/);
        if (!m) { return ''; }
        var months = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
        var mon = months[m[2].toLowerCase()];
        if (!mon) { return ''; }
        return m[3] + '-' + mon + '-' + ('0' + m[1]).slice(-2);
    },

    // Normalize a value-date string to yyyy-MM-dd (accepts yyyy-MM-dd and dd/MM/yyyy).
    _toIso: function (vd) {
        if (!vd) { return ''; }
        vd = ('' + vd).trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(vd)) { return vd; }
        var m = vd.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);
        if (m) { return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2); }
        return '';
    },

    _v: function (val) { return val ? this._esc(val) : '<span class="dash">-</span>'; },
    _esc: function (s) { return ('' + (s || '')).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); },

    _html: function (total, rows) {
        var boxes = [
            ['Total Mails Assigned', '' + total, true],
            ['Pending Action', '-', false],
            ['Matched & Closed', '-', false],
            ['Mismatch', '-', false],
            ['Unmatched', '-', false],
            ['Escalated to SEO', '-', false],
            ['Allege', '-', false],
        ];
        var boxHtml = '';
        for (var i = 0; i < boxes.length; i++) {
            boxHtml += '<div class="stat"><div class="stat-dot' + (boxes[i][2] ? ' on' : '') + '"></div>' +
                '<div class="stat-num">' + this._esc(boxes[i][1]) + '</div>' +
                '<div class="stat-lbl">' + this._esc(boxes[i][0]) + '</div></div>';
        }

        return '<style>' + TAG_CSS + '</style>' +
            '<div class="nom-app">' +
            '<header class="nom-top">' +
            '<img class="nom-logo" src="' + TAG_LOGO + '" alt="Nomura"/>' +
            '<div class="nom-user"><span class="nom-role">Analyst</span><div class="nom-avatar">US</div></div>' +
            '</header>' +
            '<main class="tag-main">' +
            '<div class="tag-head"><h1>Dashboard</h1>' +
            '<div class="tag-period"><span class="on">Weekly</span><span>Monthly</span><span>Yearly</span></div></div>' +
            '<div class="stats">' + boxHtml + '</div>' +
            '<div class="search"><span class="search-lbl">Search using:</span>' +
            '<input class="s-field" placeholder="Search trade id…" disabled="disabled"/>' +
            '<select class="s-field" disabled="disabled"><option>Product — All</option></select>' +
            '<select class="s-field" disabled="disabled"><option>Counterparty — All</option></select>' +
            '<input class="s-field" placeholder="Date from – to" disabled="disabled"/>' +
            '</div>' +
            '<div class="card"><div class="card-h">Activity table</div>' +
            '<table class="tbl"><thead><tr>' +
            '<th onclick="tagSort(0,this)">Mail Id</th><th onclick="tagSort(1,this)">Trade Id</th>' +
            '<th onclick="tagSort(2,this)">Counterparty</th><th onclick="tagSort(3,this)">Amount</th>' +
            '<th onclick="tagSort(4,this)">Currency Pair</th><th onclick="tagSort(5,this)">Direction</th>' +
            '<th onclick="tagSort(6,this)">VD (YYYY-MM-DD)</th><th onclick="tagSort(7,this)">Tagging</th>' +
            '<th onclick="tagSort(8,this)">Time Elapsed</th><th onclick="tagSort(9,this)">Outlook Tagging</th>' +
            '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
            '</main>' +
            '</div>' +
            // NOTE: this UI Page is parsed as XML, so the script must avoid < > and && (which
            // break XML). We use !== loops and helper predicates instead.
            '<script>' +
            'function nomVal(cell){var s=cell.getAttribute("data-s");if(s===null){s=(cell.textContent||"").trim();}return s;}' +
            'function nomNum(x){if(x===""){return false;}return !isNaN(parseFloat(x));}' +
            'window.tagSort=function(idx,th){' +
            'var tb=th.closest("table").tBodies[0];' +
            'var rs=Array.prototype.slice.call(tb.rows).filter(function(r){return r.cells.length!==1;});' +
            'var asc=th.getAttribute("data-asc")!=="1";' +
            'rs.sort(function(a,b){' +
            'var xa=nomVal(a.cells[idx]),xb=nomVal(b.cells[idx]),c;' +
            'var bothNum=nomNum(xa);if(bothNum){bothNum=nomNum(xb);}' +
            'if(bothNum){c=parseFloat(xa)-parseFloat(xb);}else{c=(""+xa).localeCompare(""+xb);}' +
            'return asc?c:-c;});' +
            'for(var i=0;i!==rs.length;i++){tb.appendChild(rs[i]);}' +
            'var hs=th.parentNode.cells;for(var j=0;j!==hs.length;j++){hs[j].removeAttribute("data-asc");}' +
            'th.setAttribute("data-asc",asc?"1":"0");};' +
            '</script>';
    },

    type: 'TaggingDashboard',
};

[CacheFlushLog] event=sys_script_include, count=1, ms=0: Flushing catalog sys_script_include
*** Script: 
=================================================================
FIX BOARD COUNTS (gross/net)   scope: x_nose_nexai_test
=================================================================
TaggingDashboard : d96ad80b25f246d3abf63fcaea97e777   41570 chars
anchor           : found, and unique
backup           : system log, search [boardcount-backup]

PATCHED  _cashflows now returns only the rows the mail actually settles
         script is now 43634 chars

WHAT CHANGES ON THE BOARD
   Total Trades Assigned   counts settled rows only - it will FALL below the pre-netting
                           figure for any mail switched to Net (3 components -> 1 net),
                           not climb. That is the tile doing its job.
   Activity table          a netted mail shows one row per netting group instead of the
                           net plus every component.
   Pending / Matched /     derived from the same rows, so all four follow automatically.
   Mismatch / Allege

   Untouched: Total Mails Assigned and the Scanned / Identified / Extracted funnel are
   mail-level counts and were never affected by net rows.

   To undo: search the system log for [boardcount-backup] and paste the script back.
=================================================================
