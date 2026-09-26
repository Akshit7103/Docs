/**
 * PCM cashflow retrieval - prove the connection from THIS instance, and read what comes back.
 *
 * Run: Background Scripts, Application "Global". One run. It changes nothing.
 *
 * BEFORE YOU RUN IT - create the credential once, in the UI, so the password never passes through a
 * script file or a chat window:
 *
 *   All > System Web Services > REST > Basic Auth Configurations > New
 *      Name      : PCM svcnewsd
 *      Username  : svcnewsd
 *      Password  : <the service account password>
 *   Save.
 *
 * This script finds that record by USERNAME. It never reads, prints or logs the password field - it
 * hands the platform the profile's sys_id and lets the platform do the authenticating.
 *
 * WHAT IT IS ACTUALLY TESTING
 * ---------------------------
 * The endpoint is an INTRANET host (int-intranetws.nomuranow.com) over plain HTTP. A ServiceNow cloud
 * instance has no route to it. So the real question is not "do the credentials work" - the shared test
 * run already returned 200 - but "can THIS instance reach it, and by which path". The script tries
 * direct first, and if that fails on transport it retries through a MID server. The MID path is the one
 * Chinou already uses, so we know it can see the intranet; it also means PCM would inherit the same 30
 * second ECC wall, which is why the timing is reported rather than just the status.
 *
 * WHAT IT READS OUT OF THE RESPONSE
 * ---------------------------------
 * Four things that change how the matcher has to be written, and that cannot be settled by looking at
 * a screenshot:
 *
 *   1. Does Notional/Amount carry a sign INDEPENDENT of Direction? The sample response appears to hold
 *      a negative amount on a "Receive" row. Our stored amount takes its sign FROM the direction, and
 *      the matcher compares raw signed values - so if PCM does not follow the same rule, every Pay row
 *      is out by a factor of two and can never match. This is the single most important answer here.
 *   2. Does the Amount tolerance apply to the signed value or the absolute value? The request asks for
 *      50,000 +/- 50,000, i.e. 0 to 100,000. A negative row coming back means PCM compares magnitude.
 *   3. How much of the response is masked in dev. Counterparty Name reads "CP Name (8577922)" in the
 *      sample. If that holds, counterparty-name matching stays blocked in dev exactly as it is with the
 *      synthetic directory - but Counterparty Reference and Nomura Entity Name look real, and either
 *      would be a better key.
 *   4. What CaseNumber means. Unknown. The script reports its distinct values so we can ask.
 *
 * Account numbers are truncated in the output. They are probably synthetic in dev, but there is no
 * reason to print them in full to find out.
 */
