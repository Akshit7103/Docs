[0:00:00.313] Script completed in scope global: script
Script execution history and recovery available here
Operation	Table	Row Count
update	sys_update_version	1
update	sys_update_xml	1
insert	sys_update_version	1
update	sp_widget	1
[CacheFlushLog] event=sp_widget, count=1, ms=0: Flushing catalog sp_widget
*** Script: 
=================================================================
FIX EXCEPTIONS AUDIT LINK   running in: rhino.global
=================================================================
application : NexAI OTC Test  f1621260954a4076abbfb2ac2e31bc56

PORTAL PAGES OWNED BY THIS APPLICATION
      nexaitest_ai_dashboard   "OTC AI Dashboard"
      nexaitest_ai_extraction   "OTC AI Extraction"
      nexaitest_analystdashboard   "OTC Dashboard"
      nexaitest_comparematch   "Compare & Match"
      nexaitest_llm_usage   "AI Usage & Cost"
      nexaitest_manager_dashboard   "Manager Dashboard"
      nexaitest_nfotc_analyst   "OTC Analyst Screen"
   -> nexaitest_nfotc_audit   "Audit Trail"
      nexaitest_nfotc_demo   "Email Extraction Demo"
      nexaitest_nfotc_home   "NexAI OTC Test"
      nexaitest_nfotc_login   "Sign in · NexAI OTC Test"
      nexaitest_nfotc_wiz_dash   "OTC Settlements"
      nexaitest_wizard_builder   "Wizard Builder"
      nexaitest_wizard_list   "Onboarding Wizards"
      nexaitest_work_drivers   "Work Drivers"
      nexai_exceptions   "Exceptions"

audit page resolved to : nexaitest_nfotc_audit

server script : audit-page resolver added
template      : link now hidden when no audit page exists

widget updated : a9a9ae2aeb6747103aa5f8f7fcd0cdcf

Reload the page (hard refresh) and click an Audit trail link:
   https://nomurabsmdev.service-now.com/nexai?id=nexai_exceptions
=================================================================
