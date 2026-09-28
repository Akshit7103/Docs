[0:00:00.679] Script completed in scope global: script
Script execution history and recovery available here
Operation	Table	Row Count
insert	sys_update_version	8
insert	sys_metadata_customization	6
insert	sys_update_xml	6
update	sp_widget	2
update	sys_update_version	2
...and another 6 affected table(s)
View full summary here
[CacheFlushLog] event=sp_widget, count=1, ms=0: Flushing catalog sp_widget
[CacheFlushLog] event=sp_row, count=1, ms=371: Flushing catalog sp_row
[CacheFlushLog] event=sp_column, count=1, ms=44: Flushing catalog sp_column
[CacheFlushLog] event=sp_instance, count=1, ms=51: Flushing catalog sp_instance
*** Script: 
=================================================================
WIRE AUDIT PAGE - THREE LEVELS   running in: rhino.global
=================================================================

1. WHAT WRITES "match.decided"
   business rule "Audit - match decided"  (script)
      L10: new x_nose_nexai_test.AuditTrail().log('match.decided', {
      L30: } catch (e) { gs.warn('[audit match.decided] ' + e); }

2. LABEL FOR match.decided
   ADDED  match.decided -> "Match Decision"

3. EXCEPTIONS WIDGET - render only when no record is selected
   gated on data.topLevel

4. CASHFLOW LIST WIDGET (mail level -> drill into one cashflow)
   CREATED nexaitest-mail-cashflows  8fde2eeeeb6747103aa5f8f7fcd0cded

5. PAGE LAYOUT
   container=0bde2eeeeb6747103aa5f8f7fcd0cdf2  row=4fde2eeeeb6747103aa5f8f7fcd0cdf6  column=07de2eeeeb6747103aa5f8f7fcd0cdfb
   exceptions instance=cbde2eeeeb6747103aa5f8f7fcd0cdff
   cashflows  instance=c7de6eeeeb6747103aa5f8f7fcd0cd04

DONE. One page, three states:
   https://nomurabsmdev.service-now.com/nexai?id=nexaitest_nfotc_audit
      -> Exceptions: which mails need attention
   ...&eml=<mail sys_id>   -> that mail's cashflows, then its events below
   ...&cf=<cashflow sys_id> -> that cashflow's events

The standalone page ?id=nexai_exceptions still works and is now a duplicate.
Say the word and it can be removed.
=================================================================
