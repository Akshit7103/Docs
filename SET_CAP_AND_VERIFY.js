[0:00:00.383] Script completed in scope x_nose_nexai_dev: script
Script execution history and recovery available here
Operation	Table	Row Count
insert	sys_update_version	1
update	x_nose_nexai_dev_config	1
insert	sys_metadata_customization	1
insert	sys_scope_privilege	1
insert	sys_update_xml	1
x_nose_nexai_dev: instance : nomurabsmdev
x_nose_nexai_dev: scope    : x_nose_nexai_dev
x_nose_nexai_dev: ------------------------------------------------------------------
x_nose_nexai_dev: 1. CONFIG - extract.chunk_cap on x_nose_nexai_dev_config
x_nose_nexai_dev:    changed from 4 to 2
x_nose_nexai_dev:    PASS  extract.chunk_cap = 2
x_nose_nexai_dev: ------------------------------------------------------------------
x_nose_nexai_dev: 2. SCRIPT INCLUDE - WizardExtractor
Security restricted: Execute operation on API 'ScopedGlideElement' from scope 'NexAI OTC Dev' was granted and added to 'NexAI OTC Dev' cross scope privileges
x_nose_nexai_dev:    copies of this name on the instance: 5
x_nose_nexai_dev:    length: 51311 chars
x_nose_nexai_dev:    PASS  size is the NEW version   >= 50000
x_nose_nexai_dev:    PASS  all 4 feature markers present
x_nose_nexai_dev:    PASS  no reference to another NexAI scope
x_nose_nexai_dev:    PASS  references this scope
x_nose_nexai_dev: ------------------------------------------------------------------
x_nose_nexai_dev: 3. SCRIPT INCLUDE - GenericFieldExtractor
x_nose_nexai_dev:    copies of this name on the instance: 5
x_nose_nexai_dev:    length: 21625 chars
x_nose_nexai_dev:    PASS  size is the NEW version   >= 21000
x_nose_nexai_dev:    PASS  all 3 feature markers present
x_nose_nexai_dev:    PASS  no reference to another NexAI scope
x_nose_nexai_dev:    PASS  references this scope
x_nose_nexai_dev: ------------------------------------------------------------------
x_nose_nexai_dev: 4. SCRIPT INCLUDE - XlsxCashflowExtractor
x_nose_nexai_dev:    copies of this name on the instance: 5
x_nose_nexai_dev:    length: 36170 chars
x_nose_nexai_dev:    PASS  size is the NEW version   >= 35000
x_nose_nexai_dev:    PASS  all 5 feature markers present
x_nose_nexai_dev:    PASS  no reference to another NexAI scope
x_nose_nexai_dev:    PASS  references this scope
x_nose_nexai_dev: ------------------------------------------------------------------
x_nose_nexai_dev: 5. SCRIPT INCLUDE - DemoExtractor
x_nose_nexai_dev:    copies of this name on the instance: 5
x_nose_nexai_dev:    length: 6619 chars
x_nose_nexai_dev:    PASS  size is the NEW version   >= 6400
x_nose_nexai_dev:    PASS  all 4 feature markers present
x_nose_nexai_dev:    PASS  no reference to another NexAI scope
x_nose_nexai_dev:    PASS  references this scope
x_nose_nexai_dev: ------------------------------------------------------------------
x_nose_nexai_dev: RESULT for x_nose_nexai_dev: 17 passed, 0 failed
x_nose_nexai_dev: x_nose_nexai_dev is complete: four Script Includes verified and chunk_cap = 2.
x_nose_nexai_dev: Repeat in the remaining scopes by changing only the Application picker.
