/**
 * DemoExtractor — one-shot email extraction for the business "Demo" page.
 *
 * Given a raw .eml already stored as a sys_attachment on a throwaway email record, it runs the SAME
 * pipeline the live OTC AI Settlements flow uses — EmlFieldExtractor (body) + XlsxCashflowExtractor
 * (spreadsheet), merged — and, when asked, the direct-Chinou settlement extraction
 * (AiFieldExtractor). It NEVER writes cashflow rows; everything is returned in-memory for display, so
 * the demo shows the unstructured-email -> structured-fields journey without touching the dashboards.
 *
 * Direction convention mirrors the live path: the email states the counterparty's POV; the AI 13-field
 * view is stored/shown from the bank POV (Pay <-> Receive flipped).
 */
var DemoExtractor = Class.create();
DemoExtractor.prototype = {
    initialize: function () {},

    _flipDir: function (d) {
        var s = ('' + (d || '')).trim().toLowerCase();
        if (s === 'pay' || s === 'p' || s === 'pays') { return 'Receive'; }
        if (s === 'receive' || s === 'r' || s === 'rec' || s === 'receives') { return 'Pay'; }
        return d || '';
    },
    _refKey: function (s) { return ('' + (s || '')).toLowerCase().replace(/\s+/g, ''); },

    /**
     * @param {string} attSysId    sys_id of the raw .eml sys_attachment
     * @param {string} emailSysId  sys_id of the (throwaway) parent x_nose_nfotc_bsm_email record
     * @param {boolean} withAi     also run the Chinou extraction + align per cashflow
     */
    run: function (attSysId, emailSysId, withAi) {
        var out = {
            counterparty: '', mail: { to: '', from: '', cc: '', subject: '', body: '', date: '', attachment: '' },
            flows: [], cashflows: [], aiContent: '', aiStatus: '', aiFlowCount: 0
        };
        if (!attSysId) { return out; }
        var self = this;
        var ex = new x_nose_nfotc_bsm.EmlFieldExtractor();

        // 1. deterministic body extraction + counterparty derived from the sender
        var r = ex.extractAll(attSysId, 'relevant');
        out.counterparty = r.counterparty_name || '';
        var bodyFlows = (r.flows && r.flows.length) ? r.flows.slice() : [];

        // 2. spreadsheet extraction (multi-tab), merged with the body flows (dedupe by reference)
        var attachmentText = '', attFlows = [];
        try {
            var xr = new x_nose_nfotc_bsm.XlsxCashflowExtractor().extract(attSysId, emailSysId);
            // Take the grid whenever there IS one. Gating this on flow_count threw away every
            // sheet whose columns the header patterns did not recognise — precisely the sheets
            // the model is needed for. flows[] stays the deterministic preview; the text is what
            // the model reads, and the two are not the same thing.
            if (xr) {
                attFlows = xr.flows || [];
                attachmentText = xr.sheet_text || '';
                if (xr.truncated) {
                    gs.warn('[DemoExtractor] spreadsheet TRUNCATED for email ' + emailSysId + ': ' +
                        xr.rows_sent + ' of ' + xr.rows_seen + ' row(s) reached the model.');
                }
            }
        } catch (e) { gs.warn('[DemoExtractor] xlsx: ' + e); }

        var merged = [], seen = {};
        for (var i = 0; i < bodyFlows.length; i++) { merged.push(bodyFlows[i]); var kb = self._refKey(bodyFlows[i].reference); if (kb) { seen[kb] = true; } }
        for (var j = 0; j < attFlows.length; j++) { var ka = self._refKey(attFlows[j].reference); if (ka && seen[ka]) { continue; } merged.push(attFlows[j]); if (ka) { seen[ka] = true; } }

        // 3. mail contents (headers + body) — as-shown to the analyst
        var m = ex.mailContents(attSysId) || {};
        out.mail.to = m.to || ''; out.mail.from = m.from || ''; out.mail.cc = m.cc || '';
        out.mail.subject = m.subject || ''; out.mail.body = m.body || ''; out.mail.date = m.date || '';

        // deterministic preview (direction shown AS STATED in the email — pre-AI, pre-flip)
        for (var p = 0; p < merged.length; p++) {
            var f = merged[p];
            out.flows.push({ reference: f.reference || '', currency: f.currency || '', amount: f.amount || '', direction: f.direction || '', value_date: f.value_date || '' });
        }

        // 4. the exact content that will be fed to the AI (body + parsed spreadsheet grid)
        var content = 'From: ' + (m.from || '') + '\nSubject: ' + (m.subject || '') + '\n\n';
        var segs = [];
        if (m.body) { segs.push(m.body); }
        if (attachmentText) {
            segs.push('The counterparty is the firm that SENT this email (the From address/domain above), ' +
                'NOT any "Counterparty Legal Name" column (which names the recipient bank). Additional ' +
                'settlement cashflows from the attached spreadsheet:\n' + attachmentText);
        }
        content += segs.join('\n\n');
        out.aiContent = content;

        if (withAi) {
            var ai = new x_nose_nfotc_bsm.AiFieldExtractor().extract(content);
            var aiFlows = ai.flows || [];
            out.aiStatus = ai.status || '';
            out.aiFlowCount = ai.flow_count || 0;
            var aiByRef = {};
            for (var q = 0; q < aiFlows.length; q++) { var qk = self._refKey(aiFlows[q].reference); if (qk && !(qk in aiByRef)) { aiByRef[qk] = aiFlows[q]; } }
            for (var c = 0; c < merged.length; c++) {
                var fm = merged[c];
                var af = aiByRef[self._refKey(fm.reference)] || aiFlows[c] || {};
                out.cashflows.push({
                    counterparty: out.counterparty,
                    nomuraEntity: af.nomura_entity || '',
                    product: af.product || '',
                    reference: af.reference || fm.reference || '',
                    tradeDate: af.trade_date || '',
                    valueDate: af.value_date || fm.value_date || '',
                    amount: af.amount || fm.amount || '',
                    currency: af.currency || fm.currency || '',
                    direction: af.direction ? self._flipDir(af.direction) : self._flipDir(fm.direction),
                    ssiBank: af.ssi_bank || '',
                    ssiAccount: af.ssi_account || '',
                    ssiBeneficiary: af.ssi_beneficiary || '',
                    ssiIntermediary: af.ssi_intermediary || ''
                });
            }
        }
        return out;
    },

    type: 'DemoExtractor'
};
