[0:00:19.803] Script completed in scope global: script
Script execution history and recovery available here
*** Script: instance : nomurabsmdev
*** Script: endpoint : http://int-intranetws.nomuranow.com/cts-otc/phoenix/dev/cashmanager-eu/api/ssgai/cashflows
*** Script: payload  : {"CounterpartyName":"CP Name (8577922)","Currency":"GBP","Direction":"Receive","Amount":50000,"AmountTolerance":50000,"ValueDate":"2026-03-15","ValueDateTolerance":45}
*** Script: ------------------------------------------------------------------
*** Script: 1. CREDENTIAL
QueryEventLogger: Invalid query detected, please check logs for details [Unknown field user_name in table sys_auth_profile_basic]
Invalid query detected, stack trace below [Unknown field user_name in table sys_auth_profile_basic]
	com.glide.db.QueryEventLogger.logInvalidQuery(QueryEventLogger.java:56)
	com.glide.db.QueryEventLogger.logInvalidQuery(QueryEventLogger.java:47)
	com.glide.script.GlideRecord.isInvalidTableField(GlideRecord.java:2858)
	com.glide.script.GlideRecord.isFieldInvalid(GlideRecord.java:2484)
	com.glide.script.GlideRecord.jsFunction_addQuery(GlideRecord.java:2418)
	jdk.internal.reflect.GeneratedMethodAccessor23.invoke(Unknown Source)
	java.base/jdk.internal.reflect.DelegatingMethodAccessorImpl.invoke(DelegatingMethodAccessorImpl.java:43)
	java.base/java.lang.reflect.Method.invoke(Method.java:569)
	org.mozilla.javascript.MemberBox.invoke(MemberBox.java:229)
	org.mozilla.javascript.FunctionObject.doInvoke(FunctionObject.java:693)
	org.mozilla.javascript.FunctionObject.call(FunctionObject.java:622)
	org.mozilla.javascript.ScriptRuntime.doCall(ScriptRuntime.java:3194)
	org.mozilla.javascript.Interpreter.interpretLoop(Interpreter.java:1968)
	org.mozilla.javascript.Interpreter.interpret(Interpreter.java:940)
	org.mozilla.javascript.InterpretedFunction.lambda$call$0(InterpretedFunction.java:127)
	com.glide.caller.gen.null_null_script.call(Unknown Source)
	com.glide.script.ScriptCaller.call(ScriptCaller.java:22)
	org.mozilla.javascript.InterpretedFunction.call(InterpretedFunction.java:125)
	org.mozilla.javascript.ScriptRuntime.doCall2(ScriptRuntime.java:3296)
	org.mozilla.javascript.ScriptRuntime.doCall(ScriptRuntime.java:3204)
	org.mozilla.javascript.Interpreter.interpretLoop(Interpreter.java:1968)
	org.mozilla.javascript.Interpreter.interpret(Interpreter.java:940)
	org.mozilla.javascript.InterpretedFunction.lambda$call$0(InterpretedFunction.java:127)
	com.glide.caller.gen.null_null_script.call(Unknown Source)
	com.glide.script.ScriptCaller.call(ScriptCaller.java:22)
	org.mozilla.javascript.InterpretedFunction.call(InterpretedFunction.java:125)
	org.mozilla.javascript.ContextFactory.doTopCall(ContextFactory.java:722)
	org.mozilla.javascript.ScriptRuntime.doTopCall(ScriptRuntime.java:4812)
	org.mozilla.javascript.InterpretedFunction.exec(InterpretedFunction.java:141)
	com.glide.script.ScriptCompiler.executeAndPublishMetric(ScriptCompiler.java:83)
	com.glide.script.ScriptEvaluator.execute(ScriptEvaluator.java:552)
	com.glide.script.ScriptEvaluator.evaluate(ScriptEvaluator.java:254)
	com.glide.script.fencing.GlideScopedEvaluator.evaluateScript(GlideScopedEvaluator.java:439)
	com.glide.script.fencing.GlideScopedEvaluator.evaluateScript(GlideScopedEvaluator.java:311)
	com.glide.script.fencing.GlideScopedEvaluator.evaluateScript(GlideScopedEvaluator.java:288)
	com.glide.processors.ScriptProcessor.evaluateScript0(ScriptProcessor.java:411)
	com.glide.processors.ScriptProcessor.lambda$evaluateScriptWithRecordingOption$0(ScriptProcessor.java:394)
	com.glide.rollback.recording.RollbackRecorder.execute(RollbackRecorder.java:67)
	com.glide.processors.ScriptProcessor.evaluateScriptWithRecordingOption(ScriptProcessor.java:394)
	com.glide.processors.ScriptProcessor.evaluateScript(ScriptProcessor.java:375)
	com.glide.processors.ScriptProcessor.runScript(ScriptProcessor.java:272)
	com.glide.processors.ScriptProcessor.process(ScriptProcessor.java:230)
	com.glide.processors.AProcessor.runProcessor(AProcessor.java:919)
	com.glide.processors.AProcessor.processTransaction(AProcessor.java:345)
	com.glide.processors.ProcessorRegistry.process0(ProcessorRegistry.java:200)
	com.glide.processors.ProcessorRegistry.process(ProcessorRegistry.java:188)
	com.glide.ui.GlideServletTransaction.process(GlideServletTransaction.java:62)
	com.glide.sys.Transaction.run(Transaction.java:3248)
	com.glide.ui.HTTPTransaction.run(HTTPTransaction.java:44)
	com.glide.sys.util.sema.SemaphoreQueueThreadPool$Semaphore.runTransaction(SemaphoreQueueThreadPool.java:338)
	com.glide.sys.util.sema.SemaphoreQueueThreadPool$Semaphore.runThreadImpl(SemaphoreQueueThreadPool.java:303)
	com.glide.sys.util.sema.SemaphoreQueueThreadPool$Semaphore.runThread(SemaphoreQueueThreadPool.java:150)
	java.base/java.lang.Thread.run(Thread.java:841)

