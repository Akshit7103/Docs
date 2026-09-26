[0:00:00.377] Script completed in scope x_nose_nexai_test: script
Script execution history and recovery available here
Operation	Table	Row Count
insert	sys_update_version	2
insert	sys_metadata_customization	2
insert	sys_scope_privilege	2
insert	sys_update_xml	2
x_nose_nexai_test: instance : nomurabsmdev
x_nose_nexai_test: scope    : x_nose_nexai_test
x_nose_nexai_test: ------------------------------------------------------------------
x_nose_nexai_test: 0. PREREQUISITES
Security restricted: Execute operation on API 'ScopedGlideElement' from scope 'NexAI OTC Test' was granted and added to 'NexAI OTC Test' cross scope privileges
x_nose_nexai_test:    PASS  AuditTrail present in this scope
x_nose_nexai_test:    PASS  x_nose_nexai_test_audit is writable from here
x_nose_nexai_test: ------------------------------------------------------------------
x_nose_nexai_test: 1. "Audit History" UI ACTION
Security restricted: Read operation on table 'sys_ui_action' from scope 'NexAI OTC Test' was granted and added to 'NexAI OTC Test' cross scope privileges
Security restricted: Create operation against 'sys_ui_action' from scope 'x_nose_nexai_test' has been refused due to the table's cross-scope access policy
x_nose_nexai_test:    FAIL  UI Action for x_nose_nexai_test_email   could not save
Security restricted: Create operation against 'sys_ui_action' from scope 'x_nose_nexai_test' has been refused due to the table's cross-scope access policy
x_nose_nexai_test:    FAIL  UI Action for x_nose_nexai_test_cashflow   could not save
Security restricted: Create operation against 'sys_ui_action' from scope 'x_nose_nexai_test' has been refused due to the table's cross-scope access policy
x_nose_nexai_test:    FAIL  UI Action for x_nose_nexai_test_booking   could not save
Security restricted: Create operation against 'sys_ui_action' from scope 'x_nose_nexai_test' has been refused due to the table's cross-scope access policy
x_nose_nexai_test:    FAIL  UI Action for x_nose_nexai_test_counterparty   could not save
Security restricted: Create operation against 'sys_ui_action' from scope 'x_nose_nexai_test' has been refused due to the table's cross-scope access policy
x_nose_nexai_test:    FAIL  UI Action for x_nose_nexai_test_wizard   could not save
Security restricted: Create operation against 'sys_ui_action' from scope 'x_nose_nexai_test' has been refused due to the table's cross-scope access policy
x_nose_nexai_test:    FAIL  UI Action for x_nose_nexai_test_config   could not save
Security restricted: Create operation against 'sys_ui_action' from scope 'x_nose_nexai_test' has been refused due to the table's cross-scope access policy
x_nose_nexai_test:    FAIL  UI Action for x_nose_nexai_test_capability   could not save
Security restricted: Create operation against 'sys_ui_action' from scope 'x_nose_nexai_test' has been refused due to the table's cross-scope access policy
x_nose_nexai_test:    FAIL  UI Action for x_nose_nexai_test_work_item   could not save
x_nose_nexai_test:    created 0, updated 0
x_nose_nexai_test: ------------------------------------------------------------------
x_nose_nexai_test: 2. INSTALLING 10 BUSINESS RULES
Security restricted: Read operation on table 'sys_script' from scope 'NexAI OTC Test' was granted and added to 'NexAI OTC Test' cross scope privileges
Security restricted: Create operation against 'sys_script' from scope 'x_nose_nexai_test' has been refused due to the table's cross-scope access policy
x_nose_nexai_test:    FAIL  Audit - config changed   could not save
Security restricted: Create operation against 'sys_script' from scope 'x_nose_nexai_test' has been refused due to the table's cross-scope access policy
x_nose_nexai_test:    FAIL  Audit - wizard changed   could not save
Security restricted: Create operation against 'sys_script' from scope 'x_nose_nexai_test' has been refused due to the table's cross-scope access policy
x_nose_nexai_test:    FAIL  Audit - mail processed   could not save
Security restricted: Create operation against 'sys_script' from scope 'x_nose_nexai_test' has been refused due to the table's cross-scope access policy
x_nose_nexai_test:    FAIL  Audit - extraction partial   could not save
Security restricted: Create operation against 'sys_script' from scope 'x_nose_nexai_test' has been refused due to the table's cross-scope access policy
x_nose_nexai_test:    FAIL  Audit - thread classified   could not save
Security restricted: Create operation against 'sys_script' from scope 'x_nose_nexai_test' has been refused due to the table's cross-scope access policy
x_nose_nexai_test:    FAIL  Audit - analyst decision   could not save
Security restricted: Create operation against 'sys_script' from scope 'x_nose_nexai_test' has been refused due to the table's cross-scope access policy
x_nose_nexai_test:    FAIL  Audit - match decided   could not save
Security restricted: Create operation against 'sys_script' from scope 'x_nose_nexai_test' has been refused due to the table's cross-scope access policy
x_nose_nexai_test:    FAIL  Audit - sent to middle office   could not save
Security restricted: Create operation against 'sys_script' from scope 'x_nose_nexai_test' has been refused due to the table's cross-scope access policy
x_nose_nexai_test:    FAIL  Audit - cashflow deleted   could not save
Security restricted: Create operation against 'sys_script' from scope 'x_nose_nexai_test' has been refused due to the table's cross-scope access policy
x_nose_nexai_test:    FAIL  Audit - email deleted   could not save
x_nose_nexai_test: ------------------------------------------------------------------
x_nose_nexai_test: 3. VERIFY - every audit rule now on this scope tables
x_nose_nexai_test:    FAIL  found 0 rules, expected 10
x_nose_nexai_test: ------------------------------------------------------------------
x_nose_nexai_test: 4. EVENT TYPES IN x_nose_nexai_test_audit TODAY
x_nose_nexai_test:    classification.decided    490
x_nose_nexai_test:    cashflow.extracted        431
x_nose_nexai_test:    config.changed            0   (nothing has triggered it yet)
x_nose_nexai_test:    wizard.changed            0   (nothing has triggered it yet)
x_nose_nexai_test:    mail.processed            0   (nothing has triggered it yet)
x_nose_nexai_test:    extraction.partial        0   (nothing has triggered it yet)
x_nose_nexai_test:    thread.classified         0   (nothing has triggered it yet)
x_nose_nexai_test:    analyst.decision          0   (nothing has triggered it yet)
x_nose_nexai_test:    match.decided             0   (nothing has triggered it yet)
x_nose_nexai_test:    mo.sent                   0   (nothing has triggered it yet)
x_nose_nexai_test:    cashflow.deleted          0   (nothing has triggered it yet)
x_nose_nexai_test:    email.deleted             0   (nothing has triggered it yet)
x_nose_nexai_test: ------------------------------------------------------------------
x_nose_nexai_test: RESULT for x_nose_nexai_test: 2 passed, 19 failed
x_nose_nexai_test:    created 0, updated 0
x_nose_nexai_test: Clear the failures above.
