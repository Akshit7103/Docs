[0:00:03.373] Script completed in scope global: script
Script execution history and recovery available here
Operation	Table	Row Count
update	sys_update_version	1
update	sys_update_xml	1
insert	sys_update_version	1
update	sys_properties	1
insert	sys_trigger	1
[CacheFlushLog] event=sys_properties, count=1, ms=0: Flushing catalog sys_properties
[CacheFlushLog] event=glide.properties.db, count=1, ms=29: Flushing catalog glide.properties.db
Loading properties from DB
StorageEncrypter: no registered Key-Provider for hashKey: b8j: no thrown error
StorageEncrypter: no registered Key-Provider for hashKey: b8j: no thrown error
StorageEncrypter: no registered Key-Provider for hashKey: b8j: no thrown error
Skipping db override of non-overridable property :glide.db.allow_unsafe_dbi_execute_sql
StorageEncrypter: no registered Key-Provider for hashKey: b8j: no thrown error
Slow business rule 'Properties change' on sys_properties:<span class = "session-log-bold-text"> chinou.reg.id</span>, time was: 0:00:00.337
*** Script: [ChinouClient] model=anthropic-5-sonnet[Bedrock] status=200 mid=nomurabsmdev-win-2019-int1@amn010318
*** Script: [ChinouClient] LLMError: Service account 'svcnewsd' is not authorized for Registration ID 'AIUC00336'. See https://confluence.nomura.com/ETCB/confluence/x/1ZJuYQ for more information.: no thrown error
*** Script: [ChinouClient] invokeDocument model=anthropic-5-sonnet[Bedrock] status=200 file=probe.pdf mid=nomurabsmdev-win-2019-int1@amn010318 roundTripMs=23
*** Script: [ChinouClient] invokeDocument LLMError: Service account 'svcnewsd' is not authorized for Registration ID 'AIUC00336'. See https://confluence.nomura.com/ETCB/confluence/x/1ZJuYQ for more information.: no thrown error
*** Script: 
=================================================================
FIX CHINOU REGISTRATION ID
=================================================================

property   : chinou.reg.id
before     : AIUC00337
after      : AIUC00336

ROLLBACK   : set chinou.reg.id back to "AIUC00337"

UPDATED.

LIVE TEST
   TEXT  invoke()         : STILL FAILING   1074ms
      LLMError: Service account 'svcnewsd' is not authorized for Registration ID 'AIUC00336'. See https://confluence.nomura.com/ETCB/confluence/x/1ZJuYQ for more information.
   DOC   invokeDocument() : STILL FAILING   1697ms
      LLMError: Service account 'svcnewsd' is not authorized for Registration ID 'AIUC00336'. See https://confluence.nomura.com/ETCB/confluence/x/1ZJuYQ for more information.

=================================================================
STILL FAILING after the change.

If the error still names AIUC00337, the client is not reading this property - check the
hard-coded fallback in the Global ChinouClient.
If it now names AIUC00336, then svcnewsd is not authorized for EITHER id, and this is a
question for the AI CoE rather than a configuration change. Quote the confluence link in
the error when raising it.
=================================================================