*** Script:    found  "PCM svcnewsd"  username=null
*** Script:    found  "Chinou API Basic Auth"  username=null
StorageEncrypter: no registered Key-Provider for hashKey: $dl: no thrown error
StorageEncrypter: no registered Key-Provider for hashKey: $dl: no thrown error
*** Script:    found  "NCNTS Incident Prod"  username=null
*** Script:    found  "ncntssnp"  username=null
*** Script:    found  "FX WriteBack service account"  username=null
StorageEncrypter: no registered Key-Provider for hashKey: $dl: no thrown error
StorageEncrypter: no registered Key-Provider for hashKey: $dl: no thrown error
*** Script:    found  "NCNTS Incident CMDB Test"  username=null
StorageEncrypter: no registered Key-Provider for hashKey: $dl: no thrown error
StorageEncrypter: no registered Key-Provider for hashKey: $dl: no thrown error
*** Script:    found  "JIRA"  username=null
StorageEncrypter: no registered Key-Provider for hashKey: $dl: no thrown error
StorageEncrypter: no registered Key-Provider for hashKey: $dl: no thrown error
*** Script:    found  "NCNTS Incident Test"  username=null
StorageEncrypter: no registered Key-Provider for hashKey: $dl: no thrown error
StorageEncrypter: no registered Key-Provider for hashKey: $dl: no thrown error
*** Script:    found  "PDP"  username=null
*** Script:    9 profiles share this username - using the most recently updated.
*** Script:    using  "PCM svcnewsd"  (password never read by this script)
*** Script: ------------------------------------------------------------------
*** Script: 2. CALL
*** Script:    trying direct from the instance ...
No URIs provided, removing all URI matcher rules
Request not sent to uri= http://int-intranetws.nomuranow.com/cts-otc/phoenix/dev/cashmanager-eu/api/ssgai/cashflows : java.net.UnknownHostException: int-intranetws.nomuranow.com: int-intranetws.nomuranow.com
*** Script:    -> status 0 in 67ms   error: Request not sent to uri= http://int-intranetws.nomuranow.com/cts-otc/phoenix/dev/cashmanager-eu/api/ssgai/cashflows : java.net.UnknownHostException: int-intranetws.nomuranow.com
*** Script: 
*** Script:    direct did not work. The endpoint is an intranet host, so that is the expected
*** Script:    outcome on a cloud instance. Looking for a MID server to route through.
*** Script:    MID servers Up: nomurabsmdev-win-2019-int1@amn010318, nomurabsmdev-win-2019-int2@amn010319
*** Script:    trying via MID server "nomurabsmdev-win-2019-int1@amn010318" ...
Restoring crypto module bddc8db07722201099808d11681061bc from db
Added operation symmetric_unwrapping to module
Added operation symmetric_wrapping to module
Added operation symmetric_unwrapping to module
Added operation symmetric_wrapping to module
Added operation symmetric_unwrapping to module
Added operation symmetric_wrapping to module
Added operation symmetric_unwrapping to module
Added operation symmetric_wrapping to module
Added operation symmetric_unwrapping to module
Found keyId : 3c97ee901bf01110858f0ed8624bcb21 in store : com.glide.kmf.KMFDBModuleKeyStore@768d901e
Found wrapped key in repo. Attempting to unwrap.
Successfully unwrapped key: 3c97ee901bf01110858f0ed8624bcb21
*** Script:    -> status 200 in 764ms   body 5818 chars
*** Script: ------------------------------------------------------------------
*** Script: 3. RESULT
*** Script:    SUCCESS via MID server "nomurabsmdev-win-2019-int1@amn010318" in 764ms
*** Script: ------------------------------------------------------------------
*** Script: 4. WHAT CAME BACK
*** Script:    rows: 6
*** Script:    fields per row: 30
*** Script:    rows with a different field count: 0
*** Script: 
*** Script:       Cashflow Id                 89684970
*** Script:       Counterparty Reference      (empty)
*** Script:       Counterparty Name           CP Name (8577922)
*** Script:       Owning Org Name             CP Name (8577922)
*** Script:       Notional/Amount             38730.3
*** Script:       Nomura Entity Name          NFPS
*** Script:       Product                     Unknown RP
*** Script:       Currency                    GBP
*** Script:       Direction                   Receive
*** Script:       Trade Date                  2026-02-02
*** Script:       Value Date                  2026-02-02
*** Script:       nomSSIAgentBankBIC          BARCGB22
*** Script:       nomSSIAgentBank             BARCLAYS BANK PLC
*** Script:       nomSSIAgentAccount          GB67BA...5019
*** Script:       nomIntermediaryBankBIC      (empty)
*** Script:       nomIntermediaryBankName     (empty)
*** Script:       nomIntermediaryAccount      (empty)
*** Script:       nomSSIBeneficiaryBIC        NFPSJPJT
*** Script:       nomSSIBeneficiary           Beneficiary Name (1394592)
*** Script:       nomSettlementAccountID      3619026
*** Script:       cpSSIAgentBankBIC           BARCGB22
*** Script:       cpSSIAgentBank              BARCLAYS BANK PLC LONDON ST SWITHINS
*** Script:       cpSSIAgentAccount           GB48BA...7781
*** Script:       cpSSIIntermediaryBIC        (empty)
*** Script:       cpIntermediaryBankName      (empty)
*** Script:       cpSSIIntermediaryAccount    (empty)
*** Script:       cpSSIBeneficiaryBIC         GSILGB2X
*** Script:       cpSSIBeneficiary            Beneficiary Name (2478431)
*** Script:       cpSettlementAccountID       8596787
*** Script:       CaseNumber                  1
*** Script: ------------------------------------------------------------------
*** Script: 5. THE THINGS THAT DECIDE HOW THE MATCHER IS WRITTEN
*** Script:    Q1 sign vs direction
*** Script:       Receive rows: 6, of which NEGATIVE: 0
*** Script:       Pay rows    : 0, of which POSITIVE: 0
*** Script:       -> consistent with our convention (Receive positive, Pay negative).
*** Script:    Q2 amount tolerance - asked for 50000 +/- 50000  (signed window 0 to 100000)
*** Script:       rows outside that window by SIGNED value  : 0
*** Script:       rows outside that window by ABSOLUTE value: 0
*** Script:       -> cannot tell from this response; every row fits either way. Re-probe with a
*** Script:          tighter tolerance to settle it.
*** Script:    Q3 what is usable as a matching key in dev
*** Script:       Counterparty Name masked as "CP Name (nnn)" : 6 of 6
*** Script:       Counterparty Reference BLANK                : 4 of 6
*** Script:       distinct Nomura Entity Name : NFPS
*** Script:       distinct Currency           : GBP
*** Script:       distinct Direction          : Receive
*** Script:       distinct Product            : Unknown RP
*** Script:       -> counterparty NAME is unusable as a key in dev, the same wall the synthetic
*** Script:          directory already puts us behind. Counterparty Reference is the candidate,
*** Script:          if our mails carry it; Nomura Entity Name looks real and would finally make
*** Script:          entity matching possible.
*** Script:    Q4 CaseNumber distinct values: 1   (meaning still to be confirmed)
*** Script:    value dates returned: 2026-02-02 to 2026-04-23   (asked 2026-03-15 +/- 45 days, so -41 to 39 days out)
*** Script: ------------------------------------------------------------------
*** Script: 6. FIRST FEW ROWS
*** Script:    CASHFLOW ID  CPTY REF                       AMOUNT  CCY  DIR      VALUE DATE  ENTITY
*** Script:    89684970     -                             38730.3  GBP  Receive  2026-02-02  NFPS
*** Script:    89684966     SDB3864336549.0.0.0          96825.75  GBP  Receive  2026-02-02  NFPS
*** Script:    91085660     SDB3864377527.0.0.0          37603.99  GBP  Receive  2026-03-16  NFPS
*** Script:    91862044     -                               12128  GBP  Receive  2026-04-14  NFPS
*** Script:    92108123     -                            92333.84  GBP  Receive  2026-04-23  NFPS
*** Script:    92048159     -                                8441  GBP  Receive  2026-04-22  NFPS
*** Script: ------------------------------------------------------------------
*** Script: Retrieval proven. Next: a PcmClient Script Include in Global (public, so all four scopes
*** Script: can call it) wrapping this request, then the field mapping onto the booking table.
*** Script: Nothing was written by this script.
