[0:01:31.578] Script completed in scope x_nose_nexai_test: script
Script execution history and recovery available here
Operation	Table	Row Count
insert	x_nose_nexai_test_llm_usage	3
insert	sys_attachment_doc	2
update	x_nose_nexai_test_email	1
insert	sys_metadata_customization	1
insert	sys_scope_privilege	1
...and another 4 affected table(s)
View full summary here
Found keyId : 3c97ee901bf01110858f0ed8624bcb21 in store : com.glide.kmf.KMFDBModuleKeyStore@2bbf0c98
Found wrapped key in repo. Attempting to unwrap.
Successfully unwrapped key: 3c97ee901bf01110858f0ed8624bcb21
*** Script: [ChinouClient] invokeDocument model=anthropic-5-sonnet[Bedrock] status=200 file=DOC000002741437.pdf mid=nomurabsmdev-win-2019-int1@amn010318 roundTripMs=660
x_nose_nexai_test: [ablation] OTC Derivative Confirmation SDBB4QN33349CD99QQ.0.0.0.1.eml V1 empty_response(0) 29769ms
*** Script: [ChinouClient] invokeDocument model=anthropic-5-sonnet[Bedrock] status=200 file=DOC000002741437.pdf mid=nomurabsmdev-win-2019-int1@amn010318 roundTripMs=21
x_nose_nexai_test: [ablation] OTC Derivative Confirmation SDBB4QN33349CD99QQ.0.0.0.1.eml V2 empty_200(0) 9716ms
*** Script: [ChinouClient] invokeDocument model=anthropic-5-sonnet[Bedrock] status=200 file=DOC000002741437.pdf mid=nomurabsmdev-win-2019-int1@amn010318 roundTripMs=115
x_nose_nexai_test: [ablation] OTC Derivative Confirmation SDBB4QN33349CD99QQ.0.0.0.1.eml V3 empty_200(0c, tokens 0/2) 30797ms
x_nose_nexai_test: [ablation] OTC Derivative Confirmation SDBB4QN33349CD99QQ.0.0.0.1.eml V4 skipped(0) 0ms
*** Script: [ChinouClient] invokeDocument model=anthropic-5-sonnet[Bedrock] status=200 file=hsuanfeng.shih@fubon.com_20260817_173611.pdf mid=nomurabsmdev-win-2019-int1@amn010318 roundTripMs=146
x_nose_nexai_test: [ablation] Rebate  TDCCTrade Date 812.eml V1 ok(0) 5177ms
*** Script: [ChinouClient] invokeDocument model=anthropic-5-sonnet[Bedrock] status=200 file=hsuanfeng.shih@fubon.com_20260817_173611.pdf mid=nomurabsmdev-win-2019-int1@amn010318 roundTripMs=26
x_nose_nexai_test: [ablation] Rebate  TDCCTrade Date 812.eml V2 empty_200(0) 5703ms
*** Script: [ChinouClient] invokeDocument model=anthropic-5-sonnet[Bedrock] status=200 file=hsuanfeng.shih@fubon.com_20260817_173611.pdf mid=nomurabsmdev-win-2019-int1@amn010318 roundTripMs=427
x_nose_nexai_test: [ablation] Rebate  TDCCTrade Date 812.eml V3 ok(299c, tokens 0/0) 4449ms
Security restricted: Execute operation on API 'GlideSysAttachment.write' from scope 'NexAI OTC Test' was granted and added to 'NexAI OTC Test' cross scope privileges
*** Script: [ChinouClient] model=anthropic-5-sonnet[Bedrock] status=200 mid=nomurabsmdev-win-2019-int1@amn010318
x_nose_nexai_test: [ablation] Rebate  TDCCTrade Date 812.eml V4 ok(0) 5672ms
x_nose_nexai_test: 
=================================================================
ABLATION - why do the PDF-only mails return nothing?   x_nose_nexai_test
=================================================================

work driver : OTC Settlement : Prematching
field spec  : 13 fields, 18129 chars   <- V1 and V4 both send this
model       : anthropic-5-sonnet[Bedrock]   max_tokens 8192

RESULTS    V1 full-doc | V2 mini-doc | V3 transcribe | V4 two-pass (full spec over transcript)

   mail                                    kind     V1           V2           V3                  V4
   ----                                    ----     --           --           --                  --
   OTC Derivative Confirmation SDBB4QN333  FAIL     empty_response(0)empty_200(0) empty_200(0c 0/2)   skipped(0)
   Rebate  TDCCTrade Date 812.eml          CONTROL  ok(0)        empty_200(0) ok(299c 0/0)        ok(0)

   timings ms: 
      OTC Derivative Confirmation SDBB4QN333  V1 29769  V2 9716   V3 30797  V4 0
      Rebate  TDCCTrade Date 812.eml          V1 5177   V2 5703   V3 4449   V4 5672

VERDICT
   OTC Derivative Confirmation SDBB4QN33349CD99QQ.0.0.0
      H-TRANSPORT  the document could not be read (empty_200, 30797ms). Two-pass cannot help this one.
      values NOT in the transcript: 576.75 4,258.00
      money-shaped tokens in transcript: 0   | an ISDA legal confirmation - no settlement table at all; zero rows may be CORRECT

   The transcript of each tested mail is attached to it as <pdf>.ablation-transcript.txt.
   Open one - it is the primary evidence for whatever the table above says.

NEXT: set START = 4 and run again.
=================================================================
