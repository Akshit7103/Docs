[0:00:00.184] Script completed in scope global: script
Script execution history and recovery available here
*** Script: 
==================================================================
AUDIT TRAIL PROBE   running in scope: rhino.global
user: muralia   admin: true
==================================================================

A. AUDIT FLAG ON THE DICTIONARY COLLECTION ROW
   (the table-level row: element empty. This is what turns record auditing on.)
   x_nose_nfotc_bsm
      AUDITED (8): booking, capability, cashflow, config, counterparty, email, wizard, work_item
      not     (4): audit, llm_usage, mailbox_drop, zip_drop
   x_nose_nexai_dev
      AUDITED (8): booking, capability, cashflow, config, counterparty, email, wizard, work_item
      not     (4): audit, llm_usage, mailbox_drop, zip_drop
   x_nose_nexai_test
      AUDITED (8): booking, capability, cashflow, config, counterparty, email, wizard, work_item
      not     (4): audit, llm_usage, mailbox_drop, zip_drop
   x_nose_nexai_uat
      AUDITED (8): booking, capability, cashflow, config, counterparty, email, wizard, work_item
      not     (4): audit, llm_usage, mailbox_drop, zip_drop

B. WHAT THE NATIVE TRAIL HAS CAPTURED SINCE 2026-09-26 00:00:00
   (bounded: one tablename at a time, newest first, 40 rows max each)
   x_nose_nfotc_bsm_cashflow   1 row(s)
      fields : ai_currency(1)
      actors : muralia(1)
      reason field captured: no
        2026-09-26 13:35:46  ai_currency : "EUR" -> "USD"   by muralia
   x_nose_nexai_test_cashflow   40 row(s)
      fields : ai_match_confidence(6), ai_match_tier(6), ai_match_computed(6), ai_match_status(6), ai_candidate_count(5), ai_confirmed(5), ai_match_booking(2), ai_resolution(1), ai_review_confirmed(1), ai_analyst_outcome(1), ai_selected_booking(1)
      actors : system(31), khatrim(3), mohansat(1), makkaraa(5)
      reason field captured: no
        2026-09-28 15:10:14  ai_match_confidence : "" -> "0"   by system
        2026-09-28 15:10:14  ai_match_tier : "" -> "0"   by system
        2026-09-28 15:10:14  ai_match_computed : "" -> "true"   by system
        2026-09-28 15:10:14  ai_match_status : "" -> "no_match"   by system
   x_nose_nexai_test_email   40 row(s)
      fields : composed_state(40)
      actors : system(22), mohansat(9), makkaraa(9)
      reason field captured: no
        2026-09-28 10:13:43  composed_state : "running" -> "done"   by system
        2026-09-28 10:13:01  composed_state : "running" -> "done"   by system
        2026-09-28 10:13:01  composed_state : "running" -> "done"   by system
        2026-09-28 10:12:47  composed_state : "running" -> "done"   by system

