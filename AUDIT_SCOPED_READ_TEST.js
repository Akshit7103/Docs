[0:00:00.290] Script completed in scope x_nose_nfotc_bsm: script
Script execution history and recovery available here
Operation	Table	Row Count
insert	sys_update_version	1
insert	sys_metadata_customization	1
insert	sys_scope_privilege	1
insert	sys_update_xml	1
Security restricted: Read operation on table 'sys_audit' from scope 'NexAI OTC BSM' was granted and added to 'NexAI OTC BSM' cross scope privileges
x_nose_nfotc_bsm: 
=================================================
SCOPED READ TEST
scope : x_nose_nfotc_bsm
user  : muralia   admin: true
=================================================

reading sys_audit for x_nose_nfotc_bsm_cashflow
   isValid()        : true
   ROW 1 : ai_currency  "EUR" -> "USD"   by muralia   on 2026-09-26 13:35:46
   rows returned    : 1
   VERDICT          : READABLE from this scope - the widget approach works

reading sys_audit for x_nose_nexai_test_cashflow
   isValid()        : true
   ROW 1 : ai_match_confidence  "" -> "0"   by system   on 2026-09-28 15:10:14
   ROW 2 : ai_match_tier  "" -> "0"   by system   on 2026-09-28 15:10:14
   ROW 3 : ai_match_computed  "" -> "true"   by system   on 2026-09-28 15:10:14
   rows returned    : 3
   VERDICT          : READABLE from this scope - the widget approach works

=================================================
