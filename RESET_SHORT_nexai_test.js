[0:00:00.186] Script completed in scope x_nose_nexai_test: script
Script execution history and recovery available here
Operation	Table	Row Count
update	x_nose_nexai_test_email	5
x_nose_nexai_test: Scope OK: x_nose_nexai_test
x_nose_nexai_test: ------------------------------------------------------------------
x_nose_nexai_test: Bank of Nova Scotia   (eval produced 49)
x_nose_nexai_test:    copy 1: 1 rows, checksum 5780033.09
x_nose_nexai_test:            The Bank of Nova Scotia / Please confirm GBP settlement / 8/5/2026
x_nose_nexai_test:    -> SHORT by 48. Queueing for re-extraction.
x_nose_nexai_test:       copy 1 cleared and verified.
x_nose_nexai_test: ------------------------------------------------------------------
x_nose_nexai_test: Natixis IRD settlements   (eval produced 5)
x_nose_nexai_test:    copy 1: 2 rows, checksum 7487060423
x_nose_nexai_test:            Natixis / NOMURA - confirmation of IRD settlements for value date July
x_nose_nexai_test:    -> SHORT by 3. Queueing for re-extraction.
x_nose_nexai_test:       copy 1 cleared and verified.
x_nose_nexai_test: ------------------------------------------------------------------
x_nose_nexai_test: SettlementNotice SN00002180389   (eval produced 3)
x_nose_nexai_test:    copy 1: 1 rows, checksum 0
x_nose_nexai_test:            SettlementNotice ref SN00002180389 OP32253GKU NOMALON JPY 28-Jul-2026 
x_nose_nexai_test:    -> SHORT by 2. Queueing for re-extraction.
x_nose_nexai_test:       copy 1 cleared and verified.
x_nose_nexai_test: ------------------------------------------------------------------
x_nose_nexai_test: NIP Arrangement Fees   (eval produced 2)
x_nose_nexai_test:    copy 1: 1 rows, checksum 644000
x_nose_nexai_test:            NIP Arrangement Fees and swaps between NIP and NEF value 20260819
x_nose_nexai_test:    -> SHORT by 1. Queueing for re-extraction.
x_nose_nexai_test:       copy 1 cleared and verified.
x_nose_nexai_test: ------------------------------------------------------------------
x_nose_nexai_test: TD vs NOIL_LDN   (eval produced 4)
x_nose_nexai_test:    copy 1: 3 rows, checksum 263729.74
x_nose_nexai_test:            TD vs NOIL_LDN - USD| VD 18 Aug 2026 Equity Swap - ID 1690153
x_nose_nexai_test:    -> SHORT by 1. Queueing for re-extraction.
x_nose_nexai_test:       copy 1 cleared and verified.
x_nose_nexai_test: ------------------------------------------------------------------
x_nose_nexai_test: SUMMARY
x_nose_nexai_test:    copies queued for re-extraction : 5
x_nose_nexai_test:    already correct, left alone     : 0
x_nose_nexai_test:    not found                       : 0
x_nose_nexai_test: ------------------------------------------------------------------
x_nose_nexai_test: NEXT STEP
x_nose_nexai_test:    Press "Sync now". The nine permanently failing mails are retried ahead of these on
x_nose_nexai_test:    every press, so give it time - and more than one press may be needed.
x_nose_nexai_test: ------------------------------------------------------------------
x_nose_nexai_test: WHAT GOOD LOOKS LIKE
x_nose_nexai_test:    Bank of Nova Scotia is the one that matters: 49 rows, not 1. It chunks into 7, so
x_nose_nexai_test:    1 row means the chunking produced almost nothing - a different failure from the
x_nose_nexai_test:    empty-answer problem just fixed, and it was NOT flagged partial, so the completeness
x_nose_nexai_test:    guard missed it too.
x_nose_nexai_test:    Run EXTRACTION_STATUS_nexai_test.js afterwards to see the totals again.
