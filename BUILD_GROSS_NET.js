[0:00:03.589] Script completed in scope global: script
Script execution history and recovery available here
Operation	Table	Row Count
insert	sys_update_version	19
insert	sys_metadata_customization	16
insert	sys_update_xml	16
insert	sys_custom_db_object	4
insert	sys_storage_alias	4
...and another 13 affected table(s)
View full summary here
[CacheFlushLog] event=metacache_system_wide, count=1, ms=0: Flushing catalog metacache_system_wide
[CacheFlushLog] event=syscache_tabledescriptor, count=1, ms=2: Flushing catalog syscache_tabledescriptor
[CacheFlushLog] event=syscache_sizeclass, count=1, ms=1: Flushing catalog syscache_sizeclass
[CacheFlushLog] event=dbi_table_exists, count=1, ms=2: Flushing catalog dbi_table_exists
[CacheFlushLog] event=DBNamesChecker, count=1, ms=1: Flushing catalog DBNamesChecker
[CacheFlushLog] event=DBViewNamesChecker, count=1, ms=1: Flushing catalog DBViewNamesChecker
[CacheFlushLog] event=DBNamesChecker_KnownMissing, count=1, ms=1: Flushing catalog DBNamesChecker_KnownMissing
[CacheFlushLog] event=edgeencryption_references, count=1, ms=2: Flushing catalog edgeencryption_references
[CacheFlushLog] event=edgeencryption_configurations, count=1, ms=1: Flushing catalog edgeencryption_configurations
[CacheFlushLog] event=graphql_query_cache, count=1, ms=1: Flushing catalog graphql_query_cache
GraphQL API - GlideGraphQL : Flushing GraphQL cache because  change occurred in sys_dictionary, for table: x_nose_nexai_test_cashflow
[CacheFlushLog] event=dynamic_schema_type_graphql_cache, count=1, ms=1: Flushing catalog dynamic_schema_type_graphql_cache
[CacheFlushLog] event=dynamic_schema_field_graphql_cache, count=1, ms=2: Flushing catalog dynamic_schema_field_graphql_cache
[CacheFlushLog] event=sys_dictionary, count=1, ms=1: Flushing catalog sys_dictionary
[CacheFlushLog] event=sys_choice_compiled, count=1, ms=49: Flushing catalog sys_choice_compiled
[CacheFlushLog] event=sys_ui_element, count=1, ms=133: Flushing catalog sys_ui_element
Slow business rule 'Add New Column To Form Section' on sys_dictionary:<span class = "session-log-bold-text"> </span>, time was: 0:00:00.266
Replication is not enabled on table: x_nose_nexai_test_cashflow, not queueing replication create column special db event
[CacheFlushLog] event=sys_storage_alias, count=1, ms=325: Flushing catalog sys_storage_alias
[CacheFlushLog] event=column_metadata_cache, count=1, ms=2: Flushing catalog column_metadata_cache
[CacheFlushLog] event=syscache_storagemetadata, count=1, ms=1: Flushing catalog syscache_storagemetadata
Adding column(s): x_nose_nexai_test_cashflow
Altering storage table [x_nose_nexai_test_cashflow]: ALTER TABLE x_nose_nexai_test_cashflow ADD "netting_group" SNCVARCHAR(200)
[CacheFlushLog] event=sys_custom_db_object, count=1, ms=439: Flushing catalog sys_custom_db_object
DBUtil : Default value does not exist for field : netting_group, table : x_nose_nexai_test_cashflow
[0:00:00.477] DBUtil new field inserted: netting_group in x_nose_nexai_test_cashflow
Slow business rule 'CreateElement' on sys_dictionary:<span class = "session-log-bold-text"> </span>, time was: 0:00:00.526
GraphQL API - GlideGraphQL : Flushing GraphQL cache because  change occurred in sys_dictionary, for table: x_nose_nexai_test_cashflow
Slow business rule 'Add New Column To Form Section' on sys_dictionary:<span class = "session-log-bold-text"> </span>, time was: 0:00:00.140
Replication is not enabled on table: x_nose_nexai_test_cashflow, not queueing replication create column special db event
Adding column(s): x_nose_nexai_test_cashflow
Altering storage table [x_nose_nexai_test_cashflow]: ALTER TABLE x_nose_nexai_test_cashflow ADD "is_net" SNCVARCHAR(40)
Altering storage table [sh$x_nose_nexai_test_cashflow]: ALTER TABLE sh$x_nose_nexai_test_cashflow ADD "netting_group" SNCVARCHAR(200)
DBUtil : Default value does not exist for field : is_net, table : x_nose_nexai_test_cashflow
[0:00:00.173] DBUtil new field inserted: is_net in x_nose_nexai_test_cashflow
Slow business rule 'CreateElement' on sys_dictionary:<span class = "session-log-bold-text"> </span>, time was: 0:00:00.203
GraphQL API - GlideGraphQL : Flushing GraphQL cache because  change occurred in sys_dictionary, for table: x_nose_nexai_test_cashflow
Slow business rule 'Add New Column To Form Section' on sys_dictionary:<span class = "session-log-bold-text"> </span>, time was: 0:00:00.148
Replication is not enabled on table: x_nose_nexai_test_cashflow, not queueing replication create column special db event
Adding column(s): x_nose_nexai_test_cashflow
Altering storage table [x_nose_nexai_test_cashflow]: ALTER TABLE x_nose_nexai_test_cashflow ADD "amount_origin" SNCVARCHAR(40)
Altering storage table [sh$x_nose_nexai_test_cashflow]: ALTER TABLE sh$x_nose_nexai_test_cashflow ADD "is_net" SNCVARCHAR(10)
DBUtil : Default value does not exist for field : amount_origin, table : x_nose_nexai_test_cashflow
[0:00:00.314] DBUtil new field inserted: amount_origin in x_nose_nexai_test_cashflow
Slow business rule 'CreateElement' on sys_dictionary:<span class = "session-log-bold-text"> </span>, time was: 0:00:00.344
GraphQL API - GlideGraphQL : Flushing GraphQL cache because  change occurred in sys_dictionary, for table: x_nose_nexai_test_email
Replication is not enabled on table: x_nose_nexai_test_email, not queueing replication create column special db event
Adding column(s): x_nose_nexai_test_email
Altering storage table [x_nose_nexai_test_email]: ALTER TABLE x_nose_nexai_test_email ADD "settle_granularity" SNCVARCHAR(40)
DBUtil : Default value does not exist for field : settle_granularity, table : x_nose_nexai_test_email
[0:00:00.084] DBUtil new field inserted: settle_granularity in x_nose_nexai_test_email
Slow business rule 'CreateElement' on sys_dictionary:<span class = "session-log-bold-text"> </span>, time was: 0:00:00.106
[CacheFlushLog] event=sys_script_include, count=1, ms=1519: Flushing catalog sys_script_include
Loaded the Script Includes cache in 43 ms (loaded=true, size=5204)
[CacheFlushLog] event=sys_script, count=1, ms=135: Flushing catalog sys_script
[CacheFlushLog] event=sp_widget, count=1, ms=146: Flushing catalog sp_widget
[CacheFlushLog] event=sp_page, count=1, ms=174: Flushing catalog sp_page
[CacheFlushLog] event=sp_row, count=1, ms=146: Flushing catalog sp_row
[CacheFlushLog] event=sp_column, count=1, ms=62: Flushing catalog sp_column
[CacheFlushLog] event=sp_instance, count=1, ms=63: Flushing catalog sp_instance
*** Script: 
=================================================================
GROSS / NET SWITCH   scope: x_nose_nexai_test   running in: rhino.global
=================================================================
application : NexAI OTC Test  f1621260954a4076abbfb2ac2e31bc56

