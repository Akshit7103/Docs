[0:00:00.960] Script completed in scope x_nose_nfotc_bsm: script
Script execution history and recovery available here
Operation	Table	Row Count
insert	x_nose_nfotc_bsm_booking	20
insert	x_nose_nfotc_bsm_audit	8
insert	sys_attachment_doc	8
insert	sys_attachment	4
insert	x_nose_nfotc_bsm_cashflow	4
...and another 9 affected table(s)
View full summary here
Security restricted: Execute operation on API 'GlideSysAttachment.write' from scope 'NexAI OTC BSM' was granted and added to 'NexAI OTC BSM' cross scope privileges
x_nose_nfotc_bsm: 
=================================================================
SEED TIER 2 / TIER 3 SHOWCASE   scope x_nose_nfotc_bsm
=================================================================

EFFECTIVE TOLERANCES
   amount        +/- 50   (raw currency units)
   value date    +/- 2   BUSINESS days
   name fuzzy    >= 0.85  (containment is checked first, so this rarely decides)

WORK DRIVER   "OTC Settlement : Prematching"   45e2f18b3b070310559a8ff764e45a25

CREATED   4 mails, 4 .eml attachments, 4 cashflows, 20 bookings, 4 directory entries

VERIFICATION  (running Compare & Match on each cashflow)

   mail        want  got   cands  status
   ----        ----  ---   -----  ------
   TIER2-01    2     2     5      mismatch
   TIER2-02    2     2     5      mismatch
   TIER3-01    3     3     5      mismatch
   TIER3-02    3     3     5      mismatch

   All four land on the intended tier with exactly 5 candidates.

=================================================================
WHERE TO SEE IT
   Board       /nexai?id=bsm_nfotc_wiz_dash&wiz=45e2f18b3b070310559a8ff764e45a25
               search "TIER" to isolate the four demo mails
   Case screen click any of the four rows, then section 2 Compare & Match

WHAT TO POINT AT IN THE DEMO
   TIER2-01  the mail says "JP Morgan"; the five bookings are JP Morgan Chase, JPMorgan Chase
             & Co., J.P. Morgan Securities plc, JPMorgan Chase Bank N.A. and JP Morgan AG.
             None is an exact name match, so Tier 1 cannot fire - Tier 2 catches all five on
             the fuzzy name rule. Amount deltas run 0.00 to 50.00 and dates -1 to +2 business
             days, so the tolerance window is visible in the candidate list.
   TIER3-01  the mail says "Standard Chartered" and no booking resembles it, so Tiers 1 and 2
             find nothing and Tier 3 drops the counterparty. All five candidates carry the
             identical amount and value date and differ only by name - which is exactly why
             the counterparty column is flagged red on every row and nothing auto-selects.

TO REMOVE: re-run with the seeding section commented out, or delete the four mails named
           TIER*.eml and the bookings whose Cashflow ID starts with "DEMO-TIER".
=================================================================
