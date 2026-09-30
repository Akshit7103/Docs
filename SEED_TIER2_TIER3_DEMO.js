/**
 * SEED THE TIER 2 / TIER 3 SHOWCASE  -  run ONCE in Background Scripts on nomurabsmdev.
 *
 * RUN WITH: Application = NexAI OTC BSM   (the scope named in SCOPE below)
 *   These are the application's OWN data tables. Scoped data tables refuse writes from Global, so
 *   this must run INSIDE the scope - the opposite of the metadata scripts, which must run from Global.
 *
 * WHAT IT CREATES
 *   4 mails, 1 cashflow each, and 20 booking rows in the golden source:
 *
 *     TIER2-01.eml   JP Morgan          USD 2,500,000.00  15-Oct-2026   -> Tier 2, 5 candidates
 *     TIER2-02.eml   Deutsche Bank      EUR 1,750,000.00  22-Oct-2026   -> Tier 2, 5 candidates
 *     TIER3-01.eml   Standard Chartered HKD 6,400,000.00  20-Oct-2026   -> Tier 3, 5 candidates
 *     TIER3-02.eml   UBS AG             SGD 1,250,000.00  27-Oct-2026   -> Tier 3, 5 candidates
 *
 *   Every counterparty is a REAL institution name, so the screen can be shown to Nomura without the
 *   "Counterparty5" placeholders. Each mail gets a plain-text .eml attachment, which is what fills the
 *   Classification and Time Elapsed columns on the board and the mail-contents panel on the case screen.
 *
 * WHY THE DATA IS SHAPED THE WAY IT IS  -  this is the part to read before editing any number.
 *
 *   The cascade in CompareMatch stops at the FIRST tier that returns anything:
 *     Tier 1  currency + direction + value date EXACT + amount EXACT + counterparty EXACT
 *     Tier 2  currency + direction exact, counterparty FUZZY, value date +/- 2 BUSINESS days,
 *             amount within +/- 50.00 raw currency units
 *     Tier 3  currency + direction + value date EXACT + amount EXACT, counterparty filter DROPPED
 *
 *   TIER 2 - to reach Tier 2, Tier 1 must find nothing. Tier 1 needs the counterparty to be EXACTLY
 *   equal after normalisation (lower-case, strip everything but letters and digits). So the mail says
 *   "JP Morgan" and NO booking is named exactly that - every candidate is a longer legal variant.
 *   The fuzzy test is containment first, Levenshtein second: "jpmorgan" is a substring of
 *   "jpmorganchase", "jpmorgansecuritiesplc" and the rest, so all five pass on containment and never
 *   reach the 0.85 similarity threshold at all. That is why this set is robust - it does not depend on
 *   a similarity score landing above a cutoff.
 *
 *   TIER 3 - Tiers 1 and 2 must BOTH find nothing. The mail's counterparty is a real name that shares
 *   no substring with any booking ("Standard Chartered" against Barclays, HSBC, BNP Paribas, Societe
 *   Generale, Mizuho - measured similarity 0.10 to 0.18, far below 0.85). Tier 3 then drops the
 *   counterparty and requires amount and value date to be EXACT, which is why all five Tier 3
 *   candidates carry the identical amount and date and differ only in name.
 *
 *   The Tier 2 amount deltas are 0.00 / 12.50 / 30.00 / 45.00 / 50.00 and the date offsets are
 *   0 / 0 / +1 / -1 / +2 business days - deliberately spread across the tolerance so the demo shows
 *   the window doing its job, with one candidate sitting exactly ON the 50.00 limit.
 *
 *   Ranking is counterparty-exact first, then smallest amount delta, then smallest date delta, then
 *   positive date difference before negative. The 0.00 / same-day candidate therefore lands first and
 *   carries the AI TOP MATCH badge.
 *
 * TOLERANCES
 *   The code's built-in defaults are amount +/- 50.00, value date +/- 2 BUSINESS days, name similarity
 *   0.85. Those can be overridden per work driver in the config store, so this script READS the
 *   effective values first and stops if they no longer match what the data was designed against.
 *
 * SAFE TO RE-RUN. It deletes its own rows first, by marker, and touches nothing else.
 * Pure ASCII. ES5.
 */
