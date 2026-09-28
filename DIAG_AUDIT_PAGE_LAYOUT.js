[0:00:00.075] Script completed in scope global: script
Script execution history and recovery available here
*** Script: 
=================================================================
AUDIT PAGE LAYOUT   nexaitest_nfotc_audit
=================================================================
page sys_id : 950ea95f133342cea12b968193eb2a72

CONTAINER  order=1      name="Audit"  e04cd8193dc14f5784f900031a48d2dd
   ROW      order=1      090355592688444c9f34f874e5f982ab
      COLUMN order=1      size=12
         WIDGET order=1      "OTC Audit Trail"  (nexaitest-audit)

CONTAINER  order=10     name="Audit Trail - Container 10"  0bde2eeeeb6747103aa5f8f7fcd0cdf2
   ROW      order=10     4fde2eeeeb6747103aa5f8f7fcd0cdf6
      COLUMN order=10     size=12
         WIDGET order=10     "NexAI Exceptions"  (nexai-exceptions)
         WIDGET order=20     "NexAI Mail Cashflows"  (nexaitest-mail-cashflows)

EXCEPTIONS WIDGET GATE
   server has data.topLevel : true
   server has data.bucket   : true
   template ng-if topLevel  : true
   gate line : data.topLevel = !$sp.getParameter("eml") && !$sp.getParameter("cf");

=================================================================
