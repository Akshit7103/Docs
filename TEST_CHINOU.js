[0:00:07.891] Script completed in scope global: script
Script execution history and recovery available here
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
Found keyId : 3c97ee901bf01110858f0ed8624bcb21 in store : com.glide.kmf.KMFDBModuleKeyStore@2bbf0c98
Found wrapped key in repo. Attempting to unwrap.
Successfully unwrapped key: 3c97ee901bf01110858f0ed8624bcb21
*** Script: [ChinouClient] model=anthropic-5-sonnet[Bedrock] status=200 mid=nomurabsmdev-win-2019-int1@amn010318
*** Script: [ChinouClient] invokeDocument model=anthropic-5-sonnet[Bedrock] status=200 file=probe.pdf mid=nomurabsmdev-win-2019-int1@amn010318 roundTripMs=18
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
   elapsed : 3788ms
   response object:
      costUsd            = 0.000204
      metrics            = (object)
      model              = anthropic-5-sonnet[Bedrock]
      response           = OK
      responseTimeMs     = 1791.4659976959229
      roundTripMs        = 655
      status             = 200
      success            = true

   BODY (this is where the real error lives):
      OK

-----------------------------------------------------------------
TEST 2  invokeDocument()   - a 392-byte PDF containing the text HELLO 1234
-----------------------------------------------------------------
   elapsed : 4044ms
   response object:
      costUsd            = 0.000294
      metrics            = (object)
      model              = anthropic-5-sonnet[Bedrock]
      response           = HELLO 1234
      responseTimeMs     = 1793.9491271972656
      roundTripMs        = 18
      status             = 200
      success            = true

   BODY:
      HELLO 1234
      ^ contains HELLO 1234 - the document was genuinely read.

=================================================================
SUMMARY
   call                ms      outcome
   invoke() text       3788    OK
   invokeDocument()    4044    OK

   The transport status appears in the lines the client logs above this output, as
   "[ChinouClient] ... status=NNN". Remember 200 does NOT mean success here - this
   gateway returns 200 and puts the failure in the body.
=================================================================
