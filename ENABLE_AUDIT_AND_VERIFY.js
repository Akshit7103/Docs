[0:02:41.298] Script completed in scope x_nose_nexai_test: script
Script execution history and recovery available here
Operation	Table	Row Count
insert	sys_update_version	2
insert	sys_metadata_customization	2
insert	sys_scope_privilege	2
insert	sys_update_xml	2
x_nose_nexai_test: instance : nomurabsmdev
x_nose_nexai_test: scope    : x_nose_nexai_test
x_nose_nexai_test: ------------------------------------------------------------------
x_nose_nexai_test: 0. IS THE AUDIT SUBSYSTEM LIVE ON THIS INSTANCE
Security restricted: Read operation on table 'sys_audit' from scope 'NexAI OTC Test' was granted and added to 'NexAI OTC Test' cross scope privileges
Time: 0:02:40.798 id: nomurabsmdev_1[glide.2] primary_hash=-1735923005 (connpid=2297522) for: SELECT count(*) AS recordcount FROM sys_audit sys_audit0 
x_nose_nexai_test:    sys_audit readable, 1031740848 rows on the instance
x_nose_nexai_test:    PASS  audit subsystem present
x_nose_nexai_test: ------------------------------------------------------------------
x_nose_nexai_test: 1. TABLES OWNED BY THIS SCOPE
x_nose_nexai_test:    found 12 table(s)
x_nose_nexai_test: ------------------------------------------------------------------
x_nose_nexai_test: 2. DECISION PER TABLE
Security restricted: Read operation on table 'sys_dictionary' from scope 'NexAI OTC Test' was granted and added to 'NexAI OTC Test' cross scope privileges
Security restricted: Write operation against 'sys_dictionary' from scope 'x_nose_nexai_test' has been refused due to the table's cross-scope access policy
Security restricted: Write operation against 'sys_dictionary' from scope 'x_nose_nexai_test' has been refused due to the table's cross-scope access policy
Security restricted: Write operation against 'sys_dictionary' from scope 'x_nose_nexai_test' has been refused due to the table's cross-scope access policy
Security restricted: Write operation against 'sys_dictionary' from scope 'x_nose_nexai_test' has been refused due to the table's cross-scope access policy
Security restricted: Write operation against 'sys_dictionary' from scope 'x_nose_nexai_test' has been refused due to the table's cross-scope access policy
Security restricted: Write operation against 'sys_dictionary' from scope 'x_nose_nexai_test' has been refused due to the table's cross-scope access policy
Security restricted: Write operation against 'sys_dictionary' from scope 'x_nose_nexai_test' has been refused due to the table's cross-scope access policy
Security restricted: Write operation against 'sys_dictionary' from scope 'x_nose_nexai_test' has been refused due to the table's cross-scope access policy
x_nose_nexai_test: 
x_nose_nexai_test:    TABLE                               ROWS    RESULT
x_nose_nexai_test:    x_nose_nexai_test_audit             1416    left OFF on purpose
x_nose_nexai_test:                                                the application OWN audit-event table, insert-only. auditing the audit log is circular
x_nose_nexai_test:    x_nose_nexai_test_llm_usage         326     left OFF on purpose
x_nose_nexai_test:                                                insert-only metrics, one row per LLM call. audit records field CHANGES, and an insert has none, so this would double the write volume of the busiest table and record nothing readable
x_nose_nexai_test:    x_nose_nexai_test_mailbox_drop      1       left OFF on purpose
x_nose_nexai_test:                                                ingestion staging, insert-only. sys_created_by and sys_created_on already answer who dropped what and when
x_nose_nexai_test:    x_nose_nexai_test_zip_drop          0       left OFF on purpose
x_nose_nexai_test:                                                bulk upload staging, insert-only. same reason as mailbox_drop
x_nose_nexai_test:    x_nose_nexai_test_booking           412     PROBLEM
x_nose_nexai_test:                                                write did not stick, audit still reads "0"
x_nose_nexai_test:    x_nose_nexai_test_capability        0       PROBLEM
x_nose_nexai_test:                                                write did not stick, audit still reads "0"
x_nose_nexai_test:    x_nose_nexai_test_cashflow          289     PROBLEM
x_nose_nexai_test:                                                write did not stick, audit still reads "0"
x_nose_nexai_test:    x_nose_nexai_test_config            11      PROBLEM
x_nose_nexai_test:                                                write did not stick, audit still reads "0"
x_nose_nexai_test:    x_nose_nexai_test_counterparty      51      PROBLEM
x_nose_nexai_test:                                                write did not stick, audit still reads "0"
x_nose_nexai_test:    x_nose_nexai_test_email             107     PROBLEM
x_nose_nexai_test:                                                write did not stick, audit still reads "0"
x_nose_nexai_test:    x_nose_nexai_test_wizard            1       PROBLEM
x_nose_nexai_test:                                                write did not stick, audit still reads "0"
x_nose_nexai_test:    x_nose_nexai_test_work_item         0       PROBLEM
x_nose_nexai_test:                                                write did not stick, audit still reads "0"
x_nose_nexai_test: ------------------------------------------------------------------
x_nose_nexai_test: 3. "Audit History" UI ACTION - how anyone actually reaches the trail
x_nose_nexai_test:    no audited table to attach it to
x_nose_nexai_test: ------------------------------------------------------------------
x_nose_nexai_test: 4. VERIFY - re-read every table that should now be audited
x_nose_nexai_test:    FAIL  no table in this scope matched the audit plan   read the UNKNOWN list above and say which ones to include
x_nose_nexai_test:    PASS  still OFF as intended   x_nose_nexai_test_audit
x_nose_nexai_test:    PASS  still OFF as intended   x_nose_nexai_test_llm_usage
x_nose_nexai_test:    PASS  still OFF as intended   x_nose_nexai_test_mailbox_drop
x_nose_nexai_test:    PASS  still OFF as intended   x_nose_nexai_test_zip_drop
x_nose_nexai_test:    FAIL  x_nose_nexai_test_booking   write did not stick, audit still reads "0"
x_nose_nexai_test:    FAIL  x_nose_nexai_test_capability   write did not stick, audit still reads "0"
x_nose_nexai_test:    FAIL  x_nose_nexai_test_cashflow   write did not stick, audit still reads "0"
x_nose_nexai_test:    FAIL  x_nose_nexai_test_config   write did not stick, audit still reads "0"
x_nose_nexai_test:    FAIL  x_nose_nexai_test_counterparty   write did not stick, audit still reads "0"
x_nose_nexai_test:    FAIL  x_nose_nexai_test_email   write did not stick, audit still reads "0"
x_nose_nexai_test:    FAIL  x_nose_nexai_test_wizard   write did not stick, audit still reads "0"
x_nose_nexai_test:    FAIL  x_nose_nexai_test_work_item   write did not stick, audit still reads "0"
x_nose_nexai_test: ------------------------------------------------------------------
x_nose_nexai_test: RESULT for x_nose_nexai_test: 5 passed, 9 failed
x_nose_nexai_test:    turned on now       : 0
x_nose_nexai_test:    already on          : 0
x_nose_nexai_test:    left off on purpose : 4
x_nose_nexai_test:    unrecognised        : 0
x_nose_nexai_test:    UI Actions created  : 0   updated: 0   failed: 0
x_nose_nexai_test: Clear the failures above before relying on the trail.
