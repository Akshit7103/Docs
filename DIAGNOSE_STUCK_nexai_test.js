[0:00:00.723] Script completed in scope x_nose_nexai_test: script
Script execution history and recovery available here
Operation	Table	Row Count
insert	sys_illegal_member	1
x_nose_nexai_test: Scope OK: x_nose_nexai_test
x_nose_nexai_test: reading evidence since 2026-09-25 10:16:16  (last 90 minutes)
x_nose_nexai_test: ------------------------------------------------------------------
x_nose_nexai_test: 1. RELEVANT MAILS NOT YET EXTRACTED
x_nose_nexai_test:    already extracted (wiz_extracted set) : 57
x_nose_nexai_test:    STILL PENDING                         : 15
x_nose_nexai_test:      1. rows=0  Deutsche Bank Derivative Settlements Pre-Confirmation VD - 13 May 2026 -
x_nose_nexai_test:      2. rows=0  Deutsche Bank Derivative Settlements Pre-Confirmation VD - 18 August 202
x_nose_nexai_test:      3. rows=0  GS Settlement for Value Date 2026-08-19,  GS Ref Num 215512496
x_nose_nexai_test:      4. rows=0  GS Settlement for Value Date 2026-08-19,  GS Ref Num 215514797
x_nose_nexai_test:      5. rows=0  NDF-Netting as per 13.08.2026 between Nomura and IKEA Supply AG
x_nose_nexai_test:      6. rows=0  NDF-Netting as per 18.08.2026 between Nomura and IKEA Supply AG
x_nose_nexai_test:      7. rows=0  NFPS Payment Confirmation for value date 20260818(USD)
x_nose_nexai_test:      8. rows=0  NGFP Payment Confirmation for value date 20260821
x_nose_nexai_test:      9. rows=0  NIP Arrangement Fees and swaps between NIP and NEF value 20260819
x_nose_nexai_test:      10. rows=0  OTC Derivative Confirmation: SDBB4QN33349CD99QQ.0.0.0.1
x_nose_nexai_test:      11. rows=0  OTC Derivative Confirmation: SDBB4QN33349CD99QQ.1.0.0.1
x_nose_nexai_test:      12. rows=0  Payment Notice Nomura International PLC Jul-30-2026 USD
x_nose_nexai_test:      13. rows=0  Payment Notice Nomura International PLC Jun-11-2026 USD
x_nose_nexai_test:      14. rows=0  Payment Notice Nomura International PLC Jun-11-2026 USD
x_nose_nexai_test:      15. rows=0  Settlement Confirmation - 21 Aug 2026 - 1885,1753,5913922,6842473,659843
x_nose_nexai_test: ------------------------------------------------------------------
x_nose_nexai_test: 2. LLM CALLS IN THE LAST 90 MINUTES
x_nose_nexai_test:    calls: 123   failed: 1
x_nose_nexai_test:    distinct errors:
x_nose_nexai_test:      x1  HTTP 0: null
x_nose_nexai_test:    per PENDING mail, what the model was asked in this window:
x_nose_nexai_test:      3 call(s), 0 failed, 1s total   Deutsche Bank Derivative Settlements Pre-Confirmatio
x_nose_nexai_test:      3 call(s), 0 failed, 12s total   Deutsche Bank Derivative Settlements Pre-Confirmatio
x_nose_nexai_test:      6 call(s), 0 failed, 1s total   GS Settlement for Value Date 2026-08-19,  GS Ref Num
x_nose_nexai_test:      6 call(s), 0 failed, 2s total   GS Settlement for Value Date 2026-08-19,  GS Ref Num
x_nose_nexai_test:      3 call(s), 0 failed, 0s total   NDF-Netting as per 13.08.2026 between Nomura and IKE
x_nose_nexai_test:      3 call(s), 0 failed, 0s total   NDF-Netting as per 18.08.2026 between Nomura and IKE
x_nose_nexai_test:      3 call(s), 0 failed, 0s total   NFPS Payment Confirmation for value date 20260818(US
x_nose_nexai_test:      3 call(s), 0 failed, 11s total   NGFP Payment Confirmation for value date 20260821
x_nose_nexai_test:      3 call(s), 1 failed, 0s total   NIP Arrangement Fees and swaps between NIP and NEF v
x_nose_nexai_test:      6 call(s), 0 failed, 1s total   OTC Derivative Confirmation: SDBB4QN33349CD99QQ.0.0.
x_nose_nexai_test:      6 call(s), 0 failed, 13s total   OTC Derivative Confirmation: SDBB4QN33349CD99QQ.1.0.
x_nose_nexai_test:      6 call(s), 0 failed, 1s total   Payment Notice Nomura International PLC Jul-30-2026 
x_nose_nexai_test:      6 call(s), 0 failed, 1s total   Payment Notice Nomura International PLC Jun-11-2026 
x_nose_nexai_test:      6 call(s), 0 failed, 1s total   Payment Notice Nomura International PLC Jun-11-2026 
x_nose_nexai_test:      3 call(s), 0 failed, 2s total   Settlement Confirmation - 21 Aug 2026 - 1885,1753,59
x_nose_nexai_test: ------------------------------------------------------------------
x_nose_nexai_test: 3. SYSTEM LOG - extractor and transaction messages
Security restricted: When targeting a global resource, only ServiceNow authored scopes are allowed as sources
Attempted script access to inaccessible member denied - com.glide.script.fencing.access.ScopeAccessNotGrantedException:getMessage:()Ljava/lang/String;
Script execution error: Script Identifier: null.null.script, Error Description: Illegal access to getter method getMessage in class com.glide.script.fencing.access.ScopeAccessNotGrantedException, Script ES Level: 200
Evaluator.evaluateString() problem: java.lang.SecurityException: Illegal access to getter method getMessage in class com.glide.script.fencing.access.ScopeAccessNotGrantedException: 	org.mozilla.javascript.JavaMembers.get(JavaMembers.java:133)
	org.mozilla.javascript.NativeJavaObject.get(NativeJavaObject.java:129)
	org.mozilla.javascript.ScriptableObject.getProperty(ScriptableObject.java:2401)
	org.mozilla.javascript.ScriptRuntime.getObjectProp(ScriptRuntime.java:1843)
	org.mozilla.javascript.ScriptRuntime.getObjectProp(ScriptRuntime.java:1838)
	org.mozilla.javascript.Interpreter.interpretLoop(Interpreter.java:1466)
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

Background message, type:error, message: Illegal access to getter method getMessage in class com.glide.script.fencing.access.ScopeAccessNotGrantedException
