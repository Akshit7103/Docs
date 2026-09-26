[0:00:04.817] Script completed in scope global: script
Script execution history and recovery available here
Operation	Table	Row Count
update	sys_update_version	32
insert	sys_update_version	32
insert	sys_update_xml	32
update	sys_dictionary	32
*** Script: instance : nomurabsmdev
*** Script: scope    : rhino.global
*** Script: sys_audit: present and holding rows
*** Script: ==================================================================
*** Script: x_nose_nexai_test
*** Script:    TABLE                                 ROWS   RESULT
*** Script:    ----------------------------------------------------------------
*** Script:    x_nose_nexai_test_audit               1416   left OFF - the application own audit-event table, insert-only
[CacheFlushLog] event=metacache_system_wide, count=1, ms=0: Flushing catalog metacache_system_wide
[CacheFlushLog] event=syscache_tabledescriptor, count=1, ms=1: Flushing catalog syscache_tabledescriptor
[CacheFlushLog] event=syscache_sizeclass, count=1, ms=1: Flushing catalog syscache_sizeclass
[CacheFlushLog] event=dbi_table_exists, count=1, ms=1: Flushing catalog dbi_table_exists
[CacheFlushLog] event=DBNamesChecker, count=1, ms=1: Flushing catalog DBNamesChecker
[CacheFlushLog] event=DBViewNamesChecker, count=1, ms=0: Flushing catalog DBViewNamesChecker
[CacheFlushLog] event=DBNamesChecker_KnownMissing, count=1, ms=1: Flushing catalog DBNamesChecker_KnownMissing
[CacheFlushLog] event=edgeencryption_references, count=1, ms=1: Flushing catalog edgeencryption_references
[CacheFlushLog] event=edgeencryption_configurations, count=1, ms=1: Flushing catalog edgeencryption_configurations
[CacheFlushLog] event=graphql_query_cache, count=1, ms=1: Flushing catalog graphql_query_cache
GraphQL API - GlideGraphQL : Flushing GraphQL cache because  change occurred in sys_dictionary, for table: x_nose_nexai_test_booking
[CacheFlushLog] event=dynamic_schema_type_graphql_cache, count=1, ms=0: Flushing catalog dynamic_schema_type_graphql_cache
[CacheFlushLog] event=dynamic_schema_field_graphql_cache, count=1, ms=1: Flushing catalog dynamic_schema_field_graphql_cache
[CacheFlushLog] event=sys_dictionary, count=1, ms=1: Flushing catalog sys_dictionary
[CacheFlushLog] event=sys_choice_compiled, count=1, ms=35: Flushing catalog sys_choice_compiled
*** Script:    x_nose_nexai_test_booking              412   AUDIT TURNED ON
GraphQL API - GlideGraphQL : Flushing GraphQL cache because  change occurred in sys_dictionary, for table: x_nose_nexai_test_capability
*** Script:    x_nose_nexai_test_capability             0   AUDIT TURNED ON
GraphQL API - GlideGraphQL : Flushing GraphQL cache because  change occurred in sys_dictionary, for table: x_nose_nexai_test_cashflow
*** Script:    x_nose_nexai_test_cashflow             289   AUDIT TURNED ON
GraphQL API - GlideGraphQL : Flushing GraphQL cache because  change occurred in sys_dictionary, for table: x_nose_nexai_test_config
*** Script:    x_nose_nexai_test_config                11   AUDIT TURNED ON
GraphQL API - GlideGraphQL : Flushing GraphQL cache because  change occurred in sys_dictionary, for table: x_nose_nexai_test_counterparty
*** Script:    x_nose_nexai_test_counterparty          51   AUDIT TURNED ON
GraphQL API - GlideGraphQL : Flushing GraphQL cache because  change occurred in sys_dictionary, for table: x_nose_nexai_test_email
*** Script:    x_nose_nexai_test_email                107   AUDIT TURNED ON
*** Script:    x_nose_nexai_test_llm_usage            326   left OFF - insert-only metrics, one row per LLM call
*** Script:    x_nose_nexai_test_mailbox_drop           1   left OFF - ingestion staging, insert-only
GraphQL API - GlideGraphQL : Flushing GraphQL cache because  change occurred in sys_dictionary, for table: x_nose_nexai_test_wizard
*** Script:    x_nose_nexai_test_wizard                 1   AUDIT TURNED ON
GraphQL API - GlideGraphQL : Flushing GraphQL cache because  change occurred in sys_dictionary, for table: x_nose_nexai_test_work_item
*** Script:    x_nose_nexai_test_work_item              0   AUDIT TURNED ON
*** Script:    x_nose_nexai_test_zip_drop               0   left OFF - bulk upload staging, insert-only
*** Script: ==================================================================
*** Script: x_nose_nexai_dev
*** Script:    TABLE                                 ROWS   RESULT
*** Script:    ----------------------------------------------------------------
*** Script:    x_nose_nexai_dev_audit                   0   left OFF - the application own audit-event table, insert-only
GraphQL API - GlideGraphQL : Flushing GraphQL cache because  change occurred in sys_dictionary, for table: x_nose_nexai_dev_booking
*** Script:    x_nose_nexai_dev_booking               412   AUDIT TURNED ON
GraphQL API - GlideGraphQL : Flushing GraphQL cache because  change occurred in sys_dictionary, for table: x_nose_nexai_dev_capability
*** Script:    x_nose_nexai_dev_capability              0   AUDIT TURNED ON
GraphQL API - GlideGraphQL : Flushing GraphQL cache because  change occurred in sys_dictionary, for table: x_nose_nexai_dev_cashflow
*** Script:    x_nose_nexai_dev_cashflow                0   AUDIT TURNED ON
GraphQL API - GlideGraphQL : Flushing GraphQL cache because  change occurred in sys_dictionary, for table: x_nose_nexai_dev_config
*** Script:    x_nose_nexai_dev_config                 11   AUDIT TURNED ON
GraphQL API - GlideGraphQL : Flushing GraphQL cache because  change occurred in sys_dictionary, for table: x_nose_nexai_dev_counterparty
*** Script:    x_nose_nexai_dev_counterparty           51   AUDIT TURNED ON
GraphQL API - GlideGraphQL : Flushing GraphQL cache because  change occurred in sys_dictionary, for table: x_nose_nexai_dev_email
*** Script:    x_nose_nexai_dev_email                   0   AUDIT TURNED ON
*** Script:    x_nose_nexai_dev_llm_usage               0   left OFF - insert-only metrics, one row per LLM call
*** Script:    x_nose_nexai_dev_mailbox_drop            0   left OFF - ingestion staging, insert-only
GraphQL API - GlideGraphQL : Flushing GraphQL cache because  change occurred in sys_dictionary, for table: x_nose_nexai_dev_wizard
*** Script:    x_nose_nexai_dev_wizard                  1   AUDIT TURNED ON
GraphQL API - GlideGraphQL : Flushing GraphQL cache because  change occurred in sys_dictionary, for table: x_nose_nexai_dev_work_item
*** Script:    x_nose_nexai_dev_work_item               0   AUDIT TURNED ON
*** Script:    x_nose_nexai_dev_zip_drop                0   left OFF - bulk upload staging, insert-only
*** Script: ==================================================================
*** Script: x_nose_nexai_uat
*** Script:    TABLE                                 ROWS   RESULT
*** Script:    ----------------------------------------------------------------
*** Script:    x_nose_nexai_uat_audit                   0   left OFF - the application own audit-event table, insert-only
GraphQL API - GlideGraphQL : Flushing GraphQL cache because  change occurred in sys_dictionary, for table: x_nose_nexai_uat_booking
*** Script:    x_nose_nexai_uat_booking               412   AUDIT TURNED ON
GraphQL API - GlideGraphQL : Flushing GraphQL cache because  change occurred in sys_dictionary, for table: x_nose_nexai_uat_capability
*** Script:    x_nose_nexai_uat_capability              0   AUDIT TURNED ON
GraphQL API - GlideGraphQL : Flushing GraphQL cache because  change occurred in sys_dictionary, for table: x_nose_nexai_uat_cashflow
*** Script:    x_nose_nexai_uat_cashflow                0   AUDIT TURNED ON
GraphQL API - GlideGraphQL : Flushing GraphQL cache because  change occurred in sys_dictionary, for table: x_nose_nexai_uat_config
*** Script:    x_nose_nexai_uat_config                 11   AUDIT TURNED ON
GraphQL API - GlideGraphQL : Flushing GraphQL cache because  change occurred in sys_dictionary, for table: x_nose_nexai_uat_counterparty
*** Script:    x_nose_nexai_uat_counterparty           51   AUDIT TURNED ON
GraphQL API - GlideGraphQL : Flushing GraphQL cache because  change occurred in sys_dictionary, for table: x_nose_nexai_uat_email
*** Script:    x_nose_nexai_uat_email                   0   AUDIT TURNED ON
*** Script:    x_nose_nexai_uat_llm_usage               0   left OFF - insert-only metrics, one row per LLM call
*** Script:    x_nose_nexai_uat_mailbox_drop            0   left OFF - ingestion staging, insert-only
GraphQL API - GlideGraphQL : Flushing GraphQL cache because  change occurred in sys_dictionary, for table: x_nose_nexai_uat_wizard
*** Script:    x_nose_nexai_uat_wizard                  1   AUDIT TURNED ON
GraphQL API - GlideGraphQL : Flushing GraphQL cache because  change occurred in sys_dictionary, for table: x_nose_nexai_uat_work_item
*** Script:    x_nose_nexai_uat_work_item               0   AUDIT TURNED ON
*** Script:    x_nose_nexai_uat_zip_drop                0   left OFF - bulk upload staging, insert-only
*** Script: ==================================================================
*** Script: x_nose_nfotc_bsm
*** Script:    TABLE                                 ROWS   RESULT
*** Script:    ----------------------------------------------------------------
*** Script:    x_nose_nfotc_bsm_audit                  50   left OFF - the application own audit-event table, insert-only
GraphQL API - GlideGraphQL : Flushing GraphQL cache because  change occurred in sys_dictionary, for table: x_nose_nfotc_bsm_booking
*** Script:    x_nose_nfotc_bsm_booking               412   AUDIT TURNED ON
GraphQL API - GlideGraphQL : Flushing GraphQL cache because  change occurred in sys_dictionary, for table: x_nose_nfotc_bsm_capability
*** Script:    x_nose_nfotc_bsm_capability              0   AUDIT TURNED ON
GraphQL API - GlideGraphQL : Flushing GraphQL cache because  change occurred in sys_dictionary, for table: x_nose_nfotc_bsm_cashflow
*** Script:    x_nose_nfotc_bsm_cashflow                3   AUDIT TURNED ON
GraphQL API - GlideGraphQL : Flushing GraphQL cache because  change occurred in sys_dictionary, for table: x_nose_nfotc_bsm_config
*** Script:    x_nose_nfotc_bsm_config                 11   AUDIT TURNED ON
GraphQL API - GlideGraphQL : Flushing GraphQL cache because  change occurred in sys_dictionary, for table: x_nose_nfotc_bsm_counterparty
*** Script:    x_nose_nfotc_bsm_counterparty           51   AUDIT TURNED ON
GraphQL API - GlideGraphQL : Flushing GraphQL cache because  change occurred in sys_dictionary, for table: x_nose_nfotc_bsm_email
*** Script:    x_nose_nfotc_bsm_email                   2   AUDIT TURNED ON
*** Script:    x_nose_nfotc_bsm_llm_usage              10   left OFF - insert-only metrics, one row per LLM call
*** Script:    x_nose_nfotc_bsm_mailbox_drop            1   left OFF - ingestion staging, insert-only
GraphQL API - GlideGraphQL : Flushing GraphQL cache because  change occurred in sys_dictionary, for table: x_nose_nfotc_bsm_wizard
*** Script:    x_nose_nfotc_bsm_wizard                  1   AUDIT TURNED ON
GraphQL API - GlideGraphQL : Flushing GraphQL cache because  change occurred in sys_dictionary, for table: x_nose_nfotc_bsm_work_item
*** Script:    x_nose_nfotc_bsm_work_item               0   AUDIT TURNED ON
*** Script:    x_nose_nfotc_bsm_zip_drop                0   left OFF - bulk upload staging, insert-only
*** Script: ==================================================================
*** Script: VERIFY - re-read every collection row
*** Script:    PASS  x_nose_nexai_test   8 audited, 4 deliberately off
*** Script:    PASS  x_nose_nexai_dev   8 audited, 4 deliberately off
*** Script:    PASS  x_nose_nexai_uat   8 audited, 4 deliberately off
*** Script:    PASS  x_nose_nfotc_bsm   8 audited, 4 deliberately off
*** Script: ==================================================================
*** Script: RESULT: 4 passed, 0 failed
*** Script:    turned on now       : 32
*** Script:    already on          : 0
*** Script:    left off on purpose : 16
*** Script:    unrecognised        : 0
*** Script:    problems            : 0
*** Script: ==================================================================
*** Script: NEXT: the checkbox only makes the data exist. Run INSTALL_AUDIT_EVENTS.js once in EACH
*** Script: scope to add the "Audit History" action - how anyone reaches the trail - and the ten
*** Script: business rules that record the DECISIONS the native trail cannot see.
