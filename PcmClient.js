/**
 * PcmClient - retrieval of Phoenix cash-manager cashflows for Compare and Match.
 *
 * WHERE THIS LIVES
 * ----------------
 * Script Include, Application GLOBAL, "Accessible from: All application scopes", Client callable OFF.
 *
 * One copy, called by all four NexAI applications as global.PcmClient. This is the same shape as
 * ChinouClient, and for the same reason: the credential and the MID routing are instance-level facts,
 * not application-level ones, and four copies would be four things to keep in step.
 *
 * WHY EVERYTHING GOES THROUGH THE MID SERVER
 * ------------------------------------------
 * MEASURED on nomurabsmdev: direct fails with UnknownHostException in 67ms - the host is on the Nomura
 * intranet and a cloud instance has no route to it. Through the MID server the same call returns 200 in
 * 764ms. So the MID path is not a fallback here, it is the only path, and the client treats it that way.
 *
 * That also puts PCM on the same ECC transport as Chinou, which carries a hard 30 second wall that no
 * timeout setting moves. 764ms leaves plenty of room, but the margin is a function of how many rows the
 * query returns - so keep tolerances tight, and read the ms figure on every call rather than assuming.
 *
 * THE SIGN QUESTION, AND WHY THIS RETURNS BOTH
 * --------------------------------------------
 * Our stored amount takes its sign FROM the direction: Receive positive, Pay negative. Every row seen
 * from PCM so far has been Receive and positive, which is consistent - but no Pay row has ever been
 * observed, so whether PCM follows the same rule is genuinely unknown.
 *
 * Rather than guess, every normalised row carries three fields:
 *
 *    amount_raw     exactly what PCM sent
 *    amount_signed  the same magnitude, signed by OUR convention from Direction
 *    sign_agrees    whether those two already matched
 *
 * The matcher compares amount_signed and is therefore correct either way. sign_agrees is what tells us
 * the answer the first time a Pay row comes back - and if it ever reads false in production, that is a
 * finding, not a failure.
 *
 * WHAT IS DELIBERATELY NOT HERE
 * -----------------------------
 * No write-back. The API shared is retrieval only; the write-back endpoint is still pending from
 * Nomura. There is nothing in this file that can modify anything in PCM.
 *
 * CONFIGURATION (system properties, all optional - the defaults are the working dev values)
 *    nexai.pcm.endpoint     full URL. Change this for uat/prod; the dev one has /dev/ in the path
 *    nexai.pcm.credential   NAME of the Basic Auth Configuration record. Default "PCM svcnewsd"
 *    nexai.pcm.timeout_ms   per-attempt timeout. Default 30000, which is the ECC ceiling anyway
 *    nexai.pcm.mid          pin a specific MID server. Blank = use any that is Up, trying each in turn
 */
var PcmClient = Class.create();

