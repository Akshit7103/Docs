[0:00:00.315] Script completed in scope x_nose_nexai_test: script
Script execution history and recovery available here
x_nose_nexai_test: 
==================================================================
EXCEPTIONS DIAGNOSTIC   scope: x_nose_nexai_test
table: x_nose_nexai_test_email
==================================================================

1. DISTRIBUTIONS
   classification      relevant=72   irrelevant=35
   composed_state      done=72   (empty)=35
   extraction_status   (empty)=105   partial=2
   review_status       awaiting_confirmation=107
   TOTAL MAILS         107

2. IS extraction_status EVER "extracted"?
   rows with extraction_status = "extracted" : NONE
   -> if NONE, the Analyst Screen filter "IN extracted,partial" matches only partial mails.

3. OWNERSHIP
   wiz_extracted set : 63
   composed_run  set : 72
   wiz_assigned  set : 0
   owned (any)       : 72
   OWNED BY NOTHING  : 35

4. EXCEPTION BUCKETS

   UNCLAIMED (relevant, no owner)0

   STUCK (composed_state running)0

   PARTIAL extraction        2
        USDBarclays EQ Cashflows for 26-JUNE-2026 SDS -10200531 10208641 (KAV).eml cls=relevant    state=done      extr=partial  
        SABACAP - NOMURA Upcoming Settlement Notice dtd 6162026 (JPY CCY).eml cls=relevant    state=done      extr=partial  

   DROPPED (irrelevant)      35
        URGENT REMINDER NOMURA  Sinopac HK - Equities settlement value 6-JUL (JK).eml cls=irrelevant  state=-         extr=-         reason=-
        RE URGENT RE GS Settlement for Value Date 2026-05-11  GS Ref Num 302085568 (CMDSGP-CX-641908).eml cls=irrelevant  state=-         extr=-         reason=-
        RE CGML - NOMURA - 9-Jun-2026 - 12-Jun-2026 - Upcoming Payment(s) Affirmation Request (11450).eml cls=irrelevant  state=-         extr=-         reason=-
        RE Payment Notice Nomura International PLC Jun-11-2026 USD(AT)1.eml cls=irrelevant  state=-         extr=-         reason=-
        RE OPT Premium vd 11 may 2026  (1).eml cls=irrelevant  state=-         extr=-         reason=-
        RE NOMURA vs GS  2 July 2026 (AJ) [VD 02 Jul].eml cls=irrelevant  state=-         extr=-         reason=-

   RELEVANT, ZERO CASHFLOWS  9   <- the silent case
        NDF-Netting as per 13.08.2026 between Nomura and IKEA Supply AG.eml state=done      extr=-         owner=no
        Payment Notice Nomura International PLC Jun-11-2026 USD.eml state=done      extr=-         owner=no
        OTC Derivative Confirmation SDBB4QN33349CD99QQ.1.0.0.1.eml state=done      extr=-         owner=no
        NDF-Netting as per 18.08.2026 between Nomura and IKEA Supply AG.eml state=done      extr=-         owner=no
        GS Settlement for Value Date 2026-08-19  GS Ref Num 215512496.eml state=done      extr=-         owner=no
        OTC Derivative Confirmation SDBB4QN33349CD99QQ.0.0.0.1.eml state=done      extr=-         owner=no
        GS Settlement for Value Date 2026-08-19  GS Ref Num 215514797.eml state=done      extr=-         owner=no
        Payment Notice Nomura International PLC Jun-11-2026 USD1.eml state=done      extr=-         owner=no
        Payment Notice Nomura International PLC Jul-30-2026 USD.eml state=done      extr=-         owner=no

==================================================================
