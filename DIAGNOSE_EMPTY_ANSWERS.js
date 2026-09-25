[0:00:00.248] Script completed in scope x_nose_nexai_test: script
Script execution history and recovery available here
x_nose_nexai_test: Scope OK: x_nose_nexai_test
x_nose_nexai_test: ------------------------------------------------------------------
x_nose_nexai_test: 1. WHICH MODEL IS ANSWERING
x_nose_nexai_test:    chinou.model.id = anthropic-5-sonnet[Bedrock]
x_nose_nexai_test:    chinou.reg.id = AIUC00337
x_nose_nexai_test:    x_nose_gmet_app.chinou.model.id = (not set)
x_nose_nexai_test:    x_nose_nexai_test.chinou.model.id = (not set)
x_nose_nexai_test:    models actually used across 123 calls in the last 120 min:
x_nose_nexai_test:       123 x  anthropic-5-sonnet[Bedrock]
x_nose_nexai_test:    eval, for comparison, answers on anthropic-5-sonnet[Bedrock].
x_nose_nexai_test: ------------------------------------------------------------------
x_nose_nexai_test: 2. WHAT THE MODEL SENT BACK, FOR THE MAILS THAT PRODUCED NOTHING
x_nose_nexai_test:    mails with no rows: 15
x_nose_nexai_test: 
x_nose_nexai_test:    >>> NIP Arrangement Fees and swaps between NIP and NEF value 20260819
x_nose_nexai_test:        11:31:55  -  ok=true  prompt=19822ch  RESPONSE=2ch  chinou=2947.5810527801514ms  model=anthropic-5-sonnet[Bedrock]
x_nose_nexai_test:        11:34:29  -  ok=true  prompt=19822ch  RESPONSE=2ch  chinou=3346.679925918579ms  model=anthropic-5-sonnet[Bedrock]
x_nose_nexai_test:        11:41:56  -  ok=false  prompt=19822ch  RESPONSE=0ch  chinou=0ms  model=anthropic-5-sonnet[Bedrock]
x_nose_nexai_test:           error: HTTP 0: null
x_nose_nexai_test: 
x_nose_nexai_test:    >>> Settlement Confirmation - 21 Aug 2026 - 1885,1753,5913922,6842473,6598430 - 
x_nose_nexai_test:        11:32:12  -  ok=true  prompt=23923ch  RESPONSE=41ch  chinou=3493.680953979492ms  model=anthropic-5-sonnet[Bedrock]
x_nose_nexai_test:        11:35:22  -  ok=true  prompt=23923ch  RESPONSE=41ch  chinou=2849.3199348449707ms  model=anthropic-5-sonnet[Bedrock]
x_nose_nexai_test:        11:43:21  -  ok=true  prompt=23923ch  RESPONSE=77ch  chinou=3057.819128036499ms  model=anthropic-5-sonnet[Bedrock]
x_nose_nexai_test: 
x_nose_nexai_test:    >>> Deutsche Bank Derivative Settlements Pre-Confirmation VD - 13 May 2026 - 13 
x_nose_nexai_test:        11:29:32  -  ok=true  prompt=20976ch  RESPONSE=2ch  chinou=3090.3160572052ms  model=anthropic-5-sonnet[Bedrock]
x_nose_nexai_test:        11:33:47  -  ok=true  prompt=20976ch  RESPONSE=2ch  chinou=2663.73610496521ms  model=anthropic-5-sonnet[Bedrock]
x_nose_nexai_test:        11:40:33  -  ok=true  prompt=20976ch  RESPONSE=2ch  chinou=3252.1519660949707ms  model=anthropic-5-sonnet[Bedrock]
x_nose_nexai_test: 
x_nose_nexai_test:    >>> NFPS Payment Confirmation for value date 20260818(USD)
x_nose_nexai_test:        11:31:14  -  ok=true  prompt=19838ch  RESPONSE=2ch  chinou=2663.5079383850098ms  model=anthropic-5-sonnet[Bedrock]
x_nose_nexai_test:        11:34:35  -  ok=true  prompt=19838ch  RESPONSE=2ch  chinou=4115.206003189087ms  model=anthropic-5-sonnet[Bedrock]
x_nose_nexai_test:        11:41:11  -  ok=true  prompt=19838ch  RESPONSE=2ch  chinou=2783.3659648895264ms  model=anthropic-5-sonnet[Bedrock]
x_nose_nexai_test: 
x_nose_nexai_test:    >>> NGFP Payment Confirmation for value date 20260821
x_nose_nexai_test:        11:31:33  -  ok=true  prompt=19806ch  RESPONSE=2ch  chinou=3060.0831508636475ms  model=anthropic-5-sonnet[Bedrock]
x_nose_nexai_test:        11:34:06  -  ok=true  prompt=19806ch  RESPONSE=2ch  chinou=3189.182996749878ms  model=anthropic-5-sonnet[Bedrock]
x_nose_nexai_test:        11:41:27  -  ok=true  prompt=19806ch  RESPONSE=2ch  chinou=2712.1591567993164ms  model=anthropic-5-sonnet[Bedrock]
x_nose_nexai_test: 
x_nose_nexai_test:    >>> Deutsche Bank Derivative Settlements Pre-Confirmation VD - 18 August 2026 - 
x_nose_nexai_test:        11:29:08  -  ok=true  prompt=20982ch  RESPONSE=2ch  chinou=2665.9538745880127ms  model=anthropic-5-sonnet[Bedrock]
x_nose_nexai_test:        11:33:41  -  ok=true  prompt=20982ch  RESPONSE=2ch  chinou=3690.1888847351074ms  model=anthropic-5-sonnet[Bedrock]
x_nose_nexai_test:        11:40:33  -  ok=true  prompt=20982ch  RESPONSE=2ch  chinou=3065.372943878174ms  model=anthropic-5-sonnet[Bedrock]
x_nose_nexai_test: ------------------------------------------------------------------
x_nose_nexai_test: 3. RESPONSE SIZE ACROSS EVERYTHING IN THE WINDOW
x_nose_nexai_test:    empty (0) : 23
x_nose_nexai_test:    tiny (1-40) : 40
x_nose_nexai_test:    small (41-200) : 8
x_nose_nexai_test:    real (200+) : 52
x_nose_nexai_test: 
x_nose_nexai_test:    A large prompt answered with 0 or a handful of characters means the model replied
x_nose_nexai_test:    with nothing or an empty array - it was reached, it just did not extract. That is a
x_nose_nexai_test:    model or prompt problem, not a timeout and not a lost chunk.