PcmClient.prototype = {

    initialize: function () {
        this.endpoint = gs.getProperty('nexai.pcm.endpoint',
            'http://int-intranetws.nomuranow.com/cts-otc/phoenix/dev/cashmanager-eu/api/ssgai/cashflows');
        this.credName = gs.getProperty('nexai.pcm.credential', 'PCM svcnewsd');
        this.timeoutMs = parseInt(gs.getProperty('nexai.pcm.timeout_ms', '30000'), 10);
        if (isNaN(this.timeoutMs) || this.timeoutMs < 1000) { this.timeoutMs = 30000; }
        this.pinnedMid = '' + (gs.getProperty('nexai.pcm.mid', '') || '');
    },

    /**
     * Query PCM for candidate cashflows.
     *
     * criteria - any subset of:
     *    CounterpartyName, Currency, Direction, Amount, AmountTolerance, ValueDate, ValueDateTolerance
     *
     * Returns:
     *    { success, status, ms, mid, count, rows[], raw[], error, criteria }
     *
     * rows[] are normalised (see _normalise). raw[] is exactly what PCM sent, kept so nothing is lost
     * to a mapping assumption.
     */
    query: function (criteria) {
        var body = this._cleanCriteria(criteria);
        var out = {
            success: false, status: 0, ms: 0, mid: '', count: 0,
            rows: [], raw: [], error: '', criteria: body
        };

        var credId = this._credentialId();
        if (!credId) {
            out.error = 'No Basic Auth Configuration named "' + this.credName + '". Create it under ' +
                        'sys_auth_profile_basic with username svcnewsd, or set nexai.pcm.credential.';
            gs.error('[PcmClient] ' + out.error);
            return out;
        }

        var mids = this._midServers();
        if (!mids.length) {
            out.error = 'No MID server is Up. PCM is only reachable over the MID server - the instance ' +
                        'itself cannot resolve the intranet host.';
            gs.error('[PcmClient] ' + out.error);
            return out;
        }

        var payload = JSON.stringify(body);
        for (var i = 0; i < mids.length; i++) {
            var att = this._fire(mids[i], credId, payload);
            out.status = att.status;
            out.ms = att.ms;
            out.mid = mids[i];
            out.error = att.error;

            if (att.status === 200) {
                var parsed = this._parse(att.body);
                if (parsed.error) { out.error = parsed.error; return out; }
                out.success = true;
                out.raw = parsed.raw;
                out.rows = parsed.rows;
                out.count = parsed.rows.length;
                if (att.ms > 25000) {
                    gs.warn('[PcmClient] ' + att.ms + 'ms is close to the 30s ECC wall. A broader query ' +
                            'could be cut off mid-flight. Tighten the tolerances.');
                }
                return out;
            }

            // 401/403 are answers, not transport failures - another MID server will not help
            if (att.status === 401 || att.status === 403) {
                gs.error('[PcmClient] HTTP ' + att.status + ' - the credential is the problem, not the ' +
                         'route. Not trying another MID server.');
                return out;
            }
            if (i < mids.length - 1) {
                gs.warn('[PcmClient] ' + mids[i] + ' gave status ' + att.status + '. Trying ' + mids[i + 1]);
            }
        }
        gs.error('[PcmClient] all ' + mids.length + ' MID server(s) failed. Last: ' + out.error);
        return out;
    },

    // ---------------------------------------------------------------- internals

    _cleanCriteria: function (c) {
        var allowed = ['CounterpartyName', 'Currency', 'Direction', 'Amount', 'AmountTolerance',
                       'ValueDate', 'ValueDateTolerance'];
        var body = {};
        c = c || {};
        for (var i = 0; i < allowed.length; i++) {
            var k = allowed[i];
            if (c[k] !== undefined && c[k] !== null && c[k] !== '') { body[k] = c[k]; }
        }
        return body;
    },

    _credentialId: function () {
        // the column is "username" - NOT user_name. An invalid field name does not throw here, it
        // silently drops the condition and returns every profile on the instance, which is how the
        // right credential once got picked for the wrong reason.
        var g = new GlideRecord('sys_auth_profile_basic');
        g.addQuery('name', this.credName);
        g.query();
        if (g.next()) { return g.getUniqueValue(); }
        return null;
    },

    _midServers: function () {
        var list = [];
        if (this.pinnedMid) { return [this.pinnedMid]; }
        var m = new GlideRecord('ecc_agent');
        m.addQuery('status', 'Up');
        m.orderBy('name');
        m.query();
        while (m.next()) { list.push('' + m.getValue('name')); }
        return list;
    },

    _fire: function (mid, credId, payload) {
        var t0 = new GlideDateTime().getNumericValue();
        try {
            var r = new sn_ws.RESTMessageV2();
            r.setHttpMethod('post');
            r.setEndpoint(this.endpoint);
            r.setRequestHeader('Content-Type', 'application/json');
            r.setRequestHeader('Accept', 'application/json');
            r.setAuthenticationProfile('basic', credId);
            r.setMIDServer(mid);
            r.setRequestBody(payload);
            r.setHttpTimeout(this.timeoutMs);
            var resp = r.execute();
            return {
                ms: new GlideDateTime().getNumericValue() - t0,
                status: parseInt(resp.getStatusCode(), 10),
                body: '' + resp.getBody(),
                error: '' + (resp.haveError() ? resp.getErrorMessage() : '')
            };
        } catch (e) {
            return {
                ms: new GlideDateTime().getNumericValue() - t0,
                status: 0, body: '',
                error: 'exception: ' + (e.message || e)
            };
        }
    },

    _parse: function (bodyText) {
        var res = { raw: [], rows: [], error: '' };
        var arr;
        try { arr = JSON.parse(bodyText); } catch (e) {
            res.error = 'response is not JSON: ' + ('' + bodyText).substring(0, 200);
            return res;
        }
        if (!arr || typeof arr.length !== 'number') {
            res.error = 'response is not an array of cashflows';
            return res;
        }
        res.raw = arr;
        for (var i = 0; i < arr.length; i++) { res.rows.push(this._normalise(arr[i])); }
        return res;
    },

    /**
     * PCM field names carry spaces and a slash ("Notional/Amount"), which makes every downstream
     * reference a quoted lookup and one typo away from undefined. Normalise once, here.
     */
    _normalise: function (r) {
        function v(name) {
            if (r[name] !== undefined && r[name] !== null) { return r[name]; }
            for (var k in r) { if (('' + k).toLowerCase() === name.toLowerCase()) { return r[k]; } }
            return '';
        }
        function s(name) { return '' + v(name); }

        var dir = s('Direction');
        var rawAmt = parseFloat(v('Notional/Amount'));
        if (isNaN(rawAmt)) { rawAmt = null; }

        // our convention: the stored amount is signed by NOMURA's side of the trade
        var signed = null;
        if (rawAmt !== null) {
            var mag = Math.abs(rawAmt);
            var d = dir.toLowerCase();
            if (d.indexOf('receive') === 0) { signed = mag; }
            else if (d.indexOf('pay') === 0) { signed = -mag; }
            else { signed = rawAmt; }
        }

        return {
            pcm_id: s('Cashflow Id'),
            counterparty_ref: s('Counterparty Reference'),
            counterparty: s('Counterparty Name'),
            owning_org: s('Owning Org Name'),

            amount_raw: rawAmt,
            amount_signed: signed,
            sign_agrees: (rawAmt === null || signed === null) ? null : (rawAmt === signed),

            nomura_entity: s('Nomura Entity Name'),
            product: s('Product'),
            currency: s('Currency'),
            direction: dir,
            trade_date: s('Trade Date'),
            value_date: s('Value Date'),

            nom_agent_bic: s('nomSSIAgentBankBIC'),
            nom_agent_bank: s('nomSSIAgentBank'),
            nom_agent_account: s('nomSSIAgentAccount'),
            nom_interm_bic: s('nomIntermediaryBankBIC'),
            nom_interm_bank: s('nomIntermediaryBankName'),
            nom_interm_account: s('nomIntermediaryAccount'),
            nom_bene_bic: s('nomSSIBeneficiaryBIC'),
            nom_bene_name: s('nomSSIBeneficiary'),
            nom_settlement_account_id: s('nomSettlementAccountID'),

            cp_agent_bic: s('cpSSIAgentBankBIC'),
            cp_agent_bank: s('cpSSIAgentBank'),
            cp_agent_account: s('cpSSIAgentAccount'),
            cp_interm_bic: s('cpSSIIntermediaryBIC'),
            cp_interm_bank: s('cpIntermediaryBankName'),
            cp_interm_account: s('cpSSIIntermediaryAccount'),
            cp_bene_bic: s('cpSSIBeneficiaryBIC'),
            cp_bene_name: s('cpSSIBeneficiary'),
            cp_settlement_account_id: s('cpSettlementAccountID'),

            case_number: s('CaseNumber'),

            // dev masks these. Recorded so the matcher can refuse to key on a masked value rather
            // than matching two different counterparties that happen to share a mask.
            counterparty_masked: (s('Counterparty Name').indexOf('CP Name (') === 0),
            bene_masked: (s('cpSSIBeneficiary').indexOf('Beneficiary Name (') === 0)
        };
    },

    type: 'PcmClient'
};