(function () {
    var EP = 'http://int-intranetws.nomuranow.com/cts-otc/phoenix/dev/cashmanager-eu/api/ssgai/cashflows';
    var USER = 'svcnewsd';

    // the sample query, exactly as shared
    var PAYLOAD = {
        CounterpartyName: 'CP Name (8577922)',
        Currency: 'GBP',
        Direction: 'Receive',
        Amount: 50000.00,
        AmountTolerance: 50000.00,
        ValueDate: '2026-03-15',
        ValueDateTolerance: 45
    };

    function line() { gs.info('------------------------------------------------------------------'); }
    function pad(s, n) { s = '' + s; while (s.length < n) { s = s + ' '; } return s; }
    function lpad(s, n) { s = '' + s; while (s.length < n) { s = ' ' + s; } return s; }
    function mask(v) {
        v = '' + (v || '');
        if (v.length < 12) { return v; }
        return v.substring(0, 6) + '...' + v.substring(v.length - 4);
    }
    function days(a, b) {   // a, b as YYYY-MM-DD -> whole days between
        function n(d) {
            var p = ('' + d).split('-');
            return Date.UTC(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
        }
        return Math.round((n(a) - n(b)) / 86400000);
    }

    gs.info('instance : ' + gs.getProperty('instance_name', '?'));
    gs.info('endpoint : ' + EP);
    gs.info('payload  : ' + JSON.stringify(PAYLOAD));

    // ---------------------------------------------------------------- 1. credential
    line();
    gs.info('1. CREDENTIAL');
    var profId = null, profName = '';
    var c = new GlideRecord('sys_auth_profile_basic');
    c.addQuery('user_name', USER);
    c.orderByDesc('sys_updated_on');
    c.query();
    var n = 0;
    while (c.next()) {
        n++;
        if (!profId) { profId = c.getUniqueValue(); profName = '' + c.getValue('name'); }
        gs.info('   found  "' + c.getValue('name') + '"  username=' + c.getValue('user_name'));
    }
    if (!profId) {
        gs.error('ABORT. No Basic Auth Configuration exists with username "' + USER + '".');
        gs.error('Create it first:');
        gs.error('   All > System Web Services > REST > Basic Auth Configurations > New');
        gs.error('   Name "PCM svcnewsd", Username "' + USER + '", Password <the service account one>.');
        gs.error('Nothing was sent.');
        return;
    }
    if (n > 1) { gs.warn('   ' + n + ' profiles share this username - using the most recently updated.'); }
    gs.info('   using  "' + profName + '"  (password never read by this script)');

    // ---------------------------------------------------------------- 2. call
    function attempt(midName) {
        var how = midName ? ('via MID server "' + midName + '"') : 'direct from the instance';
        gs.info('   trying ' + how + ' ...');
        var t0 = new GlideDateTime().getNumericValue();
        var out = { how: how, mid: midName || '' };
        try {
            var r = new sn_ws.RESTMessageV2();
            r.setHttpMethod('post');
            r.setEndpoint(EP);
            r.setRequestHeader('Content-Type', 'application/json');
            r.setRequestHeader('Accept', 'application/json');
            r.setAuthenticationProfile('basic', profId);
            r.setRequestBody(JSON.stringify(PAYLOAD));
            r.setHttpTimeout(30000);
            if (midName) { r.setMIDServer(midName); }
            var resp = r.execute();
            out.ms = new GlideDateTime().getNumericValue() - t0;
            out.status = parseInt(resp.getStatusCode(), 10);
            out.body = '' + resp.getBody();
            out.err = '' + (resp.haveError() ? resp.getErrorMessage() : '');
        } catch (e) {
            out.ms = new GlideDateTime().getNumericValue() - t0;
            out.status = 0;
            out.body = '';
            out.err = 'exception: ' + (e.message || e);
        }
        gs.info('   -> status ' + out.status + ' in ' + out.ms + 'ms' +
            (out.err ? ('   error: ' + out.err.substring(0, 180)) : '') +
            (out.body ? ('   body ' + out.body.length + ' chars') : ''));
        return out;
    }

    line();
    gs.info('2. CALL');
    var res = attempt(null);

    if (res.status !== 200) {
        gs.info('');
        gs.info('   direct did not work. The endpoint is an intranet host, so that is the expected');
        gs.info('   outcome on a cloud instance. Looking for a MID server to route through.');
        var mids = [];
        var m = new GlideRecord('ecc_agent');
        m.addQuery('status', 'Up');
        m.query();
        while (m.next()) { mids.push('' + m.getValue('name')); }
        if (!mids.length) {
            gs.error('   No MID server is Up on this instance. Nothing left to try.');
        } else {
            gs.info('   MID servers Up: ' + mids.join(', '));
            for (var k = 0; k < mids.length && res.status !== 200; k++) {
                res = attempt(mids[k]);
            }
        }
    }

    line();
    gs.info('3. RESULT');
    if (res.status !== 200) {
        gs.error('   NO SUCCESSFUL RETRIEVAL. Last attempt: ' + res.how);
        gs.error('   status ' + res.status + '   ' + res.err.substring(0, 400));
        gs.info('');
        gs.info('   How to read the failure:');
        gs.info('     401  the credential is wrong or the account is locked - endpoint is fine');
        gs.info('     403  authenticated but not entitled to this path');
        gs.info('     0 / UnknownHost / timeout   no network route. If the MID attempts also failed,');
        gs.info('          the MID server can reach Chinou but not this host, which is a firewall');
        gs.info('          question for Nomura, not a ServiceNow one.');
        return;
    }
    gs.info('   SUCCESS ' + res.how + ' in ' + res.ms + 'ms');
    if (res.mid && res.ms > 25000) {
        gs.warn('   That is close to the 30s ECC wall. Over the MID path a broader query could be cut');
        gs.warn('   off mid-flight, the same failure mode as the extraction chunks. Keep tolerances');
        gs.warn('   tight, or this needs the same treatment.');
    }

    // ---------------------------------------------------------------- 4. read the payload
    var rowsArr = null;
    try { rowsArr = JSON.parse(res.body); } catch (ep) {
        gs.error('   response is not JSON: ' + res.body.substring(0, 300));
        return;
    }
    if (!rowsArr || typeof rowsArr.length !== 'number') {
        gs.warn('   response is not an array. Top-level keys: ');
        for (var kk in rowsArr) { gs.info('      ' + kk); }
        return;
    }

    line();
    gs.info('4. WHAT CAME BACK');
    gs.info('   rows: ' + rowsArr.length);
    if (!rowsArr.length) {
        gs.warn('   Zero rows. The call works but this query matched nothing - widen the tolerances');
        gs.warn('   or use a counterparty/date that exists in dev.');
        return;
    }

    // field set, and whether every row agrees
    var keys = [], first = rowsArr[0];
    for (var f in first) { keys.push(f); }
    gs.info('   fields per row: ' + keys.length);
    var ragged = 0;
    for (var i = 1; i < rowsArr.length; i++) {
        var c2 = 0;
        for (var f2 in rowsArr[i]) { c2++; }
        if (c2 !== keys.length) { ragged++; }
    }
    gs.info('   rows with a different field count: ' + ragged +
        (ragged ? '   (the mapper must not assume a fixed shape)' : ''));
    gs.info('');
    for (var q = 0; q < keys.length; q++) {
        var val = '' + (first[keys[q]] === null || first[keys[q]] === undefined ? '' : first[keys[q]]);
        if (keys[q].toLowerCase().indexOf('account') > -1) { val = mask(val); }
        gs.info('      ' + pad(keys[q], 28) + (val === '' ? '(empty)' : val.substring(0, 60)));
    }

    // ---------------------------------------------------------------- 5. the four questions
    line();
    gs.info('5. THE THINGS THAT DECIDE HOW THE MATCHER IS WRITTEN');

    function get(row, name) {
        if (row[name] !== undefined) { return row[name]; }
        for (var z in row) { if (('' + z).toLowerCase() === name.toLowerCase()) { return row[z]; } }
        return undefined;
    }

    // Q1 - does the sign follow Direction?
    var recvNeg = 0, payPos = 0, recv = 0, pay = 0, noAmt = 0;
    for (var a1 = 0; a1 < rowsArr.length; a1++) {
        var d1 = ('' + (get(rowsArr[a1], 'Direction') || '')).toLowerCase();
        var v1 = get(rowsArr[a1], 'Notional/Amount');
        if (v1 === undefined || v1 === null || v1 === '') { noAmt++; continue; }
        v1 = parseFloat(v1);
        if (d1.indexOf('receive') === 0) { recv++; if (v1 < 0) { recvNeg++; } }
        else if (d1.indexOf('pay') === 0) { pay++; if (v1 > 0) { payPos++; } }
    }
    gs.info('   Q1 sign vs direction');
    gs.info('      Receive rows: ' + recv + ', of which NEGATIVE: ' + recvNeg);
    gs.info('      Pay rows    : ' + pay + ', of which POSITIVE: ' + payPos);
    if (recvNeg || payPos) {
        gs.warn('      -> PCM does NOT derive the sign from Direction. Our stored amount does.');
        gs.warn('         The matcher must compare on MAGNITUDE plus Direction, not on the raw signed');
        gs.warn('         value, or every disagreeing row is unmatchable.');
    } else {
        gs.info('      -> consistent with our convention (Receive positive, Pay negative).');
    }

    // Q2 - is the amount tolerance signed or absolute?
    var lo = PAYLOAD.Amount - PAYLOAD.AmountTolerance, hi = PAYLOAD.Amount + PAYLOAD.AmountTolerance;
    var outSigned = 0, outAbs = 0;
    for (var a2 = 0; a2 < rowsArr.length; a2++) {
        var v2 = parseFloat(get(rowsArr[a2], 'Notional/Amount'));
        if (isNaN(v2)) { continue; }
        if (v2 < lo || v2 > hi) { outSigned++; }
        if (Math.abs(v2) < lo || Math.abs(v2) > hi) { outAbs++; }
    }
    gs.info('   Q2 amount tolerance - asked for ' + PAYLOAD.Amount + ' +/- ' + PAYLOAD.AmountTolerance +
        '  (signed window ' + lo + ' to ' + hi + ')');
    gs.info('      rows outside that window by SIGNED value  : ' + outSigned);
    gs.info('      rows outside that window by ABSOLUTE value: ' + outAbs);
    if (outSigned > 0 && outAbs === 0) {
        gs.info('      -> PCM applies the tolerance to the MAGNITUDE. Send an unsigned Amount.');
    } else if (outSigned === 0) {
        gs.info('      -> cannot tell from this response; every row fits either way. Re-probe with a');
        gs.info('         tighter tolerance to settle it.');
    }

    // Q3 - how much is masked
    var maskedCp = 0, blankRef = 0, ents = {}, ccy = {}, dirs = {}, prods = {}, cases = {};
    for (var a3 = 0; a3 < rowsArr.length; a3++) {
        var r3 = rowsArr[a3];
        var cp = '' + (get(r3, 'Counterparty Name') || '');
        if (cp.indexOf('CP Name (') === 0) { maskedCp++; }
        if (!('' + (get(r3, 'Counterparty Reference') || ''))) { blankRef++; }
        ents['' + (get(r3, 'Nomura Entity Name') || '(blank)')] = 1;
        ccy['' + (get(r3, 'Currency') || '(blank)')] = 1;
        dirs['' + (get(r3, 'Direction') || '(blank)')] = 1;
        prods['' + (get(r3, 'Product') || '(blank)')] = 1;
        cases['' + (get(r3, 'CaseNumber') === undefined ? '(absent)' : get(r3, 'CaseNumber'))] = 1;
    }
    function list(o) { var s = []; for (var z in o) { s.push(z); } return s.join(', '); }
    gs.info('   Q3 what is usable as a matching key in dev');
    gs.info('      Counterparty Name masked as "CP Name (nnn)" : ' + maskedCp + ' of ' + rowsArr.length);
    gs.info('      Counterparty Reference BLANK                : ' + blankRef + ' of ' + rowsArr.length);
    gs.info('      distinct Nomura Entity Name : ' + list(ents));
    gs.info('      distinct Currency           : ' + list(ccy));
    gs.info('      distinct Direction          : ' + list(dirs));
    gs.info('      distinct Product            : ' + list(prods));
    if (maskedCp === rowsArr.length) {
        gs.warn('      -> counterparty NAME is unusable as a key in dev, the same wall the synthetic');
        gs.warn('         directory already puts us behind. Counterparty Reference is the candidate,');
        gs.warn('         if our mails carry it; Nomura Entity Name looks real and would finally make');
        gs.warn('         entity matching possible.');
    }

    // Q4 - CaseNumber
    gs.info('   Q4 CaseNumber distinct values: ' + list(cases) + '   (meaning still to be confirmed)');

    // value dates actually returned
    var minD = null, maxD = null;
    for (var a4 = 0; a4 < rowsArr.length; a4++) {
        var vd = '' + (get(rowsArr[a4], 'Value Date') || '');
        if (!vd) { continue; }
        if (!minD || vd < minD) { minD = vd; }
        if (!maxD || vd > maxD) { maxD = vd; }
    }
    if (minD) {
        gs.info('   value dates returned: ' + minD + ' to ' + maxD +
            '   (asked ' + PAYLOAD.ValueDate + ' +/- ' + PAYLOAD.ValueDateTolerance + ' days, so ' +
            days(minD, PAYLOAD.ValueDate) + ' to ' + days(maxD, PAYLOAD.ValueDate) + ' days out)');
    }

    // ---------------------------------------------------------------- 6. sample rows
    line();
    gs.info('6. FIRST FEW ROWS');
    gs.info('   ' + pad('CASHFLOW ID', 13) + pad('CPTY REF', 22) + lpad('AMOUNT', 15) + '  ' +
        pad('CCY', 5) + pad('DIR', 9) + pad('VALUE DATE', 12) + 'ENTITY');
    for (var a5 = 0; a5 < rowsArr.length && a5 < 8; a5++) {
        var r5 = rowsArr[a5];
        gs.info('   ' + pad(get(r5, 'Cashflow Id'), 13) +
            pad(('' + (get(r5, 'Counterparty Reference') || '-')).substring(0, 20), 22) +
            lpad(get(r5, 'Notional/Amount'), 15) + '  ' +
            pad(get(r5, 'Currency'), 5) + pad(get(r5, 'Direction'), 9) +
            pad(get(r5, 'Value Date'), 12) + (get(r5, 'Nomura Entity Name') || '-'));
    }
    if (rowsArr.length > 8) { gs.info('   ... and ' + (rowsArr.length - 8) + ' more'); }

    line();
    gs.info('Retrieval proven. Next: a PcmClient Script Include in Global (public, so all four scopes');
    gs.info('can call it) wrapping this request, then the field mapping onto the booking table.');
    gs.info('Nothing was written by this script.');
})();
