/**
 * ChinouClient - GLOBAL-scope Script Include for **bsmdev**.
 *
 * DIFFERENCE FROM EVAL: builds the Chinou HTTP request INLINE (no named REST Message).
 * A Global Script Include cannot resolve a REST Message that lives in another scope by name
 * ("Unable to find REST Message Record with Name: Chinou API"), so instead of calling the
 * GMET-scoped 'Chinou API' REST Message, this reuses bsmdev's existing Chinou CONNECTION VALUES
 * (endpoint + MID + svcnewsd basic auth) straight from the GMET app's system properties and
 * makes the call itself. No cross-scope REST Message dependency.
 *
 * WHERE IT LIVES: System Definition -> Script Includes -> ChinouClient
 *   Name: ChinouClient - Application: Global - Accessible from: All application scopes - Active: true
 *
 * Properties it reads:
 *   chinou.reg.id                     (ours)  -> AIUC00337
 *   chinou.model.id                   (ours)  -> anthropic-4.5-sonnet[Bedrock]
 *   x_nose_gmet_app.chinou.endpoint   (existing on bsmdev) -> the /invoke URL
 *   x_nose_gmet_app.chinou.mid_server (existing) -> the MID name (int1)
 *   x_nose_gmet_app.chinou.username   (existing) -> svcnewsd
 *   x_nose_gmet_app.chinou.password   (existing) -> the account password
 *
 * ---------------------------------------------------------------------------------------------
 * 2026-09-21 - ADDED invokeBatch (+ _fireAsync / _collectAsync and the shared body builders and
 * response parser they need).
 *
 * WHY: WizardExtractor chunks any mail above extract.chunk_threshold rows and calls
 * ChinouClient.invokeBatch() to run those chunks concurrently. This client did not have that
 * method, so every big mail died with:
 *     TypeError: Cannot find function invokeBatch in object [object Object]
 * and produced ZERO cashflows - while every small mail (which never takes the chunked path) kept
 * working. That is why 24 of 25 mails extracted and exactly one did not.
 *
 * WHAT CHANGED: invoke() and invokeDocument() are UNTOUCHED - same bodies, same temperatures, same
 * timeouts, same logging - so nothing that works today can regress. Everything below is additive.
 *
 * NOTE ON TEMPERATURE, deliberate: invoke() sends temperature 0.3 and the batch path sends 0, which
 * matches eval exactly. Do not "harmonise" them - results are only comparable within one door.
 * ---------------------------------------------------------------------------------------------
 *
 * QUICK TEST (Scripts - Background):
 *   var r = new global.ChinouClient().invoke('Reply with exactly: CHINOU OK');
 *   gs.info('[TEST] ' + JSON.stringify(r));
 *
 * BATCH TEST (proves the fix, 3 concurrent calls):
 *   var c = new global.ChinouClient();
 *   var res = c.invokeBatch([
 *       { kind: 'text', prompt: 'Reply with exactly: ONE' },
 *       { kind: 'text', prompt: 'Reply with exactly: TWO' },
 *       { kind: 'text', prompt: 'Reply with exactly: THREE' }
 *   ], 3, 120);
 *   for (var i = 0; i < res.length; i++) {
 *       gs.info('[BATCH] ' + i + ' success=' + res[i].success + ' text=' + res[i].response + ' err=' + res[i].error);
 *   }
 */
