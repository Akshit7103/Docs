/**
 * SEED THE PCM BOOKING TABLE FROM THE GROUND TRUTH
 *
 * Scripts - Background. "Execute in sandbox?" UNCHECKED.
 * APPLICATION = the environment to seed - the table names are derived from it:
 *     NexAI OTC BSM    x_nose_nfotc_bsm
 *     NexAI OTC Dev    x_nose_nexai_dev
 *     NexAI OTC Test   x_nose_nexai_test
 *     NexAI OTC UAT    x_nose_nexai_uat
 *
 * *** THIS SCRIPT WRITES. *** It inserts rows into <scope>_booking. It does not touch
 * emails or cashflows. Set DRY_RUN = true to see exactly what it would do and write nothing.
 *
 * WHY THIS EXISTS
 * The instance carries a synthetic PCM seed (Counterparty7, CF-000001...) that cannot match the
 * real production mails - different counterparties, amounts and dates entirely. Compare & Match
 * therefore finds nothing for them. This builds the bank side from the ground truth so the
 * matcher has something real to match against.
 *
 * HOW EACH COLUMN IS DERIVED, and why
 *
 *   amount              Nomura Amount EXACTLY AS THE GROUND TRUTH WRITES IT - sign included.
 *                       Pay rows are negative, Receive rows positive. This is a deliberate
 *                       decision (Akshit, 22 Sep 2026): the bank side must mirror the source
 *                       column verbatim.
 *
 *                       KNOW WHAT THIS COSTS. CompareMatch compares the two amounts RAW:
 *                           dAmt = Math.abs(bookingAmount - cashflowAmount)
 *                           reject when dAmt > tolerance
 *                       Cashflows store an UNSIGNED magnitude (the direction-from-sign rule), so a
 *                       booking of -1179.53 against a cashflow of 1179.53 gives a delta of
 *                       2359.06 - past the tolerance of every tier, including Tier 2's. Every Pay
 *                       booking therefore stops matching; only Receive rows can still match.
 *                       Set SIGNED_AMOUNTS = false below to go back to magnitudes.
 *   direction           Nomura Direction, normalised to 'Pay' / 'Receive'. The sheet spells it
 *                       ten different ways (PAY, pay, Receives, "RECEIVE (Nomura)", "Nomura Pays").
 *   currency            three letters, upper.
 *   value_date          yyyy-mm-dd, matching the format already in the table.
 *   counterparty_org_name
 *                       RESOLVED AT RUNTIME from the email's DERIVED counterparty_name, because
 *                       that is the value the matcher actually compares against (it comes from the
 *                       Eve directory lookup, not from the mail text). The ground truth's
 *                       free-text name is only the fallback. Get this wrong and every match drops
 *                       from Tier 1 to Tier 3.
 *   counterparty_trade_ref
 *                       the ground truth's counterparty reference - what the analyst recognises.
 *   bank_trade_ref      generated NB-xxxxxx. Matches are stored against THIS, not sys_id, so it
 *                       must be stable and unique.
 *
 * WHAT IS DELIBERATELY NOT SEEDED
 *   Rows whose Scenario is "Allege" get NO booking. Allege means the counterparty claims a
 *   cashflow Nomura has no record of - inventing one would contradict the ground truth and make
 *   the demo dishonest. Those mails SHOULD come back unmatched.
 *
 * WHAT THE MATCHER ACTUALLY FILTERS ON (so you know what has to be right):
 *   hard query : currency, direction, value_date  (exact, or +/- VD_TOL_DAYS in Tier 2)
 *   then       : counterparty (exact / fuzzy / none by tier), amount within the tier's tolerance
 */