1. COLUMNS
   CREATED  x_nose_nexai_test_cashflow.netting_group  (Netting Group)
   CREATED  x_nose_nexai_test_cashflow.is_net  (Is Net)
   CREATED  x_nose_nexai_test_cashflow.amount_origin  (Amount Origin)
   CREATED  x_nose_nexai_test_email.settle_granularity  (Settle Granularity)

2. SCRIPT INCLUDE  NettingEngine
   CREATED  NettingEngine  6aedaa3eebefc7103aa5f8f7fcd0cd34

3. GUARD BUSINESS RULE
   Keeps matching honest without editing CompareMatch: if anything writes a match onto a row
   that is not the granularity the mail settles at, the match is cleared before it is saved.
   CREATED  business rule  faedaa3eebefc7103aa5f8f7fcd0cd3a

4. WIDGET + PAGE
   CREATED  widget nexai-grossnet  b2edaa3eebefc7103aa5f8f7fcd0cd43
   CREATED  page nexai_grossnet  3aedaa3eebefc7103aa5f8f7fcd0cd49
   layout ok

INSTALLED. Open it at:
   https://nomurabsmdev.service-now.com/nexai?id=nexai_grossnet

   The landing list shows every mail with more than one cashflow.
   Open one, press Gross or Net, and the choice is saved on the mail.

   Switching to Net writes one net row per netting group and clears any match on the
   components, so a net and its components can never both claim the same money.
   Switching back to Gross clears the net's match. Every switch writes a
   granularity.selected event to the audit trail.

   END TO END, without editing any existing code:
     - Confirm & match runs Compare & Match over the settled rows ONLY.
     - The guard business rule strips a match from any row that is not settled, so even a
       run started from the flow or the board cannot leave a net and its components both
       claiming the same money.
     - Nets heal themselves: a re-sync deletes them, the next read rebuilds them, so the
       choice survives re-extraction. WizardExtractor is untouched.
     - Audit: granularity.selected on every switch, netting.computed on every net built.

   STILL COUNTS EVERY ROW: the board tiles and the case screen have no notion of roles,
   so a mail switched to Net shows one extra row there until they are taught to filter on
   is_net. Only switched mails are affected - nothing else gains a row. That change edits
   working widgets, so it is deliberately a separate, deliberate step.
=================================================================
