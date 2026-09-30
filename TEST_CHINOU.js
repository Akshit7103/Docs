[0:00:04.253] Script completed in scope global: script
Script execution history and recovery available here
*** Script: [ChinouClient] model=anthropic-5-sonnet[Bedrock] status=200 mid=nomurabsmdev-win-2019-int1@amn010318
*** Script: [ChinouClient] LLMError: Service account 'svcnewsd' is not authorized for Registration ID 'AIUC00337'. See https://confluence.nomura.com/ETCB/confluence/x/1ZJuYQ for more information.: no thrown error
*** Script: [ChinouClient] invokeDocument model=anthropic-5-sonnet[Bedrock] status=200 file=probe.pdf mid=nomurabsmdev-win-2019-int1@amn010318 roundTripMs=16
*** Script: [ChinouClient] invokeDocument LLMError: Service account 'svcnewsd' is not authorized for Registration ID 'AIUC00337'. See https://confluence.nomura.com/ETCB/confluence/x/1ZJuYQ for more information.: no thrown error
*** Script: 
=================================================================
CHINOU CONNECTIVITY TEST
=================================================================

CONFIG IN USE
   chinou.reg.id             AIUC00337
   chinou.model.id           anthropic-5-sonnet[Bedrock]

   all chinou.* properties on the instance:
      chinou.model.id                         anthropic-5-sonnet[Bedrock]
      chinou.reg.id                           AIUC00337
      x_nose_gmet_app.chinou.api.key          <REDACTED>
      x_nose_gmet_app.chinou.api.url          http://10.199.17.124:8080
      x_nose_gmet_app.chinou.auth             <REDACTED>
      x_nose_gmet_app.chinou.endpoint         http://chinou-ext-api-stg.us-east-1.aws.nomura.com/invoke/
      x_nose_gmet_app.chinou.mid_server       nomurabsmdev-win-2019-int1@amn010318
      x_nose_gmet_app.chinou.model            anthropic-4.5-sonnet[Bedrock]
      x_nose_gmet_app.chinou.password         <REDACTED>
      x_nose_gmet_app.chinou.reg_id           AIUC00336
      x_nose_gmet_app.chinou.username         svcnewsd
      x_nose_nfotc.chinou_bridge_key          <REDACTED>

-----------------------------------------------------------------
TEST 1  invoke()   - plain text
-----------------------------------------------------------------
   elapsed : 2175ms
   response object:
      error              = LLMError: Service account 'svcnewsd' is not authorized for Registration ID 'AIUC00337'. See https://confluence.nomura.com/ETCB/confluence/x/1ZJuYQ for more information.
      model              = anthropic-5-sonnet[Bedrock]
      status             = 200
      success            = false

   BODY (this is where the real error lives):
      (empty)

-----------------------------------------------------------------
TEST 2  invokeDocument()   - a 392-byte PDF containing the text HELLO 1234
-----------------------------------------------------------------
   elapsed : 2033ms
   response object:
      error              = LLMError: Service account 'svcnewsd' is not authorized for Registration ID 'AIUC00337'. See https://confluence.nomura.com/ETCB/confluence/x/1ZJuYQ for more information.
      model              = anthropic-5-sonnet[Bedrock]
      roundTripMs        = 16
      status             = 200
      success            = false

   BODY:
      (empty)

=================================================================
SUMMARY
   call                ms      outcome
   invoke() text       2175    REFUSED - account / registration ID (AI CoE)
   invokeDocument()    2033    REFUSED - account / registration ID (AI CoE)

   The transport status appears in the lines the client logs above this output, as
   "[ChinouClient] ... status=NNN". Remember 200 does NOT mean success here - this
   gateway returns 200 and puts the failure in the body.
=================================================================
