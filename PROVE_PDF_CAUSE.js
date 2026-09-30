[0:00:03.800] Script completed in scope global: script
Script execution history and recovery available here
*** Script: [ChinouClient] model=anthropic-5-sonnet[Bedrock] status=200 mid=nomurabsmdev-win-2019-int1@amn010318
*** Script: [ChinouClient] LLMError: Service account 'svcnewsd' is not authorized for Registration ID 'AIUC00337'. See https://confluence.nomura.com/ETCB/confluence/x/1ZJuYQ for more information.: no thrown error
*** Script: [ChinouClient] invokeDocument model=anthropic-5-sonnet[Bedrock] status=200 file=probe.pdf mid=nomurabsmdev-win-2019-int1@amn010318 roundTripMs=15
*** Script: [ChinouClient] invokeDocument LLMError: Service account 'svcnewsd' is not authorized for Registration ID 'AIUC00337'. See https://confluence.nomura.com/ETCB/confluence/x/1ZJuYQ for more information.: no thrown error
*** Script: 
=================================================================
CHINOU AUTHORIZATION DIAGNOSTIC   (read-only)
=================================================================

1. LIVE CALL TEST
   TEXT  invoke()          : FAILED   2687ms
      success=false  responseChars=0
      error: LLMError: Service account 'svcnewsd' is not authorized for Registration ID 'AIUC00337'. See https://confluence.nomura.com/ETCB/confluence/x/1ZJuYQ for more information.
   DOC   invokeDocument()  : FAILED   1030ms
      success=false  responseChars=0
      error: LLMError: Service account 'svcnewsd' is not authorized for Registration ID 'AIUC00337'. See https://confluence.nomura.com/ETCB/confluence/x/1ZJuYQ for more information.

   READING:
      TOTAL OUTAGE - every model call is rejected. No extraction of any kind can work,
      and any "0 rows" result recorded while this lasts is meaningless.

2. WHERE THE REGISTRATION ID COMES FROM

   ChinouClient in scope "Global"   22987 chars   sys_id 6edc314b3b470310559a8ff764e45a99
      registration IDs hard-coded here : AIUC00337
      read from a property             : getProperty('chinou.reg.id' | getProperty('chinou.reg.id' | getProperty('chinou.reg.id'
      mentions request parameters      : true
      looks like a query-string param  : true

   ChinouClient in scope "GMET App"   4935 chars   sys_id 9bf049a9fb87471000d2f59f5eefdc6a
      registration IDs hard-coded here : none
      read from a property             : getProperty('chinou.reg_id'
      mentions request parameters      : true
      looks like a query-string param  : true

3. RELATED PROPERTIES
   chinou.model.id                               anthropic-5-sonnet[Bedrock]
   chinou.reg.id                                 AIUC00337
   glide.crypto.core.startup.storage.encryption.keys.crash.on.registration.fail<REDACTED>
   glide.preauth.device.trust.skip.user.registrationfalse
   x_nose_gmet_app.chinou.api.key                <REDACTED>
   x_nose_gmet_app.chinou.api.url                http://10.199.17.124:8080
   x_nose_gmet_app.chinou.auth                   Basic c3ZjbmV3c2Q6WU9VUl9QQVNTV09SRF9IRVJF
   x_nose_gmet_app.chinou.endpoint               http://chinou-ext-api-stg.us-east-1.aws.nomura.com/invoke/
   x_nose_gmet_app.chinou.mid_server             nomurabsmdev-win-2019-int1@amn010318
   x_nose_gmet_app.chinou.model                  anthropic-4.5-sonnet[Bedrock]
   x_nose_gmet_app.chinou.password               <REDACTED>
   x_nose_gmet_app.chinou.reg_id                 AIUC00336
   x_nose_gmet_app.chinou.username               svcnewsd
   x_nose_nfotc.chinou_bridge_key                <REDACTED>

=================================================================
WHAT TO DO WITH THIS
   The registration ID in the rejection was AIUC00337. The ID on record for this integration
   is AIUC00336. If section 2 shows AIUC00337 hard-coded or in a property, that is the whole
   fault and it is a one-value fix.

   If it shows AIUC00336 instead, then the client is correct and the SERVICE ACCOUNT lost its
   authorization - that is a question for the AI CoE, not a code change.

   Either way: no extraction result recorded while this is failing means anything. Re-run the
   PDF ablation only after a live call succeeds.
=================================================================