C. THE "AUDIT HISTORY" UI ACTIONS - why only admins see them
   Audit History   table=x_nose_bts_breach_tracking_system
      active=1  list_banner=0  form_button=0
      ROLES     : (none - open to anyone who can see the form)
      CONDITION : (none)
   Audit History   table=x_nose_nexai_dev_booking
      active=1  list_banner=0  form_button=0
      ROLES     : (none - open to anyone who can see the form)
      CONDITION : (none)
   Audit History   table=x_nose_nexai_dev_capability
      active=1  list_banner=0  form_button=0
      ROLES     : (none - open to anyone who can see the form)
      CONDITION : (none)
   Audit History   table=x_nose_nexai_dev_cashflow
      active=1  list_banner=0  form_button=0
      ROLES     : (none - open to anyone who can see the form)
      CONDITION : (none)
   Audit History   table=x_nose_nexai_dev_config
      active=1  list_banner=0  form_button=0
      ROLES     : (none - open to anyone who can see the form)
      CONDITION : (none)
   Audit History   table=x_nose_nexai_dev_counterparty
      active=1  list_banner=0  form_button=0
      ROLES     : (none - open to anyone who can see the form)
      CONDITION : (none)
   Audit History   table=x_nose_nexai_dev_email
      active=1  list_banner=0  form_button=0
      ROLES     : (none - open to anyone who can see the form)
      CONDITION : (none)
   Audit History   table=x_nose_nexai_dev_wizard
      active=1  list_banner=0  form_button=0
      ROLES     : (none - open to anyone who can see the form)
      CONDITION : (none)
   Audit History   table=x_nose_nexai_dev_work_item
      active=1  list_banner=0  form_button=0
      ROLES     : (none - open to anyone who can see the form)
      CONDITION : (none)
   Audit History   table=x_nose_nexai_test_booking
      active=1  list_banner=0  form_button=0
      ROLES     : (none - open to anyone who can see the form)
      CONDITION : (none)
   Audit History   table=x_nose_nexai_test_capability
      active=1  list_banner=0  form_button=0
      ROLES     : (none - open to anyone who can see the form)
      CONDITION : (none)
   Audit History   table=x_nose_nexai_test_cashflow
      active=1  list_banner=0  form_button=0
      ROLES     : (none - open to anyone who can see the form)
      CONDITION : (none)
   Audit History   table=x_nose_nexai_test_config
      active=1  list_banner=0  form_button=0
      ROLES     : (none - open to anyone who can see the form)
      CONDITION : (none)
   Audit History   table=x_nose_nexai_test_counterparty
      active=1  list_banner=0  form_button=0
      ROLES     : (none - open to anyone who can see the form)
      CONDITION : (none)
   Audit History   table=x_nose_nexai_test_email
      active=1  list_banner=0  form_button=0
      ROLES     : (none - open to anyone who can see the form)
      CONDITION : (none)
   Audit History   table=x_nose_nexai_test_wizard
      active=1  list_banner=0  form_button=0
      ROLES     : (none - open to anyone who can see the form)
      CONDITION : (none)
   Audit History   table=x_nose_nexai_test_work_item
      active=1  list_banner=0  form_button=0
      ROLES     : (none - open to anyone who can see the form)
      CONDITION : (none)
   Audit History   table=x_nose_nexai_uat_booking
      active=1  list_banner=0  form_button=0
      ROLES     : (none - open to anyone who can see the form)
      CONDITION : (none)
   Audit History   table=x_nose_nexai_uat_capability
      active=1  list_banner=0  form_button=0
      ROLES     : (none - open to anyone who can see the form)
      CONDITION : (none)
   Audit History   table=x_nose_nexai_uat_cashflow
      active=1  list_banner=0  form_button=0
      ROLES     : (none - open to anyone who can see the form)
      CONDITION : (none)
   Audit History   table=x_nose_nexai_uat_config
      active=1  list_banner=0  form_button=0
      ROLES     : (none - open to anyone who can see the form)
      CONDITION : (none)
   Audit History   table=x_nose_nexai_uat_counterparty
      active=1  list_banner=0  form_button=0
      ROLES     : (none - open to anyone who can see the form)
      CONDITION : (none)
   Audit History   table=x_nose_nexai_uat_email
      active=1  list_banner=0  form_button=0
      ROLES     : (none - open to anyone who can see the form)
      CONDITION : (none)
   Audit History   table=x_nose_nexai_uat_wizard
      active=1  list_banner=0  form_button=0
      ROLES     : (none - open to anyone who can see the form)
      CONDITION : (none)
   Audit History   table=x_nose_nexai_uat_work_item
      active=1  list_banner=0  form_button=0
      ROLES     : (none - open to anyone who can see the form)
      CONDITION : (none)
   Audit History   table=x_nose_nfotc_bsm_booking
      active=1  list_banner=0  form_button=0
      ROLES     : (none - open to anyone who can see the form)
      CONDITION : (none)
   Audit History   table=x_nose_nfotc_bsm_capability
      active=1  list_banner=0  form_button=0
      ROLES     : (none - open to anyone who can see the form)
      CONDITION : (none)
   Audit History   table=x_nose_nfotc_bsm_cashflow
      active=1  list_banner=0  form_button=0
      ROLES     : (none - open to anyone who can see the form)
      CONDITION : (none)
   Audit History   table=x_nose_nfotc_bsm_config
      active=1  list_banner=0  form_button=0
      ROLES     : (none - open to anyone who can see the form)
      CONDITION : (none)
   Audit History   table=x_nose_nfotc_bsm_counterparty
      active=1  list_banner=0  form_button=0
      ROLES     : (none - open to anyone who can see the form)
      CONDITION : (none)
   Audit History   table=x_nose_nfotc_bsm_email
      active=1  list_banner=0  form_button=0
      ROLES     : (none - open to anyone who can see the form)
      CONDITION : (none)
   Audit History   table=x_nose_nfotc_bsm_wizard
      active=1  list_banner=0  form_button=0
      ROLES     : (none - open to anyone who can see the form)
      CONDITION : (none)
   Audit History   table=x_nose_nfotc_bsm_work_item
      active=1  list_banner=0  form_button=0
      ROLES     : (none - open to anyone who can see the form)
      CONDITION : (none)

D. WHO CAN READ sys_audit TODAY
   sys_audit_role.*  active=0  admin_overrides=1
      roles     : admin
      condition : (none)
      script    : (none)
   sys_audit_role  active=1  admin_overrides=1
      roles     : admin, Compliance Admin
      condition : (none)
      script    : (none)
   sys_audit  active=1  admin_overrides=0
      roles     : (none)
      condition : (none)
      script    : (none)
   sys_audit  active=1  admin_overrides=1
      roles     : nom_support_readonly
      condition : (none)
      script    : (none)
   sys_audit_role.*  active=0  admin_overrides=1
      roles     : Compliance Admin
      condition : (none)
      script    : (none)
   sys_audit_role.*  active=1  admin_overrides=1
      roles     : Compliance Admin, admin
      condition : (none)
      script    : (none)
   sys_audit_relation  active=1  admin_overrides=0
      roles     : (none)
      condition : (none)
      script    : (none)
   sys_audit_delete  active=1  admin_overrides=0
      roles     : (none)
      condition : (none)
      script    : (none)
   sys_audit  active=1  admin_overrides=0
      roles     : sn_hr_sp.esc_admin
      condition : (none)
      script    : answer = accessSysAudit(); function accessSysAudit() { var tableName = String(current.tablename); if (tableName == 'inte
   sys_audit_role  active=1  admin_overrides=0
      roles     : (none)
      condition : (none)
      script    : (none)
   sys_audit_retention  active=1  admin_overrides=1
      roles     : (none)
      condition : (none)
      script    : (none)
   sys_audit_identity  active=1  admin_overrides=0
      roles     : snc_internal
      condition : (none)
      script    : (none)
   sys_audit_cleaner_job_progress  active=1  admin_overrides=1
      roles     : admin
      condition : (none)
      script    : (none)
   sys_audit  active=1  admin_overrides=1
      roles     : admin
      condition : (none)
      script    : (none)
   sys_audit_identity  active=1  admin_overrides=0
      roles     : (none)
      condition : (none)
      script    : (none)
   sys_audit.*  active=1  admin_overrides=1
      roles     : nom_support_readonly
      condition : (none)
      script    : (none)

E. CAN THIS SCOPE READ sys_audit?  (decides the portal-widget approach)
   GlideRecord valid in this scope : true
   read test on x_nose_nfotc_bsm_booking : OK - returned a row

==================================================================
