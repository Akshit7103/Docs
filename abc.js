/**
 * ChinouClient — GLOBAL-scope Script Include for **bsmdev**.
 *
 * DIFFERENCE FROM EVAL: builds the Chinou HTTP request INLINE (no named REST Message).
 * A Global Script Include cannot resolve a REST Message that lives in another scope by name
 * ("Unable to find REST Message Record with Name: Chinou API"), so instead of calling the
 * GMET-scoped 'Chinou API' REST Message, this reuses bsmdev's existing Chinou CONNECTION VALUES
 * (endpoint + MID + svcnewsd basic auth) straight from the GMET app's system properties and
 * makes the call itself. No cross-scope REST Message dependency.
 *
 * WHERE IT LIVES: System Definition -> Script Includes -> ChinouClient
 *   Name: ChinouClient · Application: Global · Accessible from: All application scopes · Active: true
 *
 * Properties it reads:
 *   chinou.reg.id                     (ours)  -> AIUC00337
 *   chinou.model.id                   (ours)  -> anthropic-4.5-sonnet[Bedrock]
 *   x_nose_gmet_app.chinou.endpoint   (existing on bsmdev) -> the /invoke URL
 *   x_nose_gmet_app.chinou.mid_server (existing) -> the MID name (int1)
 *   x_nose_gmet_app.chinou.username   (existing) -> svcnewsd
 *   x_nose_gmet_app.chinou.password   (existing) -> the account password
 *
 * QUICK TEST (Scripts - Background):
 *   var r = new global.ChinouClient().invoke('Reply with exactly: CHINOU OK');
 *   gs.info('[TEST] ' + JSON.stringify(r));
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
            // Reg-id for AI CoE usage/cost attribution — MUST go in LLMRequest.parameters.
            if (regId) { requestBody.LLMRequest.parameters = { "reg_id": regId }; }

            // INLINE REST call — no named REST Message, so no cross-scope lookup.
            var request = new sn_ws.RESTMessageV2();
            request.setHttpMethod('POST');
            request.setEndpoint(endpoint);
            if (midServer) { request.setMIDServer(midServer); }
            if (user) { request.setBasicAuth(user, pass); }
            request.setRequestHeader('Content-Type', 'application/json');
            request.setRequestBody(JSON.stringify(requestBody));
            request.setHttpTimeout(60000);

            var response = request.execute();
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
            return { success: true, status: httpStatus, response: text, model: model,
                     costUsd: metrics.cost, responseTimeMs: metrics.execution_time_ms };
        } catch (ex) {
            gs.error('[ChinouClient] exception: ' + (ex.message || ex));
            return { success: false, status: 0, model: model, error: 'Exception: ' + (ex.message || ex) };
        }
    },

    type: 'ChinouClient'
};
