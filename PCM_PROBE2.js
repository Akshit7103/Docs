[0:00:21.722] Script completed in scope global: script
Script execution history and recovery available here
*** Script: instance : nomurabsmdev
*** Script: ------------------------------------------------------------------
*** Script: 0. PcmClient
*** Script:    copies: 1   scope: global   active: 1   access: public
*** Script:    PASS  lives in Global
*** Script:    PASS  Accessible from: All application scopes
*** Script:    endpoint  : http://int-intranetws.nomuranow.com/cts-otc/phoenix/dev/cashmanager-eu/api/ssgai/cashflows
*** Script:    credential: PCM svcnewsd
*** Script:    timeout   : 30000ms
*** Script: ------------------------------------------------------------------
*** Script: 1. CALLS
Found keyId : 47e021561b3bed50bd2942e7bd4bcb0e in store : com.glide.kmf.KMFDBModuleKeyStore@61827a51
Found wrapped key in repo. Attempting to unwrap.
Successfully unwrapped key: 47e021561b3bed50bd2942e7bd4bcb0e
Found keyId : 3c97ee901bf01110858f0ed8624bcb21 in store : com.glide.kmf.KMFDBModuleKeyStore@768d901e
Found wrapped key in repo. Attempting to unwrap.
Successfully unwrapped key: 3c97ee901bf01110858f0ed8624bcb21
*** Script:    A  baseline - repeat probe 1 exactly                         
*** Script:       {"CounterpartyName":"CP Name (8577922)","Currency":"GBP","Direction":"Receive","Amount":50000,"AmountTolerance":50000,"ValueDate":"2026-03-15","ValueDateTolerance":45}
*** Script:       -> status 200     691ms  rows 6
*** Script:    B  Direction = Pay - do Pay rows exist, and how are they signed
*** Script:       {"CounterpartyName":"CP Name (8577922)","Currency":"GBP","Direction":"Pay","Amount":50000,"AmountTolerance":50000,"ValueDate":"2026-03-15","ValueDateTolerance":45}
*** Script:       -> status 200      18ms  rows 1
*** Script: [PcmClient] nomurabsmdev-win-2019-int1@amn010318 gave status 400. Trying nomurabsmdev-win-2019-int2@amn010319
*** Script: [PcmClient] all 2 MID server(s) failed. Last: Method failed: (/cts-otc/phoenix/dev/cashmanager-eu/api/ssgai/cashflows) with code: 400: no thrown error
*** Script:    C  Direction omitted - does it return both sides             
*** Script:       {"CounterpartyName":"CP Name (8577922)","Currency":"GBP","Amount":50000,"AmountTolerance":50000,"ValueDate":"2026-03-15","ValueDateTolerance":45}
*** Script:       -> status 400     125ms  rows 0  error: Method failed: (/cts-otc/phoenix/dev/cashmanager-eu/api/ssgai/cashflows) with code: 400
*** Script:    D  one exact amount on one exact date - do the filters really filter
*** Script:       {"CounterpartyName":"CP Name (8577922)","Currency":"GBP","Direction":"Receive","Amount":38730.3,"AmountTolerance":0.01,"ValueDate":"2026-02-02","ValueDateTolerance":0}
*** Script:       -> status 200      19ms  rows 1
*** Script: [PcmClient] nomurabsmdev-win-2019-int1@amn010318 gave status 400. Trying nomurabsmdev-win-2019-int2@amn010319
*** Script: [PcmClient] all 2 MID server(s) failed. Last: Method failed: (/cts-otc/phoenix/dev/cashmanager-eu/api/ssgai/cashflows) with code: 400: no thrown error
*** Script:    E  the SAME row asked for as a NEGATIVE amount - signed or magnitude
*** Script:       {"CounterpartyName":"CP Name (8577922)","Currency":"GBP","Direction":"Receive","Amount":-38730.3,"AmountTolerance":0.01,"ValueDate":"2026-02-02","ValueDateTolerance":0}
*** Script:       -> status 400      17ms  rows 0  error: Method failed: (/cts-otc/phoenix/dev/cashmanager-eu/api/ssgai/cashflows) with code: 400
*** Script: [PcmClient] nomurabsmdev-win-2019-int1@amn010318 gave status 400. Trying nomurabsmdev-win-2019-int2@amn010319
*** Script: [PcmClient] all 2 MID server(s) failed. Last: Method failed: (/cts-otc/phoenix/dev/cashmanager-eu/api/ssgai/cashflows) with code: 400: no thrown error
*** Script:    F  CounterpartyName omitted - is it mandatory                
*** Script:       {"Currency":"GBP","Direction":"Receive","Amount":38730.3,"AmountTolerance":0.01,"ValueDate":"2026-02-02","ValueDateTolerance":0}
*** Script:       -> status 400      19ms  rows 0  error: Method failed: (/cts-otc/phoenix/dev/cashmanager-eu/api/ssgai/cashflows) with code: 400
*** Script: ------------------------------------------------------------------
*** Script: 2. ANSWERS
*** Script:    PASS  baseline reproduces probe 1   6 rows
*** Script:    slowest call: 691ms against the 30s ECC wall
*** Script:    PASS  comfortable margin on the ECC wall
*** Script: 
*** Script:    Q1  HOW PCM SIGNS A PAY
*** Script:       Pay rows: 1   negative: 0   positive: 1
*** Script:       sign already matches our convention on 0 of 1
*** Script:       -> PCM sends Pay as a POSITIVE number. Its amount is a magnitude and the
*** Script:          direction carries the sign separately. Our stored amount is signed.
*** Script:          Comparing raw to raw would put every Pay row out by a factor of two;
*** Script:          amount_signed already handles it, and nothing else should be compared.
*** Script: 
*** Script:    Q2  DOES THE AMOUNT TOLERANCE USE THE SIGNED VALUE OR THE MAGNITUDE
*** Script:    FAIL  one of the two calls failed   D:   E: Method failed: (/cts-otc/phoenix/dev/cashmanager-eu/api/ssgai/cashflows) with code: 400: no thrown error
*** Script: 
*** Script:    Q2b DO THE FILTERS ACTUALLY NARROW
*** Script:       wide query -> 6 rows, exact query -> 1 rows
*** Script:    PASS  the criteria genuinely filter server side
*** Script:    PASS  the exact query returned exactly the expected row   Cashflow Id 89684970
*** Script: 
*** Script:    Q3  IS CounterpartyName MANDATORY
*** Script:       omitting it gave status 400: Method failed: (/cts-otc/phoenix/dev/cashmanager-eu/api/ssgai/cashflows) with code: 400
*** Script:       -> it looks required. In dev the name is masked, so we could only ever query
*** Script:          for a counterparty whose mask we already know - which a real mail will not
*** Script:          give us. That is a blocker worth raising, not a detail.
*** Script: 
*** Script:    Q4  IS Direction OPTIONAL
*** Script:       failed: Method failed: (/cts-otc/phoenix/dev/cashmanager-eu/api/ssgai/cashflows) with code: 400
*** Script: ------------------------------------------------------------------
*** Script: 3. NORMALISATION - what the matcher will actually receive
*** Script:       pcm_id                89684970
*** Script:       counterparty          CP Name (8577922)
*** Script:       counterparty_masked   true
*** Script:       counterparty_ref      (empty)
*** Script:       nomura_entity         NFPS
*** Script:       currency              GBP
*** Script:       direction             Receive
*** Script:       amount_raw            38730.3
*** Script:       amount_signed         38730.3
*** Script:       sign_agrees           true
*** Script:       trade_date            2026-02-02
*** Script:       value_date            2026-02-02
*** Script:       case_number           1
*** Script:       nom_agent_bic         BARCGB22
*** Script:       nom_bene_bic          NFPSJPJT
*** Script:       cp_agent_bic          BARCGB22
*** Script:       cp_bene_bic           GSILGB2X
*** Script: 
*** Script:       counterparty_ref blank : 4 of 6
*** Script:       counterparty masked    : 6 of 6
*** Script:       -> Counterparty Reference cannot be the join key either. It was the obvious
*** Script:          fallback once the name turned out to be masked, and it is blank on 4 of 6.
*** Script: ------------------------------------------------------------------
*** Script: RESULT: 6 passed, 1 failed
*** Script: Nothing was written. No PCM record was modified - this API is retrieval only.
