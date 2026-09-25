[0:00:00.421] Script completed in scope x_nose_nexai_test: script
Script execution history and recovery available here
x_nose_nexai_test: Scope OK: x_nose_nexai_test
x_nose_nexai_test: ------------------------------------------------------------------
x_nose_nexai_test: 1. DID THE FOUR SCRIPT INCLUDES LAND IN THIS SCOPE
x_nose_nexai_test:    --- WizardExtractor ---
x_nose_nexai_test:        length: 51348 chars   (expected at least 50000)
x_nose_nexai_test:    PASS  size looks like the new version
x_nose_nexai_test:    PASS  all 4 markers present
x_nose_nexai_test:    PASS  no leftover x_nose_nfotc_bsm reference
x_nose_nexai_test:    PASS  references this scope
x_nose_nexai_test:    --- GenericFieldExtractor ---
x_nose_nexai_test:        length: 21627 chars   (expected at least 21000)
x_nose_nexai_test:    PASS  size looks like the new version
x_nose_nexai_test:    PASS  all 2 markers present
x_nose_nexai_test:    PASS  no leftover x_nose_nfotc_bsm reference
x_nose_nexai_test:    PASS  references this scope
x_nose_nexai_test:    --- XlsxCashflowExtractor ---
x_nose_nexai_test:        length: 36174 chars   (expected at least 35000)
x_nose_nexai_test:    PASS  size looks like the new version
x_nose_nexai_test:    PASS  all 5 markers present
x_nose_nexai_test:    PASS  no leftover x_nose_nfotc_bsm reference
x_nose_nexai_test:    PASS  references this scope
x_nose_nexai_test:    --- DemoExtractor ---
x_nose_nexai_test:        length: 6623 chars   (expected at least 6400)
x_nose_nexai_test:    PASS  size looks like the new version
x_nose_nexai_test:    PASS  all 4 markers present
x_nose_nexai_test:    PASS  no leftover x_nose_nfotc_bsm reference
x_nose_nexai_test:    PASS  references this scope
x_nose_nexai_test: ------------------------------------------------------------------
x_nose_nexai_test: 2. WHAT THE MODEL WAS SENT, FOR MAILS STILL PRODUCING NOTHING
x_nose_nexai_test:    extracted: 57    still pending: 15
x_nose_nexai_test:    cashflows in this scope: 203
x_nose_nexai_test: 
x_nose_nexai_test:    >>> NIP Arrangement Fees and swaps between NIP and NEF value 20260819
x_nose_nexai_test:        11:31:55  -  prompt=19822ch  response=2ch  ok=true
x_nose_nexai_test:        11:34:29  -  prompt=19822ch  response=2ch  ok=true
x_nose_nexai_test:        11:41:56  -  prompt=19822ch  response=0ch  ok=false
x_nose_nexai_test:        3 calls - chunking IS happening
x_nose_nexai_test: 
x_nose_nexai_test:    >>> Settlement Confirmation - 21 Aug 2026 - 1885,1753,5913922,6842473,6598430 
x_nose_nexai_test:        11:32:12  -  prompt=23923ch  response=41ch  ok=true
x_nose_nexai_test:        11:35:22  -  prompt=23923ch  response=41ch  ok=true
x_nose_nexai_test:        11:43:21  -  prompt=23923ch  response=77ch  ok=true
x_nose_nexai_test:        3 calls - chunking IS happening
x_nose_nexai_test: 
x_nose_nexai_test:    >>> Deutsche Bank Derivative Settlements Pre-Confirmation VD - 13 May 2026 - 1
x_nose_nexai_test:        11:29:32  -  prompt=20976ch  response=2ch  ok=true
x_nose_nexai_test:        11:33:47  -  prompt=20976ch  response=2ch  ok=true
x_nose_nexai_test:        11:40:33  -  prompt=20976ch  response=2ch  ok=true
x_nose_nexai_test:        3 calls - chunking IS happening
x_nose_nexai_test: 
x_nose_nexai_test:    >>> NFPS Payment Confirmation for value date 20260818(USD)
x_nose_nexai_test:        11:31:14  -  prompt=19838ch  response=2ch  ok=true
x_nose_nexai_test:        11:34:35  -  prompt=19838ch  response=2ch  ok=true
x_nose_nexai_test:        11:41:11  -  prompt=19838ch  response=2ch  ok=true
x_nose_nexai_test:        3 calls - chunking IS happening
x_nose_nexai_test: 
x_nose_nexai_test:    >>> NGFP Payment Confirmation for value date 20260821
x_nose_nexai_test:        11:31:33  -  prompt=19806ch  response=2ch  ok=true
x_nose_nexai_test:        11:34:06  -  prompt=19806ch  response=2ch  ok=true
x_nose_nexai_test:        11:41:27  -  prompt=19806ch  response=2ch  ok=true
x_nose_nexai_test:        3 calls - chunking IS happening
x_nose_nexai_test: 
x_nose_nexai_test:    >>> Deutsche Bank Derivative Settlements Pre-Confirmation VD - 18 August 2026 
x_nose_nexai_test:        11:29:08  -  prompt=20982ch  response=2ch  ok=true
x_nose_nexai_test:        11:33:41  -  prompt=20982ch  response=2ch  ok=true
x_nose_nexai_test:        11:40:33  -  prompt=20982ch  response=2ch  ok=true
x_nose_nexai_test:        3 calls - chunking IS happening
x_nose_nexai_test: ------------------------------------------------------------------
x_nose_nexai_test: VERDICT: 16 passed, 0 failed in section 1
x_nose_nexai_test:   Chunking is happening now. If rows are still missing it is an extraction-quality
x_nose_nexai_test:   question rather than the plumbing.
