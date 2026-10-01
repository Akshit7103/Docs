[0:01:45.294] Script completed in scope x_nose_nexai_test: script
Script execution history and recovery available here
*** Script: [ChinouClient] invokeDocument model=anthropic-5-sonnet[Bedrock] status=200 file=PaymentNotice_Nomura International PLC_Jul-30-2026_USD_.PDF mid=nomurabsmdev-win-2019-int1@amn010318 roundTripMs=711
x_nose_nexai_test: [repeat] Payment Notice Nomura International PLC Jul-30-2026 USD.eml attempt 1 EMPTY 0c 14350ms
*** Script: [ChinouClient] invokeDocument model=anthropic-5-sonnet[Bedrock] status=200 file=PaymentNotice_Nomura International PLC_Jul-30-2026_USD_.PDF mid=nomurabsmdev-win-2019-int1@amn010318 roundTripMs=138
x_nose_nexai_test: [repeat] Payment Notice Nomura International PLC Jul-30-2026 USD.eml attempt 2 EMPTY 0c 14791ms
*** Script: [ChinouClient] invokeDocument model=anthropic-5-sonnet[Bedrock] status=200 file=PaymentNotice_Nomura International PLC_Jul-30-2026_USD_.PDF mid=nomurabsmdev-win-2019-int1@amn010318 roundTripMs=107
x_nose_nexai_test: [repeat] Payment Notice Nomura International PLC Jul-30-2026 USD.eml attempt 3 EMPTY 0c 15810ms
*** Script: [ChinouClient] invokeDocument model=anthropic-5-sonnet[Bedrock] status=200 file=PaymentNotice_Nomura International PLC_Jul-30-2026_USD_.PDF mid=nomurabsmdev-win-2019-int1@amn010318 roundTripMs=129
x_nose_nexai_test: [repeat] Payment Notice Nomura International PLC Jul-30-2026 USD.eml attempt 4 EMPTY 0c 14826ms
*** Script: [ChinouClient] invokeDocument model=anthropic-5-sonnet[Bedrock] status=200 file=PaymentNotice_Nomura International PLC_Jul-30-2026_USD_.PDF mid=nomurabsmdev-win-2019-int1@amn010318 roundTripMs=110
x_nose_nexai_test: [repeat] Payment Notice Nomura International PLC Jul-30-2026 USD.eml attempt 5 EMPTY 0c 14770ms
*** Script: [ChinouClient] invokeDocument model=anthropic-5-sonnet[Bedrock] status=200 file=hsuanfeng.shih@fubon.com_20260817_173611.pdf mid=nomurabsmdev-win-2019-int1@amn010318 roundTripMs=137
x_nose_nexai_test: [repeat] Rebate  TDCCTrade Date 812.eml attempt 1 ok 616c 6757ms
*** Script: [ChinouClient] invokeDocument model=anthropic-5-sonnet[Bedrock] status=200 file=hsuanfeng.shih@fubon.com_20260817_173611.pdf mid=nomurabsmdev-win-2019-int1@amn010318 roundTripMs=120
x_nose_nexai_test: [repeat] Rebate  TDCCTrade Date 812.eml attempt 2 ok 400c 6770ms
*** Script: [ChinouClient] invokeDocument model=anthropic-5-sonnet[Bedrock] status=200 file=hsuanfeng.shih@fubon.com_20260817_173611.pdf mid=nomurabsmdev-win-2019-int1@amn010318 roundTripMs=110
x_nose_nexai_test: [repeat] Rebate  TDCCTrade Date 812.eml attempt 3 ok 385c 5139ms
*** Script: [ChinouClient] invokeDocument model=anthropic-5-sonnet[Bedrock] status=200 file=hsuanfeng.shih@fubon.com_20260817_173611.pdf mid=nomurabsmdev-win-2019-int1@amn010318 roundTripMs=23
x_nose_nexai_test: [repeat] Rebate  TDCCTrade Date 812.eml attempt 4 ok 207c 5726ms
*** Script: [ChinouClient] invokeDocument model=anthropic-5-sonnet[Bedrock] status=200 file=hsuanfeng.shih@fubon.com_20260817_173611.pdf mid=nomurabsmdev-win-2019-int1@amn010318 roundTripMs=111
x_nose_nexai_test: [repeat] Rebate  TDCCTrade Date 812.eml attempt 5 ok 409c 6152ms
x_nose_nexai_test: 
=================================================================
REPEAT TEST - document fault, or flaky endpoint?   N=5
=================================================================

model anthropic-5-sonnet[Bedrock]   max_tokens 8192

-----------------------------------------------------------------
SUSPECT  (never produced output)
Payment Notice Nomura International PLC Jul-30-2026 USD.eml
-----------------------------------------------------------------
   PaymentNotice_Nomura International PLC_Jul-30-2026_USD_.   ~16 KB

   attempt   result        chars    ms
   1 of 5    EMPTY         0        14350
   2 of 5    EMPTY         0        14791
   3 of 5    EMPTY         0        15810
   4 of 5    EMPTY         0        14826
   5 of 5    EMPTY         0        14770

   ok 0/5   empty 5/5

-----------------------------------------------------------------
BASELINE (has produced output)
Rebate  TDCCTrade Date 812.eml
-----------------------------------------------------------------
   hsuanfeng.shih@fubon.com_20260817_173611.pdf   ~38 KB

   attempt   result        chars    ms
   1 of 5    ok            616      6757
   2 of 5    ok            400      6770
   3 of 5    ok            385      5139
   4 of 5    ok            207      5726
   5 of 5    ok            409      6152

   ok 5/5   empty 0/5
   transcript length when it worked: 207 to 616 chars

=================================================================
VERDICT
   SUSPECT  (never produced output)    ok 0/5   empty 5/5
   BASELINE (has produced output)      ok 5/5   empty 0/5

   DETERMINISTIC AND DOCUMENT-SPECIFIC.
   The baseline never failed; the suspect never succeeded. This document defeats the
   document handler. Raise it with Chinou, attaching the file and these figures.
=================================================================
