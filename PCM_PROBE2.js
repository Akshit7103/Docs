/**
 * PCM probe 2 - exercise PcmClient, and settle the two questions probe 1 could not.
 *
 * Run: Background Scripts, Application "Global". One run. It changes nothing in PCM or on the instance.
 *
 * Probe 1 proved the route (MID server, 200 in 764ms, 6 rows) but left two things open, both because
 * of what the query happened to ask for rather than any fault in the API:
 *
 *   Q1  Every row came back Direction "Receive" and positive - because the query ASKED for Receive.
 *       Zero Pay rows were seen, so how PCM signs a Pay is still unknown. Our stored amount takes its
 *       sign from the direction, and the matcher compares signed values, so this decides whether the
 *       two can be compared at all.
 *
 *   Q2  The amount tolerance asked for 50,000 +/- 50,000, a window of 0 to 100,000. Every row fitted
 *       that window whether you compare the signed value or the magnitude, so the response could not
 *       distinguish the two. Call E below settles it with one clean test: ask for a NEGATIVE amount
 *       that is the exact negative of a row we know exists. If the row comes back, PCM compares
 *       magnitude. If nothing comes back, it compares the signed value.
 *
 * It also answers two practical questions that shape how the matcher can query at all:
 *
 *   - Is CounterpartyName mandatory? In dev it is masked to "CP Name (8577922)", so if it is required
 *     we can only query for counterparties whose mask we already know - which is useless against a
 *     real mail. Call F drops it and sees what happens.
 *   - Do the filters actually filter? Call D asks for one exact amount on one exact date. If that
 *     returns the whole set, the criteria are advisory and all the narrowing has to happen our side.
 *
 * PREREQUISITE: PcmClient installed as a Script Include in Global, Accessible from All application
 * scopes. This script checks that before it does anything else.
 *
 * The known row it anchors on, from probe 1:
 *    Cashflow Id 89684970   GBP   Receive   38730.3   value date 2026-02-02
 */