(function () {

    var DRY_RUN = true;           // <<< run once like this and READ IT, then set false to write

    // Store the Nomura amount with its SIGN, exactly as the ground truth writes it: Pay rows
    // negative, Receive rows positive. Set false to store magnitudes instead - see the header
    // note for what the sign costs at match time. No need to regenerate either way.
    var SIGNED_AMOUNTS = true;
    var WIPE_GT_ROWS = true;      // remove rows this script created before (cashflow_id GT-*)
    var WIPE_ALL_BOOKINGS = false; // true also deletes the synthetic seed. Read the note below.

    // The synthetic rows cannot match a production mail, so they are harmless noise for Tier 1/2.
    // They CAN in principle surface in Tier 3 (counterparty-less), which needs only
    // currency + direction + value_date + an exact amount - a coincidence that is very unlikely
    // but not impossible. Set WIPE_ALL_BOOKINGS = true if you want a clean bank side.

    // The four NexAI environments do NOT share a prefix (BSM is x_nose_nfotc_bsm while dev/test/uat
    // are x_nose_nexai_*), and the instance also carries the older x_nose_nfotc app, so this is an
    // explicit allow-list rather than a prefix test. Everything below is derived from the scope the
    // script is running in, so the same file cannot write to the wrong environment.
    var ENVIRONMENTS = {
        'x_nose_nfotc_bsm':  'NexAI OTC BSM',
        'x_nose_nexai_dev':  'NexAI OTC Dev',
        'x_nose_nexai_test': 'NexAI OTC Test',
        'x_nose_nexai_uat':  'NexAI OTC UAT'
    };
    var scope = '' + gs.getCurrentScopeName();
    if (!ENVIRONMENTS[scope]) {
        gs.error('[PCM] ABORT: Application is "' + scope + '", not a NexAI OTC environment.');
        for (var _e in ENVIRONMENTS) {
            if (ENVIRONMENTS.hasOwnProperty(_e)) { gs.error('[PCM]     ' + ENVIRONMENTS[_e] + '   (' + _e + ')'); }
        }
        return;
    }

    var TBL = scope + '_booking';
    var EML = scope + '_email';

    // EML id -> the mail's subject, used to find the email record and read its DERIVED counterparty.
    var MAILS = {
"EML-0001": "EMUCF_Barclays EQ Cashflows for 04-Jun-2026 SDS -10200531 (KAV)",
"EML-00010": "Natixis / NOMURA - confirmation of IRD settlements for value date July 9, 2026(CUST : NOMUGFPNY)./*NOMUGFPNY",
"EML-00011": "Unsettled cashflows for VD 09 July 2026---NOMURA GL FN PR*NY*****GBP*****",
"EML-00012": "**** USD***Barclays EQ Cashflows for 26-JUNE-2026 SDS -10200531 10208641 (KAV)",
"EML-00013": "[Nomura] PAYMENT CONFIRMATION FOR VALUE 04-Jun-26",
"EML-00014": "SABACAP - NOMURA Upcoming Settlement Notice dtd 6/16/2026 (JPY CCY)",
"EML-00015": "NYUCF_Barclays EQ Cashflows for 16-Jun-2026 SDS -10200531 (PC)",
"EML-00016": "NOMURA vs GS | 2 July 2026",
"EML-00017": "Payment Notice Nomura International PLC Jun-11-2026 USD(AT)",
"EML-00018": "IRS-payment val. 15.05.26 (Nomura International PLC GB 51308081)-mha",
"EML-0002": "High Value//Pre-Confirmation / VD 23rd June 26//Nomura",
"EML-00020": "PreConfirmation Email | VD 22 April 2026 | ccy USD |",
"EML-00021": "PGGM IRS/NOM/confirmation cash flow VD 13-5-2026",
"EML-00022": "Deutsche Bank Derivative Settlements Pre-Confirmation VD - 13 May 2026 - 13 May 2026 Request#508249",
"EML-00023": "MBBESGSG / NOMAGB2L01 - IRS/CCS SETTLEMENT VALUE 13 MAY 2026",
"EML-00025": "[KB Securities w/NIP] Settlement date 14 Jul",
"EML-00026": "KEPOS/ Nomura settlement confirmation 07/28",
"EML-00027": "Settlement vd 2026-07-15(Nomura)",
"EML-00028": "IRS - NOMURLDN 19-Jul-26",
"EML-00029": "Equity swap Settlement: Value Date 17/07/2026 NOMURA GLOBAL FINANCIAL PRODUCTS INC NY_TRSAdvice_20260717__2026717_934",
"EML-0003": "NOMUBK/LDN - Cash Flow Confirmation - 05 Jun 2026",
"EML-00032": "[SHS] NOMURA Settlement VAL 23-Jul-26",
"EML-00036": "Netting of IRS/CCS trades value 20/07/2026",
"EML-00037": "[OCBC HK] CS / IRS Settlement Confirmation - NO",
"EML-00038": "Settlement Notice // NOMA LON // VD 14-Aug-2026 - [EQDSTRUCTURE-ROH-33359]",
"EML-00039": "RE: NOMUBK/LDN - Cash Flow Confirmation - 18 Aug 2026",
"EML-0004": "DMFI - Nomura - SW - Settlement for 05 Jun 26",
"EML-00040": "CCS Settlements - Santander Hong Kong BSHK vs NOMURA INTERNATIONAL PLC (NOMU) value 19 Aug 2026",
"EML-00041": "GCM | Please confirm: ANZ Swap Settlement vd 20-Aug-2026",
"EML-00042": "Please confirm IRD payments of 2026/8/20- TPBKTWTPFMG and NOMAGB2L",
"EML-00043": "Jane Street vs. NMRA | OTC derivative cash flows | 08/19/2026 - JPY",
"EML-00044": "NDF -Confirm Settlement Amount with NOMURA_INTERNATIONAL_PLC_LONDON Value Date: 2026/08/19 Ref: 41255007",
"EML-00045": "~<PA-PRE>~ Settlements Bco. Santander [MADRID REAL] [RATES] [17/08/2026] [NOMU] [1873466416304226304]",
"EML-00046": "CSOP - Nomura Settlement Notice VD 8/17/2026 & 8/18/2026",
"EML-00047": "CSFBFI | Please confirm cash for VD 8/17/2026 | NOMURAFX",
"EML-00048": "~<PA-PRE>~ Settlements Bco. Santander [MADRID REAL] [OTC] [17/08/2026] [NFPEG1] [1873466422726754304]",
"EML-00049": "Settlement Confirmation//6842473//VD 18 Aug 2026",
"EML-0005": "NFPSJPJTXXX/ NOMAGB2LXXX - SCB NDF SETTLEMENT - 09 Jun 2026",
"EML-00050": "DB LON: FX Cash Settlements Netting - Value date: 17-Aug-2026- 8106707",
"EML-00051": "SGNA497 - NOMURA GLOBAL FINANCIAL PRODUCTS INC. - 18-Aug-2026 - Upcoming Payment(s) Affirmation Request",
"EML-00052": "BNS / NOMURA GLOBAL FINANCIAL PRODUCTS INC- Settlement Confirmation +S-2026-930617+ - Aug 05,2026",
"EML-00053": "Payment confirmation Value 17 August 2026",
"EML-00054": "IRS/CRS*26-Aug-26* - DAIWA TOKYO vs Nomura International Upcoming Payments",
"EML-00055": "FHLB Cincinnati Swap Payments 08/18/2026",
"EML-00056": "Barclays EQ Cashflows for 18 Aug 2026 APUCF 10200531",
"EML-00057": "TD vs NOIL_LDN - USD| VD 18 Aug 2026 Equity Swap - ID 1690153",
"EML-00058": "BNS / NOMURA GLOBAL FINANCIAL PRODUCTS INC- Settlement Confirmation +G-2026-169144+ - Aug 17,2026",
"EML-00059": "Barclays EQ Cashflows for 29 Jul 2026 APUCF 10200531",
"EML-0006": "OPT Premium vd 11 may 2026 (FX Setts:Interbank-2791169)",
"EML-00060": "NYUCF_Barclays EQ Cashflows for 2026-07-24 SDS - 10200531 (PC)",
"EML-00061": "ASAP-REVISED: Please Confirm Option Payment(s) for the 17-Aug-2026--NOMAGB2L vs SINOTWTP",
"EML-00062": "BALY | NOMURA INTERNATIONAL PLC -OTC | Put Swaptions | VD-2026-07-27 00:00:00(WDOM6L)",
"EML-00063": "BBVASA Prematching - 16607 - NOMURA INTERNATIONAL PLC -LON - 2026-07-27",
"EML-00064": "Payment Notice Nomura International PLC Jun-11-2026 USD",
"EML-00065": "RBC Toronto - NGFPNY - Settlement pre-confirmation value date: 19/08/2026",
"EML-00066": "RBC London - NGFPNY - Settlement pre-confirmation value date: 18/08/2026",
"EML-00067": "IRD Settlement VD 17/08/2026 - NOMURA INTERNATIONAL PLC (NOMUGBLON)",
"EML-00068": "GS Settlement for Value Date 2026-08-19, GS Ref Num 215514797",
"EML-00069": "GS Settlement for Value Date 2026-08-19, GS Ref Num 215512496",
"EML-00070": "<Rebate & TDCC>Trade Date: 8/12",
"EML-00071": "NOMURA / Sinopac HK - Equities settlement value 6-JUL",
"EML-00072": "Deutsche Bank Derivative Settlements Pre-Confirmation VD - 18 August 2026 - 18 August 2026 Request#539410 - Auto",
"EML-00073": "Settlement Confirmation - 21 Aug 2026 - 1885,1753,5913922,6842473,6598430 - 18 Aug 2026 to 21 Aug 2026 - 18082026",
"EML-00074": "SettlementNotice ref SN00002180331 OP32189GKU NOMALON USD 24-Jul-2026 - BNPP-Tech-Ref: Fq6tP4wLk4",
"EML-00075": "SettlementNotice ref SN00002180389 OP32253GKU NOMALON JPY 28-Jul-2026 - BNPP-Tech-Ref: Fq7JTMWtVq",
"EML-00076": "SettlementNotice ref SN00002181353 OP32266GKU NOMALON USD 27-Jul-2026 - BNPP-Tech-Ref: FrFg38mT8M",
"EML-00077": "The Bank of Nova Scotia / Please confirm GBP settlement / 8/5/2026",
"EML-00078": "Nomura - Swap Reset Settlement (T/D 17/8/2026)",
"EML-00079": "NFPS Payment Confirmation for value date 20260818(USD)",
"EML-0008": "Upfront Fee due on 08 May 2026 BEA Ref IXA-80006252 (Nomura Singapore)",
"EML-00080": "NGFP Payment Confirmation for value date 20260821",
"EML-00081": "NIP Arrangement Fees and swaps between NIP and NEF value 20260819",
"EML-00082": "[Nomura] PAYMENT CONFIRMATION FOR VALUE 18-Aug-26",
"EML-0009": "Cash Settlement for VD 06/25 -NMRA"
};

    // [ eml, counterparty(fallback), counterparty_ref, product, currency, amount, direction,
    //   value_date, nomura_entity ]
    var ROWS = [
["EML-0001", "BARCLAYS", "EDR47254218EU", "", "EUR", 873.76, "Receive", "2026-04-06", ""],
["EML-0002", "BOFA", "", "", "USD", 30906855.54, "Receive", "2026-06-23", "Nomura Global Financial Products Inc"],
["EML-0002", "BOFA", "", "", "USD", -13496024.12, "Pay", "2026-06-23", "NOMURA INTERNATIONAL PLC"],
["EML-0002", "BOFA", "", "", "USD", -66855.11, "Pay", "2026-06-23", "NOMURA INTERNATIONAL PLC"],
["EML-0002", "BOFA", "", "", "USD", 10260703.65, "Receive", "2026-06-23", "NOMURA INTERNATIONAL PLC"],
["EML-0003", "Standard Chartered Global Business Services Private Limited", "M00126446018", "", "USD", 15312500.0, "Receive", "2026-06-05", "NOMUBK/LD"],
["EML-0003", "Standard Chartered Global Business Services Private Limited", "M00126446018", "", "USD", 125850.0, "Receive", "2026-06-05", "NOMUBK/LD"],
["EML-0003", "Standard Chartered Global Business Services Private Limited", "M00127165855", "", "NZD", 1931.02, "Receive", "2026-06-05", "NOMURAFINPB/TYO"],
["EML-0003", "Standard Chartered Global Business Services Private Limited", "M00127162041", "", "AUD", 28992.6, "Receive", "2026-06-05", "NOMURAFINPB/TYO"],
["EML-0003", "Standard Chartered Global Business Services Private Limited", "M00127159661", "", "CHF", 15125.76, "Receive", "2026-06-05", "NOMURAFINPB/TYO"],
["EML-0003", "Standard Chartered Global Business Services Private Limited", "M00127163218", "", "EUR", 5574.4, "Receive", "2026-06-05", "NOMURAFINPB/TYO"],
["EML-0003", "Standard Chartered Global Business Services Private Limited", "M00127167590", "", "NZD", 13125.84, "Receive", "2026-06-05", "NOMURAFINPB/TYO"],
["EML-0003", "Standard Chartered Global Business Services Private Limited", "M00127165293", "", "NZD", 152.88, "Receive", "2026-06-05", "NOMURAFINPB/TYO"],
["EML-0004", "SCHONFELD DMFI MASTER FUND L.P", "2510319-39842992C", "", "JPY", 22390000.0, "Receive", "2026-06-05", ""],
["EML-0005", "STANDARD CHARTERED GLOBAL BUSINESS SERVICES PRIVATE LIMITED", "", "", "USD", -749739.09, "Pay", "2026-06-09", "NOMURA FIN INC*TYO"],
["EML-0005", "STANDARD CHARTERED GLOBAL BUSINESS SERVICES PRIVATE LIMITED", "", "", "USD", -1361826.6, "Pay", "2026-06-09", "NOMURA INTL*LDN"],
["EML-0006", "GSIL", "", "", "USD", 2973203.0, "Receive", "2026-05-11", "NFPS"],
["EML-0006", "GSIL", "", "", "EUR", 121000.0, "Receive", "2026-05-11", "NFPS"],
["EML-0008", "", "IXA-80006252", "", "CNY", -3807.54, "Pay", "2026-05-08", "Nomura Singapore"],
["EML-0009", "Millennium Consulting (India) Private", "", "", "EUR", 2000.0, "Receive", "2026-06-25", "NOMURA INTL PLC"],
["EML-00010", "Natixis", "18842923M", "EXOTIC", "JPY", -393542300.0, "Pay", "2026-09-07", "Nomura International PLC, London"],
["EML-00010", "Natixis", "20551259M", "", "EUR", -40437806.65, "Pay", "2026-09-07", "Nomura International PLC, London"],
["EML-00010", "Natixis", "20551258M", "", "EUR", -7010353.75, "Pay", "2026-09-07", "Nomura International PLC, London"],
["EML-00010", "Natixis", "20551258M", "", "JPY", 1298050000.0, "Receive", "2026-09-07", "Nomura International PLC, London"],
["EML-00010", "Natixis", "20551259M", "SWAP", "JPY", 748312500000.0, "Receive", "2026-09-07", "Nomura International PLC, London"],
["EML-00011", "Standard Chartered Global Business Services Private Limited", "", "", "USD", -2809490.89, "Pay", "2026-07-09", ""],
["EML-00011", "Standard Chartered Global Business Services Private Limited", "", "", "GBP", 2134946.01, "Receive", "2026-07-09", ""],
["EML-00012", "Barclays", "1757254036", "", "USD", 11492.55, "Receive", "2026-06-26", "NOM INTL PLC"],
["EML-00012", "Barclays", "1757258695", "", "USD", 89550.0, "Receive", "2026-06-26", "NOM INTL PLC"],
["EML-00012", "Barclays", "1757370407", "", "USD", 2786.42, "Receive", "2026-06-26", "NOM INTL PLC"],
["EML-00012", "Barclays", "1757382148", "", "USD", -32000.0, "Pay", "2026-06-26", "NOMURA GLOB FIN PROD INC"],
["EML-00012", "Barclays", "1757382151", "", "USD", -112000.0, "Pay", "2026-06-26", "NOMURA GLOB FIN PROD INC"],
["EML-00012", "Barclays", "1757385622", "", "USD", -2350000.0, "Pay", "2026-06-26", "NOMURA GLOB FIN PROD INC"],
["EML-00012", "Barclays", "1757385538", "", "USD", -1475000.0, "Pay", "2026-06-26", "NOMURA GLOB FIN PROD INC"],
["EML-00012", "Barclays", "1757384301", "", "USD", 60000.0, "Receive", "2026-06-26", "NOMURA GLOB FIN PROD INC"],
["EML-00012", "Barclays", "1757385574", "", "USD", 228000.0, "Receive", "2026-06-26", "NOMURA GLOB FIN PROD INC"],
["EML-00012", "Barclays", "1757384690", "", "USD", 102000.0, "Receive", "2026-06-26", "NOMURA GLOB FIN PROD INC"],
["EML-00012", "Barclays", "1757385693", "", "USD", 105600.0, "Receive", "2026-06-26", "NOMURA GLOB FIN PROD INC"],
["EML-00012", "Barclays", "1757385515", "", "USD", 1090000.0, "Receive", "2026-06-26", "NOMURA GLOB FIN PROD INC"],
["EML-00012", "Barclays", "1757385711", "", "USD", 1655000.0, "Receive", "2026-06-26", "NOMURA GLOB FIN PROD INC"],
["EML-00014", "SABACAP", "", "", "JPY", 1083354.0, "Receive", "2026-06-16", "Nomura International PLC"],
["EML-00014", "SABACAP", "", "", "JPY", 296498.0, "Receive", "2026-06-16", "Nomura International PLC"],
["EML-00014", "SABACAP", "", "", "JPY", 6621307.0, "Receive", "2026-06-16", "Nomura International PLC"],
["EML-00014", "SABACAP", "", "", "JPY", 1112419.0, "Receive", "2026-06-16", "Nomura International PLC"],
["EML-00014", "SABACAP", "", "", "JPY", 2032340.0, "Receive", "2026-06-16", "Nomura International PLC"],
["EML-00014", "SABACAP", "", "", "JPY", 2016467.0, "Receive", "2026-06-16", "Nomura International PLC"],
["EML-00014", "SABACAP", "", "", "JPY", 240022.0, "Receive", "2026-06-16", "Nomura International PLC"],
["EML-00014", "SABACAP", "", "", "JPY", 485678.0, "Receive", "2026-06-16", "Nomura International PLC"],
["EML-00014", "SABACAP", "", "", "JPY", 242431.0, "Receive", "2026-06-16", "Nomura International PLC"],
["EML-00014", "SABACAP", "", "", "JPY", 1180183.0, "Receive", "2026-06-16", "Nomura International PLC"],
["EML-00014", "SABACAP", "", "", "JPY", 35075375.0, "Receive", "2026-06-16", "Nomura International PLC"],
["EML-00014", "SABACAP", "", "", "JPY", 1299412.0, "Receive", "2026-06-16", "Nomura International PLC"],
["EML-00014", "SABACAP", "", "", "JPY", 3275143.0, "Receive", "2026-06-16", "Nomura International PLC"],
["EML-00014", "SABACAP", "", "", "JPY", 1998313.0, "Receive", "2026-06-16", "Nomura International PLC"],
["EML-00014", "SABACAP", "", "", "JPY", 31540390.0, "Receive", "2026-06-16", "Nomura International PLC"],
["EML-00015", "", "1748231860", "", "USD", -209895.83, "Pay", "2026-06-16", "EDBB"],
["EML-00015", "", "1749280446", "", "USD", 1774.08, "Receive", "2026-06-16", "NEBB"],
["EML-00015", "", "1749280523", "", "USD", 1213.56, "Receive", "2026-06-16", "NEBB"],
["EML-00015", "", "1749294793", "", "USD", 2126.9, "Receive", "2026-06-16", "NEBB"],
["EML-00015", "", "1749299894", "", "USD", 17304.54, "Receive", "2026-06-16", "NEBB"],
["EML-00015", "", "1749457150", "", "USD", 9870.0, "Receive", "2026-06-16", "NEBB"],
["EML-00016", "GOLDMAN SACHS INTERNATIONAL", "", "", "USD", 211225.67, "Receive", "2026-07-02", ""],
["EML-00017", "NBC Global Finance Payment", "148187227 / 163334252", "", "USD", 33670.0, "Receive", "2026-06-11", "Nomura International PLC"],
["EML-00017", "NBC Global Finance Payment", "154495657 / 169493530", "", "USD", 91000.0, "Receive", "2026-06-11", "Nomura International PLC"],
["EML-00017", "NBC Global Finance Payment", "145535242 / 160741213", "", "USD", 54600.0, "Receive", "2026-06-11", "Nomura International PLC"],
["EML-00018", "Kommunalkredit Austria AG", "85790699", "", "EUR", -107.87, "Pay", "2026-05-15", "Nomura International PLC GB"],
["EML-00018", "Kommunalkredit Austria AG", "85790699", "", "EUR", 100.0, "Receive", "2026-05-15", "Nomura International PLC GB"],
["EML-00020", "UBS AG London Branch", "BKP359HKG4559480", "", "USD", -500008.57, "Pay", "2026-04-22", "NOMURA INTERNATIONAL PLC LONDON"],
["EML-00021", "PGGM Investments", "", "Interest Rate Swap", "EUR", 998408.33, "Receive", "2026-05-13", "NOMURA FIN PROD"],
["EML-00022", "Deutsche Bank AG, New York.", "", "BASIS_SWAP", "USD", 12995.86, "Receive", "2026-05-13", "Nomura International PLC"],
["EML-00023", "Maybank", "", "", "CNH", 1154540.63, "Receive", "2026-05-13", "NOMURA INTERNATIONAL PLC LONDON"],
["EML-00023", "Maybank", "", "", "USD", -228991.25, "Pay", "2026-05-13", "NOMURA INTERNATIONAL PLC LONDON"],
["EML-00025", "KB Securities Co., Ltd", "", "", "USD", -12606.99, "Pay", "2026-07-14", ""],
["EML-00026", "Kepos Alpha Master Fund L.P.", "", "", "USD", 217600.0, "Receive", "2026-07-28", "NGFP"],
["EML-00027", "Korea Investment & Securities", "", "", "USD", 207973.59, "Receive", "2026-07-15", ""],
["EML-00028", "Saudi National Bank", "", "", "SAR", 284106.04, "Receive", "2026-07-19", ""],
["EML-00029", "Natixis CIB", "", "", "USD", 34354245.92, "Receive", "2026-07-17", "NOMURA GLOBAL FINANCIAL PRODUCTS INC NY"],
["EML-00032", "Shinhan Securities", "OTC-S-ELS-27779", "", "USD", -4752.87, "Pay", "2026-07-23", ""],
["EML-00036", "Danske Bank A/S", "", "", "EUR", -238622.22, "Pay", "2026-07-20", "Nomura International PLC (London)"],
["EML-00037", "OCBC HK", "322830779", "", "USD", 4516.5, "Receive", "2026-08-20", "NOMUINTPL1"],
["EML-00038", "BNP Paribas", "1353021745", "", "USD", 23.41, "Receive", "2026-08-18", "NOMA LON"],
["EML-00038", "BNP Paribas", "1353021744", "", "USD", -12163.24, "Pay", "2026-08-18", "NOMA LON"],
["EML-00039", "Standard Chartered Bank (SCB London)", "", "", "USD", 968.5, "Receive", "2026-08-18", "NOMURAFINPB/TYO"],
["EML-00039", "Standard Chartered Bank (SCB London)", "", "", "EUR", 13005.2, "Receive", "2026-08-18", "NOMURAFINPB/TYO"],
["EML-00039", "Standard Chartered Bank (SCB London)", "", "FWD Start Swap (IRD/CS)", "USD", -15000.0, "Pay", "2026-08-18", "NOMUBK/LDN"],
["EML-00039", "Standard Chartered Bank (SCB London)", "", "", "USD", 15222.0, "Receive", "2026-08-18", "NOMURAFINPB/TYO"],
["EML-00039", "Standard Chartered Bank (SCB London)", "", "Vanilla X-ccy swap", "GBP", -44709.48, "Pay", "2026-08-18", "NOMURA FIN INC/TYO"],
["EML-00039", "Standard Chartered Bank (SCB London)", "", "", "USD", 2409.5, "Receive", "2026-08-18", "NOMURAFINPB/TYO"],
["EML-00039", "Standard Chartered Bank (SCB London)", "", "Vanilla X-ccy swap", "USD", 62803.66, "Receive", "2026-08-18", "NOMURA FIN INC/TYO"],
["EML-00039", "Standard Chartered Bank (SCB London)", "", "", "USD", 152500.0, "Receive", "2026-08-18", "GUEC000K/LDN"],
["EML-00039", "Standard Chartered Bank (SCB London)", "", "Vanilla X-ccy swap", "EUR", -262660.0, "Pay", "2026-08-18", "NOMURA FIN INC/TYO"],
["EML-00039", "Standard Chartered Bank (SCB London)", "", "Vanilla X-ccy swap", "USD", 544936.92, "Receive", "2026-08-18", "NOMURA FIN INC/TYO"],
["EML-00039", "Standard Chartered Bank (SCB London)", "", "", "USD", -767500.0, "Pay", "2026-08-18", "NOMURAFIN/TYO"],
["EML-00039", "Standard Chartered Bank (SCB London)", "", "", "USD", -64138.88, "Pay", "2026-08-18", "NOMURAFIN/TYO"],
["EML-00040", "Banco Santander HK", "17888387.45", "Cross Currency Swap", "CNH", -1050546.64, "Pay", "2026-08-19", "Nomura International PLC"],
["EML-00040", "Banco Santander HK", "17888387.45", "Cross Currency Swap", "USD", 376510.76, "Receive", "2026-08-19", "Nomura International PLC"],
["EML-00041", "ANZ Bank", "29029485", "Swap", "AUD", -1202351.78, "Pay", "2026-08-20", ""],
["EML-00041", "ANZ Bank", "29029489", "Swap", "AUD", 841108.8, "Receive", "2026-08-20", ""],
["EML-00041", "ANZ Bank", "29029485", "Swap", "USD", 919615.14, "Receive", "2026-08-20", ""],
["EML-00041", "ANZ Bank", "29029489", "Swap", "USD", -639132.52, "Pay", "2026-08-20", ""],
["EML-00042", "Taipei Fubon Commercial Bank Co Ltd", "28401635", "Non-Deliverable Swap", "USD", -5043.0, "Pay", "2026-08-20", "NOMAGB2L"],
["EML-00043", "Jane Street", "PQ050 9481", "", "JPY", 53700000.0, "Receive", "2026-08-19", "NMRA"],
["EML-00044", "Bank of China (Hong Kong) Ltd.", "29587717_29587717_41255007", "NDF", "USD", -11553.14, "Pay", "2026-08-19", "Nomura International PLC London"],
["EML-00045", "Banco Santander", "7096203.21", "", "EUR", -41893.06, "Pay", "2026-08-17", "Nomura International PLC"],
["EML-00045", "Banco Santander", "7096213.21", "", "EUR", -20946.53, "Pay", "2026-08-17", "Nomura International PLC"],
["EML-00046", "CSOP Asset Management Limited", "", "", "USD", 334099.09, "Receive", "2026-08-18", ""],
["EML-00046", "CSOP Asset Management Limited", "", "", "USD", -50869471.31, "Pay", "2026-08-18", ""],
["EML-00046", "CSOP Asset Management Limited", "", "", "USD", -168457048.91, "Pay", "2026-08-18", ""],
["EML-00046", "CSOP Asset Management Limited", "", "", "USD", -4088964.8, "Pay", "2026-08-17", ""],
["EML-00047", "State Street", "", "FX OTC Option", "USD", 2916.32, "Receive", "2026-08-17", ""],
["EML-00048", "Banco Santander", "14019832.21", "OTC", "USD", -66000.0, "Pay", "2026-08-17", "Nomura Financial Products Europe GmbH"],
["EML-00049", "NatWest Commercial & Institutional", "", "", "EUR", 3900000.0, "Receive", "2026-08-18", ""],
["EML-00050", "", "", "", "USD", 10176654.44, "Receive", "2026-08-17", "NFPS"],
["EML-00050", "", "", "", "XAU", -2484.0, "Pay", "2026-08-17", "NFPS"],
["EML-00050", "", "", "", "XAG", 1650.0, "Receive", "2026-08-17", "NFPS"],
["EML-00051", "Citibank", "235325601", "Swap", "USD", 51083.97, "Receive", "2026-08-18", "Nomura Global Financial Products Inc."],
["EML-00052", "The Bank of Nova Scotia", "", "", "USD", -469024.41, "Pay", "2026-08-05", "Nomura Global Financial Products Inc."],
["EML-00053", "DBS Bank Ltd", "", "CS", "HKD", -156940000.0, "Pay", "2026-08-17", ""],
["EML-00053", "DBS Bank Ltd", "", "CS", "USD", 20000000.0, "Receive", "2026-08-17", ""],
["EML-00053", "DBS Bank Ltd", "", "IRS", "USD", -103411.64, "Pay", "2026-08-17", ""],
["EML-00053", "DBS Bank Ltd", "", "IRS", "USD", -156076.12, "Pay", "2026-08-17", ""],
["EML-00054", "Daiwa Securities Co. Ltd.", "W155912441", "", "AUD", 238035.51, "Receive", "2026-08-26", "Nomura International"],
["EML-00054", "Daiwa Securities Co. Ltd.", "W155912469", "", "AUD", -356977.64, "Pay", "2026-08-26", "Nomura International"],
["EML-00055", "FHLB Cincinnati", "", "", "USD", 3096.57, "Receive", "2026-08-18", ""],
["EML-00056", "BARCLAYS", "", "", "HKD", 29627.92, "Receive", "2026-08-18", "NOM INTL PLC"],
["EML-00056", "BARCLAYS", "", "", "JPY", 1893091.0, "Receive", "2026-08-18", "NOM INTL PLC"],
["EML-00057", "TD Securities", "", "Equity Swap", "USD", -263729.75, "Pay", "2026-08-18", ""],
["EML-00058", "The Bank of Nova Scotia", "", "", "GBP", -437298.56, "Pay", "2026-08-17", "NOMURA GLOBAL FINANCIAL PRODUCTS INC"],
["EML-00058", "The Bank of Nova Scotia", "", "", "GBP", 230793.97, "Receive", "2026-08-17", "NOMURA GLOBAL FINANCIAL PRODUCTS INC"],
["EML-00058", "The Bank of Nova Scotia", "", "", "USD", 592916.6, "Receive", "2026-08-17", "NOMURA GLOBAL FINANCIAL PRODUCTS INC"],
["EML-00058", "The Bank of Nova Scotia", "", "", "USD", 143802.77, "Receive", "2026-08-17", "NOMURA GLOBAL FINANCIAL PRODUCTS INC"],
["EML-00058", "The Bank of Nova Scotia", "", "", "USD", -315381.17, "Pay", "2026-08-17", "NOMURA GLOBAL FINANCIAL PRODUCTS INC"],
["EML-00058", "The Bank of Nova Scotia", "", "", "USD", 95560.48, "Receive", "2026-08-17", "NOMURA GLOBAL FINANCIAL PRODUCTS INC"],
["EML-00059", "BARCLAYS", "", "", "HKD", 9732.87, "Receive", "2026-07-29", "NOM INTL PLC"],
["EML-00059", "BARCLAYS", "", "", "HKD", 45036.8, "Receive", "2026-07-29", "NOM INTL PLC"],
["EML-00059", "BARCLAYS", "", "", "HKD", 115528.71, "Receive", "2026-07-29", "NOM INTL PLC"],
["EML-00059", "BARCLAYS", "", "", "HKD", 16374.12, "Receive", "2026-07-29", "NOM INTL PLC"],
["EML-00060", "BARCLAYS", "", "", "USD", 16348.28, "Receive", "2026-07-24", ""],
["EML-00061", "", "", "", "USD", 41903.19, "Receive", "2026-08-17", ""],
["EML-00061", "", "", "", "USD", 42083.73, "Receive", "2026-08-17", ""],
["EML-00061", "", "", "", "USD", 42539.71, "Receive", "2026-08-17", ""],
["EML-00061", "", "", "", "USD", 42587.24, "Receive", "2026-08-17", ""],
["EML-00061", "", "", "", "USD", 42735.28, "Receive", "2026-08-17", ""],
["EML-00061", "", "", "", "USD", 42935.43, "Receive", "2026-08-17", ""],
["EML-00062", "", "", "", "EUR", 1000.0, "Receive", "2026-07-27", "NOMURA INTERNATIONAL PLC"],
["EML-00063", "BBVA", "", "SwapCrossCurrency", "CNY", 218987.15, "Receive", "2026-07-27", "NOMURA FINANCIAL PRODUCTS EUROPE GMBH"],
["EML-00063", "BBVA", "", "SwapCrossCurrency", "USD", -91674.92, "Pay", "2026-07-27", "NOMURA FINANCIAL PRODUCTS EUROPE GMBH"],
["EML-00063", "BBVA", "", "SwapCrossCurrency", "HKD", -97288027.88, "Pay", "2026-07-27", "NOMURA INTERNATIONAL PLC"],
["EML-00063", "BBVA", "", "SwapCrossCurrency", "HKD", -96940000.0, "Pay", "2026-07-27", "NOMURA INTERNATIONAL PLC"],
["EML-00063", "BBVA", "", "SwapCrossCurrency", "HKD", -348027.88, "Pay", "2026-07-27", "NOMURA INTERNATIONAL PLC"],
["EML-00063", "BBVA", "", "SwapCrossCurrency", "USD", 12622859.8, "Receive", "2026-07-27", "NOMURA INTERNATIONAL PLC"],
["EML-00063", "BBVA", "", "SwapCrossCurrency", "USD", 122859.8, "Receive", "2026-07-27", "NOMURA INTERNATIONAL PLC"],
["EML-00063", "BBVA", "", "SwapCrossCurrency", "USD", 12500000.0, "Receive", "2026-07-27", "NOMURA INTERNATIONAL PLC"],
["EML-00064", "National Bank of Canada", "157898935 / 172821440", "", "USD", -30324.0, "Pay", "2026-06-11", "Nomura International PLC"],
["EML-00013", "OCBC Bank", "354276862", "", "SGD", -9000.0, "Pay", "2026-04-06", ""],
["EML-00013", "OCBC Bank", "354285847", "", "SGD", -4560.0, "Pay", "2026-04-06", ""],
["EML-00013", "OCBC Bank", "354297277", "", "USD", -4522.0, "Pay", "2026-04-06", ""],
["EML-00013", "OCBC Bank", "354303486", "", "SGD", -10500.0, "Pay", "2026-04-06", ""],
["EML-00013", "OCBC Bank", "354303625", "", "USD", -5692.8, "Pay", "2026-04-06", ""],
["EML-00065", "Royal Bank of Canada (RBC)", "4110618", "", "USD", 492800.0, "Receive", "2026-08-19", "NGFPNY (Nomura Global Financial Products, New York)"],
["EML-00065", "Royal Bank of Canada (RBC)", "4110619", "", "USD", 2261600.0, "Receive", "2026-08-19", "NGFPNY (Nomura Global Financial Products, New York)"],
["EML-00065", "Royal Bank of Canada (RBC)", "4110620", "", "USD", 1645600.0, "Receive", "2026-08-19", "NGFPNY (Nomura Global Financial Products, New York)"],
["EML-00065", "Royal Bank of Canada (RBC)", "4110627", "", "USD", -1207900.0, "Pay", "2026-08-19", "NGFPNY (Nomura Global Financial Products, New York)"],
["EML-00065", "Royal Bank of Canada (RBC)", "4110628", "", "USD", -878900.0, "Pay", "2026-08-19", "NGFPNY (Nomura Global Financial Products, New York)"],
["EML-00065", "Royal Bank of Canada (RBC)", "4110632", "", "USD", -873800.0, "Pay", "2026-08-19", "NGFPNY (Nomura Global Financial Products, New York)"],
["EML-00065", "Royal Bank of Canada (RBC)", "4110633", "", "USD", -635800.0, "Pay", "2026-08-19", "NGFPNY (Nomura Global Financial Products, New York)"],
["EML-00065", "Royal Bank of Canada (RBC)", "4110634", "", "USD", -190400.0, "Pay", "2026-08-19", "NGFPNY (Nomura Global Financial Products, New York)"],
["EML-00065", "Royal Bank of Canada (RBC)", "4110642", "", "USD", -263200.0, "Pay", "2026-08-19", "NGFPNY (Nomura Global Financial Products, New York)"],
["EML-00066", "RBC (Royal Bank of Canada / RBC Capital Markets)", "3238104", "", "EUR", -133805.69, "Pay", "2026-08-18", "NGFPNY (Nomura Global Financial Products, New York)"],
["EML-00066", "RBC (Royal Bank of Canada / RBC Capital Markets)", "3238105", "", "EUR", 107044.56, "Receive", "2026-08-18", "NGFPNY (Nomura Global Financial Products, New York)"],
["EML-00066", "RBC (Royal Bank of Canada / RBC Capital Markets)", "1938600", "", "GBP", -222917.26, "Pay", "2026-08-18", "NGFPNY (Nomura Global Financial Products, New York)"],
["EML-00066", "RBC (Royal Bank of Canada / RBC Capital Markets)", "5072877", "", "GBP", 1903064.11, "Receive", "2026-08-18", "NGFPNY (Nomura Global Financial Products, New York)"],
["EML-00066", "RBC (Royal Bank of Canada / RBC Capital Markets)", "1689705", "", "USD", 921000.0, "Receive", "2026-08-18", "NGFPNY (Nomura Global Financial Products, New York)"],
["EML-00066", "RBC (Royal Bank of Canada / RBC Capital Markets)", "1938600", "", "USD", 314018.28, "Receive", "2026-08-18", "NGFPNY (Nomura Global Financial Products, New York)"],
["EML-00066", "RBC (Royal Bank of Canada / RBC Capital Markets)", "3247744", "", "USD", 76750.0, "Receive", "2026-08-18", "NGFPNY (Nomura Global Financial Products, New York)"],
["EML-00066", "RBC (Royal Bank of Canada / RBC Capital Markets)", "4413350", "", "USD", -296025.6, "Pay", "2026-08-18", "NGFPNY (Nomura Global Financial Products, New York)"],
["EML-00067", "BBVA (Banco Bilbao Vizcaya Argentaria S.A.)", "", "SwapCrossCurrency", "EUR", 122102.08, "Receive", "2026-08-17", "NOMURA INTERNATIONAL PLC"],
["EML-00067", "BBVA (Banco Bilbao Vizcaya Argentaria S.A.)", "", "SwapCrossCurrency", "USD", 15147.81, "Receive", "2026-08-17", "NOMURA INTERNATIONAL PLC"],
["EML-00067", "BBVA (Banco Bilbao Vizcaya Argentaria S.A.)", "", "Swap", "EUR", -1647422.08, "Pay", "2026-08-17", "NOMURA INTERNATIONAL PLC"],
["EML-00067", "BBVA (Banco Bilbao Vizcaya Argentaria S.A.)", "", "SwapCrossCurrency", "MXN", -495673.33, "Pay", "2026-08-17", "NOMURA INTERNATIONAL PLC"],
["EML-00068", "Goldman Sachs International", "SDBB4QN33349CD99QQ.2.1.0", "Commodity / Gold Physical (London Bullion)", "USD", -214714.55, "Pay", "2026-08-19", "Nomura Financial Products & Services, Inc"],
["EML-00068", "Goldman Sachs International", "SDBB4QN33349CD99QQ.0.1.0", "Commodity / Gold Physical (London Bullion)", "USD", -214714.55, "Pay", "2026-08-19", "Nomura Financial Products & Services, Inc"],
["EML-00068", "Goldman Sachs International", "SDBB4QN33349CD99QQ.3.1.0", "Commodity / Gold Physical (London Bullion)", "USD", -214714.55, "Pay", "2026-08-19", "Nomura Financial Products & Services, Inc"],
["EML-00068", "Goldman Sachs International", "SDBB4QN33349CD99QQ.1.1.0", "Commodity / Gold Physical (London Bullion)", "USD", -214714.55, "Pay", "2026-08-19", "Nomura Financial Products & Services, Inc"],
["EML-00068", "Goldman Sachs International", "SDBB4QN33349CD7BHX.3.1.0", "Commodity / Gold Physical (London Bullion)", "USD", 311430.0, "Receive", "2026-08-19", "Nomura Financial Products & Services, Inc"],
["EML-00068", "Goldman Sachs International", "SDBB4QN33349CD7BHX.1.1.0", "Commodity / Gold Physical (London Bullion)", "USD", 311430.0, "Receive", "2026-08-19", "Nomura Financial Products & Services, Inc"],
["EML-00068", "Goldman Sachs International", "SDBB4QN33349CD7BHX.2.1.0", "Commodity / Gold Physical (London Bullion)", "USD", 444900.0, "Receive", "2026-08-19", "Nomura Financial Products & Services, Inc"],
["EML-00068", "Goldman Sachs International", "SDBB4QN33349CD7BHX.0.1.0", "Commodity / Gold Physical (London Bullion)", "USD", 444900.0, "Receive", "2026-08-19", "Nomura Financial Products & Services, Inc"],
["EML-00069", "Goldman Sachs International", "SDBB4QN33349D7NHBR.0.0.0", "Commodities (OTC)", "USD", 611.0, "Receive", "2026-08-19", "NOMURA FINANCIAL PRODUCTS & SERVICES, INC"],
["EML-00069", "Goldman Sachs International", "SDBB4QN33349D7NHL9.0.0.0", "Commodities (OTC)", "USD", 644.0, "Receive", "2026-08-19", "NOMURA FINANCIAL PRODUCTS & SERVICES, INC"],
["EML-00069", "Goldman Sachs International", "SDBB4QN33349D7NHF7.0.0.0", "Commodities (OTC)", "USD", 679.0, "Receive", "2026-08-19", "NOMURA FINANCIAL PRODUCTS & SERVICES, INC"],
["EML-00069", "Goldman Sachs International", "SDBB4QN33349D7NHRL.0.0.0", "Commodities (OTC)", "USD", 727.0, "Receive", "2026-08-19", "NOMURA FINANCIAL PRODUCTS & SERVICES, INC"],
["EML-00070", "Taipei Fubon Commercial Bank", "WMGS26080072", "Rebate / TDCC", "USD", -18900.0, "Pay", "2026-08-19", "NOMU (Nomura)"],
["EML-00071", "Bank SinoPac ()", "S422603260001", "Equities Settlement", "USD", -1909.56, "Pay", "2026-07-06", "Nomura"],
["EML-00072", "Deutsche Bank AG", "AY672047M", "XCY_SWAP (IRXCcySwapFixFlt) - Floating Rate Return", "USD", 532180.91, "Receive", "2026-08-18", "Nomura Financial Products & Services, Inc"],
["EML-00072", "Deutsche Bank AG", "AY672047M", "XCY_SWAP (IRXCcySwapFixFlt) - Fixed Rate Return", "CNH", -1939510.65, "Pay", "2026-08-18", "Nomura Financial Products & Services, Inc"],
["EML-00072", "Deutsche Bank AG", "AP303677M", "XCY_SWAP (IRXCcySwapFixFlt) - Fixed Rate Return", "CNH", 438369.57, "Receive", "2026-08-18", "Nomura Financial Products & Services, Inc"],
["EML-00072", "Deutsche Bank AG", "Z477335M", "XCY_SWAP (IRXCcySwapBasisMTM) - Floating Rate Return", "JPY", -26002980.0, "Pay", "2026-08-18", "Nomura Financial Products & Services, Inc"],
["EML-00072", "Deutsche Bank AG", "AP303674M", "XCY_SWAP (IRXCcySwapFixFlt) - Floating Rate Return", "USD", -397826.4, "Pay", "2026-08-18", "Nomura Financial Products & Services, Inc"],
["EML-00072", "Deutsche Bank AG", "AP303677M", "XCY_SWAP (IRXCcySwapFixFlt) - Floating Rate Return", "USD", -99456.6, "Pay", "2026-08-18", "Nomura Financial Products & Services, Inc"],
["EML-00072", "Deutsche Bank AG", "A4482693M", "IR Swap (IRSwapFixFlt) - Floating Rate Return", "USD", -268532.82, "Pay", "2026-08-18", "Nomura Financial Products & Services, Inc"],
["EML-00072", "Deutsche Bank AG", "AY841269M", "XCY_SWAP (IRXCcySwapFixFlt) - Fixed Rate Return", "CNH", 1011784.11, "Receive", "2026-08-18", "Nomura Financial Products & Services, Inc"],
["EML-00072", "Deutsche Bank AG", "AY841272M", "XCY_SWAP (IRXCcySwapFixFlt) - Floating Rate Return", "USD", 185542.02, "Receive", "2026-08-18", "Nomura Financial Products & Services, Inc"],
["EML-00072", "Deutsche Bank AG", "AY672626M", "XCY_SWAP (IRXCcySwapFixFlt) - Floating Rate Return", "USD", 435420.74, "Receive", "2026-08-18", "Nomura Financial Products & Services, Inc"],
["EML-00072", "Deutsche Bank AG", "SL430922L", "XCY_SWAP (IRXCcySwapBasisMTM) - Floating Rate Return", "AUD", 280267.79, "Receive", "2026-08-18", "Nomura Financial Products & Services, Inc"],
["EML-00072", "Deutsche Bank AG", "Z477335M", "XCY_SWAP (IRXCcySwapBasisMTM) - Floating Rate Return", "USD", 1177521.24, "Receive", "2026-08-18", "Nomura Financial Products & Services, Inc"],
["EML-00072", "Deutsche Bank AG", "AY672626M", "XCY_SWAP (IRXCcySwapFixFlt) - Fixed Rate Return", "CNH", -1586872.35, "Pay", "2026-08-18", "Nomura Financial Products & Services, Inc"],
["EML-00072", "Deutsche Bank AG", "AW004629M", "XCY_SWAP (IRXCcySwapFixFlt) - Fixed Rate Return", "CNH", 411647.84, "Receive", "2026-08-18", "Nomura Financial Products & Services, Inc"],
["EML-00072", "Deutsche Bank AG", "AP303674M", "XCY_SWAP (IRXCcySwapFixFlt) - Fixed Rate Return", "CNH", 1753533.29, "Receive", "2026-08-18", "Nomura Financial Products & Services, Inc"],
["EML-00072", "Deutsche Bank AG", "SL430922L", "XCY_SWAP (IRXCcySwapBasisMTM) - Multiple", "USD", -627938.03, "Pay", "2026-08-18", "Nomura Financial Products & Services, Inc"],
["EML-00072", "Deutsche Bank AG", "AY841269M", "XCY_SWAP (IRXCcySwapFixFlt) - Floating Rate Return", "USD", -241204.63, "Pay", "2026-08-18", "Nomura Financial Products & Services, Inc"],
["EML-00072", "Deutsche Bank AG", "TY862091L", "XCY_SWAP (IRXCcySwapBasisMTM) - Principal", "USD", -49337.6, "Pay", "2026-08-18", "Nomura Financial Products & Services, Inc"],
["EML-00072", "Deutsche Bank AG", "AW004629M", "XCY_SWAP (IRXCcySwapFixFlt) - Floating Rate Return", "USD", -92771.01, "Pay", "2026-08-18", "Nomura Financial Products & Services, Inc"],
["EML-00072", "Deutsche Bank AG", "AY841272M", "XCY_SWAP (IRXCcySwapFixFlt) - Fixed Rate Return", "CNH", -774589.3, "Pay", "2026-08-18", "Nomura Financial Products & Services, Inc"],
["EML-00073", "NatWest Markets Plc", "HK030777915979_REP1", "Basis Swaps", "AUD", 224318.68, "Receive", "2026-08-21", "Nomura International Plc, London"],
["EML-00074", "BNP PARIBAS", "SN00002180331", "Options Premium (PREM)", "USD", 5462.1, "Receive", "2026-07-24", "NOMURA INTERNATIONAL PLC"],
["EML-00075", "BNP PARIBAS", "", "Equity Option Premium (PREM)", "JPY", 1511616.0, "Receive", "2026-07-28", "NOMURA INTERNATIONAL PLC"],
["EML-00075", "BNP PARIBAS", "", "Equity Option Premium (PREM)", "JPY", 2050200.0, "Receive", "2026-07-28", "NOMURA INTERNATIONAL PLC"],
["EML-00075", "BNP PARIBAS", "", "Equity Option Premium (PREM)", "JPY", 1968192.0, "Receive", "2026-07-28", "NOMURA INTERNATIONAL PLC"],
["EML-00076", "BNP PARIBAS", "", "Options Premium (EQD)", "USD", 136.75, "Receive", "2026-07-27", "NOMURA INTERNATIONAL PLC"],
["EML-00077", "The Bank of Nova Scotia (BNS)", "465582", "Equity Swap (Short Total Return Swap)", "GBP", -5780033.09, "Pay", "2026-08-05", "Nomura International PLC"],
["EML-00078", "Macquarie Bank Limited", "", "Equity Swap / Swap Reset", "USD", -4151722.3, "Pay", "2026-08-18", "NOMURA INTERNATIONAL PLC"],
["EML-00079", "Nomura Europe Finance .N.V", "", "Swap - FI", "USD", 4205.66, "Pay", "2026-08-18", "NFPS"],
["EML-00080", "Nomura Europe Finance .N.V", "", "Swap - FI (IRS)", "JPY", -1030555.0, "Pay", "2026-08-21", "NGFP1"],
["EML-00081", "Nomura International PLC (NIP1)", "NIP1_20260819_0001 / 1005264", "Note - MTN Fee (Phoenix Net)", "JPY", 644000.0, "Receive", "2026-08-19", "Nomura Europe Finance N.V. (NEF) / Nomura International PLC (NIP)"],
["EML-00082", "OCBC Bank", "ProdRef:99383986 / TradeRef:348285457", "", "EUR", 139286.83, "Receive", "2026-08-18", ""],
["EML-00082", "OCBC Bank", "ProdRef:108463201 / TradeRef:357860860", "", "SGD", -30000.0, "Pay", "2026-08-18", ""],
["EML-00082", "OCBC Bank", "ProdRef:108471580 / TradeRef:357873702", "", "SGD", -7500.0, "Pay", "2026-08-18", ""],
["EML-00082", "OCBC Bank", "ProdRef:108472927 / TradeRef:357875038", "", "USD", -5666.64, "Pay", "2026-08-18", ""],
["EML-00082", "OCBC Bank", "ProdRef:108473242 / TradeRef:357875342", "", "SGD", -9560.01, "Pay", "2026-08-18", ""],
["EML-00082", "OCBC Bank", "ProdRef:108473918 / TradeRef:357876010", "", "SGD", -6000.0, "Pay", "2026-08-18", ""],
["EML-00082", "OCBC Bank", "ProdRef:108488486 / TradeRef:357890627", "", "USD", -6227.16, "Pay", "2026-08-18", ""],
["EML-00082", "OCBC Bank", "ProdRef:108489057 / TradeRef:357891216", "", "USD", -6000.0, "Pay", "2026-08-18", ""],
["EML-00082", "OCBC Bank", "ProdRef:108490086 / TradeRef:357892259", "", "SGD", -6000.0, "Pay", "2026-08-18", ""],
["EML-00082", "OCBC Bank", "ProdRef:108490678 / TradeRef:357892876", "", "USD", -6600.0, "Pay", "2026-08-18", ""],
["EML-00082", "OCBC Bank", "ProdRef:108492604 / TradeRef:357894822", "", "SGD", -10500.0, "Pay", "2026-08-18", ""],
["EML-00082", "OCBC Bank", "ProdRef:92738659 / TradeRef:341048822", "", "JPY", -101126.0, "Pay", "2026-08-18", ""],
["EML-00082", "OCBC Bank", "ProdRef:95285092 / TradeRef:343768653", "", "SGD", 230.8, "Receive", "2026-08-18", ""],
["EML-00082", "OCBC Bank", "ProdRef:95550946 / TradeRef:344067831", "", "SGD", -1682.67, "Pay", "2026-08-18", ""],
["EML-00082", "OCBC Bank", "ProdRef:96322823 / TradeRef:344879373", "", "JPY", -724498.0, "Pay", "2026-08-18", ""],
["EML-00082", "OCBC Bank", "ProdRef:99383455 / TradeRef:348284882", "", "SGD", 248041.1, "Receive", "2026-08-18", ""],
["EML-00082", "OCBC Bank", "ProdRef:99387089 / TradeRef:348288773", "", "SGD", -1179.53, "Pay", "2026-08-18", ""],
["EML-00082", "OCBC Bank", "ProdRef:99387137 / TradeRef:348288824", "", "SGD", 198439.85, "Receive", "2026-08-18", ""],
["EML-00082", "OCBC Bank", "ProdRef:99383843 / TradeRef:348285301", "", "SGD", -1179.53, "Pay", "2026-08-18", ""],
["EML-00082", "OCBC Bank", "ProdRef:99383857 / TradeRef:348285314", "", "SGD", 247468.48, "Receive", "2026-08-18", ""],
["EML-00082", "OCBC Bank", "ProdRef:99384100 / TradeRef:348285577", "", "SGD", -1269.2, "Pay", "2026-08-18", ""],
["EML-00082", "OCBC Bank", "ProdRef:99384726 / TradeRef:348286259", "", "SGD", -1846.13, "Pay", "2026-08-18", ""],
["EML-00082", "OCBC Bank", "ProdRef:100900563 / TradeRef:349906281", "", "SGD", 178.29, "Receive", "2026-08-18", ""],
["EML-00082", "OCBC Bank", "ProdRef:101030001 / TradeRef:350045542", "", "SGD", -4846.13, "Pay", "2026-08-18", ""],
["EML-00082", "OCBC Bank", "ProdRef:103932776 / TradeRef:353109559", "", "SGD", -1497.73, "Pay", "2026-08-18", ""],
["EML-00082", "OCBC Bank", "ProdRef:103932709 / TradeRef:353109492", "", "SGD", -1179.53, "Pay", "2026-08-18", ""],
["EML-00082", "OCBC Bank", "ProdRef:103931366 / TradeRef:353108115", "", "SGD", -1179.53, "Pay", "2026-08-18", ""],
["EML-00082", "OCBC Bank", "ProdRef:103931631 / TradeRef:353108377", "", "SGD", -3025.47, "Pay", "2026-08-18", ""],
["EML-00082", "OCBC Bank", "ProdRef:103934169 / TradeRef:353110977", "", "SGD", -2593.17, "Pay", "2026-08-18", ""],
["EML-00082", "OCBC Bank", "ProdRef:103930761 / TradeRef:353107515", "", "SGD", -1179.53, "Pay", "2026-08-18", ""],
["EML-00082", "OCBC Bank", "ProdRef:103934439 / TradeRef:353111257", "", "SGD", -1512.73, "Pay", "2026-08-18", ""],
["EML-00082", "OCBC Bank", "ProdRef:104222577 / TradeRef:353427356", "", "SGD", -2359.07, "Pay", "2026-08-18", ""],
["EML-00082", "OCBC Bank", "ProdRef:103934462 / TradeRef:353111278", "", "SGD", -1769.3, "Pay", "2026-08-18", ""],
["EML-00082", "OCBC Bank", "ProdRef:103934781 / TradeRef:353111606", "", "SGD", -1881.13, "Pay", "2026-08-18", ""],
["EML-00082", "OCBC Bank", "ProdRef:105657513 / TradeRef:354928031", "", "SGD", -2846.13, "Pay", "2026-08-18", ""],
["EML-00082", "OCBC Bank", "ProdRef:105348872 / TradeRef:354592969", "", "SGD", -1179.53, "Pay", "2026-08-18", ""],
["EML-00082", "OCBC Bank", "ProdRef:105349224 / TradeRef:354593365", "", "SGD", -3156.8, "Pay", "2026-08-18", ""],
["EML-00082", "OCBC Bank", "ProdRef:105348864 / TradeRef:354592961", "", "SGD", -3519.2, "Pay", "2026-08-18", ""],
["EML-00082", "OCBC Bank", "ProdRef:105349205 / TradeRef:354593341", "", "SGD", -1179.53, "Pay", "2026-08-18", ""],
["EML-00082", "OCBC Bank", "ProdRef:105349717 / TradeRef:354593850", "", "SGD", -1179.53, "Pay", "2026-08-18", ""],
["EML-00082", "OCBC Bank", "ProdRef:106555149 / TradeRef:355837905", "", "JPY", -386804.0, "Pay", "2026-08-18", ""],
["EML-00082", "OCBC Bank", "ProdRef:107058875 / TradeRef:356385179", "", "SGD", -779.29, "Pay", "2026-08-18", ""],
["EML-00082", "OCBC Bank", "ProdRef:106656072 / TradeRef:355945929", "", "JPY", -370021.0, "Pay", "2026-08-18", ""],
["EML-00082", "OCBC Bank", "ProdRef:101030448 / TradeRef:350046023", "", "USD", -1596.62, "Pay", "2026-08-18", ""],
["EML-00082", "OCBC Bank", "ProdRef:103932335 / TradeRef:353109103", "", "USD", -1912.81, "Pay", "2026-08-18", ""],
["EML-00082", "OCBC Bank", "ProdRef:103931187 / TradeRef:353107931", "", "USD", -2247.9, "Pay", "2026-08-18", ""],
["EML-00082", "OCBC Bank", "ProdRef:105349613 / TradeRef:354593748", "", "USD", -1779.41, "Pay", "2026-08-18", ""],
["EML-00082", "OCBC Bank", "ProdRef:103933479 / TradeRef:353110263", "", "USD", -939.5, "Pay", "2026-08-18", ""],
["EML-00082", "OCBC Bank", "ProdRef:103930940 / TradeRef:353107689", "", "USD", -1312.81, "Pay", "2026-08-18", ""],
["EML-00082", "OCBC Bank", "ProdRef:103933093 / TradeRef:353109865", "", "USD", -1119.32, "Pay", "2026-08-18", ""],
["EML-00082", "OCBC Bank", "ProdRef:104239077 / TradeRef:353445682", "", "USD", -1889.02, "Pay", "2026-08-18", ""],
["EML-00082", "OCBC Bank", "ProdRef:103932310 / TradeRef:353109079", "", "USD", -1519.94, "Pay", "2026-08-18", ""],
["EML-00082", "OCBC Bank", "ProdRef:103934814 / TradeRef:353111640", "", "USD", -1126.21, "Pay", "2026-08-18", ""],
["EML-00082", "OCBC Bank", "ProdRef:104236709 / TradeRef:353443350", "", "USD", -1187.81, "Pay", "2026-08-18", ""],
["EML-00082", "OCBC Bank", "ProdRef:105348836 / TradeRef:354592936", "", "USD", -647.03, "Pay", "2026-08-18", ""],
["EML-00082", "OCBC Bank", "ProdRef:105364599 / TradeRef:354608642", "", "USD", 439.17, "Receive", "2026-08-18", ""],
["EML-00082", "OCBC Bank", "ProdRef:105349627 / TradeRef:354593762", "", "USD", -1975.33, "Pay", "2026-08-18", ""],
["EML-00082", "OCBC Bank", "ProdRef:105364752 / TradeRef:354608786", "", "USD", 499.11, "Receive", "2026-08-18", ""],
["EML-00082", "OCBC Bank", "ProdRef:105348884 / TradeRef:354592980", "", "USD", -3107.18, "Pay", "2026-08-18", ""],
["EML-00082", "OCBC Bank", "ProdRef:108766815 / TradeRef:358173582", "", "SGD", -9000.0, "Pay", "2026-08-18", ""],
["EML-00082", "OCBC Bank", "ProdRef:96364167 / TradeRef:344921910", "", "HKD", 969000.29, "Receive", "2026-08-18", ""]
];

    function pad(s, n) { s = '' + (s === null || s === undefined ? '' : s); while (s.length < n) { s += ' '; } return s.substring(0, n); }
    function rpad(s, n) { s = '' + s; while (s.length < n) { s = ' ' + s; } return s; }

    gs.info('[PCM] ================================================================================');
    gs.info('[PCM] ground truth rows : ' + ROWS.length + '   mails referenced: ' + countKeys(MAILS));
    gs.info('[PCM] DRY_RUN=' + DRY_RUN + '  WIPE_GT_ROWS=' + WIPE_GT_ROWS + '  WIPE_ALL_BOOKINGS=' + WIPE_ALL_BOOKINGS);
    gs.info('[PCM] ================================================================================');

    function countKeys(o) { var n = 0, k; for (k in o) { if (o.hasOwnProperty(k)) { n++; } } return n; }

    // ---------------------------------------------------------------- what is already there
    var before = new GlideAggregate(TBL);
    before.addAggregate('COUNT');
    before.query();
    var beforeN = before.next() ? parseInt(before.getAggregate('COUNT'), 10) : 0;
    gs.info('[PCM] bookings currently on the instance: ' + beforeN);

    // ---------------------------------------------------------------- resolve DERIVED counterparties
    // The matcher compares against the counterparty DERIVED from the sender domain, which lives on
    // the email record. Look it up per mail so Tier 1 can actually hit.
    var cpByEml = {}, foundMails = 0, derived = 0;
    for (var id in MAILS) {
        if (!MAILS.hasOwnProperty(id)) { continue; }
        var subj = ('' + MAILS[id]).substring(0, 60);
        if (!subj) { continue; }
        var eg = new GlideRecord(EML);
        eg.addQuery('name', 'STARTSWITH', subj);
        eg.setLimit(1);
        eg.query();
        if (eg.next()) {
            foundMails++;
            var cp = '' + (eg.getValue('counterparty_name') || '');
            if (cp) { cpByEml[id] = cp; derived++; }
        }
    }
    gs.info('[PCM] mails found on instance : ' + foundMails + ' of ' + countKeys(MAILS));
    gs.info('[PCM] with a derived counterparty : ' + derived +
        '   (the rest fall back to the ground truth name and will match at a lower tier)');

    if (DRY_RUN) {
        gs.info('[PCM] --------------------------------------------------------------------------------');
        gs.info('[PCM] ' + pad('CASHFLOW ID', 14) + pad('COUNTERPARTY', 30) + pad('CCY', 5) +
            rpad('AMOUNT', 16) + '  ' + pad('DIR', 9) + pad('VALUE DATE', 12) + 'SOURCE');
        for (var d = 0; d < ROWS.length && d < 15; d++) {
            var rw = ROWS[d];
            var cpd = cpByEml[rw[0]] || rw[1];
            gs.info('[PCM] ' + pad('GT-' + zero(d + 1), 14) + pad(cpd, 30) + pad(rw[4], 5) +
                rpad(rw[5].toFixed(2), 16) + '  ' + pad(rw[6], 9) + pad(rw[7], 12) +
                (cpByEml[rw[0]] ? 'derived' : 'ground truth'));
        }
        gs.info('[PCM] ... ' + ROWS.length + ' row(s) in total. Nothing was written.');
        return;
    }

    // ---------------------------------------------------------------- clear previous runs
    var removed = 0;
    if (WIPE_ALL_BOOKINGS) {
        var dAll = new GlideRecord(TBL);
        dAll.query();
        while (dAll.next()) { dAll.deleteRecord(); removed++; }
        gs.info('[PCM] deleted ALL ' + removed + ' booking(s)');
    } else if (WIPE_GT_ROWS) {
        var dGt = new GlideRecord(TBL);
        dGt.addQuery('cashflow_id', 'STARTSWITH', 'GT-');
        dGt.query();
        while (dGt.next()) { dGt.deleteRecord(); removed++; }
        gs.info('[PCM] deleted ' + removed + ' booking(s) from a previous run of this script');
    }

    // ---------------------------------------------------------------- insert
    function zero(n) { var s = '' + n; while (s.length < 6) { s = '0' + s; } return s; }

    var created = 0, refused = 0, byCcy = {}, byDir = { Pay: 0, Receive: 0 };
    for (var i = 0; i < ROWS.length; i++) {
        var row = ROWS[i];
        var cp = cpByEml[row[0]] || row[1];
        var gr = new GlideRecord(TBL);
        gr.initialize();
        gr.setValue('cashflow_id', 'GT-' + zero(i + 1));
        gr.setValue('counterparty_org_name', cp);
        gr.setValue('counterparty_entity', row[8] || cp);
        gr.setValue('product_type', row[3]);
        gr.setValue('trade_system', 'PCM');
        gr.setValue('cashflow_type', 'Settlement');
        gr.setValue('currency', row[4]);
        // SIGNED by default - the seed mirrors the ground truth's Nomura amount verbatim.
        gr.setValue('amount', SIGNED_AMOUNTS ? row[5] : Math.abs(row[5]));
        gr.setValue('direction', row[6]);
        gr.setValue('value_date', row[7]);
        gr.setValue('status', 'Not Settled');
        gr.setValue('bank_trade_ref', 'NB-' + zero(700000 + i + 1));
        gr.setValue('counterparty_trade_ref', row[2]);

        // insert() returns null when a cross-scope policy refuses the write. Never assume.
        var sysId = gr.insert();
        if (!sysId) { refused++; continue; }
        created++;
        byCcy[row[4]] = (byCcy[row[4]] || 0) + 1;
        byDir[row[6]] = (byDir[row[6]] || 0) + 1;
    }

    // ---------------------------------------------------------------- report
    var after = new GlideAggregate(TBL);
    after.addAggregate('COUNT');
    after.query();
    var afterN = after.next() ? parseInt(after.getAggregate('COUNT'), 10) : 0;

    gs.info('[PCM] --------------------------------------------------------------------------------');
    gs.info('[PCM] created  : ' + created);
    if (refused) { gs.error('[PCM] REFUSED  : ' + refused + ' insert(s) returned null - check the scope and ACLs'); }
    gs.info('[PCM] deleted  : ' + removed);
    gs.info('[PCM] bookings : ' + beforeN + ' -> ' + afterN);
    var parts = [];
    for (var c in byCcy) { if (byCcy.hasOwnProperty(c)) { parts.push(c + ' ' + byCcy[c]); } }
    gs.info('[PCM] currency : ' + parts.join(', '));
    gs.info('[PCM] direction: Pay ' + byDir.Pay + ', Receive ' + byDir.Receive);
    gs.info('[PCM] --------------------------------------------------------------------------------');
    gs.info('[PCM] Allege rows were deliberately NOT seeded - those mails should come back');
    gs.info('[PCM] unmatched, and that is the correct answer.');
    gs.info('[PCM]');
    gs.info('[PCM] NEXT: open a board and run Compare & Match on a mail you know is in the ground');
    gs.info('[PCM] truth. A Tier 1 hit means currency, direction, value date, counterparty AND');
    gs.info('[PCM] amount all agreed. A Tier 3 hit means the counterparty did not - most likely the');
    gs.info('[PCM] sender is not in the Eve directory, so the email has no derived counterparty.');
    gs.info('[PCM] ================================================================================');
})();