(function () {

    var SCOPE = 'x_nose_nfotc_bsm';

    // Marker carried by every row this script creates, so a re-run can clean up after itself.
    var TAG = 'DEMO-TIER';

    var EMAIL = SCOPE + '_email';
    var CASHFLOW = SCOPE + '_cashflow';
    var BOOKING = SCOPE + '_booking';
    var CPTY = SCOPE + '_counterparty';

    var log = [];
    function p(s) { log.push(s); }
    function pad(s, n) { s = '' + s; while (s.length < n) { s += ' '; } return s; }
    function money(n) {
        var x = ('' + n).split('.');
        var w = x[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        return w + '.' + ((x[1] || '') + '00').substring(0, 2);
    }

    p('=================================================================');
    p('SEED TIER 2 / TIER 3 SHOWCASE   scope ' + SCOPE);
    p('=================================================================');

    // ---------------------------------------------------------------- scope guard
    var here = '' + gs.getCurrentScopeName();
    if (here !== SCOPE) {
        p('');
        p('!! WRONG SCOPE. Current = "' + here + '", needs "' + SCOPE + '".');
        p('   These are scoped DATA tables - they refuse writes from Global and from other scopes.');
        p('   Set the Application picker to the NexAI OTC BSM application and run again.');
        p('   Nothing was changed.');
        gs.info('\n' + log.join('\n'));
        return;
    }

    // ---------------------------------------------------------------- the data
    // amt / vd offsets are relative to the cashflow; see the header for why each value is what it is.
    var MAILS = [
        {
            id: 'TIER2-01', tier: 2,
            cp: 'JP Morgan',
            cpEntity: 'JPMorgan Chase Bank, N.A. London Branch',
            from: 'settlements@jpmorgan-demo.com',
            ccy: 'USD', dirn: 'Receive', amt: '2500000.00', vd: '2026-10-15',
            sent: 'Mon, 05 Oct 2026 09:14:00 +0100',
            product: 'FX Forward', cfType: 'Net Settlement',
            ref: 'JPM-FX-884120',
            ssiBank: 'JPMORGAN CHASE BANK NA', ssiAcct: '0011-45872-991', ssiBic: 'CHASGB2LXXX',
            books: [
                { cp: 'JP Morgan Chase',            amt: '2500000.00', vd: '2026-10-15', sys: 'System 1', ref: 'NB-930101' },
                { cp: 'JPMorgan Chase & Co.',       amt: '2500012.50', vd: '2026-10-15', sys: 'System 3', ref: 'NB-930102' },
                { cp: 'J.P. Morgan Securities plc', amt: '2499970.00', vd: '2026-10-16', sys: 'System 1', ref: 'NB-930103' },
                { cp: 'JPMorgan Chase Bank, N.A.',  amt: '2500045.00', vd: '2026-10-14', sys: 'System 2', ref: 'NB-930104' },
                { cp: 'JP Morgan AG',               amt: '2500050.00', vd: '2026-10-19', sys: 'System 3', ref: 'NB-930105' }
            ]
        },
        {
            id: 'TIER2-02', tier: 2,
            cp: 'Deutsche Bank',
            cpEntity: 'Deutsche Bank AG, Frankfurt',
            from: 'otc.settlements@deutschebank-demo.com',
            ccy: 'EUR', dirn: 'Receive', amt: '1750000.00', vd: '2026-10-22',
            sent: 'Mon, 12 Oct 2026 08:32:00 +0200',
            product: 'Interest Rate Swap', cfType: 'Coupon',
            ref: 'DB-IRS-552901',
            ssiBank: 'DEUTSCHE BANK AG', ssiAcct: 'DE89-3704-0044-0532', ssiBic: 'DEUTDEFFXXX',
            books: [
                { cp: 'Deutsche Bank AG',                     amt: '1750000.00', vd: '2026-10-22', sys: 'System 2', ref: 'NB-930201' },
                { cp: 'Deutsche Bank AG London Branch',       amt: '1749980.00', vd: '2026-10-22', sys: 'System 2', ref: 'NB-930202' },
                { cp: 'Deutsche Bank Securities Inc.',        amt: '1750035.00', vd: '2026-10-23', sys: 'System 1', ref: 'NB-930203' },
                { cp: 'Deutsche Bank Trust Company Americas', amt: '1750050.00', vd: '2026-10-21', sys: 'System 4', ref: 'NB-930204' },
                { cp: 'Deutsche Bank Luxembourg S.A.',        amt: '1750005.00', vd: '2026-10-26', sys: 'System 2', ref: 'NB-930205' }
            ]
        },
        {
            id: 'TIER3-01', tier: 3,
            cp: 'Standard Chartered',
            cpEntity: 'Standard Chartered Bank (Hong Kong) Limited',
            from: 'settlements@standardchartered-demo.com',
            ccy: 'HKD', dirn: 'Receive', amt: '6400000.00', vd: '2026-10-20',
            sent: 'Fri, 09 Oct 2026 10:05:00 +0800',
            product: 'Commodity Swap', cfType: 'Settlement',
            ref: 'SCB-CS-770418',
            ssiBank: 'STANDARD CHARTERED BANK HK', ssiAcct: '447-882-11930-4', ssiBic: 'SCBLHKHHXXX',
            books: [
                { cp: 'Barclays Bank PLC',   amt: '6400000.00', vd: '2026-10-20', sys: 'System 1', ref: 'NB-930301' },
                { cp: 'HSBC Bank plc',       amt: '6400000.00', vd: '2026-10-20', sys: 'System 1', ref: 'NB-930302' },
                { cp: 'BNP Paribas SA',      amt: '6400000.00', vd: '2026-10-20', sys: 'System 3', ref: 'NB-930303' },
                { cp: 'Societe Generale SA', amt: '6400000.00', vd: '2026-10-20', sys: 'System 1', ref: 'NB-930304' },
                { cp: 'Mizuho Bank, Ltd.',   amt: '6400000.00', vd: '2026-10-20', sys: 'System 2', ref: 'NB-930305' }
            ]
        },
        {
            id: 'TIER3-02', tier: 3,
            cp: 'UBS AG',
            cpEntity: 'UBS AG, Singapore Branch',
            from: 'otc.ops@ubs-demo.com',
            ccy: 'SGD', dirn: 'Receive', amt: '1250000.00', vd: '2026-10-27',
            sent: 'Fri, 16 Oct 2026 14:48:00 +0800',
            product: 'FX Swap', cfType: 'Net Settlement',
            ref: 'UBS-FXS-306677',
            ssiBank: 'UBS AG SINGAPORE', ssiAcct: 'SG55-UBSW-3300-9821', ssiBic: 'UBSWSGSGXXX',
            books: [
                { cp: 'Citibank N.A.',                          amt: '1250000.00', vd: '2026-10-27', sys: 'System 3', ref: 'NB-930401' },
                { cp: 'Goldman Sachs International',            amt: '1250000.00', vd: '2026-10-27', sys: 'System 1', ref: 'NB-930402' },
                { cp: 'Morgan Stanley & Co. International plc', amt: '1250000.00', vd: '2026-10-27', sys: 'System 1', ref: 'NB-930403' },
                { cp: 'Wells Fargo Bank N.A.',                  amt: '1250000.00', vd: '2026-10-27', sys: 'System 2', ref: 'NB-930404' },
                { cp: 'Royal Bank of Canada',                   amt: '1250000.00', vd: '2026-10-27', sys: 'System 4', ref: 'NB-930405' }
            ]
        }
    ];

    // ---------------------------------------------------------------- 1. effective tolerances
    // The data above was designed against 50.00 / 2 business days / 0.85. A per-driver override in the
    // config store would silently change which tier fires, so check before seeding rather than after.
    var TOL_AMT = 50, TOL_VD = 2, TOL_FUZZ = 0.85;
    try {
        var cfg = new NfotcConfig();
        TOL_AMT = cfg.getNumber('match.t2_amt_abs', '', 50);
        TOL_VD = cfg.getNumber('match.vd_tol_days', '', 2);
        TOL_FUZZ = cfg.getNumber('match.name_fuzzy_pct', '', 0.85);
    } catch (eCfg) {
        p('(config store not readable - assuming the code defaults)');
    }
    p('');
    p('EFFECTIVE TOLERANCES');
    p('   amount        +/- ' + TOL_AMT + '   (raw currency units)');
    p('   value date    +/- ' + TOL_VD + '   BUSINESS days');
    p('   name fuzzy    >= ' + TOL_FUZZ + '  (containment is checked first, so this rarely decides)');
    if (Number(TOL_AMT) !== 50 || Number(TOL_VD) !== 2) {
        p('');
        p('!! These are NOT the values this data was designed against (50 / 2).');
        p('   The Tier 2 candidates may fall outside the window and drop to Tier 3.');
        p('   Either restore the defaults or adjust the amounts and dates above. Nothing was changed.');
        gs.info('\n' + log.join('\n'));
        return;
    }

    // ---------------------------------------------------------------- 2. the work driver
    // wiz_extracted holds the WIZARD SYS_ID, not a flag - it is what puts a mail on a given board.
    var wizId = '', wizName = '';
    var w = new GlideRecord(SCOPE + '_wizard');
    w.addQuery('status', 'published');
    w.orderBy('sys_created_on');
    w.setLimit(1);
    w.query();
    if (!w.next()) {
        p('');
        p('!! No PUBLISHED work driver in ' + SCOPE + '. The mails would have no board to appear on.');
        p('   Publish one first. Nothing was changed.');
        gs.info('\n' + log.join('\n'));
        return;
    }
    wizId = w.getUniqueValue();
    wizName = '' + w.getValue('name');
    p('');
    p('WORK DRIVER   "' + wizName + '"   ' + wizId);

    // ---------------------------------------------------------------- 3. clean up a previous run
    var gone = { email: 0, cashflow: 0, booking: 0, cpty: 0 };
    var i, j;

    for (i = 0; i < MAILS.length; i++) {
        var oldE = new GlideRecord(EMAIL);
        oldE.addQuery('name', MAILS[i].id + '.eml');
        oldE.query();
        while (oldE.next()) {
            var oldC = new GlideRecord(CASHFLOW);
            oldC.addQuery('email', oldE.getUniqueValue());
            oldC.query();
            while (oldC.next()) { oldC.deleteRecord(); gone.cashflow++; }
            oldE.deleteRecord();
            gone.email++;
        }
    }
    var oldB = new GlideRecord(BOOKING);
    oldB.addQuery('cashflow_id', 'STARTSWITH', TAG);
    oldB.query();
    while (oldB.next()) { oldB.deleteRecord(); gone.booking++; }

    if (gone.email || gone.booking) {
        p('');
        p('PREVIOUS RUN REMOVED   ' + gone.email + ' mails, ' + gone.cashflow +
          ' cashflows, ' + gone.booking + ' bookings');
    }

    // ---------------------------------------------------------------- 4. seed
    var made = { email: 0, cashflow: 0, booking: 0, cpty: 0, att: 0 };
    var cfIds = [];

    for (i = 0; i < MAILS.length; i++) {
        var m = MAILS[i];

        // --- the counterparty directory row, so the board's "Counterparty (EVE)" column resolves
        // from the sender address the same way a real mail would.
        var cpq = new GlideRecord(CPTY);
        cpq.addQuery('email_address', m.from);
        cpq.setLimit(1);
        cpq.query();
        if (!cpq.next()) {
            var cpn = new GlideRecord(CPTY);
            cpn.initialize();
            cpn.setValue('email_address', m.from);
            cpn.setValue('org_name', m.cp);
            cpn.setValue('entity', m.cpEntity);
            if (cpn.insert()) { made.cpty++; }
        }

        // --- the mail
        var subject = 'Settlement confirmation - ' + m.ccy + ' ' + money(m.amt) +
                      ' value ' + m.vd + ' - ref ' + m.ref;
        var body =
            'Dear Settlements Team,\n\n' +
            'Please find below the settlement details for the trade referenced above.\n\n' +
            '  Counterparty      : ' + m.cpEntity + '\n' +
            '  Our reference     : ' + m.ref + '\n' +
            '  Product           : ' + m.product + '\n' +
            '  Cashflow type     : ' + m.cfType + '\n' +
            '  Currency          : ' + m.ccy + '\n' +
            '  Amount            : ' + money(m.amt) + '\n' +
            '  Direction         : ' + m.dirn + ' (you receive)\n' +
            '  Value date        : ' + m.vd + '\n\n' +
            'Settlement instructions\n' +
            '  Bank              : ' + m.ssiBank + '\n' +
            '  Account           : ' + m.ssiAcct + '\n' +
            '  BIC               : ' + m.ssiBic + '\n\n' +
            'Please confirm receipt and advise if any detail differs from your records.\n\n' +
            'Regards,\n' +
            'Settlements Operations\n' +
            m.cpEntity + '\n';

        var e = new GlideRecord(EMAIL);
        e.initialize();
        e.setValue('name', m.id + '.eml');
        e.setValue('source', 'demo-seed');
        e.setValue('sender', m.from);
        e.setValue('classification', 'relevant');
        e.setValue('classification_reason', 'demo seed - settlement mail, counterparty in directory');
        e.setValue('counterparty_name', m.cp);        // <- the match key (derived, not AI)
        e.setValue('wiz_extracted', wizId);           // <- puts it on this driver's board
        e.setValue('wiz_intake_state', 'claimed');
        e.setValue('composed_run', TAG + '-' + m.id);
        e.setValue('composed_state', 'done');
        e.setValue('ai_status', 'extracted');
        e.setValue('ai_flow_count', '1');
        e.setValue('ai_reference', m.ref);
        e.setValue('ai_currency', m.ccy);
        e.setValue('ai_amount', m.amt);
        e.setValue('ai_direction', m.dirn);
        e.setValue('ai_value_date', m.vd);
        e.setValue('mail_from', m.from);
        e.setValue('mail_to', 'otc.settlements@nomura.com');
        e.setValue('mail_subject', subject);
        e.setValue('mail_body', body);
        var eId = e.insert();
        if (!eId) {
            p('   !! ' + m.id + '  email insert REFUSED - skipped');
            continue;
        }
        made.email++;

        // --- the .eml attachment.
        // The board reads the mail's Date header from this attachment to fill the Classification
        // (Pre / Post Settlement) and Time Elapsed columns. Without it both render as a dash.
        var eml =
            'From: ' + m.cpEntity + ' <' + m.from + '>\r\n' +
            'To: OTC Settlements <otc.settlements@nomura.com>\r\n' +
            'Subject: ' + subject + '\r\n' +
            'Date: ' + m.sent + '\r\n' +
            'Message-ID: <' + m.id + '.' + m.ref + '@demo.local>\r\n' +
            'MIME-Version: 1.0\r\n' +
            'Content-Type: text/plain; charset=UTF-8\r\n' +
            'Content-Transfer-Encoding: 7bit\r\n' +
            '\r\n' +
            body.replace(/\n/g, '\r\n');
        try {
            var eGr = new GlideRecord(EMAIL);
            if (eGr.get(eId)) {
                new GlideSysAttachment().write(eGr, m.id + '.eml', 'message/rfc822', eml);
                made.att++;
            }
        } catch (eAtt) {
            p('   (attachment for ' + m.id + ' failed: ' + eAtt + ' - the tier demo still works,');
            p('    but Classification and Time Elapsed will show a dash)');
        }

        // --- the cashflow. Both the plain and the ai_ fields are set: the case screen reads the
        // ai_ set, some list views read the plain set.
        var c = new GlideRecord(CASHFLOW);
        c.initialize();
        c.setValue('email', eId);
        c.setValue('flow_index', '1');
        c.setValue('reference', m.ref);
        c.setValue('currency', m.ccy);
        c.setValue('amount', m.amt);
        c.setValue('direction', m.dirn);
        c.setValue('value_date', m.vd);
        c.setValue('ai_reference', m.ref);
        c.setValue('ai_product', m.product);
        c.setValue('ai_currency', m.ccy);
        c.setValue('ai_amount', m.amt);
        c.setValue('ai_direction', m.dirn);
        c.setValue('ai_value_date', m.vd);
        // Both the mail's counterparty_name and the cashflow's ai_counterparty are set to the SAME
        // name on purpose. In this scope the match key is _counterpartyFor(), which prefers
        // ai_counterparty and falls back to the mail's derived name - setting both means the tier
        // outcome is the same whichever one the engine reads.
        c.setValue('ai_counterparty', m.cp);
        c.setValue('ai_ssi_bank', m.ssiBank);
        c.setValue('ai_ssi_account', m.ssiAcct);
        c.setValue('ai_ssi_beneficiary', m.cpEntity);
        c.setValue('ai_sources', 'body');
        // Confirmed, so the Compare & Match panel renders immediately. To demo the confirm step
        // instead, clear ai_confirmed on the cashflow before showing it.
        c.setValue('ai_confirmed', 'true');
        var cId = c.insert();
        if (!cId) {
            p('   !! ' + m.id + '  cashflow insert REFUSED');
            continue;
        }
        made.cashflow++;
        cfIds.push({ id: cId, m: m });

        // --- the five bookings
        for (j = 0; j < m.books.length; j++) {
            var b = m.books[j];
            var bk = new GlideRecord(BOOKING);
            bk.initialize();
            bk.setValue('cashflow_id', TAG + '-' + m.id + '-' + (j + 1));
            bk.setValue('counterparty_org_name', b.cp);
            bk.setValue('counterparty_entity', b.cp);
            bk.setValue('product_type', m.product);
            bk.setValue('trade_system', b.sys);
            bk.setValue('cashflow_type', m.cfType);
            bk.setValue('currency', m.ccy);
            bk.setValue('amount', b.amt);
            bk.setValue('direction', m.dirn);
            bk.setValue('value_date', b.vd);
            bk.setValue('status', 'Not Settled');
            bk.setValue('bank_trade_ref', b.ref);
            bk.setValue('counterparty_trade_ref', '');
            if (bk.insert()) { made.booking++; }
        }
    }

    p('');
    p('CREATED   ' + made.email + ' mails, ' + made.att + ' .eml attachments, ' +
      made.cashflow + ' cashflows, ' + made.booking + ' bookings, ' +
      made.cpty + ' directory entries');

    // ---------------------------------------------------------------- 5. verify against the real matcher
    // Do not trust the design - run the engine and read back what it stored. This is what the case
    // screen will show.
    p('');
    p('VERIFICATION  (running Compare & Match on each cashflow)');
    p('');
    p('   ' + pad('mail', 12) + pad('want', 6) + pad('got', 6) + pad('cands', 7) + 'status');
    p('   ' + pad('----', 12) + pad('----', 6) + pad('---', 6) + pad('-----', 7) + '------');

    var bad = 0;
    for (i = 0; i < cfIds.length; i++) {
        var row = cfIds[i];
        var gotTier = 0, gotCands = 0, gotStatus = '?';
        try {
            var cm = new CompareMatch();
            cm.loadConfig(wizId);
            cm.matchAndStore(row.id);
            var rb = new GlideRecord(CASHFLOW);
            if (rb.get(row.id)) {
                gotTier = parseInt('' + (rb.getValue('ai_match_tier') || '0'), 10);
                gotCands = parseInt('' + (rb.getValue('ai_candidate_count') || '0'), 10);
                gotStatus = '' + (rb.getValue('ai_match_status') || '');
            }
        } catch (eM) {
            gotStatus = 'ERROR ' + eM;
        }
        var ok = (gotTier === row.m.tier && gotCands === 5);
        if (!ok) { bad++; }
        p('   ' + pad(row.m.id, 12) + pad(row.m.tier, 6) + pad(gotTier, 6) +
          pad(gotCands, 7) + gotStatus + (ok ? '' : '   <-- NOT AS DESIGNED'));
    }

    p('');
    if (bad === 0) {
        p('   All four land on the intended tier with exactly 5 candidates.');
    } else {
        p('   ' + bad + ' cashflow(s) did not land as designed. The usual cause is an EXISTING booking');
        p('   that also satisfies the query - for a Tier 3 mail any other booking with the same');
        p('   currency, direction, value date and amount becomes a sixth candidate; for a Tier 2 mail');
        p('   a booking whose name IS exactly the mail name would pull it up to Tier 1.');
        p('   Search the booking table on the currency and value date above to find it.');
    }

    // ---------------------------------------------------------------- 6. where to look
    p('');
    p('=================================================================');
    p('WHERE TO SEE IT');
    p('   Board       /nexai?id=bsm_nfotc_wiz_dash&wiz=' + wizId);
    p('               search "TIER" to isolate the four demo mails');
    p('   Case screen click any of the four rows, then section 2 Compare & Match');
    p('');
    p('WHAT TO POINT AT IN THE DEMO');
    p('   TIER2-01  the mail says "JP Morgan"; the five bookings are JP Morgan Chase, JPMorgan Chase');
    p('             & Co., J.P. Morgan Securities plc, JPMorgan Chase Bank N.A. and JP Morgan AG.');
    p('             None is an exact name match, so Tier 1 cannot fire - Tier 2 catches all five on');
    p('             the fuzzy name rule. Amount deltas run 0.00 to 50.00 and dates -1 to +2 business');
    p('             days, so the tolerance window is visible in the candidate list.');
    p('   TIER3-01  the mail says "Standard Chartered" and no booking resembles it, so Tiers 1 and 2');
    p('             find nothing and Tier 3 drops the counterparty. All five candidates carry the');
    p('             identical amount and value date and differ only by name - which is exactly why');
    p('             the counterparty column is flagged red on every row and nothing auto-selects.');
    p('');
    p('TO REMOVE: re-run with the seeding section commented out, or delete the four mails named');
    p('           TIER*.eml and the bookings whose Cashflow ID starts with "' + TAG + '".');
    p('=================================================================');
    gs.info('\n' + log.join('\n'));
})();