(function () {
    var KNOWN_AMT = 38730.30;
    var KNOWN_DATE = '2026-02-02';
    var KNOWN_CP = 'CP Name (8577922)';
    var KNOWN_ID = '89684970';

    function line() { gs.info('------------------------------------------------------------------'); }
    function pad(s, n) { s = '' + s; while (s.length < n) { s = s + ' '; } return s; }
    function lpad(s, n) { s = '' + s; while (s.length < n) { s = ' ' + s; } return s; }
    var pass = 0, fail = 0;
    function P(l, d) { pass++; gs.info('   PASS  ' + l + (d ? '   ' + d : '')); }
    function F(l, d) { fail++; gs.error('   FAIL  ' + l + (d ? '   ' + d : '')); }

    gs.info('instance : ' + gs.getProperty('instance_name', '?'));

    // ---------------------------------------------------------------- 0. is the client installed
    line();
    gs.info('0. PcmClient');
    var si = new GlideRecord('sys_script_include');
    si.addQuery('name', 'PcmClient');
    si.query();
    var found = 0, access = '', scope = '', active = '';
    while (si.next()) {
        found++;
        access = '' + si.getValue('access');
        active = '' + si.getValue('active');
        scope = '' + si.sys_scope.scope;
    }
    if (!found) {
        gs.error('ABORT. No Script Include named PcmClient. Create it in Global first.');
        return;
    }
    gs.info('   copies: ' + found + '   scope: ' + scope + '   active: ' + active + '   access: ' + access);
    if (scope === 'global' || scope === 'rhino.global') { P('lives in Global'); }
    else { F('lives in ' + scope, 'it should be Global so all four scopes share one copy'); }
    if (access === 'public') { P('Accessible from: All application scopes'); }
    else {
        F('access is "' + access + '"',
          'the scoped apps cannot call it. Set "Accessible from" to "All application scopes"');
    }

    var pcm;
    try { pcm = new PcmClient(); } catch (e) {
        gs.error('ABORT. Could not instantiate PcmClient: ' + (e.message || e));
        return;
    }
    gs.info('   endpoint  : ' + pcm.endpoint);
    gs.info('   credential: ' + pcm.credName);
    gs.info('   timeout   : ' + pcm.timeoutMs + 'ms');

    // ---------------------------------------------------------------- run the calls
    var CALLS = [
        { id: 'A', what: 'baseline - repeat probe 1 exactly',
          c: { CounterpartyName: KNOWN_CP, Currency: 'GBP', Direction: 'Receive',
               Amount: 50000.00, AmountTolerance: 50000.00,
               ValueDate: '2026-03-15', ValueDateTolerance: 45 } },

        { id: 'B', what: 'Direction = Pay - do Pay rows exist, and how are they signed',
          c: { CounterpartyName: KNOWN_CP, Currency: 'GBP', Direction: 'Pay',
               Amount: 50000.00, AmountTolerance: 50000.00,
               ValueDate: '2026-03-15', ValueDateTolerance: 45 } },

        { id: 'C', what: 'Direction omitted - does it return both sides',
          c: { CounterpartyName: KNOWN_CP, Currency: 'GBP',
               Amount: 50000.00, AmountTolerance: 50000.00,
               ValueDate: '2026-03-15', ValueDateTolerance: 45 } },

        { id: 'D', what: 'one exact amount on one exact date - do the filters really filter',
          c: { CounterpartyName: KNOWN_CP, Currency: 'GBP', Direction: 'Receive',
               Amount: KNOWN_AMT, AmountTolerance: 0.01,
               ValueDate: KNOWN_DATE, ValueDateTolerance: 0 } },

        { id: 'E', what: 'the SAME row asked for as a NEGATIVE amount - signed or magnitude',
          c: { CounterpartyName: KNOWN_CP, Currency: 'GBP', Direction: 'Receive',
               Amount: -KNOWN_AMT, AmountTolerance: 0.01,
               ValueDate: KNOWN_DATE, ValueDateTolerance: 0 } },

        { id: 'F', what: 'CounterpartyName omitted - is it mandatory',
          c: { Currency: 'GBP', Direction: 'Receive',
               Amount: KNOWN_AMT, AmountTolerance: 0.01,
               ValueDate: KNOWN_DATE, ValueDateTolerance: 0 } }
    ];

    line();
    gs.info('1. CALLS');
    var R = {};
    for (var i = 0; i < CALLS.length; i++) {
        var call = CALLS[i];
        var res = pcm.query(call.c);
        R[call.id] = res;
        gs.info('   ' + call.id + '  ' + pad(call.what, 58));
        gs.info('      ' + JSON.stringify(call.c));
        gs.info('      -> status ' + res.status + '  ' + lpad(res.ms, 6) + 'ms  rows ' + res.count +
            (res.error ? ('  error: ' + res.error.substring(0, 140)) : ''));
    }

    // ---------------------------------------------------------------- read the answers
    line();
    gs.info('2. ANSWERS');

    // transport still healthy
    if (R.A.success && R.A.count === 6) { P('baseline reproduces probe 1', '6 rows'); }
    else if (R.A.success) { gs.warn('   baseline returned ' + R.A.count + ' rows, probe 1 saw 6 - data moves, not alarming'); }
    else { F('baseline call failed', R.A.error); }

    var slowest = 0;
    for (var k in R) { if (R[k].ms > slowest) { slowest = R[k].ms; } }
    gs.info('   slowest call: ' + slowest + 'ms against the 30s ECC wall');
    if (slowest < 5000) { P('comfortable margin on the ECC wall'); }
    else { gs.warn('   margin is thinner than expected - watch this as result sets grow'); }

    // Q1 - the sign of a Pay
    gs.info('');
    gs.info('   Q1  HOW PCM SIGNS A PAY');
    if (!R.B.success) {
        F('the Pay query failed', R.B.error);
    } else if (R.B.count === 0) {
        gs.warn('      No Pay rows exist for this counterparty and window, so this STILL cannot be');
        gs.warn('      answered. It is not a failure - it needs a counterparty that has Pay cashflows.');
        gs.warn('      Until then the matcher stays on amount_signed, which is correct either way.');
    } else {
        var neg = 0, pos = 0, agree = 0;
        for (var b = 0; b < R.B.rows.length; b++) {
            var row = R.B.rows[b];
            if (row.amount_raw < 0) { neg++; } else if (row.amount_raw > 0) { pos++; }
            if (row.sign_agrees) { agree++; }
        }
        gs.info('      Pay rows: ' + R.B.count + '   negative: ' + neg + '   positive: ' + pos);
        gs.info('      sign already matches our convention on ' + agree + ' of ' + R.B.count);
        if (neg === R.B.count) {
            P('PCM signs a Pay negative - same convention as ours',
              'raw and signed agree, nothing to reconcile');
        } else if (pos === R.B.count) {
            gs.warn('      -> PCM sends Pay as a POSITIVE number. Its amount is a magnitude and the');
            gs.warn('         direction carries the sign separately. Our stored amount is signed.');
            gs.warn('         Comparing raw to raw would put every Pay row out by a factor of two;');
            gs.warn('         amount_signed already handles it, and nothing else should be compared.');
        } else {
            F('Pay rows are signed INCONSISTENTLY', neg + ' negative and ' + pos + ' positive');
            gs.error('      This is worth raising with Nomura before building on it.');
        }
    }

    // Q2 - signed or magnitude in the tolerance
    gs.info('');
    gs.info('   Q2  DOES THE AMOUNT TOLERANCE USE THE SIGNED VALUE OR THE MAGNITUDE');
    if (!R.D.success || !R.E.success) {
        F('one of the two calls failed', 'D: ' + R.D.error + '  E: ' + R.E.error);
    } else {
        gs.info('      D  asked +' + KNOWN_AMT + ' -> ' + R.D.count + ' row(s)');
        gs.info('      E  asked -' + KNOWN_AMT + ' -> ' + R.E.count + ' row(s)');
        if (R.D.count > 0 && R.E.count > 0) {
            P('PCM matches on MAGNITUDE', 'the sign of the Amount we send is ignored');
            gs.info('      -> send Math.abs(amount) and let Direction carry the side.');
        } else if (R.D.count > 0 && R.E.count === 0) {
            P('PCM matches on the SIGNED value', 'the sign we send matters');
            gs.info('      -> send amount_signed, not the magnitude, or Pay rows will never be found.');
        } else if (R.D.count === 0) {
            gs.warn('      D found nothing for an amount we know exists. Either the tolerance is too');
            gs.warn('      tight for its rounding, or the filters do not work the way we assume.');
        }
    }

    // do the filters filter at all
    gs.info('');
    gs.info('   Q2b DO THE FILTERS ACTUALLY NARROW');
    if (R.A.success && R.D.success) {
        gs.info('      wide query -> ' + R.A.count + ' rows, exact query -> ' + R.D.count + ' rows');
        if (R.D.count < R.A.count) {
            P('the criteria genuinely filter server side');
        } else if (R.D.count === R.A.count) {
            F('the exact query returned just as many rows as the wide one',
              'the criteria may be advisory - all narrowing would have to happen our side');
        }
        if (R.D.count === 1 && R.D.rows[0].pcm_id === KNOWN_ID) {
            P('the exact query returned exactly the expected row', 'Cashflow Id ' + KNOWN_ID);
        }
    }

    // Q3 - is counterparty mandatory
    gs.info('');
    gs.info('   Q3  IS CounterpartyName MANDATORY');
    if (!R.F.success) {
        gs.info('      omitting it gave status ' + R.F.status + ': ' + R.F.error.substring(0, 160));
        gs.warn('      -> it looks required. In dev the name is masked, so we could only ever query');
        gs.warn('         for a counterparty whose mask we already know - which a real mail will not');
        gs.warn('         give us. That is a blocker worth raising, not a detail.');
    } else {
        gs.info('      omitting it returned ' + R.F.count + ' row(s)');
        if (R.F.count > 0) {
            P('CounterpartyName is OPTIONAL',
              'we can query on amount, currency, direction and date alone');
            gs.info('      -> this matters more than it looks. It means the masked counterparty name');
            gs.info('         does NOT block us: match on the economics, then use the returned');
            gs.info('         counterparty only to confirm.');
        } else {
            gs.warn('      accepted but returned nothing - it may be silently required.');
        }
    }

    // Q4 - direction omitted
    gs.info('');
    gs.info('   Q4  IS Direction OPTIONAL');
    if (R.C.success) {
        gs.info('      omitted -> ' + R.C.count + ' rows, vs ' + R.A.count + ' for Receive and ' +
            R.B.count + ' for Pay');
        if (R.C.count >= R.A.count + R.B.count && R.C.count > 0) {
            P('omitting Direction returns both sides');
        } else if (R.C.count === R.A.count) {
            gs.info('      -> same count as Receive alone; either there are no Pay rows here or it');
            gs.info('         defaults to Receive. Re-check once a Pay row is known to exist.');
        }
    } else { gs.info('      failed: ' + R.C.error.substring(0, 160)); }

    // ---------------------------------------------------------------- normalisation sanity
    line();
    gs.info('3. NORMALISATION - what the matcher will actually receive');
    if (R.A.success && R.A.count) {
        var r0 = R.A.rows[0];
        var show = ['pcm_id', 'counterparty', 'counterparty_masked', 'counterparty_ref',
                    'nomura_entity', 'currency', 'direction',
                    'amount_raw', 'amount_signed', 'sign_agrees',
                    'trade_date', 'value_date', 'case_number',
                    'nom_agent_bic', 'nom_bene_bic', 'cp_agent_bic', 'cp_bene_bic'];
        for (var sI = 0; sI < show.length; sI++) {
            var vv = r0[show[sI]];
            gs.info('      ' + pad(show[sI], 22) + (vv === '' ? '(empty)' : vv));
        }
        var refBlank = 0, cpMasked = 0;
        for (var z = 0; z < R.A.rows.length; z++) {
            if (!R.A.rows[z].counterparty_ref) { refBlank++; }
            if (R.A.rows[z].counterparty_masked) { cpMasked++; }
        }
        gs.info('');
        gs.info('      counterparty_ref blank : ' + refBlank + ' of ' + R.A.count);
        gs.info('      counterparty masked    : ' + cpMasked + ' of ' + R.A.count);
        if (refBlank > 0) {
            gs.warn('      -> Counterparty Reference cannot be the join key either. It was the obvious');
            gs.warn('         fallback once the name turned out to be masked, and it is blank on ' +
                    refBlank + ' of ' + R.A.count + '.');
        }
    }

    line();
    gs.info('RESULT: ' + pass + ' passed, ' + fail + ' failed');
    gs.info('Nothing was written. No PCM record was modified - this API is retrieval only.');
})();
