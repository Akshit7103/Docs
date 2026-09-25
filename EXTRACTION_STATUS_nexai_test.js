[0:00:00.174] Script completed in scope x_nose_nexai_test: script
Script execution history and recovery available here
x_nose_nexai_test: Scope OK: x_nose_nexai_test
x_nose_nexai_test: ------------------------------------------------------------------
x_nose_nexai_test: OVERALL
x_nose_nexai_test:    mails scanned            : 107     (eval 107)
x_nose_nexai_test:    relevant                 : 72     (eval 72)
x_nose_nexai_test:    filtered out             : 35     (eval 35)
x_nose_nexai_test:    mails holding cashflows  : 72     (eval 62)
x_nose_nexai_test:    CASHFLOWS                : 289    (eval 289)
x_nose_nexai_test:    flagged partial          : 2
x_nose_nexai_test:    not stamped, will retry  : 9
x_nose_nexai_test: ------------------------------------------------------------------
x_nose_nexai_test: AGAINST EVAL, MAIL BY MAIL
x_nose_nexai_test:    matches eval exactly     : 55
x_nose_nexai_test:    MORE than eval           : 1
x_nose_nexai_test:    SHORT, flagged partial   : 0
x_nose_nexai_test:    SHORT, not flagged       : 6
x_nose_nexai_test:    no rows yet              : 0
x_nose_nexai_test:    no eval figure           : 10
x_nose_nexai_test: 
x_nose_nexai_test: --- SHORT but NOT flagged - nothing on the record says so (6) ---
x_nose_nexai_test:    got 3 of 6, missing 3   GS Settlement for Value Date 2026-05-11,  GS Ref Num 30208
x_nose_nexai_test:    got 3 of 6, missing 3   GS Settlement for Value Date 2026-05-11,  GS Ref Num 30208
x_nose_nexai_test:    got 1 of 2, missing 1   NIP Arrangement Fees and swaps between NIP and NEF value 2
x_nose_nexai_test:    got 1 of 2, missing 1   Nomura - Swap Reset Settlement (T/D 17/8/2026)
x_nose_nexai_test:    got 1 of 2, missing 1   Nomura - Swap Reset Settlement (T/D 17/8/2026)
x_nose_nexai_test:    got 3 of 4, missing 1   TD vs NOIL_LDN - USD| VD 18 Aug 2026 Equity Swap - ID 1690
x_nose_nexai_test: 
x_nose_nexai_test: --- MORE rows than eval produced (1) ---
x_nose_nexai_test:    got 6 of 5, missing -1   Natixis / NOMURA - confirmation of IRD settlements for val
x_nose_nexai_test: 
x_nose_nexai_test: --- no eval figure - not in the eval corpus, or the subject differs (10) ---
x_nose_nexai_test:    rows 0  [will retry]   GS Settlement for Value Date 2026-08-19,  GS Ref Num 21551
x_nose_nexai_test:    rows 0  [will retry]   GS Settlement for Value Date 2026-08-19,  GS Ref Num 21551
x_nose_nexai_test:    rows 0  [will retry]   NDF-Netting as per 13.08.2026 between Nomura and IKEA Supp
x_nose_nexai_test:    rows 0  [will retry]   NDF-Netting as per 18.08.2026 between Nomura and IKEA Supp
x_nose_nexai_test:    rows 1   NOMURA SECURITIES / Please confirm USD settlements / 18 Au
x_nose_nexai_test:    rows 0  [will retry]   OTC Derivative Confirmation: SDBB4QN33349CD99QQ.0.0.0.1
x_nose_nexai_test:    rows 0  [will retry]   OTC Derivative Confirmation: SDBB4QN33349CD99QQ.1.0.0.1
x_nose_nexai_test:    rows 0  [will retry]   Payment Notice Nomura International PLC Jul-30-2026 USD
x_nose_nexai_test:    rows 0  [will retry]   Payment Notice Nomura International PLC Jun-11-2026 USD
x_nose_nexai_test:    rows 0  [will retry]   Payment Notice Nomura International PLC Jun-11-2026 USD
x_nose_nexai_test: ------------------------------------------------------------------
x_nose_nexai_test: WHAT IS LEFT
x_nose_nexai_test:    cashflows still to recover vs eval : 10
x_nose_nexai_test:    289 + 10 = 299   (eval total 289)
x_nose_nexai_test: 
x_nose_nexai_test:    Anything marked [will retry] is attempted again on EVERY Sync. Keep pressing while
x_nose_nexai_test:    any remain: BATCH counts 10 SUCCESSFUL mails per press, and the permanently failing
x_nose_nexai_test:    ones are retried ahead of the good ones, so a full pass takes several presses.