var ChinouClient = Class.create();
ChinouClient.prototype = {
    initialize: function () {},

    DEFAULT_MODEL: 'anthropic-4.5-sonnet[Bedrock]',

    /**
     * POST a text prompt to Chinou (chinou-json:1 contract), built inline + routed via the MID.
     * @param {string} prompt  the text to send
     * @param {string} [model] optional per-call model override; else chinou.model.id, then DEFAULT_MODEL.
     */
    invoke: function (prompt, model) {
        try {
            model = model || gs.getProperty('chinou.model.id', this.DEFAULT_MODEL);
            var regId = gs.getProperty('chinou.reg.id', '');

            // Reuse bsmdev's existing Chinou connection (from the GMET app's properties).
            var endpoint  = gs.getProperty('x_nose_gmet_app.chinou.endpoint', '');
            var midServer = gs.getProperty('x_nose_gmet_app.chinou.mid_server', '');
            var user      = gs.getProperty('x_nose_gmet_app.chinou.username', '');
            var pass      = gs.getProperty('x_nose_gmet_app.chinou.password', '');
            if (!endpoint) {
                return { success: false, status: 0, model: model,
                         error: 'Chinou endpoint not set (x_nose_gmet_app.chinou.endpoint)' };
            }

            var requestBody = {
                "_protocol": "chinou-json:1",
                "LLMRequest": {
                    "sessionId": "",
                    "LLMDescriptor": {
                        "model": model,
                        "model_params": { "temperature": 0.3, "top_k": 1.0, "max_tokens": 8192 }
                    },
                    "body": "" + (prompt || "")
                }
            };
            // Reg-id for AI CoE usage/cost attribution - MUST go in LLMRequest.parameters.
            if (regId) { requestBody.LLMRequest.parameters = { "reg_id": regId }; }

            // INLINE REST call - no named REST Message, so no cross-scope lookup.
            var request = new sn_ws.RESTMessageV2();
            request.setHttpMethod('POST');
            request.setEndpoint(endpoint);
            if (midServer) { request.setMIDServer(midServer); }
            if (user) { request.setBasicAuth(user, pass); }
            request.setRequestHeader('Content-Type', 'application/json');
            request.setRequestBody(JSON.stringify(requestBody));
            request.setHttpTimeout(60000);

            var _rtStart = new GlideDateTime().getNumericValue();
            var response = request.execute();
            var _roundTripMs = new GlideDateTime().getNumericValue() - _rtStart;
            var httpStatus = response.getStatusCode();
            var responseBody = response.getBody();
            gs.info('[ChinouClient] model=' + model + ' status=' + httpStatus + ' mid=' + midServer);

            if (httpStatus != 200) {
                gs.error('[ChinouClient] HTTP ' + httpStatus + ': ' + responseBody);
                return { success: false, status: httpStatus, model: model, error: 'HTTP ' + httpStatus + ': ' + responseBody };
            }

            var json = JSON.parse(responseBody);

            if (json.LLMError) {
                var em = json.LLMError.message || json.LLMError.code || 'LLMError';
                gs.error('[ChinouClient] LLMError: ' + em);
                return { success: false, status: httpStatus, model: model, error: 'LLMError: ' + em };
            }

            var env = json.LLMDocuResponse || json.LLMResponse;
            if (!env) {
                gs.error('[ChinouClient] unexpected response shape: ' + ('' + responseBody).substring(0, 300));
                return { success: false, status: httpStatus, model: model, error: 'Unexpected response: ' + ('' + responseBody).substring(0, 300) };
            }

            var decision = (env.ComplianceChecks && env.ComplianceChecks.Decision) ? env.ComplianceChecks.Decision : null;
            if (decision && decision.decision && ('' + decision.decision).toUpperCase() !== 'RESPOND') {
                gs.warn('[ChinouClient] guardrail blocked: ' + decision.decision + ' (' + (decision.reason || '') + ')');
                return { success: false, status: httpStatus, model: model, blocked: true,
                         error: 'Guardrail: ' + decision.decision + (decision.reason ? (' - ' + decision.reason) : '') };
            }

            var text = (typeof env.body === 'string') ? env.body : '';
            var metrics = env.metrics || {};
            // costUsd + responseTimeMs are Chinou's OWN authoritative figures (not a local estimate).
            // `metrics` (full object incl. any token counts) + roundTripMs are surfaced for LlmUsage logging.
            return { success: true, status: httpStatus, response: text, model: model,
                     costUsd: metrics.cost, responseTimeMs: metrics.execution_time_ms,
                     metrics: metrics, roundTripMs: _roundTripMs };
        } catch (ex) {
            gs.error('[ChinouClient] exception: ' + (ex.message || ex));
            return { success: false, status: 0, model: model, error: 'Exception: ' + (ex.message || ex) };
        }
    },

    /**
     * POST a born-digital settlement PDF (base64) + a prompt to Chinou, built INLINE from the GMET
     * connection (same endpoint/MID/svcnewsd Basic auth as invoke()). chinou-json:1 LLMDocuRequest
     * contract; Chinou reads the PDF text layer and returns the answer. Used for born-digital PDF
     * cashflow extraction in ONE call.
     * NOTE: requires this Chinou gateway to support the DOCUMENT protocol (LLMDocuRequest/LLMDocumentSet)
     * and a doc-capable model. Scanned/image-only PDFs are NOT handled (no vision via this gateway).
     * @param {string} base64, {string} prompt, {string} [fileName], {string} [model], {number} [maxTokens=8192]
     */
    invokeDocument: function (base64, prompt, fileName, model, maxTokens) {
        try {
            model = model || gs.getProperty('chinou.model.id', this.DEFAULT_MODEL);
            var regId = gs.getProperty('chinou.reg.id', '');
            var mt = parseInt(maxTokens, 10); if (isNaN(mt) || mt <= 0) { mt = 8192; }

            var endpoint  = gs.getProperty('x_nose_gmet_app.chinou.endpoint', '');
            var midServer = gs.getProperty('x_nose_gmet_app.chinou.mid_server', '');
            var user      = gs.getProperty('x_nose_gmet_app.chinou.username', '');
            var pass      = gs.getProperty('x_nose_gmet_app.chinou.password', '');
            if (!endpoint) {
                return { success: false, status: 0, model: model,
                         error: 'Chinou endpoint not set (x_nose_gmet_app.chinou.endpoint)' };
            }

            var requestBody = {
                "_protocol": "chinou-json:1",
                "LLMDocuRequest": {
                    "sessionId": "",
                    "LLMRequest": {
                        "sessionId": "",
                        "LLMDescriptor": { "model": model, "model_params": { "temperature": 0, "top_k": 1.0, "max_tokens": mt } },
                        "body": "" + (prompt || ""),
                        "parameters": { "control_message": true, "native_doc_submission": false }
                    },
                    "LLMDocumentSet": {
                        "documents": [{ "LLMDocument": {
                            "name": "" + (fileName || "document.pdf"), "document_type": "PDF", "body": "" + (base64 || "")
                        } }]
                    }
                }
            };
            if (regId) { requestBody.LLMDocuRequest.LLMRequest.parameters.reg_id = regId; }

            // INLINE REST call - no named REST Message (same as invoke()).
            var request = new sn_ws.RESTMessageV2();
            request.setHttpMethod('POST');
            request.setEndpoint(endpoint);
            if (midServer) { request.setMIDServer(midServer); }
            if (user) { request.setBasicAuth(user, pass); }
            request.setRequestHeader('Content-Type', 'application/json');
            request.setRequestBody(JSON.stringify(requestBody));
            request.setHttpTimeout(180000);   // document reads are slower than a text prompt

            var _t0 = new GlideDateTime().getNumericValue();
            var response = request.execute();
            var _rt = new GlideDateTime().getNumericValue() - _t0;
            var httpStatus = response.getStatusCode();
            var responseBody = response.getBody();
            gs.info('[ChinouClient] invokeDocument model=' + model + ' status=' + httpStatus + ' file=' + fileName + ' mid=' + midServer + ' roundTripMs=' + _rt);

            if (httpStatus != 200) {
                gs.error('[ChinouClient] invokeDocument HTTP ' + httpStatus + ': ' + ('' + responseBody).substring(0, 300));
                return { success: false, status: httpStatus, model: model, roundTripMs: _rt, error: 'HTTP ' + httpStatus };
            }
            var json = JSON.parse(responseBody);
            if (json.LLMError) {
                var em = json.LLMError.message || json.LLMError.code || 'LLMError';
                gs.error('[ChinouClient] invokeDocument LLMError: ' + em);
                return { success: false, status: httpStatus, model: model, roundTripMs: _rt, error: 'LLMError: ' + em };
            }
            var env = json.LLMDocuResponse || json.LLMResponse;
            if (!env) {
                return { success: false, status: httpStatus, model: model, roundTripMs: _rt,
                         error: 'Unexpected response: ' + ('' + responseBody).substring(0, 300) };
            }
            var decision = (env.ComplianceChecks && env.ComplianceChecks.Decision) ? env.ComplianceChecks.Decision : null;
            if (decision && decision.decision && ('' + decision.decision).toUpperCase() !== 'RESPOND') {
                gs.warn('[ChinouClient] invokeDocument guardrail blocked: ' + decision.decision);
                return { success: false, status: httpStatus, model: model, roundTripMs: _rt, blocked: true,
                         error: 'Guardrail: ' + decision.decision + (decision.reason ? (' - ' + decision.reason) : '') };
            }
            var body = env.body, text = '';
            if (typeof body === 'string') { text = body; }
            else if (body && body.kwargs && typeof body.kwargs.content === 'string') { text = body.kwargs.content; }
            else if (body && typeof body.content === 'string') { text = body.content; }
            var metrics = env.metrics || {};
            return { success: true, status: httpStatus, response: text, model: model,
                     costUsd: metrics.cost, responseTimeMs: metrics.execution_time_ms, roundTripMs: _rt, metrics: metrics };
        } catch (ex) {
            gs.error('[ChinouClient] invokeDocument exception: ' + (ex.message || ex));
            return { success: false, status: 0, model: model, error: 'Exception: ' + (ex.message || ex) };
        }
    },

    // =============================================================================================
    // BATCH / CONCURRENT PATH  - added 2026-09-21
    // =============================================================================================

    /**
     * Run several Chinou calls CONCURRENTLY, in waves of `cap`, so a big mail split into N chunks
     * takes about one call's time instead of N. The cap exists because the Chinou gateway is shared
     * across scopes and instances - firing 20 calls at once floods it.
     *
     * Each item: { kind:'text'|'doc', prompt, base64?, fileName?, model?, maxTokens? }
     * Returns results[] ALIGNED TO items[] - each entry the same shape as invoke()/invokeDocument(),
     * so a caller can map chunk i to result i. A failed item yields a failure object in its slot
     * rather than shortening the array; never assume results.length is the success count.
     *
     * Mechanism: RESTMessageV2.executeAsync() returns immediately and the MID processes the call in
     * the background; response.waitForResponse(sec) blocks later. So a wave is FIRED first and only
     * then collected - firing and collecting one at a time would be serial and pointless.
     *
     * @param {Array}  items      the calls to make
     * @param {number} [cap=4]    how many may be in flight at once
     * @param {number} [timeoutSec=180] how long to wait for each response
     */
    invokeBatch: function (items, cap, timeoutSec) {
        var out = [];
        if (!items || !items.length) { return out; }
        cap = parseInt(cap, 10); if (isNaN(cap) || cap < 1) { cap = 4; }
        var to = parseInt(timeoutSec, 10); if (isNaN(to) || to < 1) { to = 180; }
        for (var i = 0; i < items.length; i += cap) {
            var end = Math.min(i + cap, items.length);
            var wave = [];
            for (var f = i; f < end; f++) { wave.push(this._fireAsync(items[f])); }                  // fire the whole wave
            for (var c = 0; c < wave.length; c++) { out[i + c] = this._collectAsync(wave[c], to); }  // then collect
            gs.info('[ChinouClient] invokeBatch wave ' + (Math.floor(i / cap) + 1) + ' fired ' +
                    wave.length + ' (of ' + items.length + ' total)');
        }
        return out;
    },

    // Build the chinou-json:1 body for a text OR document item, then executeAsync() (non-blocking).
    // The request is assembled INLINE here, exactly as invoke()/invokeDocument() do it - this is the
    // one place the bsmdev client must differ from eval's, which uses a named REST Message.
    _fireAsync: function (item) {
        try {
            item = item || {};
            var model = item.model || gs.getProperty('chinou.model.id', this.DEFAULT_MODEL);
            var regId = gs.getProperty('chinou.reg.id', '');
            var mt = parseInt(item.maxTokens, 10); if (isNaN(mt) || mt <= 0) { mt = 8192; }

            var endpoint  = gs.getProperty('x_nose_gmet_app.chinou.endpoint', '');
            var midServer = gs.getProperty('x_nose_gmet_app.chinou.mid_server', '');
            var user      = gs.getProperty('x_nose_gmet_app.chinou.username', '');
            var pass      = gs.getProperty('x_nose_gmet_app.chinou.password', '');
            if (!endpoint) { return { err: 'Chinou endpoint not set (x_nose_gmet_app.chinou.endpoint)', model: model }; }

            var body = (item.kind === 'doc')
                ? this._docBody(item.base64, item.prompt, item.fileName, model, mt, regId)
                : this._textBody(item.prompt, model, mt, regId);

            var request = new sn_ws.RESTMessageV2();
            request.setHttpMethod('POST');
            request.setEndpoint(endpoint);
            if (midServer) { request.setMIDServer(midServer); }
            if (user) { request.setBasicAuth(user, pass); }
            request.setRequestHeader('Content-Type', 'application/json');
            request.setRequestBody(JSON.stringify(body));
            request.setHttpTimeout(180000);

            var start = new GlideDateTime().getNumericValue();
            var resp = request.executeAsync();   // returns immediately; the MID works in the background
            return { resp: resp, model: model, startMs: start };
        } catch (e) {
            return { err: '' + (e.message || e), model: (item && item.model) };
        }
    },

    // Block for one fired request's response, then parse it with the shared parser.
    _collectAsync: function (h, to) {
        if (!h || h.err) {
            return { success: false, status: 0, model: (h && h.model), error: 'fire failed: ' + (h && h.err) };
        }
        try {
            h.resp.waitForResponse(to);
            var rt = new GlideDateTime().getNumericValue() - h.startMs;
            return this._parseChinou(h.resp.getStatusCode(), h.resp.getBody(), h.model, rt);
        } catch (e) {
            return { success: false, status: 0, model: h.model, error: 'collect failed: ' + (e.message || e) };
        }
    },

    // ---- shared request-body builders + response parser (used by the batch path) ----
    // NOTE: temperature 0 here, while invoke() uses 0.3. That difference is intentional and matches
    // eval - it is why results from the single and batch doors are not directly comparable.
    _textBody: function (prompt, model, mt, regId) {
        var b = { "_protocol": "chinou-json:1", "LLMRequest": { "sessionId": "",
            "LLMDescriptor": { "model": model, "model_params": { "temperature": 0, "top_k": 1.0, "max_tokens": mt } },
            "body": "" + (prompt || "") } };
        if (regId) { b.LLMRequest.parameters = { "reg_id": regId }; }
        return b;
    },

    _docBody: function (base64, prompt, fileName, model, mt, regId) {
        var b = { "_protocol": "chinou-json:1", "LLMDocuRequest": { "sessionId": "", "LLMRequest": { "sessionId": "",
            "LLMDescriptor": { "model": model, "model_params": { "temperature": 0, "top_k": 1.0, "max_tokens": mt } },
            "body": "" + (prompt || ""), "parameters": { "control_message": true, "native_doc_submission": false } },
            "LLMDocumentSet": { "documents": [{ "LLMDocument": { "name": "" + (fileName || "document.pdf"),
                "document_type": "PDF", "body": "" + (base64 || "") } }] } } };
        if (regId) { b.LLMDocuRequest.LLMRequest.parameters.reg_id = regId; }
        return b;
    },

    _parseChinou: function (httpStatus, responseBody, model, rt) {
        if (httpStatus != 200) {
            gs.error('[ChinouClient] HTTP ' + httpStatus + ': ' + ('' + responseBody).substring(0, 300));
            return { success: false, status: httpStatus, model: model, roundTripMs: rt, error: 'HTTP ' + httpStatus };
        }
        var json;
        try { json = JSON.parse(responseBody); }
        catch (e) {
            return { success: false, status: httpStatus, model: model, roundTripMs: rt,
                     error: 'non-JSON response', raw: ('' + responseBody).substring(0, 300) };
        }
        if (json.LLMError) {
            var em = json.LLMError.message || json.LLMError.code || 'LLMError';
            return { success: false, status: httpStatus, model: model, roundTripMs: rt, error: 'LLMError: ' + em };
        }
        var env = json.LLMDocuResponse || json.LLMResponse;
        if (!env) {
            return { success: false, status: httpStatus, model: model, roundTripMs: rt,
                     error: 'Unexpected response: ' + ('' + responseBody).substring(0, 300) };
        }
        var decision = (env.ComplianceChecks && env.ComplianceChecks.Decision) ? env.ComplianceChecks.Decision : null;
        if (decision && decision.decision && ('' + decision.decision).toUpperCase() !== 'RESPOND') {
            return { success: false, status: httpStatus, model: model, roundTripMs: rt, blocked: true,
                     error: 'Guardrail: ' + decision.decision + (decision.reason ? (' - ' + decision.reason) : '') };
        }
        var body = env.body, text = '';
        if (typeof body === 'string') { text = body; }
        else if (body && body.kwargs && typeof body.kwargs.content === 'string') { text = body.kwargs.content; }
        else if (body && typeof body.content === 'string') { text = body.content; }
        var metrics = env.metrics || {};
        return { success: true, status: httpStatus, response: text, model: model,
                 costUsd: metrics.cost, responseTimeMs: metrics.execution_time_ms, roundTripMs: rt, metrics: metrics };
    },

    type: 'ChinouClient'
};
