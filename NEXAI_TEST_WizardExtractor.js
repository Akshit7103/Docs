/**
 * WizardExtractor — runs AI extraction on the dropped mails using a PUBLISHED wizard's own field
 * config (the manager's per-field AI Prompts), and writes the results onto each cashflow's ai_* fields.
 *
 * Two entry points share one per-email routine (_processEmail):
 *   - syncWizard(wizId)         — batch: the wizard board's "Sync now" (inline, capped at BATCH).
 *   - extractEmail(wizId, id)   — single mail: called by Flow A (Intake) per triggered email, so the
 *                                 pipeline runs as a VISIBLE Flow Designer flow rather than inline code.
 *   - identify(wizId, id)       — Flow A's identification step: apply the wizard's id_rules (else keep
 *                                 the mail's existing classification).
 *
 * It builds a record-mode instruction from the wizard's input_fields (identical shape to the wizard's
 * Publish-step "Run"), runs the generic prompt-driven skill (GenericFieldExtractor.extractRecords) once
 * per email, aligns the returned rows to that email's cashflows by index, and maps each known field onto
 * its ai_* column. Direction is flipped to the bank POV. The counterparty used for matching stays DERIVED
 * from the sender (EVE); a wizard that picks "Counterparty Name" also stores the AI-read name in ai_counterparty.
 */
