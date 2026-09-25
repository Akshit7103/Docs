[0:00:00.375] Script completed in scope x_nose_nexai_test: script
Script execution history and recovery available here
x_nose_nexai_test: Scope OK: x_nose_nexai_test    instance: nomurabsmdev
x_nose_nexai_test: ------------------------------------------------------------------
x_nose_nexai_test: 1. PUBLISHED WIZARD
x_nose_nexai_test:    name        : OTC Settlement : Prematching
x_nose_nexai_test:    work driver : Cash flow & SSI confirmation (Int \ Ext)
x_nose_nexai_test:    published wizards in this scope: 1
x_nose_nexai_test:    WARN  id_rules DIFFERS from eval   475 chars vs 453 - the relevant/irrelevant split will not match the prediction
x_nose_nexai_test:    id_rules head: [{"excludeNoise":true,"keywords":"settlement instruction, value date, deal reference, trade confirmation, pay, receive, FXOPT","subject":"se
x_nose_nexai_test:    fields configured: 13   (eval has 13)
x_nose_nexai_test:    prompt lengths vs eval:
x_nose_nexai_test:       same Value Date: 482 vs 482
x_nose_nexai_test:       same Amount: 1184 vs 1184
x_nose_nexai_test:       same Currency: 338 vs 338
x_nose_nexai_test:       same Direction: 2426 vs 2426
x_nose_nexai_test:       same Counterparty Reference: 1663 vs 1663
x_nose_nexai_test:       same Counterparty Name: 1804 vs 1804
x_nose_nexai_test:       same Nomura Entity: 1273 vs 1273
x_nose_nexai_test:       same Product: 784 vs 784
x_nose_nexai_test:       same Trade Date: 898 vs 898
x_nose_nexai_test:       same SSI Bank / BIC: 1593 vs 1593
x_nose_nexai_test:       same SSI Account: 1295 vs 1295
x_nose_nexai_test:       same SSI Beneficiary / BIC: 1669 vs 1669
x_nose_nexai_test:       same SSI Intermediary: 942 vs 942
x_nose_nexai_test:    OK    every field prompt matches eval by length
x_nose_nexai_test:    NOTE: on eval, Value Date (482) and Currency (338) are themselves OLD short
x_nose_nexai_test:    prompts - the field catalogue in code holds 1214 and 820. If this scope shows
x_nose_nexai_test:    1214 / 820 it is AHEAD of eval, not broken.
x_nose_nexai_test: ------------------------------------------------------------------
x_nose_nexai_test: 2. GLOBAL ChinouClient
x_nose_nexai_test:    copies named ChinouClient on the instance: 2
x_nose_nexai_test:    WARN  2 copies exist   scoped forks have caused silent failures before
x_nose_nexai_test:    length: 22987 chars
x_nose_nexai_test:    OK    client has invokeBatch()
x_nose_nexai_test:    OK    client has invoke()
x_nose_nexai_test:    OK    client has _fireAsync()
x_nose_nexai_test:    OK    client has _collectAsync()
x_nose_nexai_test: ------------------------------------------------------------------
x_nose_nexai_test: 3. CONFIG (x_nose_nexai_test_config)
x_nose_nexai_test:    OK    extract.chunk_budget_s = 15
x_nose_nexai_test:    OK    extract.chunk_cap = 2
x_nose_nexai_test:    OK    extract.chunk_html_fallback = 1
x_nose_nexai_test:    OK    extract.chunk_overhead_s = 9
x_nose_nexai_test:    OK    extract.chunk_sec_per_row = 0
x_nose_nexai_test:    OK    extract.chunk_threshold = 12
x_nose_nexai_test:    OK    match.name_fuzzy_pct = 0.85
x_nose_nexai_test:    OK    match.t2_amt_abs = 50.0
x_nose_nexai_test:    OK    match.vd_tol_days = 2
x_nose_nexai_test: ------------------------------------------------------------------
x_nose_nexai_test: 4. SCRIPT INCLUDES IN THIS SCOPE
x_nose_nexai_test:    OK    WizardExtractor   51348 chars
x_nose_nexai_test:    OK    GenericFieldExtractor   21627 chars
x_nose_nexai_test:    OK    DemoExtractor   5866 chars
x_nose_nexai_test:    OK    RowSegmenter   16037 chars
x_nose_nexai_test:    OK    LlmUsage   5811 chars
x_nose_nexai_test:    OK    NfotcConfig   5910 chars
x_nose_nexai_test:    OK    CompareMatch   61885 chars
x_nose_nexai_test:    OK    ExtractionConfidence   7798 chars
x_nose_nexai_test:    OK    EmlFieldExtractor   46213 chars
x_nose_nexai_test:    OK    XlsxCashflowExtractor   18875 chars
x_nose_nexai_test: ------------------------------------------------------------------
x_nose_nexai_test: 5. DATA IN THIS SCOPE
x_nose_nexai_test:    emails            : 107
x_nose_nexai_test:      relevant        : 72
x_nose_nexai_test:      irrelevant      : 35
x_nose_nexai_test:      not classified  : 0
x_nose_nexai_test:    cashflows         : 202
x_nose_nexai_test:    flagged partial   : 2
x_nose_nexai_test:    bookings (PCM)    : 412
x_nose_nexai_test: ------------------------------------------------------------------
x_nose_nexai_test: SUMMARY: 24 ok, 2 warn, 0 fail
x_nose_nexai_test: No blockers. The WARN items explain any difference from eval numbers.
