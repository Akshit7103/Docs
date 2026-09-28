[0:00:00.347] Script completed in scope global: script
Script execution history and recovery available here
Operation	Table	Row Count
update	sys_update_version	1
insert	sys_update_version	1
update	sp_widget	1
insert	sys_update_xml	1
[CacheFlushLog] event=sp_widget, count=1, ms=0: Flushing catalog sp_widget
*** Script: 
=================================================================
AUDIT COVERAGE + LABELS   running in: rhino.global
=================================================================

PART 1  EVENT COVERAGE  (what each event type can be filtered by)

   EVENT TYPE                ROWS   has email_id   has cashflow_id  shows at
   cashflow.extracted        431    431/431        431/431          mail + cashflow
   classification.decided    622    622/622        0/622            mail
   extraction.confirmed      146    146/146        146/146          mail + cashflow
   extraction.overridden     16     16/16          16/16            mail + cashflow
   match.computed            264    264/264        264/264          mail + cashflow
   match.confirmed           69     69/69          69/69            mail + cashflow
   match.decided             36     36/36          36/36            mail + cashflow
   match.no_match            32     32/32          32/32            mail + cashflow
   match.selected            47     47/47          47/47            mail + cashflow
   writeback                 41     41/41          41/41            mail + cashflow
   writeback.mo              8      8/8            8/8              mail + cashflow

   TOTAL EVENTS: 1712   distinct types: 11

PART 2  LABEL FIX
   widget "OTC Audit Trail" (nexaitest-audit) - label map in script
      ADDED: 'match.computed': 'Match Computed (automatic)', 'workflow.routed': 'Write-back Staged',
   widgets on the page: 1   patched: 1

=================================================================
