[0:00:00.190] Script completed in scope global: script
Script execution history and recovery available here
*** Script: sys_id        : a931ee35fba74b5000d2f59f5eefdc70
*** Script: name          : PCMClient
*** Script: api_name      : global.PCMClient
*** Script: scope         : global
*** Script: active        : 1
*** Script: access        : public
*** Script: client_callable: 0
*** Script: script length : 12804 chars   (the file is 12520)
*** Script: ------------------------------------------------------------------
*** Script: 1. IS IT THE RIGHT CONTENT
*** Script:    all 6 markers present
*** Script:    occurrences of Class.create : 1
*** Script:    non-ASCII characters : 0
*** Script: 
*** Script:    first 90 chars: /**
 \n  * PcmClient - retrieval of Phoenix cash-manager cashflows for Compare and Match.
 \n  *
*** Script:    last  90 chars: ry').indexOf('Beneficiary Name (') === 0)
 \n         };
 \n     },
 \n 
 \n     type: 'PcmClient'
 \n };
*** Script: ------------------------------------------------------------------
*** Script: 2. EVALUATE IT AND SEE THE REAL ERROR
*** Script:    the script body evaluates cleanly.
*** Script:    and instantiates: endpoint = http://int-intranetws.nomuranow.com/cts-otc/phoenix/dev/cashmanager-eu/api/ssgai/cashflows
*** Script: 
*** Script:    So the CODE is fine and the platform just has not picked it up yet.
*** Script:    Fix: open the record, add a space, save. That republishes it. If it still
*** Script:    fails, flush the cache with cache.do in the address bar.
