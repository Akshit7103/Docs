[0:01:43.171] Script completed in scope x_nose_nexai_test: script
Script execution history and recovery available here
Operation	Table	Row Count
insert	x_nose_nexai_test_llm_usage	2
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
Found keyId : 3c97ee901bf01110858f0ed8624bcb21 in store : com.glide.kmf.KMFDBModuleKeyStore@1ff3b656
Found wrapped key in repo. Attempting to unwrap.
Successfully unwrapped key: 3c97ee901bf01110858f0ed8624bcb21
*** Script: [ChinouClient] invokeDocument model=anthropic-5-sonnet[Bedrock] status=200 file=PaymentNotice_Nomura International PLC_Jul-30-2026_USD_.PDF mid=nomurabsmdev-win-2019-int1@amn010318 roundTripMs=708
x_nose_nexai_test: [ablation] Payment Notice Nomura International PLC Jul-30-2026 USD.eml V1 empty_response(0) 37436ms
*** Script: [ChinouClient] invokeDocument model=anthropic-5-sonnet[Bedrock] status=200 file=PaymentNotice_Nomura International PLC_Jul-30-2026_USD_.PDF mid=nomurabsmdev-win-2019-int1@amn010318 roundTripMs=131
x_nose_nexai_test: [ablation] Payment Notice Nomura International PLC Jul-30-2026 USD.eml V2 empty_200(0) 14783ms
*** Script: [ChinouClient] invokeDocument model=anthropic-5-sonnet[Bedrock] status=200 file=PaymentNotice_Nomura International PLC_Jul-30-2026_USD_.PDF mid=nomurabsmdev-win-2019-int1@amn010318 roundTripMs=114
x_nose_nexai_test: [ablation] Payment Notice Nomura International PLC Jul-30-2026 USD.eml V3 empty_200(0c, tokens 0/3) 15174ms
x_nose_nexai_test: [ablation] Payment Notice Nomura International PLC Jul-30-2026 USD.eml V4 skipped(0) 0ms
*** Script: [ChinouClient] invokeDocument model=anthropic-5-sonnet[Bedrock] status=200 file=XDOC02089328769469788160.pdf mid=nomurabsmdev-win-2019-int1@amn010318 roundTripMs=291
x_nose_nexai_test: [ablation] GS Settlement for Value Date 2026-08-19  GS Ref Num 215512496.eml V1 empty_response(0) 16994ms
*** Script: [ChinouClient] invokeDocument model=anthropic-5-sonnet[Bedrock] status=200 file=XDOC02089328769469788160.pdf mid=nomurabsmdev-win-2019-int1@amn010318 roundTripMs=114
x_nose_nexai_test: [ablation] GS Settlement for Value Date 2026-08-19  GS Ref Num 215512496.eml V2 empty_200(0) 6730ms
*** Script: [ChinouClient] invokeDocument model=anthropic-5-sonnet[Bedrock] status=200 file=XDOC02089328769469788160.pdf mid=nomurabsmdev-win-2019-int1@amn010318 roundTripMs=151
x_nose_nexai_test: [ablation] GS Settlement for Value Date 2026-08-19  GS Ref Num 215512496.eml V3 empty_200(0c, tokens 0/3) 11802ms
x_nose_nexai_test: [ablation] GS Settlement for Value Date 2026-08-19  GS Ref Num 215512496.eml V4 skipped(0) 0ms
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
   Payment Notice Nomura International PL  FAIL     empty_response(0)empty_200(0) empty_200(0c 0/3)   skipped(0)
   GS Settlement for Value Date 2026-08-1  FAIL     empty_response(0)empty_200(0) empty_200(0c 0/3)   skipped(0)

   timings ms: 
      Payment Notice Nomura International PL  V1 37436  V2 14783  V3 15174  V4 0
      GS Settlement for Value Date 2026-08-1  V1 16994  V2 6730   V3 11802  V4 0

VERDICT
   Payment Notice Nomura International PLC Jul-30-2026 
      H-TRANSPORT  the document could not be read (empty_200, 15174ms). Two-pass cannot help this one.
      values NOT in the transcript: 5,401.15 18,645.31 11,167.22
      money-shaped tokens in transcript: 0   | 3 sub-tables, each with its own Total; direction only in a footnote; bracketed negative
   GS Settlement for Value Date 2026-08-19  GS Ref Num 
      H-TRANSPORT  the document could not be read (empty_200, 11802ms). Two-pass cannot help this one.
      values NOT in the transcript: 2,661.00 (611.00) 19 Aug 2026
      money-shaped tokens in transcript: 0   | an INVOICE - rows are 0.00 and bracketed; the real amount is in a sentence

   The transcript of each tested mail is attached to it as <pdf>.ablation-transcript.txt.
   Open one - it is the primary evidence for whatever the table above says.

NEXT: set START = 2 and run again.
=================================================================
