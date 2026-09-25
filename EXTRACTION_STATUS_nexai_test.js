/**
 * Extraction status for NexAI OTC Test: what is done, what is short, and what is left.
 *
 * Every mail is measured against what the SAME mail produced on the eval instance, so "short" means
 * short of a number actually achieved on this corpus rather than a guess. The eval figures are embedded
 * below: 60 distinct mails, 289 cashflows.
 *
 * Three outcomes are reported separately because they need different responses:
 *   - SHORT, flagged partial : the completeness guard caught it. Another Sync usually recovers it.
 *   - SHORT, NOT flagged     : worse, because nothing on the record says anything is missing.
 *   - no rows yet            : either genuinely unreadable, or simply not reached by a Sync yet.
 *
 * On the partial flag: on eval two mails (Barclays 26-JUNE and SABACAP) hold their FULL expected count
 * and still carry the flag, because the guard counts money-anchored LINES and those two have more lines
 * than cashflows. A flag on a mail that already matches eval is that false positive, not a loss.
 *
 * READ-ONLY. Nothing is written.
 *
 * Run: Background Scripts, Application "NexAI OTC Test", "Run in scoped application" ticked.
 */
(function () {
    var SCOPE = 'x_nose_nexai_test';

    // normalised subject -> cashflows the same mail produced on eval
    var EVAL = [
        ['amounts to confirm value 03 07 2026 nomura global financial', 1],
        ['asap revised please confirm option payment s for the 17 aug 2026 nomagb2l vs sinotwtp', 6],
        ['baly nomura international plc otc put swaptions vd 2026 07 27 00 00 00 wdom6l', 1],
        ['barclays eq cashflows for 18 aug 2026 apucf 10200531', 4],
        ['bbvasa prematching 16607 nomura international plc lon 2026 07 27', 8],
        ['bns nomura global financial products inc settlement confirmation g 2026 169144 aug 17 2026', 6],
        ['bns nomura global financial products inc settlement confirmation s 2026 930617 aug 05 2026', 1],
        ['ccs settlements santander hong kong bshk vs nomura international plc nomu value 19 aug 2026', 2],
        ['csfbfi please confirm cash for vd 8 17 2026 nomurafx', 1],
        ['csop nomura settlement notice vd 8 17 2026 8 18 2026', 4],
        ['deutsche bank derivative settlements pre confirmation vd 13 may 2026 13 may 2026 request 508249 auto', 1],
        ['deutsche bank derivative settlements pre confirmation vd 18 august 2026 18 august 2026 request 539410 auto', 20],
        ['dmfi nomura sw settlement for 09 jan 26', 1],
        ['equity swap settlement value date 17 07 2026 nomura global financial products inc ny trsadvice 20260717 2026717 934', 2],
        ['fhlb cincinnati swap payments 08 18 2026', 1],
        ['gcm please confirm anz swap settlement vd 20 aug 2026', 4],
        ['gs settlement for value date 2026 05 11 gs ref num 302085568', 6],
        ['ird settlement vd 17 08 2026 nomura international plc nomugblon', 4],
        ['irs crs 26 aug 26 daiwa tokyo vs nomura international upcoming payments', 2],
        ['irs payment val 15 05 26 nomura international plc gb 51308081 mha', 1],
        ['irs settlement value 18 aug 2026 payment confirmation cl', 1],
        ['jane street vs nmra otc derivative cash flows 08 19 2026 jpy', 3],
        ['kb securities w nip settlement date 14 jul', 1],
        ['kepos nomura settlement confirmation 07 28', 2],
        ['mbbesgsg nomagb2l01 irs ccs settlement value 13 may 2026', 2],
        ['natixis nomura confirmation of ird settlements for value date july 9 2026 cust nomugfpny nomugfpny', 5],
        ['ndf confirm settlement amount with nomura international plc london value date 2026 08 19 ref 41255007', 1],
        ['netting of irs ccs trades value 20 07 2026', 2],
        ['nfps payment confirmation for value date 20260818 usd', 2],
        ['nfpsjpjtxxx nomagb2lxxx scb ndf settlement 09 jun 2026', 2],
        ['ngfp payment confirmation for value date 20260821', 7],
        ['nip arrangement fees and swaps between nip and nef value 20260819', 2],
        ['nomura payment confirmation for value 18 aug 26', 61],
        ['nomura swap reset settlement t d 17 8 2026', 2],
        ['nyucf barclays eq cashflows for 16 jun 2026 sds 10200531 pc', 6],
        ['nyucf barclays eq cashflows for 2026 07 24 sds 10200531 pc', 3],
        ['ocbc hk cs irs settlement confirmation no', 1],
        ['pa pre settlements bco santander madrid real otc 17 08 2026 nfpeg1 1873466422726754304', 1],
        ['pa pre settlements bco santander madrid real rates 17 08 2026 nomu 1873466416304226304', 2],
        ['payment confirmation value 17 august 2026', 4],
        ['pggm irs nom confirmation cash flow vd 13 5 2026', 2],
        ['please confirm ird payments of 2026 8 20 tpbktwtpfmg and nomagb2l', 1],
        ['preconfirmation email vd 22 april 2026 ccy usd', 1],
        ['rebate tdcc trade date 8 12', 1],
        ['sabacap nomura upcoming settlement notice dtd 6 16 2026 jpy ccy', 15],
        ['settlement confirmation 21 aug 2026 1885 1753 5913922 6842473 6598430 18 aug 2026 to 21 aug 2026 18082026', 1],
        ['settlement confirmation 6842473 vd 18 aug 2026', 1],
        ['settlement notice noma lon vd 14 aug 2026 eqdstructure roh 33359', 2],
        ['settlement vd 2026 07 15 nomura', 1],
        ['settlementnotice ref sn00002180331 op32189gku nomalon usd 24 jul 2026 bnpp tech ref fq6tp4wlk4', 1],
        ['settlementnotice ref sn00002180389 op32253gku nomalon jpy 28 jul 2026 bnpp tech ref fq7jtmwtvq', 3],
        ['settlementnotice ref sn00002181353 op32266gku nomalon usd 27 jul 2026 bnpp tech ref frfg38mt8m', 1],
        ['sgna497 nomura global financial products inc 18 aug 2026 upcoming payment s affirmation request', 1],
        ['shs nomura settlement val 23 jul 26', 2],
        ['sr zz 20260709 m67311 high value scb sg vs nxxxxx inxxxxxxxxxxxx pxx vd 10 july 2026', 1],
        ['td vs noil ldn usd vd 18 aug 2026 equity swap id 1690153', 4],
        ['the bank of nova scotia please confirm gbp settlement 8 5 2026', 49],
        ['unsettled cashflows for vd 09 july 2026 nomura gl fn pr ny gbp', 2],
        ['upfront fee due on 08 may 2026 bea ref ixa 80006252 nomura singapore', 1],
        ['usd barclays eq cashflows for 26 june 2026 sds 10200531 10208641 kav', 13]
    ];

    function line() { gs.info('------------------------------------------------------------------'); }
    function norm(s) {
        s = ('' + (s || '')).replace(/^\s*(?:(?:re|fw|fwd|antw|tr)\s*:\s*)+/i, '');
        return s.toLowerCase().replace(/[^0-9a-z]+/g, ' ').replace(/\s+/g, ' ')
            .replace(/^ +| +$/g, '');
    }

    var scope = '';
    try { scope = '' + gs.getCurrentScopeName(); } catch (e) { scope = '?'; }
    if (scope !== SCOPE) { gs.error('ABORT. Must run in ' + SCOPE + '; got "' + scope + '".'); return; }
    gs.info('Scope OK: ' + scope);

    var want = {};
    for (var i = 0; i < EVAL.length; i++) { want[EVAL[i][0]] = EVAL[i][1]; }

    var rows = {}, total = 0;
    var ag = new GlideAggregate(SCOPE + '_cashflow');
    ag.groupBy('email');
    ag.addAggregate('COUNT');
    ag.query();
    while (ag.next()) {
        var c = parseInt(ag.getAggregate('COUNT'), 10);
        rows['' + ag.getValue('email')] = c;
        total += c;
    }

    var scanned = 0, relevant = 0, irrelevant = 0, flaggedCount = 0, notStamped = 0;
    var exact = [], short_flagged = [], short_silent = [], over = [], none = [], unknown = [];

    var eg = new GlideRecord(SCOPE + '_email');
    eg.orderBy('mail_subject');
    eg.query();
    while (eg.next()) {
        scanned++;
        if (('' + (eg.getValue('classification') || '')) !== 'relevant') { irrelevant++; continue; }
        relevant++;
        var id = eg.getUniqueValue();
        var subj = '' + (eg.getValue('mail_subject') || eg.getValue('name') || '');
        var got = rows[id] || 0;
        var flag = '' + (eg.getValue('extraction_status') || '');
        var wx = '' + (eg.getValue('wiz_extracted') || '');
        if (flag) { flaggedCount++; }
        if (!wx) { notStamped++; }
        var exp = want[norm(subj)];
        var rec = { subj: subj, got: got, exp: exp, flag: flag, wx: wx };
        if (exp === undefined) { unknown.push(rec); }
        else if (got === 0) { none.push(rec); }
        else if (got === exp) { exact.push(rec); }
        else if (got > exp) { over.push(rec); }
        else if (flag) { short_flagged.push(rec); }
        else { short_silent.push(rec); }
    }

    var holding = exact.length + over.length + short_flagged.length + short_silent.length + unknown.length;

    line();
    gs.info('OVERALL');
    gs.info('   mails scanned            : ' + scanned + '     (eval 107)');
    gs.info('   relevant                 : ' + relevant + '     (eval 72)');
    gs.info('   filtered out             : ' + irrelevant + '     (eval 35)');
    gs.info('   mails holding cashflows  : ' + holding + '     (eval 62)');
    gs.info('   CASHFLOWS                : ' + total + '    (eval 289)');
    gs.info('   flagged partial          : ' + flaggedCount);
    gs.info('   not stamped, will retry  : ' + notStamped);

    line();
    gs.info('AGAINST EVAL, MAIL BY MAIL');
    gs.info('   matches eval exactly     : ' + exact.length);
    gs.info('   MORE than eval           : ' + over.length);
    gs.info('   SHORT, flagged partial   : ' + short_flagged.length);
    gs.info('   SHORT, not flagged       : ' + short_silent.length);
    gs.info('   no rows yet              : ' + none.length);
    gs.info('   no eval figure           : ' + unknown.length);

    function dump(title, arr, showExp) {
        if (!arr.length) { return; }
        gs.info('');
        gs.info('--- ' + title + ' (' + arr.length + ') ---');
        for (var j = 0; j < arr.length; j++) {
            var r = arr[j];
            var head = (showExp && r.exp !== undefined)
                ? ('got ' + r.got + ' of ' + r.exp + ', missing ' + (r.exp - r.got))
                : ('rows ' + r.got + (r.exp !== undefined ? ' (eval ' + r.exp + ')' : ''));
            gs.info('   ' + head + (r.flag ? '  [' + r.flag + ']' : '') +
                (r.wx ? '' : '  [will retry]') + '   ' + r.subj.substring(0, 58));
        }
    }

    dump('SHORT and flagged partial - another Sync usually recovers these', short_flagged, true);
    dump('SHORT but NOT flagged - nothing on the record says so', short_silent, true);
    dump('MORE rows than eval produced', over, true);
    dump('no rows yet', none, false);
    dump('no eval figure - not in the eval corpus, or the subject differs', unknown, false);

    line();
    var missing = 0, k;
    for (k = 0; k < short_flagged.length; k++) { missing += (short_flagged[k].exp - short_flagged[k].got); }
    for (k = 0; k < short_silent.length; k++) { missing += (short_silent[k].exp - short_silent[k].got); }
    for (k = 0; k < none.length; k++) { missing += (none[k].exp || 0); }
    gs.info('WHAT IS LEFT');
    gs.info('   cashflows still to recover vs eval : ' + missing);
    gs.info('   ' + total + ' + ' + missing + ' = ' + (total + missing) + '   (eval total 289)');
    gs.info('');
    gs.info('   Anything marked [will retry] is attempted again on EVERY Sync. Keep pressing while');
    gs.info('   any remain: BATCH counts 10 SUCCESSFUL mails per press, and the permanently failing');
    gs.info('   ones are retried ahead of the good ones, so a full pass takes several presses.');
})();
