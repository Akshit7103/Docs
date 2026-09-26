[0:00:04.036] Script completed in scope global: script
Script execution history and recovery available here
Operation	Table	Row Count
update	sys_update_version	12
insert	sys_update_version	12
update	sys_script_include	12
insert	sys_update_xml	9
update	sys_update_xml	3
*** Script: instance : nomurabsmdev
*** Script: scope    : rhino.global
*** Script: ------------------------------------------------------------------
*** Script: SOURCE: x_nose_nexai_test
*** Script:    ok  WizardExtractor  51348 chars, 37 scope refs, 33 em dashes
*** Script:    ok  GenericFieldExtractor  21627 chars, 2 scope refs, 14 em dashes
*** Script:    ok  XlsxCashflowExtractor  36174 chars, 4 scope refs, 16 em dashes
*** Script:    ok  DemoExtractor  6623 chars, 4 scope refs, 6 em dashes
*** Script: ------------------------------------------------------------------
*** Script: TARGET: x_nose_nexai_dev
[CacheFlushLog] event=sys_script_include, count=1, ms=0: Flushing catalog sys_script_include
*** Script:    OK    WizardExtractor  47308 -> 51311 chars, rewritten to x_nose_nexai_dev
*** Script:    OK    GenericFieldExtractor  17591 -> 21625 chars, rewritten to x_nose_nexai_dev
*** Script:    OK    XlsxCashflowExtractor  18875 -> 36170 chars, rewritten to x_nose_nexai_dev
*** Script:    OK    DemoExtractor  5862 -> 6619 chars, rewritten to x_nose_nexai_dev
*** Script: ------------------------------------------------------------------
*** Script: TARGET: x_nose_nexai_uat
*** Script:    OK    WizardExtractor  47308 -> 51311 chars, rewritten to x_nose_nexai_uat
*** Script:    OK    GenericFieldExtractor  17591 -> 21625 chars, rewritten to x_nose_nexai_uat
*** Script:    OK    XlsxCashflowExtractor  16552 -> 36170 chars, rewritten to x_nose_nexai_uat
*** Script:    OK    DemoExtractor  5862 -> 6619 chars, rewritten to x_nose_nexai_uat
*** Script: ------------------------------------------------------------------
*** Script: TARGET: x_nose_nfotc_bsm
*** Script:    OK    WizardExtractor  47308 -> 51311 chars, rewritten to x_nose_nfotc_bsm
*** Script:    OK    GenericFieldExtractor  17591 -> 21625 chars, rewritten to x_nose_nfotc_bsm
*** Script:    OK    XlsxCashflowExtractor  18875 -> 36170 chars, rewritten to x_nose_nfotc_bsm
*** Script:    OK    DemoExtractor  5862 -> 6619 chars, rewritten to x_nose_nfotc_bsm
*** Script: ------------------------------------------------------------------
*** Script: RESULT
*** Script:    written            : 12
*** Script:    already matching   : 0
*** Script:    scopes covered     : x_nose_nexai_dev, x_nose_nexai_uat, x_nose_nfotc_bsm
*** Script:    failures           : 0
*** Script: ------------------------------------------------------------------
*** Script: NEXT STEP - the config is NOT done yet.
*** Script:    extract.chunk_cap is still 4 in those scopes. It lives on a scoped config table that
*** Script:    rejects writes from Global, so run SET_CAP_AND_VERIFY.js once in EACH of:
*** Script:       - x_nose_nexai_dev
*** Script:       - x_nose_nexai_uat
*** Script:       - x_nose_nfotc_bsm
*** Script:    That script sets the value and verifies all four Script Includes in that scope.