var WizardExtractor = Class.create();
WizardExtractor.prototype = {
    initialize: function () {},

    BATCH: 10,

    // wizard field NAME (lowercased) -> cashflow ai_* column
    FIELD_MAP: {
        'value date': 'ai_value_date',
        'amount': 'ai_amount',
        'currency': 'ai_currency',
        'direction': 'ai_direction',
        'nomura entity': 'ai_nomura_entity',
        'product': 'ai_product',
        'counterparty reference': 'ai_reference',
        'trade reference': 'ai_reference',          // legacy name of "Counterparty Reference"
        'counterparty name': 'ai_counterparty',     // AI-read name; the EVE-derived name on the email still drives matching
        'trade date': 'ai_trade_date',
        'ssi bank / bic': 'ai_ssi_bank',
        'ssi account': 'ai_ssi_account',
        'ssi beneficiary / bic': 'ai_ssi_beneficiary',
        'ssi intermediary': 'ai_ssi_intermediary'
    },

    _slug: function (s) { return ('' + (s || '')).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'field'; },
    // Coerce an email ref to a sys_id STRING. The subflow invokes with a GlideRecord (reference input),
    // but setValue('email', ...) / GlideRecord.get() need the sys_id — passing the object silently no-ops.
    _sid: function (v) {
        if (v && typeof v === 'object' && typeof v.getUniqueValue === 'function') { return '' + v.getUniqueValue(); }
        return '' + (v || '');
    },
    _flipDir: function (d) {
        var s = ('' + (d || '')).trim().toLowerCase();
        if (s === 'pay' || s === 'p' || s === 'pays') { return 'Receive'; }
        if (s === 'receive' || s === 'r' || s === 'rec' || s === 'receives') { return 'Pay'; }
        return d || '';
    },

    // Resolve + parse the wizard's field config once (shared by both entry points).
    _wizFields: function (wizId) {
        var wg = new GlideRecord('x_nose_nexai_test_wizard');
        if (!wizId || !wg.get(wizId)) { return null; }
        var fields = [];
        try { fields = JSON.parse(wg.getValue('input_fields') || '[]'); } catch (e) { fields = []; }
        return fields.length ? fields : null;
    },

    // Engine/model recorded in the audit's model_version. BSM is direct-Chinou only (no engine toggle).
    _aiMeta: function (wizId) {
        return { engine: 'chinou', model: gs.getProperty('chinou.model.id', 'anthropic-5-sonnet[Bedrock]'), skill: 'direct-chinou' };
    },

    /**
     * BATCH entry (wizard board "Sync now").
     * @param {string} wizId  sys_id of the published x_nose_nexai_test_wizard
     * @return {{status:string, processed:number, remaining:number, cashflows:number}}
     */
    syncWizard: function (wizId) {
        var out = { status: 'ok', processed: 0, remaining: 0, cashflows: 0, failed: 0, diag: '' };
        if (!wizId) { out.status = 'no_wizard'; return out; }

        var fields = this._wizFields(wizId);
        if (!fields) { out.status = 'no_fields'; return out; }
        var instruction = this._buildInstruction(fields);

        var dx = new x_nose_nexai_test.DemoExtractor();
        var gx = new x_nose_nexai_test.GenericFieldExtractor();

        // All relevant emails; skip ones already extracted by THIS wizard in JS (a '!=' addQuery would
        // wrongly drop rows whose wiz_extracted is NULL — i.e. every pre-existing mail).
        var eg = new GlideRecord('x_nose_nexai_test_email');
        eg.addQuery('classification', 'relevant');
        eg.orderBy('sys_created_on');
        eg.query();

        while (eg.next()) {
            if (eg.getValue('wiz_extracted') === wizId) { continue; } // already extracted by this wizard
            if (out.processed >= this.BATCH) { out.remaining++; continue; }
            var r = this._processEmail(eg.getUniqueValue(), eg.getValue('name'), eg.getValue('counterparty_name'), wizId, instruction, dx, gx);
            if (r.status === 'skipped') { continue; }
            if (r.status === 'failed') { out.failed++; if (r.diag && !out.diag) { out.diag = r.diag; } continue; }
            out.cashflows += r.cashflows;
            out.processed++;
        }
        if (out.processed === 0 && out.failed > 0) { out.status = 'extraction_failed'; }
        return out;
    },

    /**
     * SINGLE-mail entry (Flow A — Intake). Extract one email with the wizard's field prompts.
     * @return {{status:string, cashflows:number, diag:string}}
     */
    extractEmail: function (wizId, emailId) {
        emailId = this._sid(emailId);
        if (!wizId || !emailId) { return { status: 'failed', cashflows: 0, diag: 'missing_args' }; }
        var fields = this._wizFields(wizId);
        if (!fields) { return { status: 'failed', cashflows: 0, diag: 'no_fields' }; }
        var eg = new GlideRecord('x_nose_nexai_test_email');
        if (!eg.get(emailId)) { return { status: 'failed', cashflows: 0, diag: 'no_email' }; }
        if (eg.getValue('classification') === 'irrelevant') { return { status: 'skipped', cashflows: 0, diag: 'irrelevant' }; }
        var instruction = this._buildInstruction(fields);
        var dx = new x_nose_nexai_test.DemoExtractor();
        var gx = new x_nose_nexai_test.GenericFieldExtractor();
        return this._processEmail(emailId, eg.getValue('name'), eg.getValue('counterparty_name'), wizId, instruction, dx, gx);
    },

    /**
     * Email Identification — decide whether THIS wizard should pick up the mail (relevant/irrelevant),
     * driven entirely by the wizard's id_rules (the Email-Identification builder step). HYBRID:
     *   1. wizard structural toggles (exclude replies/forwards, exclude noise domains) — manager-chosen.
     *   2. deterministic rules per label — keywords / subject pattern / sender watch (+ exclusions).
     *   3. AI context — a plain-language description the LLM matches the mail against (fallback for a label
     *      that has a context but no deterministic hit).
     * A wizard CLAIMS the mail if ANY label matches. No labels configured -> default 'relevant'.
     * Returns { classification, reason }.
     */
    identify: function (wizId, emailId) {
        emailId = this._sid(emailId);
        var out = { classification: 'relevant', reason: 'default' };
        var eg = new GlideRecord('x_nose_nexai_test_email');
        if (!eg.get(emailId)) { out.classification = ''; out.reason = 'no_email'; return out; }

        var subject = '' + (eg.getValue('mail_subject') || '');
        var body = '' + (eg.getValue('mail_body') || '');
        var sender = ('' + (eg.getValue('sender') || eg.getValue('mail_from') || '')).toLowerCase();
        var hay = (subject + ' ' + body).toLowerCase();
        var content = 'Subject: ' + subject + '\n\n' + body;

        var labels = [];
        try {
            var wg = new GlideRecord('x_nose_nexai_test_wizard');
            if (wizId && wg.get(wizId)) { labels = JSON.parse(wg.getValue('id_rules') || '[]'); }
        } catch (e) { labels = []; }
        if (!labels || !labels.length) { out.reason = 'no_rules'; return out; }   // nothing configured -> relevant

        // 1) wizard-level structural toggles (default ON), taken from the first label.
        var t0 = labels[0] || {};
        var exReplies = (t0.excludeReplies === undefined) ? true : !!t0.excludeReplies;
        var exNoise = (t0.excludeNoise === undefined) ? true : !!t0.excludeNoise;
        var exThreads = (t0.excludeThreads === undefined) ? true : !!t0.excludeThreads;
        if (exReplies && /^\s*(re|fwd?|fw)\s*:/i.test(subject)) { out.classification = 'irrelevant'; out.reason = 'reply_forward'; return out; }
        // A mail that quotes an earlier message repeats figures we may already have processed, and its
        // quoted table would be extracted as if it were new. The subject test above misses these when the
        // sender writes a plain subject ("chaser ...", "UPDATED ..."), so this reads the mail itself and
        // drops it only on QUOTED HISTORY IN THE BODY — reply headers alone mark a fresh notice sent inside
        // a conversation (12 of the 107 production mails, all with clean tables) and must not drop it.
        if (exThreads && this._isThreadMail(eg)) { out.classification = 'irrelevant'; out.reason = 'quoted_thread'; return out; }
        if (exNoise && this._isNoiseDomain(sender)) { out.classification = 'irrelevant'; out.reason = 'noise_domain'; return out; }

        // 2/3) any label match -> relevant.
        var gx = null;
        for (var i = 0; i < labels.length; i++) {
            var L = labels[i] || {};
            if (this._anyMatch(L.exclusions, hay, sender)) { continue; }               // this label excludes the mail
            var subjKw = this._splitList(L.subject), kw = this._splitList(L.keywords), snd = this._splitList(L.senders);
            var hasDet = subjKw.length || kw.length || snd.length;
            var det = (subjKw.length && this._containsAny(subject.toLowerCase(), subjKw)) ||
                      (kw.length && this._containsAny(hay, kw)) ||
                      (snd.length && this._containsAny(sender, snd));
            if (det) { out.reason = 'rule_match'; return out; }
            if (L.context) {
                if (!gx) { gx = new x_nose_nexai_test.GenericFieldExtractor(); }
                var ai = gx.classifyMatch(L.context, content, { capability: 'classify', emailId: emailId, mailId: eg.getValue('name'), driver: wizId });
                if (ai === true) { out.reason = 'ai_context'; return out; }
                // ai === null -> skill unavailable; ai === false -> this label says no. either way, try next label.
            }
            if (!hasDet && !L.context) { out.reason = 'empty_label'; return out; }      // a label with no criteria matches all
        }
        out.classification = 'irrelevant'; out.reason = 'no_label_match';
        return out;
    },

    /**
     * Ownership gate for the board Sync. Ensures the mail is materialised (parses its .eml into mail_*
     * on-demand, so routing works even on the very first sync — before any subflow has run), then applies
     * THIS wizard's identification rules. The board uses this to process ONLY its own mails and leave
     * every other wizard's mails completely untouched (never stamped, never run). Returns identify()'s
     * { classification, reason }.
     */
    routeForWizard: function (wizId, emailId) {
        emailId = this._sid(emailId);
        this._ensureIngested(emailId);
        var res = this.identify(wizId, emailId);
        this._persistClassification(emailId, res);        // the verdict must LAND on the record...
        this._auditClassification(wizId, emailId, res);   // ...and be audited, kept or dropped alike
        return res;
    },

    // Write the relevance verdict onto the email.
    //
    // It used to exist only as a return value: a KEPT mail eventually picked up
    // classification='relevant' further down the pipeline, but a DROPPED one was simply never
    // written to. On the instance that looked like a mail nobody had got to yet - blank
    // classification, no reason, no trace - rather than one the system had deliberately discarded.
    // "Which mails did we drop, and why" therefore had no answer, which for a settlements workflow
    // is the wrong answer to have.
    //
    // Recording it as ORDINARY COLUMNS is what makes it auditable natively: sys_audit captures
    // field changes, so a decision that is never stored can never be audited, however it is logged.
    _persistClassification: function (emailId, res) {
        try {
            if (!res || !res.classification) { return; }
            var eg = new GlideRecord('x_nose_nexai_test_email');
            if (!eg.get(emailId)) { return; }

            // Only write on a real change - an unchanged re-Sync should not manufacture audit rows.
            var same = ('' + (eg.getValue('classification') || '')) === res.classification &&
                       ('' + (eg.getValue('classification_reason') || '')) === ('' + (res.reason || ''));
            if (same) { return; }

            eg.setValue('classification', res.classification);
            eg.setValue('classification_reason', '' + (res.reason || ''));
            // 'ai_context' is the only reason a model decides; everything else is a deterministic rule.
            eg.setValue('classified_by', res.reason === 'ai_context'
                ? ('ai:' + gs.getProperty('chinou.model.id', '')) : 'rule');
            eg.update();
        } catch (e) { /* never let audit bookkeeping break routing */ }
    },

    // Audit the routing/relevance DECISION for a mail this wizard evaluated. Logged ONLY when the wizard
    // CLAIMS the mail ('relevant') — avoids a row for every other driver's / noise mail on each scan.
    // Captures the 5 governance fields: label, model_version, prompt_ref (+hash), input_hash, confidence.
    _auditClassification: function (wizId, emailId, res) {
        try {
            // Log the DROPS too. This used to return early on anything but 'relevant', so the audit
            // trail recorded only what was kept - which is the half an auditor is least interested
            // in. A discarded settlement mail is the one that needs a reason on the record.
            if (!res || !res.classification) { return; }
            var eg = new GlideRecord('x_nose_nexai_test_email');
            if (!eg.get(emailId)) { return; }
            var content = 'Subject: ' + (eg.getValue('mail_subject') || '') + '\n\n' + (eg.getValue('mail_body') || '');
            var context = '';
            var wg = new GlideRecord('x_nose_nexai_test_wizard');
            if (wg.get(wizId)) { context = wg.getValue('id_rules') || ''; }
            var at = new x_nose_nexai_test.AuditTrail();
            var meta = this._aiMeta(wizId);
            var byAi = (res.reason === 'ai_context');   // AI-context judgment vs a deterministic keyword/sender rule
            at.log('classification.decided', {
                entityType: 'email', entityId: emailId, emailId: emailId, mailId: eg.getValue('name'),
                counterparty: eg.getValue('counterparty_name'), actor: 'system', aiComponent: 'classifier',
                summary: 'Relevance: ' + res.classification + ' (' + res.reason + ')',
                ai: {
                    label: res.classification, reason: res.reason,
                    engine: byAi ? meta.engine : 'rule', model_version: byAi ? meta.model : '',
                    skill: byAi ? meta.skill : '', prompt_ref: 'wizard:' + wizId,
                    prompt_hash: at.hash(context), input_hash: at.hash(content),
                    // Deterministic keyword/sender match = high certainty; AI-context judgment = medium.
                    // (Classification returns a yes/no decision, not a numeric score.)
                    confidence_level: byAi ? 'Medium' : 'High'
                }
            });
        } catch (e) { /* audit best-effort */ }
    },

    // Parse the raw .eml into the record's mail_* fields if not already done (mirrors cap-ingest, idempotent).
    _ensureIngested: function (emailId) {
        var g = new GlideRecord('x_nose_nexai_test_email');
        if (!g.get(emailId)) { return; }
        // Already materialised = the BODY is present (same test as the ingest step). A record that carries
        // subject/sender but an empty body was parsed while the body could not be read (e.g. the gateway
        // boundary defect) and is re-parsed here so the fix self-heals it on the next Sync.
        if (g.getValue('mail_body')) { return; }
        var attId = '', first = '';
        var ag = new GlideRecord('sys_attachment');
        ag.addQuery('table_name', 'x_nose_nexai_test_email');
        ag.addQuery('table_sys_id', emailId);
        ag.orderBy('sys_created_on');
        ag.query();
        while (ag.next()) {
            var fn = ('' + ag.getValue('file_name')).toLowerCase();
            if (!first) { first = ag.getUniqueValue(); }
            if (/\.eml$/.test(fn) || ag.getValue('content_type') === 'message/rfc822') { attId = ag.getUniqueValue(); break; }
        }
        if (!attId) { attId = first; }
        if (!attId) { return; }
        try {
            var m = new x_nose_nexai_test.EmlFieldExtractor().mailContents(attId) || {};
            g.setValue('mail_to', m.to || '');
            g.setValue('mail_from', m.from || '');
            g.setValue('mail_cc', m.cc || '');
            g.setValue('mail_subject', m.subject || '');
            g.setValue('mail_body', m.body || '');
            g.update();
        } catch (e) { /* leave unparsed; identify falls back to defaults */ }
    },

    // ---- id_rules helpers ----
    _splitList: function (s) {
        return ('' + (s || '')).split(/[,;\n]+/).map(function (x) { return x.trim().toLowerCase(); }).filter(function (x) { return x; });
    },
    _containsAny: function (hay, list) {
        for (var i = 0; i < list.length; i++) { if (('' + hay).indexOf(list[i]) !== -1) { return true; } }
        return false;
    },
    _anyMatch: function (exclusions, hay, sender) {
        var list = this._splitList(exclusions);
        for (var i = 0; i < list.length; i++) { if (('' + hay).indexOf(list[i]) !== -1 || ('' + sender).indexOf(list[i]) !== -1) { return true; } }
        return false;
    },
    // Is this mail part of a chain? Answered from the stored body first (cheap) and from the raw .eml only
    // when the body looks clean — the reply headers live in the file, not in any column. The verdict is
    // cached on the record (thread_state) so a re-sync never re-reads the attachment for the same mail.
    _isThreadMail: function (eg) {
        var cached = '' + (eg.getValue('thread_state') || '');
        if (cached) { return cached === 'thread'; }                    // 'thread' | 'reply' | 'fresh'
        var ex = new x_nose_nexai_test.EmlFieldExtractor();
        var body = '' + (eg.getValue('mail_body') || '');
        var state = 'fresh';
        try {
            // The stored body is already cleaned, so the banner count can only be taken from the .eml; when
            // the stored text alone already shows quoted history there is no need to read the attachment.
            state = ex._hasQuotedHistory(body, '') ? 'thread' : ex.threadState(this._emlAtt(eg.getUniqueValue()), body);
        } catch (e) { state = 'fresh'; }
        try { eg.setValue('thread_state', state); eg.update(); } catch (e2) { /* cache is best-effort */ }
        return state === 'thread';
    },

    _isNoiseDomain: function (sender) {
        var m = ('' + sender).match(/@([a-z0-9._-]+)/);
        var domain = m ? m[1] : '';
        if (!domain) { return false; }
        var noise = ('' + gs.getProperty('x_nose_nexai_test.noise_domains', 'nonoutlook.com')).split(',');
        for (var i = 0; i < noise.length; i++) {
            var d = noise[i].trim().toLowerCase();
            if (d && (domain === d || domain.substr(domain.length - d.length - 1) === '.' + d)) { return true; }
        }
        return false;
    },

    // ---- shared per-email routine (used by both batch + single-mail paths) ----------------------
    _processEmail: function (emailId, mailId, cpName, wizId, instruction, dx, gx) {
        emailId = this._sid(emailId);
        var res = { status: 'ok', cashflows: 0, diag: '' };
        var attId = this._emlAtt(emailId);
        if (!attId) { return { status: 'skipped', cashflows: 0, diag: 'no_attachment' }; }

        // AI-governance metadata for the audit trail (FR-AUD-003): engine/model/skill, a prompt reference,
        // and a hash of the EXACT input sent to the model (model_version + prompt_hash + input_hash triple).
        var meta = this._aiMeta(wizId);
        var _at = new x_nose_nexai_test.AuditTrail();
        var promptHash = _at.hash((instruction && instruction.text) || '');

        // LangSmith: open a parent "otc_extraction" trace for this email (best-effort; inert unless configured).
        // The child Chinou LLM run nests under it at the extraction chokepoint via ctx.trace; endRun flushes.
        var _ls = new x_nose_nexai_test.LangSmithTracer();
        var _lsRun = _ls.startRun('otc_extraction', { email: emailId, mail_id: mailId, counterparty: cpName, wizard: wizId });

        // SOURCE: read EVERYTHING and send it ALL to Chinou in ONE call. The email body + Excel grid (text)
        // go in the prompt; every attached PDF is sent as a document; Chinou extracts + RECONCILES the cashflows
        // across all sources (dedup). No source-of-truth guessing — a junk PDF can't preempt the body, and a
        // summary body can't preempt a detailed PDF, because the model sees everything at once. A text-only mail
        // (no PDF) uses the plain text extractor.
        var content = '';        // grounding source (text part) + the audit input_hash
        var contentHash = '';
        var out = null;
        var textContent = '';
        try { textContent = (dx.run(attId, emailId, false) || {}).aiContent || ''; } catch (ec) { textContent = ''; }
        var pdfDocs = [];
        try { pdfDocs = new x_nose_nexai_test.PdfCashflowExtractor().findAllPdfs(attId, emailId) || []; } catch (ep) { pdfDocs = []; }

        if (!textContent && !pdfDocs.length) {
            try { _ls.endRun(_lsRun, { status: 'skipped', rows: 0, diag: 'no_content' }, null); } catch (_es) { /* best-effort */ }
            return { status: 'skipped', cashflows: 0, diag: 'no_content' };
        }

        if (pdfDocs.length) {
            // body/Excel text + ALL PDFs in ONE reconciled call
            try {
                out = new x_nose_nexai_test.PdfCashflowExtractor().extractCombined(textContent, pdfDocs, instruction, {
                    capability: 'extract_all', emailId: emailId, mailId: mailId, driver: wizId,
                    trace: { tracer: _ls, parent: _lsRun }
                });
            } catch (er) { out = null; }
            var _docSig = '';
            for (var _d = 0; _d < pdfDocs.length; _d++) { _docSig += (pdfDocs[_d].filename || '') + ':' + ('' + (pdfDocs[_d].base64 || '')).length + ';'; }
            meta.engine = 'chinou-multi'; meta.skill = 'body+pdf';
            meta.model = (out && out.model) || meta.model;
            content = textContent || ('[documents] ' + _docSig);   // grounding source (text part; PDF-only values ungrounded — separate confidence item)
            contentHash = _at.hash('all|text:' + _at.hash(textContent) + '|docs:' + _docSig);
        } else {
            // text-only email (body + Excel, no attachments)
            out = this._textExtract(gx, instruction, textContent, emailId, mailId, wizId, _ls, _lsRun, attId);
            content = textContent;
            contentHash = _at.hash(content);
        }

        if (!out || out.status !== 'ok' || !(out.rows && out.rows.length)) {
            // extraction failed / returned nothing — do NOT blank the cashflows; leave the mail
            // un-flagged so a later run retries it. diag carries the extractor status for the log.
            var _diag = (out && out.status) ? out.status : 'no_rows';
            try { _ls.endRun(_lsRun, { status: 'failed', rows: 0, diag: _diag }, 'extraction ' + _diag); } catch (_elf) { /* best-effort */ }
            // Log the head of the model's raw reply so an unparseable answer is diagnosable from the system
            // log alone (control characters made visible; never more than 600 chars).
            var _rawHead = ('' + ((out && out.raw) || '')).substring(0, 600).replace(/\t/g, '<TAB>').replace(/\r?\n/g, '<NL>');
            gs.warn('[WizardExtractor] no rows for email=' + emailId + ' (status=' + (out ? out.status : 'null') + ', source=' + (pdfDocs.length ? 'body+pdf' : 'text') + ', pdfs=' + pdfDocs.length + ')' + (_rawHead ? ' raw=' + _rawHead : ''));
            return { status: 'failed', cashflows: 0, diag: _diag };
        }

        // The subflow is the SOLE extractor now: it CREATES one cashflow per AI row (the split comes from
        // the AI's record-mode output). Idempotent — clear this email's existing rows first so a re-sync
        // never duplicates. Match reads the ai_* fields (CompareMatch._cfValuesAi), which _applyRow writes.
        var rows = out.rows;
        var _cfIds = [];   // sys_ids of the cashflows this ONE extraction call produced (for usage attribution)
        var del = new GlideRecord('x_nose_nexai_test_cashflow');
        del.addQuery('email', emailId);
        del.deleteMultiple();
        for (var ri = 0; ri < rows.length; ri++) {
            var cf = new GlideRecord('x_nose_nexai_test_cashflow');
            cf.initialize();
            cf.setValue('email', emailId);
            cf.setValue('flow_index', ri + 1);
            this._applyRow(cf, instruction.keys, rows[ri] || {});   // writes only the wizard's configured ai_* fields
            cf.setValue('ai_sources', '');   // highlight provenance removed 2026-09-17 (see _buildInstruction)
            // Stamp WHICH model produced this row. A model swap changes every extraction after it,
            // and "what generated this number" is an AI-governance question that has to be
            // answerable from the row - not inferred from when it happened to be created.
            cf.setValue('ai_model', '' + (this._aiMeta(wizId).model || ''));
            cf.insert();
            _cfIds.push(cf.getUniqueValue());
            // Overall extraction confidence as a level (High/Medium/Low) — grounding + validation of the
            // economic keys against the source content. The model doesn't return a per-field number, so this
            // deterministic check is what the audit records (input_hash ties it to the exact source read).
            var _confLevel = '';
            try {
                _confLevel = new x_nose_nexai_test.ExtractionConfidence().score({
                    valueDate: cf.getValue('ai_value_date'), amount: cf.getValue('ai_amount'),
                    currency: cf.getValue('ai_currency'), direction: cf.getValue('ai_direction')
                }, content).overall.label;
            } catch (ecl) { _confLevel = ''; }
            try {
                new x_nose_nexai_test.AuditTrail().log('cashflow.extracted', {
                    entityType: 'cashflow', entityId: cf.getUniqueValue(), emailId: emailId, cashflowId: cf.getUniqueValue(),
                    mailId: mailId, counterparty: cpName, actor: 'system',
                    aiComponent: 'extractor', product: cf.getValue('ai_product'),
                    summary: 'AI extracted the cashflow using the wizard field prompts',
                    ai: {
                        source: 'wizard', wizard: wizId,
                        engine: meta.engine, model_version: meta.model, skill: meta.skill,
                        prompt_ref: 'wizard:' + wizId, prompt_hash: promptHash, input_hash: contentHash,
                        confidence_level: _confLevel,   // High / Medium / Low (per-field number = Phase 2, model doesn't return it)
                        amount: cf.getValue('ai_amount'), currency: cf.getValue('ai_currency'),
                        value_date: cf.getValue('ai_value_date'), direction: cf.getValue('ai_direction')
                    }
                });
            } catch (ea) { /* audit best-effort */ }
            res.cashflows++;
        }

        this._normaliseCounterparty(_cfIds);

        // Link the cashflows back onto the LLM-usage row(s) of the call(s) that produced them. A chunked
        // mail has one row per chunk, so the cost of a big mail is the SUM of its chunks, not a lost total.
        var _uids = (out.usageIds && out.usageIds.length) ? out.usageIds : (out.usageId ? [out.usageId] : []);
        for (var _u = 0; _u < _uids.length; _u++) {
            try { new x_nose_nexai_test.LlmUsage().attach(_uids[_u], { cashflowIds: _cfIds, cashflowCount: _cfIds.length, emailId: emailId }); } catch (eu) { /* usage attribution best-effort */ }
        }

        // COMPLETENESS GUARD. The dangerous failure for a big mail is not an error — it is a valid-looking
        // answer holding fewer rows than the mail, which nothing downstream would question. The segmenter
        // counted the rows independently of the model, so a shortfall is visible: say so on the record and
        // in the log rather than presenting a partial extraction as a finished one.
        var _expected = parseInt(out.expectedRows, 10) || 0;
        var _short = _expected && res.cashflows < _expected;
        if (_short) {
            res.diag = 'partial:' + res.cashflows + '/' + _expected;
            gs.warn('[WizardExtractor] INCOMPLETE email=' + emailId + ' (' + mailId + '): ' + res.cashflows +
                ' cashflows extracted but the body holds ' + _expected + ' rows' +
                (out.chunks > 1 ? (' — ' + out.chunks + ' chunks, ' + (out.failed || 0) + ' failed') : '') + '.');
        }

        // Close the LangSmith parent run (outputs = status + rows) and flush the whole trace in one async call.
        try { _ls.endRun(_lsRun, { status: 'ok', rows: res.cashflows }, null); } catch (_els) { /* best-effort */ }

        var eg = new GlideRecord('x_nose_nexai_test_email');
        if (eg.get(emailId)) {
            eg.setValue('wiz_extracted', wizId);
            // The flag has to be CLEARED when a later run comes back complete, not only set when one
            // comes back short. It was set-only, so a mail that failed once stayed marked partial for
            // ever - including a 61-row mail sitting there with all 61 rows. A flag that only ever
            // accumulates is worse than no flag: it is the list you would work from to find the mails
            // that still need attention, and it was quietly full of mails that did not.
            if (_short) { eg.setValue('extraction_status', 'partial'); }
            else if (('' + (eg.getValue('extraction_status') || '')) === 'partial') { eg.setValue('extraction_status', ''); }
            eg.update();
        }
        return res;
    },

    // ONE MAIL, ONE COUNTERPARTY.
    //
    // The counterparty is a fact about the MAIL - one sender, one trading party - but the prompt asks for
    // it on every ROW, and a big mail is extracted in several concurrent calls. Each call therefore decides
    // it again from scratch, and N answers do not always agree: on a 61-row mail split into 8 calls, seven
    // returned "OCBC Bank" and one returned nothing, leaving exactly its 8 rows blank. The same mail run
    // again filled all 61 - so this is variance between calls, not a mail the model cannot read.
    //
    // Rather than hope the calls agree, take the answer the mail as a whole gave and apply it to every row:
    // the most frequent non-blank value wins, and a tie goes to the longer string (the fuller legal name,
    // "OCBC Bank" over "OCBC"). Where no call found a name at all, leave every row blank so the Eve
    // directory fallback still applies - inventing one would be worse than admitting none.
    //
    // This runs at extraction only, before any analyst has touched the rows, and it matches the rule the
    // case screen already enforces: correcting the counterparty writes it to every cashflow of the mail.
    // The extractor and the analyst now agree by construction rather than by luck.
    _normaliseCounterparty: function (cfIds) {
        if (!cfIds || !cfIds.length) { return; }
        var rows = [], counts = {}, best = '', bestN = 0, v, i;
        var gr = new GlideRecord('x_nose_nexai_test_cashflow');
        gr.addQuery('sys_id', 'IN', cfIds.join(','));
        gr.query();
        while (gr.next()) {
            v = ('' + (gr.getValue('ai_counterparty') || '')).trim();
            rows.push({ id: gr.getUniqueValue(), v: v });
            if (v) { counts[v] = (counts[v] || 0) + 1; }
        }
        for (v in counts) {
            if (!counts.hasOwnProperty(v)) { continue; }
            if (counts[v] > bestN || (counts[v] === bestN && v.length > best.length)) { best = v; bestN = counts[v]; }
        }
        if (!best) { return; }
        var fixed = 0;
        for (i = 0; i < rows.length; i++) {
            if (rows[i].v === best) { continue; }
            var u = new GlideRecord('x_nose_nexai_test_cashflow');
            if (u.get(rows[i].id)) { u.setValue('ai_counterparty', best); u.update(); fixed++; }
        }
        if (fixed) {
            gs.info('[WizardExtractor] counterparty normalised to "' + best + '" on ' + fixed +
                    ' of ' + rows.length + ' cashflow(s) - the calls did not agree.');
        }
    },

    // Run the body/Excel text-only extraction (no attachments). Best-effort: result or null on throw.
    /**
     * Text extraction, in ONE call when the mail is ordinary and in several CONCURRENT calls when it is too
     * big to answer in time.
     *
     * The ceiling is not the token limit — it is the clock. The instance stops waiting for the MID server
     * after 30s and the model writes about 9s + 0.7s per row, so a mail past roughly 23 rows is abandoned
     * mid-answer and yields nothing at all (EML-0143, 31 rows: a flat 30s timeout, every time). Split into
     * pieces that each answer in ~15s and fired together, the same mail returns all 31 rows in 18s.
     *
     * Only genuinely big mails take this path: below `extract.chunk_threshold` rows nothing changes, so the
     * overwhelming majority of mails keep the exact single call they have today. `out.expectedRows` carries
     * the segmenter's own row count so the caller can tell a complete answer from a quietly short one.
     */
    _textExtract: function (gx, instruction, textContent, emailId, mailId, wizId, ls, lsRun, attId) {
        var ctx = { capability: 'extract', emailId: emailId, mailId: mailId, driver: wizId, trace: { tracer: ls, parent: lsRun } };
        var cfg = null, seg = null, sgm = null;
        try { cfg = new x_nose_nexai_test.NfotcConfig(); } catch (ec) { cfg = null; }
        function num(key, def) { try { return cfg ? cfg.getNumber(key, wizId, def) : def; } catch (e) { return def; } }

        var threshold = num('extract.chunk_threshold', 12);
        try {
            sgm = new x_nose_nexai_test.RowSegmenter();
            // The HTML part is consulted ONLY when the text table turned out to be flattened onto one line;
            // parsing it costs nothing for every other mail because the segmenter asks for it lazily.
            var html = '';
            if (attId && num('extract.chunk_html_fallback', 1)) {
                try { html = new x_nose_nexai_test.EmlFieldExtractor().mailHtml(attId) || ''; } catch (eh) { html = ''; }
            }
            seg = sgm.segment(textContent, html);
        } catch (es) { seg = null; }

        // The expected-row count is only reported when it is TRUSTWORTHY: a structured table big enough to
        // be at risk of truncation. On a small mail the segmenter can legitimately over-count (a vertically
        // laid-out mail lists one field per line, so "Cashflow Amount" and its value read as two rows), and
        // a single call on a small mail does not truncate anyway — flagging those partial would be noise.
        var expected = (seg && seg.splittable && seg.dataCount >= threshold) ? seg.dataCount : 0;
        if (!seg || !seg.splittable || seg.dataCount < threshold) {
            var one = null;
            try { one = gx.extractRecords(instruction.text, textContent, ctx); } catch (e) { return null; }
            if (one) {
                one.expectedRows = expected;
                one.usageIds = one.usageId ? [one.usageId] : [];
                one.chunks = 1;
                if (seg && !seg.splittable && seg.reason && seg.dataCount >= threshold) {
                    // big, but we could not find row boundaries — say so instead of silently single-calling
                    gs.warn('[WizardExtractor] email=' + emailId + ' has ~' + seg.dataCount + ' rows but cannot be split (' +
                        seg.mode + ': ' + seg.reason + ') — extracted in one call, which may time out.');
                }
            }
            return one;
        }

        var calls = sgm.planCalls(seg.dataCount, (instruction.keys || []).length, {
            budgetSec: num('extract.chunk_budget_s', 15),
            overheadSec: num('extract.chunk_overhead_s', 9),
            secPerRow: num('extract.chunk_sec_per_row', 0)     // 0 = derive from the field count
        });
        var parts = sgm.chunks(seg, calls);
        if (!parts || parts.length < 2) {
            var solo = null;
            try { solo = gx.extractRecords(instruction.text, textContent, ctx); } catch (e2) { return null; }
            if (solo) { solo.expectedRows = expected; solo.usageIds = solo.usageId ? [solo.usageId] : []; solo.chunks = 1; }
            return solo;
        }

        var cap = num('extract.chunk_cap', 4);
        gs.info('[WizardExtractor] email=' + emailId + ' is big (' + seg.dataCount + ' rows, ' + seg.mode +
            ') — extracting in ' + parts.length + ' concurrent calls (cap ' + cap + ').');
        var out = null;
        try { out = gx.extractRecordsBatch(instruction.text, parts, ctx, cap); } catch (e3) { return null; }
        if (!out) { return null; }
        // Two chunks can legitimately return the same row when a row straddles a boundary; dedup on the
        // configured keys, exactly as the body+PDF path does.
        try { out.rows = new x_nose_nexai_test.PdfCashflowExtractor()._dedupRows(out.rows, instruction.keys) || out.rows; } catch (e4) { /* keep undeduped */ }
        out.expectedRows = expected;
        out.chunks = parts.length;
        return out;
    },

    // Build the highlight-provenance JSON from ONE model row: the verbatim row source + one entry per field
    // that carried a "<key>__src" snippet (standard AND custom fields — custom ones have no ai_* column but
    // still get a snippet + legend chip). `group` selects the case-screen highlight colour. Counterparty is
    // DERIVED (never AI-extracted) so it is never a source. Lengths are capped to keep the JSON column small.
    _buildSources: function (keys, row) {
        function cap(s, n) { s = '' + (s == null ? '' : s); return s.length > n ? s.substring(0, n) : s; }
        var out = { rowsrc: cap(row.__rowsrc, 1200), fields: [] };
        for (var k = 0; k < keys.length; k++) {
            var key = keys[k].key, name = '' + (keys[k].name || key);
            var snip = ('' + (row[key + '__src'] || '')).trim();
            if (!snip) { continue; }
            var col = this.FIELD_MAP[name.toLowerCase()] || '';
            if (col === 'ai_counterparty') { continue; }   // counterparty name is not highlighted in the email
            out.fields.push({ key: key, label: name, group: this._hlGroup(col), snippet: cap(snip, 240) });
        }
        return out;
    },
    // Map an ai_* column to a case-screen highlight colour group; a field with no column is a custom field.
    _hlGroup: function (col) {
        if (col === 'ai_amount') { return 'amount'; }
        if (col === 'ai_value_date' || col === 'ai_trade_date') { return 'date'; }
        if (col === 'ai_currency') { return 'ccy'; }
        if (col === 'ai_direction') { return 'dir'; }
        if (col === 'ai_reference') { return 'ref'; }
        if (col === 'ai_nomura_entity' || col === 'ai_product' || col.indexOf('ai_ssi') === 0) { return 'other'; }
        return col ? 'other' : 'custom';   // no column => custom field
    },

    // Build the record-mode instruction + the ordered key list (same shape as the wizard's Run step).
    _buildInstruction: function (fields) {
        var keys = [], lines = [], seen = {};
        for (var i = 0; i < fields.length; i++) {
            var f = fields[i] || {};
            var key = this._slug(f.name), base = key, n = 2;
            while (seen[key]) { key = base + '_' + (n++); }
            seen[key] = true;
            keys.push({ key: key, name: '' + (f.name || '') });
            var line = '- ' + key + ': ' + (f.prompt || f.name || key);
            var exs = [];
            var fex = f.examples || [];
            for (var e = 0; e < fex.length; e++) { var ev = fex[e]; if (ev && typeof ev === 'object') { ev = ev.value; } if (ev) { exs.push('"' + ev + '"'); } }
            if (exs.length) { line += ' (example values: ' + exs.join(', ') + ')'; }
            else if (f.value) { line += ' (example value: "' + f.value + '")'; }
            lines.push(line);
        }
        // NOTE (2026-09-17): the per-field provenance snippets ("__rowsrc" / "<key>__src") were REMOVED. They
        // existed only to highlight values inside the mail body on the case screen, and cost roughly half of
        // every answer — which also capped how many rows fitted in one 8192-token reply. Highlighting is to be
        // rebuilt deterministically (search the body for the stored value) with no model output at all.
        var shape = [];
        for (var j = 0; j < keys.length; j++) { shape.push('"' + keys[j].key + '":""'); }
        var text = 'Extract EVERY trade / row present in the TEXT (there may be one row or many — each ' +
            'line of a table is a row). For EACH row, extract these fields:\n' + lines.join('\n') +
            '\n\nReturn ONLY a JSON array — one object per row, each object exactly {' + shape.join(',') + '}. ' +
            'No markdown, no code fences, no commentary. If a field is absent for a row, use "" for it.';
        return { text: text, keys: keys };
    },

    // Blank every standard ai_* field column so a wizard that configures only a SUBSET of fields leaves
    // the rest empty — the board reflects exactly the wizard's field config, with no leftover values from
    // a prior extraction (by another wizard or the original ingest). Counterparty is derived, not cleared.
    _clearFields: function (cf) {
        for (var k in this.FIELD_MAP) { if (this.FIELD_MAP.hasOwnProperty(k)) { cf.setValue(this.FIELD_MAP[k], ''); } }
    },

    _applyRow: function (cf, keys, row) {
        for (var k = 0; k < keys.length; k++) {
            var name = '' + keys[k].name;
            var col = this.FIELD_MAP[name.toLowerCase()];
            if (!col) { continue; } // custom field with no ai_* column -> not shown on the standard board
            var v = this.validateField(name, row[keys[k].key]);   // GUARDRAIL: coerce/normalise per field; blank if out-of-spec
            if (col === 'ai_direction') { v = this._flipDir(v); }  // then flip to the bank POV
            cf.setValue(col, v);
        }
        this._signFromDirection(cf);   // DIRECTION PRIORITY: the sign follows Nomura's side of the trade
    },

    // DIRECTION PRIORITY - the stored amount carries the sign of NOMURA's side of the trade.
    //
    // A mail states a direction, an amount, and sometimes a sign, and the three do not always agree:
    // a counterparty writes "500 Receive" meaning IT receives, which is Nomura paying. Reading the sign
    // alone contradicted the ground truth on 45 of 407 rows, because two thirds of real mails carry no
    // sign at all. So the DIRECTION decides and the sign is derived from it:
    //
    //     Nomura Receive -> +amount            Nomura Pay -> -amount
    //
    // The sign is consulted only where the mail states no direction anywhere, and there it speaks for
    // the SENDER: a minus means the sender pays, so Nomura receives.
    //
    // Measured against the ground truth's own Nomura Amount column, this convention holds on 411 of its
    // 412 rows - and the bank bookings are seeded on the same one, which is what makes a cashflow and a
    // booking comparable as raw numbers at all. An unsigned magnitude against a signed booking is out by
    // twice its value on every Pay row, past the tolerance of every tier, so they simply never match.
    _signFromDirection: function (cf) {
        var raw = '' + (cf.getValue('ai_amount') || '');
        if (!raw) { return; }
        var n = parseFloat(raw.replace(/[, ]/g, ''));
        if (isNaN(n)) { return; }
        var dir = this._normDirection(cf.getValue('ai_direction'));   // already flipped to Nomura's side
        if (!dir) {
            dir = (n < 0) ? 'Receive' : 'Pay';        // nothing stated: the sender's sign is the evidence
            cf.setValue('ai_direction', dir);
        }
        // Keep the magnitude EXACTLY as extracted - no float round-trip, so 1234.50 stays 1234.50.
        cf.setValue('ai_amount', (dir === 'Pay' ? '-' : '') + raw.replace(/^[-+]/, ''));
    },

    // Deterministic guardrail — the prompt REQUESTS the right format; this ENFORCES it after the model
    // responds. Out-of-spec values are coerced to the canonical form or blanked (never a wrong guess).
    // Applied to the mandatory Compare & Match fields; other fields pass through (trimmed).
    validateField: function (name, v) {
        var raw = (v === null || v === undefined) ? '' : ('' + v).trim();
        if (raw === '') { return ''; }
        var n = ('' + name).toLowerCase();
        if (n.indexOf('value date') > -1) { return this._normDate(raw); }
        if (n === 'amount') { return this._normAmount(raw); }
        if (n === 'currency') { return this._normCcy(raw); }
        if (n === 'direction') { return this._normDirection(raw); }
        return raw;
    },

    _MONTHS: { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' },
    // -> ISO YYYY-MM-DD from ISO / DD-first slash / DD-Mon-YYYY / SWIFT YYMMDD / YYYYMMDD; else '' (never a wrong date).
    _normDate: function (s) {
        s = ('' + s).trim();
        var m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/); if (m) { return s; }
        m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
        if (m) { return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2); }
        m = s.match(/^(\d{1,2})[\-\s]([A-Za-z]{3,})[\-\s](\d{4})$/);
        if (m) { var mo = this._MONTHS[m[2].substring(0, 3).toLowerCase()]; if (mo) { return m[3] + '-' + mo + '-' + ('0' + m[1]).slice(-2); } }
        m = s.match(/^(\d{2})(\d{2})(\d{2})$/); if (m) { return '20' + m[1] + '-' + m[2] + '-' + m[3]; }
        m = s.match(/^(\d{4})(\d{2})(\d{2})$/); if (m) { return m[1] + '-' + m[2] + '-' + m[3]; }
        return '';
    },
    // -> uppercase 3-letter code; else ''.
    _normCcy: function (s) { var m = ('' + s).toUpperCase().match(/[A-Z]{3}/); return m ? m[0] : ''; },
    // -> 'Pay' / 'Receive' (counterparty stated POV) from words, single letters, SWIFT tags; else ''.
    _normDirection: function (s) {
        var t = ('' + s).toLowerCase();
        if (/rec|rcv/.test(t)) { return 'Receive'; }
        if (/pay|pmt/.test(t)) { return 'Pay'; }
        var w = t.replace(/[^a-z]/g, '');
        if (w === 'r') { return 'Receive'; }
        if (w === 'p') { return 'Pay'; }
        return '';
    },
    // -> plain number string (dot decimal, sign preserved); handles thousands seps + European comma decimals; else ''.
    _normAmount: function (s) {
        var str = ('' + s).trim();
        if (!str) { return ''; }
        var neg = /-/.test(str) || /^\s*\(.*\)\s*$/.test(str);
        str = str.replace(/[^0-9.,]/g, '');
        if (!str) { return ''; }
        var lastComma = str.lastIndexOf(','), lastDot = str.lastIndexOf('.');
        if (lastComma > -1 && lastDot > -1) {
            if (lastComma > lastDot) { str = str.replace(/\./g, '').replace(/,/g, '.'); }  // comma is decimal
            else { str = str.replace(/,/g, ''); }                                          // dot is decimal
        } else if (lastComma > -1) {
            var commas = (str.match(/,/g) || []).length, after = str.length - lastComma - 1;
            if (commas === 1 && after > 0 && after <= 2) { str = str.replace(/,/g, '.'); } // European decimal
            else { str = str.replace(/,/g, ''); }                                          // thousands
        } else {
            var dots = (str.match(/\./g) || []).length;
            if (dots > 1) { var li = str.lastIndexOf('.'); str = str.substring(0, li).replace(/\./g, '') + '.' + str.substring(li + 1); }
        }
        str = str.replace(/[^0-9.]/g, '');
        if (str === '' || str === '.') { return ''; }
        var num = parseFloat(str);
        if (isNaN(num)) { return ''; }
        if (neg) { num = -Math.abs(num); }
        return '' + num;
    },

    // The raw .eml attachment on an email record (prefer *.eml; else the first attachment).
    _emlAtt: function (emailId) {
        var ag = new GlideRecord('sys_attachment');
        ag.addQuery('table_name', 'x_nose_nexai_test_email');
        ag.addQuery('table_sys_id', emailId);
        ag.orderBy('sys_created_on');
        ag.query();
        var first = '';
        while (ag.next()) {
            var fn = ('' + ag.getValue('file_name')).toLowerCase();
            if (!first) { first = ag.getUniqueValue(); }
            if (/\.eml$/.test(fn) || ag.getValue('content_type') === 'message/rfc822') { return ag.getUniqueValue(); }
        }
        return first;
    },

    type: 'WizardExtractor'
};
