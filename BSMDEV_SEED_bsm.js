/**
 * BSMDEV SEED — apply the tuned configuration and work driver to bsmdev.
 * Scripts - Background, Application = "NexAI OTC BSM", "Execute in sandbox?" UNCHECKED.
 *
 * *** THIS SCRIPT WRITES. *** It is idempotent: run it twice and the second run reports
 * "unchanged" for everything it already applied.
 *
 * WHY THIS EXISTS. An update set carries metadata only, and the Import XML route would not
 * process the record exports. Two things were therefore missing on bsmdev:
 *
 *   1. the 6 extract.chunk_* configuration keys — without them the big-mail splitter falls
 *      back to code defaults, which happen to match, but the keys need to exist so they can
 *      be tuned per instance.
 *   2. THE WORK DRIVER. This is the one that matters. Its input_fields column holds the
 *      13 field prompts with three worked examples each — 18,929 characters of tuning done
 *      against the real corpus. The seed script that shipped in September holds the OLD
 *      prompts, so without this the new code runs against stale instructions: software that
 *      looks installed and quietly extracts the wrong things.
 *
 * NOT TOUCHED, deliberately: bookings and counterparties. bsmdev already has them from the
 * September seed and re-inserting risks duplicates for no gain.
 */
(function () {
    var scope = '' + gs.getCurrentScopeName();
    if (scope !== 'x_nose_nfotc_bsm') {
        gs.error('[SEED] ABORT: run with Application = NexAI OTC BSM, not ' + scope);
        return;
    }

    var created = 0, updated = 0, same = 0;

    // ---------------------------------------------------------------- configuration keys
    var CFG = [
        { key: "match.vd_tol_days", label: "Value-date window (business days)", value: "2", type: "number", group: "matching", desc: "Tier 2 fuzzy value-date window, +/- N BUSINESS days (weekends skipped; holidays pending a calendar)." },
        { key: "match.name_fuzzy_pct", label: "Fuzzy name-match threshold", value: "0.85", type: "number", group: "matching", desc: "Tier 2 counterparty-name similarity threshold (0-1). 0.85 = 85% similar." },
        { key: "match.t2_amt_abs", label: "Tier 2 amount tolerance", value: "50.0", type: "number", group: "matching", desc: "Tier 2 amount tolerance in currency units (FSD \"$50 equivalent\" — FX normalization pending rates)." },
        { key: "extract.chunk_sec_per_row", label: "Seconds per row (0 = auto)", value: "0", type: "number", group: "extraction", desc: "Override the per-row cost. 0 derives it from the field count (~0.7s at 13 fields), so a narrower driver fits more rows per chunk." },
        { key: "extract.chunk_budget_s", label: "Seconds per extraction call", value: "15", type: "number", group: "extraction", desc: "Target duration of ONE chunk call. Half the 30s MID/ECC response wait, leaving headroom. Rows per chunk are derived from this and the field count." },
        { key: "extract.chunk_threshold", label: "Chunk above N cashflow rows", value: "12", type: "number", group: "extraction", desc: "Mails with at least this many cashflow rows are extracted in several concurrent calls. Below it, one call as before." },
        { key: "extract.chunk_overhead_s", label: "Fixed call overhead (seconds)", value: "9", type: "number", group: "extraction", desc: "Measured fixed cost of any Chinou call before the first row is written. Subtracted from the budget when sizing a chunk." },
        { key: "extract.chunk_cap", label: "Concurrent calls per mail", value: "4", type: "number", group: "extraction", desc: "How many chunk calls are in flight at once. Raising it shortens big mails but puts more load on the shared Chinou gateway." },
        { key: "extract.chunk_html_fallback", label: "Recover rows from HTML when flattened", value: "1", type: "number", group: "extraction", desc: "1 = when the plain-text table is flattened onto one line, read the row boundaries from the mail HTML <tr> instead (20 of 177 production mails are this shape). 0 = off." }
    ];

    for (var i = 0; i < CFG.length; i++) {
        var c = CFG[i];
        var g = new GlideRecord('x_nose_nfotc_bsm_config');
        g.addQuery('key', c.key);
        g.query();
        if (g.next()) {
            if (('' + g.getValue('value')) === c.value) {
                same++;
                gs.info('[SEED] config unchanged : ' + c.key + ' = ' + c.value);
            } else {
                var was = '' + g.getValue('value');
                g.setValue('value', c.value);
                g.update();
                updated++;
                gs.info('[SEED] config UPDATED   : ' + c.key + '  ' + was + ' -> ' + c.value);
            }
        } else {
            var n = new GlideRecord('x_nose_nfotc_bsm_config');
            n.initialize();
            n.setValue('key', c.key);
            n.setValue('label', c.label);
            n.setValue('value', c.value);
            n.setValue('type', c.type);
            n.setValue('config_group', c.group);
            n.setValue('description', c.desc);
            n.insert();
            created++;
            gs.info('[SEED] config CREATED   : ' + c.key + ' = ' + c.value + '  [' + c.group + ']');
        }
    }

    // ---------------------------------------------------------------- the work driver
    // The JSON columns below are the tuning. Everything else about the wizard already exists
    // on bsmdev; only these are replaced.
    var WIZ_NAME = "OTC Settlement : Prematching";
    var INPUT_FIELDS = "[{\"name\":\"Value Date\",\"type\":\"string\",\"prompt\":\"Extract the settlement / value date for this cashflow. It may appear under a value-date column or label, after the word 'value', in a key/value line, inside a SWIFT date-and-amount field, or — only when the body contains none — in the subject line. The source date may be written in ISO, day-first, or day-month-name form, or as a compact SWIFT date; interpret whichever is present. Always return the date in ISO format YYYY-MM-DD. If it is genuinely absent, return an empty string.\",\"example\":\"\",\"value\":\"2026-06-13\",\"custom\":false,\"mapExclude\":false,\"examples\":[\"2026-06-13\",\"2026-06-14\",\"2026-06-05\"]},{\"name\":\"Amount\",\"type\":\"float\",\"prompt\":\"Extract the settlement amount of THIS cashflow - the cash amount to be paid or received on the value date, labelled for example Amount, Settlement Amount, Payment Amount, Net Amount, Net, Total, Flow Amount, Cashflow Amount, Payment Due or SETTLEAMOUNT, or stated in a sentence such as 'due to pay USD 207,973.59'. When a row shows several money figures, take the one in the settlement currency that the email asks to settle - not the trade's notional or principal, a local-currency equivalent, a price, a rate, a fee percentage or a component leg (e.g. 'Notional: KRW 1,000,000,000', 'UF 1.00%'). A column named Quantity is the amount only when it holds cash in the settlement currency, not a number of shares, units or ounces. A reference or id formatted with commas (e.g. 'Registry Id 17,888,387.45') is not an amount. Return a plain number: remove currency codes and symbols, spaces and thousands separators, and use a dot for decimals (1,234.56 / 1.234,56 / 1 234,56 / 1'234.56 all become 1234.56). Return the amount WITHOUT a sign: a minus sign or brackets only indicate who pays, and the Direction field records that. If no amount is given for this row, return an empty string.\",\"example\":\"\",\"value\":\"1497447.18\",\"custom\":false,\"mapExclude\":false,\"examples\":[\"1154540.63\",\"207973.59\",\"39087.22\"]},{\"name\":\"Currency\",\"type\":\"string\",\"prompt\":\"Extract the settlement currency for this cashflow as a three-letter ISO 4217 code. It may appear under a currency\\n  column or label, in a key/value line, embedded inside a SWIFT date-and-amount field, or as the first token of a\\n  shorthand amount line. Return the uppercase three-letter code only. If it is absent, return an empty string.\",\"example\":\"\",\"value\":\"EUR\",\"custom\":false,\"mapExclude\":false,\"examples\":[\"EUR\",\"SGD\",\"AUD\"]},{\"name\":\"Direction\",\"type\":\"string\",\"prompt\":\"Extract the settlement direction of THIS cashflow and return exactly 'Pay' or 'Receive'.\\n\\nPoint of view: always the firm that SENT this email (identified by the From address, signature or letterhead; when an administrator writes for a fund or client, that fund or client). 'Pay' means the sender pays this amount; 'Receive' means the sender receives it. Never answer from Nomura's side. Columns labelled Counterparty, CPTY, CP Name, Customer or Client in the sender's table name Nomura, not the sender.\\n\\nRead it in this order: (1) A direction stated for the row - a Pay/Receive, P/R, Pay/Rec, Direction, Payment Direction, Send/Receive or S/R column ('Send' means Pay); a header naming the sender ('<sender> Pays', '<sender> P/R', '<sender> to', 'Amount (<sender> Rec)'); a 'Pay to / Rec at' column; a single letter P or R; a C/D code (read it with the email's legend; without one, C means the sender receives and D means the sender pays); a SWIFT or DOCFUNCTION tag; or 'Pay from' / 'To' columns. If the text names Nomura as the payer or receiver (e.g. 'NOMURA ... is due to receive'), the sender's direction is the opposite. (2) A sentence such as 'we pay you', 'we will pay', 'is due to pay', '<sender> will receive', 'in our favour', 'please pay us' ('in our favour' and 'pay us' mean the sender receives). (3) A stated sign legend (e.g. 'Negative amounts = <sender> pays', 'Minus means we pay you', 'Positive amount - <sender> receive', 'amounts are from <sender>'s perspective', 'Pay or Receive is from client perspective', 'when the total payment due is positive, it is due from the Counterparty in favour of <sender>') applied to this row's sign or brackets; convert a legend written from another party's perspective to the sender's side. (4) Otherwise, read the amount's own sign as the convention: an amount written with a minus sign or in brackets means the sender PAYS, and an amount written without a sign means the sender RECEIVES. Apply this to every row, including a table in which no amount is negative at all - a settlement notice sent BY the counterparty lists what it expects to receive, so an unsigned amount means the sender receives and Nomura pays.\\n\\nIgnore pay/receive words that describe swap legs inside a product or payment-category text (e.g. 'PAY SWAP FIXED COUPON; RCV SWAP FLOAT COUPON') and anything quoted from a Nomura reply. Return an empty string only when the row carries no amount at all.\",\"example\":\"\",\"value\":\"Pay\",\"custom\":false,\"mapExclude\":false,\"examples\":[\"Pay\",\"Receive\",\"Pay\"]},{\"name\":\"Counterparty Reference\",\"type\":\"string\",\"prompt\":\"Extract the sender's own reference for THIS cashflow. Decide ONCE, for the whole email, which column or label holds it: read the table header, pick the single best candidate, then use that SAME source for every row - never take the reference from one column for some rows and a different column for others. Choose by MEANING, never by position; the right column is often not the first one. Priority, highest first: (1) a cashflow-level id - Cashflow ID, Flow ID, Flow Ref, Payment ID, Settlement ID, Transaction ID; (2) a trade or deal id - Trade ID, Trade Ref, Trade reference, Deal ID, Deal, Deal Ref, Swap ID; (3) another reference the sender labels as its own - Our Ref, Reference, Ref No, Prod. Ref, Product Ref, Confirmation Ref, or '<sender name> Reference'; (4) when the email settles one netted amount, the netting or settlement reference (Netting ID, Settlement No). A candidate higher in this list always wins - in a table headed 'Prod. Ref | Trade reference | Cur. | ValueDate | Quantity', use Trade reference for every row, because a trade id (2) outranks a product reference (3) even though Prod. Ref comes first. Never return a reference labelled as Nomura's or the recipient's ('Your Ref', 'C.P Reference', 'Counterparty Ref No', a column named after a Nomura entity), a ticket, case or request number, a client, fund, book or account code, a security code (SEDOL, ISIN), or a SWIFT BIC. Copy the value exactly as written - keep letters, dots, hyphens, slashes and commas (e.g. '6,532,559'), keep both parts of a pair such as '157898935 / 172821440', and drop surrounding quotes and spaces. If the row carries no reference, return an empty string.\",\"example\":\"\",\"value\":\"M00126446018\",\"custom\":false,\"mapExclude\":true,\"examples\":[\"340319756\",\"M00126446018\",\"18842923M\"]},{\"name\":\"Counterparty Name\",\"type\":\"string\",\"prompt\":\"Extract the legal name of the counterparty - the trading party on the other side from Nomura, i.e. the firm that sent this email or on whose behalf it was sent. Prefer, in this order: (1) the sending legal entity as stated in the email or its attachment ('FROM: <name>', 'Entity: <name>', '<name> is due to pay', a letterhead, 'For payments to <name>', the beneficiary of the sender's own payment instructions); (2) the bank or company line of the signature or legal footer; (3) the sender's display name. When a fund administrator, investment manager or adviser writes for a fund or client (a 'Fund', 'Fund Name', 'Client' or 'Book' column or line, or 'on behalf of'), return that fund or client. A shared-service or operations company in a signature (e.g. a name containing 'Business Services', 'Solutions' or 'Consulting') is not the trading party when the email names the trading bank or its booking entity elsewhere - return the trading bank. If a Nomura group entity writes to another Nomura entity, return the sending Nomura entity; otherwise never return a Nomura entity. Never return a person, a team or mailbox name, or a table value that names Nomura (columns such as Counterparty, CPTY, CP Name or Customer in the sender's table usually name Nomura). A value that is only a branch, city or desk (e.g. 'Sydney Branch') is not the name - use the legal entity name written elsewhere in the email, such as in its payment instructions or signature. Prefer a name written in Latin script; if the sender's name appears only in another script, return the sender's Latin-script code or BIC from the email (e.g. from the subject) instead. Return the name as written, without address or department. If only a short code or BIC identifies the sender, return that; if nothing does, return an empty string.\",\"example\":\"\",\"value\":\"Goldman Sachs International\",\"custom\":false,\"mapExclude\":true,\"examples\":[\"Goldman Sachs International\",\"Standard Chartered Bank\",\"National Bank of Canada\"]},{\"name\":\"Nomura Entity\",\"type\":\"string\",\"prompt\":\"Extract the Nomura legal entity that is party to THIS cashflow - the Nomura side, never the sender. Look first on the row itself: sender tables usually list Nomura under a column such as Counterparty, CPTY, CP Name, Customer, Customer Name, Client Name, Counterparty Legal Name, Legal Entity, Long Name, Booking Entity, Settlement CP, Broker or a system code column (FMCODE, CUST, FlowCpty, TradeParty, Crds). If the row has none, use the subject line, a 'between <sender> and Nomura ...' phrase, the 'To:' party of an attached notice, or the beneficiary of Nomura's payment instructions for this cashflow. Rows of one email can belong to different Nomura entities - take this row's. Return the most complete form present, exactly as written: a full legal name (e.g. 'NOMURA INTERNATIONAL PLC') is preferred to an abbreviation or system code (e.g. 'NOM INTL PLC', 'NOMURA INTL*LDN', 'NIP'), which is preferred to a SWIFT BIC alone (e.g. 'NOMAGB2L'). Never return a purely numeric client or account id, or text from email addresses, legal footers (e.g. a tax number labelled 'NIP') or the signatures of Nomura staff. For an email between two Nomura group entities, return the Nomura entity that is not the sender. If no Nomura entity is identifiable, return an empty string.\",\"example\":\"\",\"value\":\"NOMURA INTERNATIONAL PLC\",\"custom\":false,\"mapExclude\":true,\"examples\":[\"NOMURA INTERNATIONAL PLC\",\"NOMURA GLOB FIN PROD INC\",\"Nomura Financial Products & Services, Inc\"]},{\"name\":\"Product\",\"type\":\"string\",\"prompt\":\"Extract the product or instrument type of THIS cashflow. Use a column or line whose values name the instrument - labelled for example Product, Product Type, Product Class, Subproduct, Instrument, Trade Type, TradeType, Typology, Transaction Type, Asset Type or Product Features - when one is present; otherwise use the instrument named in the email's own text or subject (for example IRS, CCS, NDF, TRS, Swaption, Equity Swap, Basis Swap, Option Premium, Upfront Fee). Copy the value exactly as written, including system codes (e.g. 'BASIS_SWAP', 'IRD|OSWP'). Do not return a column heading or abbreviation used as a label (e.g. 'UF'), a placeholder ('0', '-'), a status, or a product derived from a reference, book, desk or team name. If no product is stated, return an empty string.\",\"example\":\"\",\"value\":\"Interest Rate Swap\",\"custom\":false,\"mapExclude\":true,\"examples\":[\"Interest Rate Swap\",\"NDF\",\"BASIS_SWAP\"]},{\"name\":\"Trade Date\",\"type\":\"string\",\"prompt\":\"Extract the trade date of THIS cashflow - the date the trade was executed, labelled for example Trade Date, TD, T/D, TradeDate, Deal Date or Execution Date. It is not the value, payment or settlement date, and not a start, effective, maturity, fixing, reset, valuation, P&L, issue, ex-dividend, accrual or confirmation date - never return those. Read the form the email uses (2026-08-17, 17/08/2026, 8/17/2026, 17-Aug-2026, 17Aug2026, August 17, 2026, 2026.07.08); a six-digit date follows the format given in its label (e.g. 'ddmmyy'), and a two-digit year means 20YY. When a slash date is ambiguous, decide day and month order from other dates in the same email. If the year is missing, take it from another date written in the email; if the email writes no year at all, return an empty string. Always return ISO format YYYY-MM-DD. If no trade date is stated for this row, return an empty string.\",\"example\":\"\",\"value\":\"2026-08-17\",\"custom\":false,\"mapExclude\":true,\"examples\":[\"2026-08-17\",\"2026-07-08\",\"2026-05-07\"]},{\"name\":\"SSI Bank / BIC\",\"type\":\"string\",\"prompt\":\"Extract the account-with bank of the settlement instructions (SSI) for THIS cashflow. Use the instructions of the party that RECEIVES this cashflow: the sender's own ('Our SSI', 'Ours', 'Our payment instructions', 'Please pay to', '<sender> cash / payment instructions', the sender's SSI document) when the sender receives; Nomura's as quoted by the sender ('Your SSI', 'Yours', 'Your payment instructions', 'Customer' or 'Client Settlement Instructions', 'We will pay to', 'Paying To') when the sender pays. Use instructions printed on the row only if they belong to that receiving party - tell whose they are from the label or the beneficiary (a Nomura name or BIC means Nomura's). In an SSI list covering several currencies or several of the sender's entities, use the line for this cashflow's currency and entity (and, where the list distinguishes, the derivatives or non-resident line). The account-with bank is where the beneficiary's account is held (SWIFT field 57A; labelled e.g. Account with Bank, Account With Institution, AWB, Agent Bank, Agent, Correspondent Bank, Beneficiary Bank, Bene Bank, Bank, Bank Name, Route Code, Creditor Agent, or written as 'pay to <bank>' / 'For Credit to <bank>'). Return the bank name followed by its BIC in parentheses, e.g. 'BANK OF AMERICA, N.A. (BOFAUS3N)'; if only one of the two is given, return that one. Never return the beneficiary, an intermediary (field 56A), or a routing code (ABA, Fedwire, CHIPS, BSB, sort code). If the SSI is only referred to ('as per SSI on file', 'usual SSIs in our records') or not given, return an empty string.\",\"example\":\"\",\"value\":\"BANK OF AMERICA, N.A. (BOFAUS3N)\",\"custom\":false,\"mapExclude\":true,\"examples\":[\"BANK OF AMERICA, N.A. (BOFAUS3N)\",\"CITIBANK JAPAN LTD (CITIJPJT)\",\"MUFG BANK LTD (BOTKJPJT)\"]},{\"name\":\"SSI Account\",\"type\":\"string\",\"prompt\":\"Extract the beneficiary's account number from the settlement instructions (SSI) for THIS cashflow. Use the instructions of the party that RECEIVES this cashflow: the sender's own ('Our SSI', 'Ours', 'Our payment instructions', 'Please pay to', the sender's SSI document) when the sender receives; Nomura's as quoted by the sender ('Your SSI', 'Yours', 'Your payment instructions', 'Customer' or 'Client Settlement Instructions', 'We will pay to', 'Paying To') when the sender pays. Use instructions printed on the row only if they belong to that receiving party; in an SSI list covering several currencies or entities, use the line for this cashflow's currency and entity. The account is labelled e.g. Account, Account No., Account Number, Acct, A/C, A/C No, ACC, Bene Account, Beneficiary Account, Account at Agent, BENEFICIARY_ACCOUNT, C.P A/C No or IBAN. Copy it exactly as written, keeping hyphens, spaces and leading zeros (e.g. '6550-6-61548', '0-158101-408'), without the label or a leading '/'. If the same line shows both a local account number and an IBAN, return the IBAN. Never return a routing or clearing code (ABA, Fedwire, CHIPS UID, BSB, sort code, clearing number), a SWIFT BIC, or an intermediary's account. If the SSI is only referred to or not given, return an empty string.\",\"example\":\"\",\"value\":\"6550661548\",\"custom\":false,\"mapExclude\":true,\"examples\":[\"6550661548\",\"0-158101-408\",\"GB44CITI18500812543850\"]},{\"name\":\"SSI Beneficiary / BIC\",\"type\":\"string\",\"prompt\":\"Extract the beneficiary of the settlement instructions (SSI) for THIS cashflow. Use the instructions of the party that RECEIVES this cashflow: the sender's own ('Our SSI', 'Ours', 'Our payment instructions', 'Please pay to', the sender's SSI document) when the sender receives; Nomura's as quoted by the sender ('Your SSI', 'Yours', 'Your payment instructions', 'Customer' or 'Client Settlement Instructions', 'We will pay to', 'Paying To') when the sender pays. Use instructions printed on the row only if they belong to that receiving party; in an SSI list covering several currencies or entities, use the line for this cashflow's currency and entity. The beneficiary is the account holder that finally receives the money (SWIFT field 58A or 59; labelled e.g. Beneficiary, BEN, Bene Name, Bene Swift, Beneficiary BIC, Beneficiary Customer, Account Name, F/O, FAO, in favour of). A label such as 'Beneficiary Bank' or 'Banque benf.' names the account-with bank, not the beneficiary. Return the name followed by its BIC in parentheses, e.g. 'NOMURA INTERNATIONAL PLC (NOMAGB2L)'; if only one of the two is given, return that one. If the instructions add a further-credit party ('For Further Credit to', 'FFC'), append it as ' / FFC <name> <account>'. If the receiving party's instructions give a bank and an account but no beneficiary line, the beneficiary is the receiving party itself: return its name and BIC as the instructions state them (e.g. in the SSI document's title), or, for Nomura's instructions, the Nomura entity of this cashflow. Never return the account-with bank or an intermediary. If the SSI is only referred to or not given, return an empty string.\",\"example\":\"\",\"value\":\"NOMURA INTERNATIONAL PLC (NOMAGB2L)\",\"custom\":false,\"mapExclude\":true,\"examples\":[\"NOMURA INTERNATIONAL PLC (NOMAGB2L)\",\"NATIXIS (NATXFRPPMAR)\",\"BNP PARIBAS (BNPAFRPPXXX)\"]},{\"name\":\"SSI Intermediary\",\"type\":\"string\",\"prompt\":\"Extract the intermediary bank of the settlement instructions (SSI) for THIS cashflow, if one is given. Use the instructions of the party that RECEIVES this cashflow (the sender's own when the sender receives; Nomura's as quoted by the sender when the sender pays; row-level instructions only if they belong to that party; in a multi-currency SSI list, the line for this cashflow's currency). The intermediary is the bank the payment passes through before the account-with bank (SWIFT field 56A; labelled e.g. Intermediary, Intermediary Bank, Intermediate Bank, Institution intermediary, IBK, Int. bank, Intermediary Institution, or written as 'via <bank>' or '<bank> (Intermediary Bank)'). Return the name followed by its BIC in parentheses, e.g. 'CITIBANK N.A., NEW YORK (CITIUS33)'; if only one of the two is given, return that one. A placeholder such as '-' or '_' means there is none. If no intermediary is stated, return an empty string.\",\"example\":\"\",\"value\":\"CITIBANK EUROPE PLC (CITIIE2X)\",\"custom\":false,\"mapExclude\":true,\"examples\":[\"CITIBANK EUROPE PLC (CITIIE2X)\",\"CITIBANK N.A., NEW YORK (CITIUS33)\",\"HANG SENG BANK (HASEHKHH)\"]}]";
    var ID_RULES = "[{\"excludeNoise\":true,\"keywords\":\"settlement instruction, value date, deal reference, trade confirmation, pay, receive, FXOPT\",\"subject\":\"settlement, confirmation, FXOPT\",\"name\":\"\",\"context\":\"Outbound OTC FX settlement instructions and trade confirmations — value date, amount, currency, pay/receive direction, and a trade/deal reference. Not entity static-data or reference-data change notices.\",\"exclusions\":\"NLUX\",\"excludeReplies\":true,\"senders\":\"\"}]";
    var MAPPING = "{\"Value Date\":\"value_date\",\"Amount\":\"amount\",\"Currency\":\"currency\",\"Direction\":\"direction\"}";
    var TAGGING = "[{\"stage\":\"Default\",\"tag\":\"\"},{\"stage\":\"Extraction Confirmed\",\"tag\":\"\"},{\"stage\":\"Review Confirmed\",\"tag\":\"\"},{\"stage\":\"Resolved\",\"tag\":\"\"},{\"stage\":\"Escalated\",\"tag\":\"\"}]";
    var WRITEBACK = "[{\"scenario\":\"Matched\",\"actions\":[\"Send to NEWS\"]},{\"scenario\":\"Mismatch\",\"actions\":[\"Reply to Middle Office\"]},{\"scenario\":\"No Match\",\"actions\":[\"Reply to Counterparty\"]}]";
    var CONFIG_OVERRIDES = "{}";
    var STATUS = "published";
    var TARGET_SYSTEM = "PCM";
    var WORK_DRIVER = "Cash flow & SSI confirmation (Int \\ Ext)";
    var ACTIVITY = "Compare & Match";
    var BU = "OPS Shared Services";
    var SUB_BU = "OTC Settlements";
    var SERVICE = "Pre Settlement";

    var wg = new GlideRecord('x_nose_nfotc_bsm_wizard');
    wg.addQuery('name', WIZ_NAME);
    wg.query();

    if (!wg.next()) {
        gs.error('[SEED] work driver "' + WIZ_NAME + '" not found on this instance.');
        gs.error('[SEED] Config keys were applied. Check the wizard list — if the driver is');
        gs.error('[SEED] named differently here, tell me the name and I will re-issue this script.');
        gs.info('[SEED] config: ' + created + ' created, ' + updated + ' updated, ' + same + ' unchanged.');
        return;
    }

    var before = ('' + wg.getValue('input_fields')).length;
    var fieldsChanged = ('' + wg.getValue('input_fields')) !== INPUT_FIELDS;

    wg.setValue('input_fields', INPUT_FIELDS);
    wg.setValue('id_rules', ID_RULES);
    wg.setValue('mapping', MAPPING);
    wg.setValue('tagging', TAGGING);
    wg.setValue('writeback', WRITEBACK);
    wg.setValue('config_overrides', CONFIG_OVERRIDES);
    wg.setValue('status', STATUS);
    wg.setValue('target_system', TARGET_SYSTEM);
    wg.setValue('work_driver', WORK_DRIVER);
    wg.setValue('activity', ACTIVITY);
    wg.setValue('bu', BU);
    wg.setValue('sub_bu', SUB_BU);
    wg.setValue('service', SERVICE);
    wg.update();

    gs.info('[SEED] ------------------------------------------------------------');
    gs.info('[SEED] work driver : ' + WIZ_NAME);
    gs.info('[SEED]   status        : ' + STATUS);
    gs.info('[SEED]   input_fields  : ' + before + ' chars -> ' + INPUT_FIELDS.length + ' chars' +
        (fieldsChanged ? '   *** PROMPTS REPLACED ***' : '   (already identical)'));

    // read it back and count what actually landed, rather than trusting the write
    var check = new GlideRecord('x_nose_nfotc_bsm_wizard');
    check.get(wg.getUniqueValue());
    var flds = [];
    try { flds = JSON.parse('' + check.getValue('input_fields')) || []; } catch (e) { flds = []; }
    var withPrompt = 0, withExamples = 0, totalPrompt = 0, j;
    for (j = 0; j < flds.length; j++) {
        var p = '' + (flds[j].prompt || '');
        if (p) { withPrompt++; totalPrompt += p.length; }
        if (flds[j].examples && flds[j].examples.length >= 3) { withExamples++; }
    }
    gs.info('[SEED]   VERIFIED      : ' + flds.length + ' fields, ' + withPrompt + ' with a prompt, ' +
        withExamples + ' with 3+ examples, ' + totalPrompt + ' chars of prompt text');
    gs.info('[SEED] ------------------------------------------------------------');
    gs.info('[SEED] config: ' + created + ' created, ' + updated + ' updated, ' + same + ' unchanged.');
    gs.info('[SEED] EXPECTED: 13 fields, 13 with a prompt, 13 with 3+ examples, ~16351 chars.');
    gs.info('[SEED] If those numbers match, the tuning is live on this instance.');
    gs.info('[SEED] Next: open the work driver once in the builder (the normaliser self-heals on load),');
    gs.info('[SEED] then drop a test mail and run one Sync.');
})();
