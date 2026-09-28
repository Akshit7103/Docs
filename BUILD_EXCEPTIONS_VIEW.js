[0:00:00.600] Script completed in scope global: script
Script execution history and recovery available here
Operation	Table	Row Count
insert	sys_metadata_customization	6
insert	sys_update_version	6
insert	sys_update_xml	6
insert	sp_container	1
insert	sp_column	1
...and another 4 affected table(s)
View full summary here
[CacheFlushLog] event=sp_widget, count=1, ms=0: Flushing catalog sp_widget
#### Compiler Stats ####
Compiles: 1, time: 1,546ms
Total classes: 1, bytecode length: 0
Total loaders created: 1, unloaded: 1, existing: 0
Interpreted compiles: 27,600, time: 12,093ms
Cache name: "syscache_expression", max: 7,447, size: 5,617, seeks: 506,811,250, hits: 253,399,779, misses: 253,411,471, flushed: 0, row evictions: 0, single key evictions: 0, puts: 0, reclaims: 0, time from last reclaim to recreation total ms: 0, average time from last reclaim to recreation ms: 0
[CacheFlushLog] event=sp_page, count=1, ms=133: Flushing catalog sp_page
[CacheFlushLog] event=sp_row, count=1, ms=154: Flushing catalog sp_row
[CacheFlushLog] event=sp_column, count=1, ms=54: Flushing catalog sp_column
[CacheFlushLog] event=sp_instance, count=1, ms=69: Flushing catalog sp_instance
*** Script: 
=================================================================
BUILD EXCEPTIONS VIEW   running in: rhino.global
=================================================================
owning application : NexAI OTC Test  (x_nose_nexai_test)  f1621260954a4076abbfb2ac2e31bc56

CREATED widget   nexai-exceptions  a9a9ae2aeb6747103aa5f8f7fcd0cdcf
CREATED page     nexai_exceptions  e5a9ee2aeb6747103aa5f8f7fcd0cdc3
layout  container=29a9ee2aeb6747103aa5f8f7fcd0cdc9  row=61a9ee2aeb6747103aa5f8f7fcd0cdcf  column=21a9ee2aeb6747103aa5f8f7fcd0cdd4  instance=ada9226aeb6747103aa5f8f7fcd0cd23

BUILD OK. Open it at:
   https://nomurabsmdev.service-now.com/nexai?id=nexai_exceptions

The records are stamped to NexAI OTC Test, so they belong to the application and
travel in its update set rather than sitting in Global.
=================================================================
