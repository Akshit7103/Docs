[0:00:00.070] Script completed in scope global: script
Script execution history and recovery available here
*** Script: 
=================================================================
TaggingDashboard  d96ad80b25f246d3abf63fcaea97e777   41570 chars
=================================================================

--- _cashflows, verbatim (first 60 lines) ---
   1 | _cashflows: function (emailId) {
   2 |         var out = [];
   3 |         // The counterparty is derived from the sender via EVE and lives on the EMAIL, not the
   4 |         // cashflow. Read it once so every row carries the same authoritative value; the
   5 |         // cashflow's ai_counterparty column is no longer written and must not be shown.
   6 |         var cpty = '';
   7 |         var _em = new GlideRecord('x_nose_nexai_test_email');
   8 |         if (_em.get(emailId)) { cpty = '' + (_em.getValue('counterparty_name') || ''); }
   9 |         var cf = new GlideRecord('x_nose_nexai_test_cashflow');
  10 |         cf.addQuery('email', emailId);
  11 |         cf.orderBy('flow_index');
  12 |         cf.query();
  13 |         while (cf.next()) {
  14 |             out.push({
  15 |                 sys_id: cf.getUniqueValue(),
  16 |                 reference: cf.getValue('reference'), currency: cf.getValue('currency'),
  17 |                 amount: cf.getValue('amount'), direction: cf.getValue('direction'),
  18 |                 value_date: cf.getValue('value_date'), confirmed: cf.getValue('confirmed'),
  19 |                 analyst_outcome: cf.getValue('analyst_outcome'),
  20 |                 review_confirmed: cf.getValue('review_confirmed'), resolution: cf.getValue('resolution'),
  21 |                 ai_counterparty: cf.getValue('ai_counterparty'), ai_reference: cf.getValue('ai_reference'),
  22 |                 ai_currency: cf.getValue('ai_currency'), ai_amount: cf.getValue('ai_amount'),
  23 |                 ai_direction: cf.getValue('ai_direction'), ai_value_date: cf.getValue('ai_value_date'),
  24 |                 ai_confirmed: cf.getValue('ai_confirmed'), ai_analyst_outcome: cf.getValue('ai_analyst_outcome'),
  25 |                 ai_review_confirmed: cf.getValue('ai_review_confirmed'), ai_resolution: cf.getValue('ai_resolution')
  26 |             });
  27 |         }
  28 |         return out;
  29 |     },
  30 | 
  31 |     // The raw .eml attachment on an email record. PREFER *.eml / message-rfc822 — a mail that carried a
  32 |     // spreadsheet has BOTH the .eml AND an extracted Cashflows.xlsx on the record, and picking the xlsx
  33 |     // (which has no Date header) broke the email-date read (Time Elapsed + Pre/Post tag fell back to ingest).
  34 |     _attId: function (recId) {
  35 |         var a = new GlideRecord('sys_attachment');
  36 |         a.addQue

--- exact-match probes ---
   FOUND   "_cashflows: function (emailId) {"
   FOUND   "var cf = new GlideRecord('x_nose_nexai_test_cashflow');"
   FOUND   "cf.addQuery('email', emailId);"
   FOUND   "cf.orderBy('flow_index');"
   FOUND   "ai_resolution: cf.getValue('ai_resolution')"
   FOUND   "        }\n        return out;\n    },"
