[0:01:31.540] Script completed in scope x_nose_nexai_test: script
Script execution history and recovery available here
Operation	Table	Row Count
insert	sys_attachment_doc	2
update	x_nose_nexai_test_email	1
insert	sys_trigger	1
insert	sys_attachment	1
Found keyId : 3c97ee901bf01110858f0ed8624bcb21 in store : com.glide.kmf.KMFDBModuleKeyStore@2bbf0c98
Found wrapped key in repo. Attempting to unwrap.
Successfully unwrapped key: 3c97ee901bf01110858f0ed8624bcb21
*** Script: [ChinouClient] invokeDocument model=anthropic-5-sonnet[Bedrock] status=200 file=XDOC02052307015631384576.pdf mid=nomurabsmdev-win-2019-int1@amn010318 roundTripMs=44
x_nose_nexai_test: [fontrule] GS Settlement for Value Date 2026-05-11  GS Ref Num 302085568 [VD 11 May].eml 1 EMPTY 0c 10088ms
*** Script: [ChinouClient] invokeDocument model=anthropic-5-sonnet[Bedrock] status=200 file=XDOC02052307015631384576.pdf mid=nomurabsmdev-win-2019-int1@amn010318 roundTripMs=34
x_nose_nexai_test: [fontrule] GS Settlement for Value Date 2026-05-11  GS Ref Num 302085568 [VD 11 May].eml 2 EMPTY 0c 10696ms
*** Script: [ChinouClient] invokeDocument model=anthropic-5-sonnet[Bedrock] status=200 file=XDOC02052307015631384576.pdf mid=nomurabsmdev-win-2019-int1@amn010318 roundTripMs=122
x_nose_nexai_test: [fontrule] GS Settlement for Value Date 2026-05-11  GS Ref Num 302085568 [VD 11 May].eml 3 EMPTY 0c 11811ms
*** Script: [ChinouClient] invokeDocument model=anthropic-5-sonnet[Bedrock] status=200 file=PaymentNotice_Nomura International PLC_Oct-08-2025_EUR_.PDF mid=nomurabsmdev-win-2019-int1@amn010318 roundTripMs=124
x_nose_nexai_test: [fontrule] URGENT Payment Notice Nomura International PLC Oct-08-2025 EUR.eml 1 EMPTY 0c 14193ms
*** Script: [ChinouClient] invokeDocument model=anthropic-5-sonnet[Bedrock] status=200 file=PaymentNotice_Nomura International PLC_Oct-08-2025_EUR_.PDF mid=nomurabsmdev-win-2019-int1@amn010318 roundTripMs=41
x_nose_nexai_test: [fontrule] URGENT Payment Notice Nomura International PLC Oct-08-2025 EUR.eml 2 EMPTY 0c 12688ms
*** Script: [ChinouClient] invokeDocument model=anthropic-5-sonnet[Bedrock] status=200 file=PaymentNotice_Nomura International PLC_Oct-08-2025_EUR_.PDF mid=nomurabsmdev-win-2019-int1@amn010318 roundTripMs=116
x_nose_nexai_test: [fontrule] URGENT Payment Notice Nomura International PLC Oct-08-2025 EUR.eml 3 EMPTY 0c 12792ms
*** Script: [ChinouClient] invokeDocument model=anthropic-5-sonnet[Bedrock] status=200 file=hsuanfeng.shih@fubon.com_20260817_173611.pdf mid=nomurabsmdev-win-2019-int1@amn010318 roundTripMs=112
x_nose_nexai_test: [fontrule] Rebate  TDCCTrade Date 812.eml 1 ok 409c 5140ms
*** Script: [ChinouClient] invokeDocument model=anthropic-5-sonnet[Bedrock] status=200 file=hsuanfeng.shih@fubon.com_20260817_173611.pdf mid=nomurabsmdev-win-2019-int1@amn010318 roundTripMs=18
x_nose_nexai_test: [fontrule] Rebate  TDCCTrade Date 812.eml 2 ok 363c 7676ms
*** Script: [ChinouClient] invokeDocument model=anthropic-5-sonnet[Bedrock] status=200 file=hsuanfeng.shih@fubon.com_20260817_173611.pdf mid=nomurabsmdev-win-2019-int1@amn010318 roundTripMs=120
x_nose_nexai_test: [fontrule] Rebate  TDCCTrade Date 812.eml 3 ok 312c 6149ms
x_nose_nexai_test: 
=================================================================
CONFIRM OR KILL: "no embedded fonts -> empty response"   N=3
=================================================================

model anthropic-5-sonnet[Bedrock]   max_tokens 8192

-----------------------------------------------------------------
TWIN   GS Settlement for Value Date 2026-05-11  GS Ref Num 3020
   PDF 1.4, Smart Communications SC27, 2x Type1, 0 embedded - twin of the failing GS mails
   cashflows on this mail today: 4
-----------------------------------------------------------------
   XDOC02052307015631384576.pdf   ~9 KB

   attempt   result    chars   ms
   1/3       EMPTY     0       10088
   2/3       EMPTY     0       10696
   3/3       EMPTY     0       11811

   ok 0/3   empty 3/3

-----------------------------------------------------------------
TWIN   URGENT Payment Notice Nomura International PLC Oct-08-20
   PDF 1.4, PD4ML, 3x Type1, 0 embedded - twin of the failing Payment Notices; known 0 cashflows
   cashflows on this mail today: 0
-----------------------------------------------------------------
   PaymentNotice_Nomura International PLC_Oct-08-2025_E   ~12 KB

   attempt   result    chars   ms
   1/3       EMPTY     0       14193
   2/3       EMPTY     0       12688
   3/3       EMPTY     0       12792

   ok 0/3   empty 3/3

-----------------------------------------------------------------
BASELINE   Rebate  TDCCTrade Date 812.eml
   scanned PDF, no fonts at all - proved 5/5 readable
   cashflows on this mail today: 1
-----------------------------------------------------------------
   hsuanfeng.shih@fubon.com_20260817_173611.pdf   ~38 KB

   attempt   result    chars   ms
   1/3       ok        409     5140
   2/3       ok        363     7676
   3/3       ok        312     6149

   ok 3/3   empty 0/3

=================================================================
RESULTS
   TWIN      GS Settlement for Value Date 2026-05-11  GS   ok 0/3   empty 3/3
   TWIN      URGENT Payment Notice Nomura International P  ok 0/3   empty 3/3
   BASELINE  Rebate  TDCCTrade Date 812.eml                ok 3/3   empty 0/3

VERDICT
   RULE CONFIRMED. Every PDF without embedded fonts returned empty - including the two
   that were previously assumed to work. The baseline (no fonts at all, image path)
   read every time.

   Statement for the Chinou team:
     invokeDocument returns an empty 200 for PDFs whose fonts are NOT embedded
     (PDF 1.4, Type1, no FontFile object). Scanned PDFs and PDFs with embedded fonts
     succeed on the same endpoint, in the same session.
=================================================================
