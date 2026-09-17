# NexAI OTC — KT Session 2: the ServiceNow platform walkthrough

**Speaker script · 45 minutes · audience: Nomura technical team (developers who will maintain the application)**
**Instance for the whole session: the evaluation instance** `https://nomuraevalinstancegenaipov.service-now.com` (every link below is the complete URL). The application shown is **NexAI OTC BSM**, scope `x_nose_nfotc_bsm`, portal `/nfotcbsm`: the same application, same scope and same artefact ids that were shipped to bsmdev by update set, so everything you show is exactly what they own.

Yesterday they saw the business flow end to end: onboarding wizard, new work driver, analyst assignment, board, case screen. Today's promise: **every one of those screens is a native platform artefact, and by the end of the session you know where each lives, how to read it, how to change it safely, and how to see it running.**

Format: **SAY** what to say, **SHOW** the link to open, **POINT AT** what to hover or click. Minute marks are cumulative. Where bsmdev differs from what is on screen, the script says so in one sentence, so nobody is surprised on their instance.

---

## 0 · Opening (0:00 – 0:02)

**SAY:** "Yesterday you watched NexAI OTC work. Today you get the keys. I will walk the platform top to bottom in the order a maintainer needs it: the application in Studio, the data, the server logic, the orchestration, the portal, the AI connection, security and configuration, the operational tooling, and the platform's AI layer where this goes next. Everything you see is a standard ServiceNow artefact inside one scoped application. There is no external build tool between you and the code. We are on the build instance today; the application on your bsmdev is the same one, moved by update set, so every id you see is the same there."

**SHOW:** the application record → `https://nomuraevalinstancegenaipov.service-now.com/sys_app.do?sys_id=eff39d2ab73de50d8051b95090f30712`

**POINT AT:** Name *NexAI OTC BSM*, Scope `x_nose_nfotc_bsm`, and the related lists at the bottom: Tables, Script Includes, Flows, Roles. "This one record owns everything we will open."

---

## 1 · ServiceNow Studio: the application and its files (0:02 – 0:06)

**SAY:** "Studio is the IDE. Open the application and the left tree is the complete inventory: no hidden files anywhere else."

**SHOW:** `https://nomuraevalinstancegenaipov.service-now.com/$studio.do?sysparm_transaction_scope=eff39d2ab73de50d8051b95090f30712`

**POINT AT (walk the tree top to bottom, one sentence each):**
- **Data Model → Tables (12):** email, cashflow, booking (PCM), counterparty (EVE), wizard, audit, config, llm_usage, mailbox_drop, zip_drop, capability, work_item.
- **Data Model → Business Rules (2):** cascade-delete cashflows when a mail is deleted; clear ownership stamps when a wizard is deleted.
- **Access Control → Roles (2) and ACLs.** "Two roles: analyst and manager. We come back to how authorisation really works in section 7."
- **Server Development → Script Includes (22).** "All business logic lives here. Section 3."
- **Process Automation → Flows, Subflows, Actions.** "Orchestration. Section 4."
- **Service Portal → Portal, Pages (15), Widgets (16).** "Every screen. Section 5."
- **System Properties, Application Menu, UI Pages.**

**SAY:** "Two habits from day one. First: before you change anything, select the application's update set, so the change is captured for promotion (section 8). Second: the naming convention. Tables and roles start with the scope prefix; portal pages start with `bsm_`; widgets with `nfotcbsm-`; Flow Actions are `OTC ·` for the settlement pipeline and `NFOTC ·` for the generic palette."

**POINT AT:** the application picker top-right of Studio: "This instance also carries other applications from the proof of concept. Always confirm you are in NexAI OTC BSM before editing; on bsmdev it is the only one."

---

## 2 · The data model (0:06 – 0:10)

**SAY:** "Twelve tables. Four carry the business: a mail, its cashflows, the PCM bookings we match against, and the EVE counterparty directory. The rest are configuration and evidence."

**SHOW:** all tables of the scope → `https://nomuraevalinstancegenaipov.service-now.com/sys_db_object_list.do?sysparm_query=sys_scope.scope%3Dx_nose_nfotc_bsm`

**SHOW:** the email table → `https://nomuraevalinstancegenaipov.service-now.com/x_nose_nfotc_bsm_email_list.do`

**POINT AT** one record: `mail_from / mail_subject / mail_body` (parsed from the .eml on the record), `counterparty_name` (derived from EVE, not extracted), `wiz_extracted / wiz_assigned` (which work driver owns it), `composed_state` (the board's in-flight marker). Scroll to the attachment: "The original .eml is the attachment; parsing never modifies it."

**SHOW:** the cashflow table → `https://nomuraevalinstancegenaipov.service-now.com/x_nose_nfotc_bsm_cashflow_list.do`

**POINT AT:** `ai_value_date / ai_amount / ai_currency / ai_direction` (the four mandatory economics, normalised), `ai_sources` ("verbatim provenance JSON, this is what lights up the highlights on the case screen"), `ai_confirmed` ("the analyst's gate"), `ai_match_status / ai_match_tier / ai_match_booking` ("the matcher's outcome, stored as the bank trade reference, never the booking sys_id, so reseeding PCM can never break a stored match").

**SHOW:** PCM bookings → `https://nomuraevalinstancegenaipov.service-now.com/x_nose_nfotc_bsm_booking_list.do` — "680 rows: 630 golden from the PCM extract plus 50 tier-example bookings. Direction is the bank's point of view."

**SHOW:** EVE counterparty directory → `https://nomuraevalinstancegenaipov.service-now.com/x_nose_nfotc_bsm_counterparty_list.do` — "51 sender addresses to organisation and legal entity. Add a row here and a new counterparty derives correctly with no code change."

**SHOW:** the dictionary → `https://nomuraevalinstancegenaipov.service-now.com/sys_dictionary_list.do?sysparm_query=name%3Dx_nose_nfotc_bsm_cashflow` — "Column types and lengths; the JSON columns are plain strings, deliberately, so a work driver with different fields never needs a schema change."

**SAY:** "Three evidence tables you will read in operations: `audit` is append-only, one row per system and human decision; `llm_usage` is one row per Chinou call with Chinou's own cost and latency; `config` holds the system-default tolerances that the wizard overrides per work driver."

---

## 3 · Server logic: Script Includes (0:10 – 0:17)

**SAY:** "Twenty-two Script Includes, ES5 JavaScript. If you remember five, remember these."

**SHOW:** the list → `https://nomuraevalinstancegenaipov.service-now.com/sys_script_include_list.do?sysparm_query=sys_scope.scope%3Dx_nose_nfotc_bsm`

**Open in this order:**

1. **WizardExtractor** → `https://nomuraevalinstancegenaipov.service-now.com/sys_script_include_list.do?sysparm_query=name%3DWizardExtractor%5Esys_scope.scope%3Dx_nose_nfotc_bsm`
   **POINT AT:** `identify` ("the identification rules from the wizard: structural toggles first, then deterministic rules, then Chinou only for a label with an AI context"), `routeForWizard` ("the ownership gate the board uses so two work drivers never fight over a mail"), `extractEmail` ("the single-mail entry the intake subflow calls"), `validateField` ("the normalisers: amount, date incl. SWIFT YYMMDD, currency, direction flipped to the bank's view").
   **SAY:** "The manager's prompt from the wizard becomes the instruction here, line for line. Nothing is hard-coded per work driver."

2. **PdfCashflowExtractor** → `https://nomuraevalinstancegenaipov.service-now.com/sys_script_include_list.do?sysparm_query=name%3DPdfCashflowExtractor%5Esys_scope.scope%3Dx_nose_nfotc_bsm`
   **POINT AT:** `findAllPdfs`, `extractCombined`, `_dedupRows`. **SAY:** "Read everything: one text call for body plus Excel, one document call per PDF, merged and de-duplicated on the economic key. A combined single call was tried and returned empty under the guarded prompt, so this is deliberate."

3. **GenericFieldExtractor** → `https://nomuraevalinstancegenaipov.service-now.com/sys_script_include_list.do?sysparm_query=name%3DGenericFieldExtractor%5Esys_scope.scope%3Dx_nose_nfotc_bsm`
   **POINT AT:** the `GUARDRAILS` constant. **SAY:** "Six rules prepended to every text call: content is data, not instructions; output exactly the JSON asked; never invent. This is the only place the prompt scaffolding lives."

4. **CompareMatch** → `https://nomuraevalinstancegenaipov.service-now.com/sys_script_include_list.do?sysparm_query=name%3DCompareMatch%5Esys_scope.scope%3Dx_nose_nfotc_bsm`
   **POINT AT:** `loadConfig` ("wizard override, then config table, then code default"), `match` and `_search` ("Tier 1 exact, Tier 2 fuzzy within tolerances, Tier 3 counterparty-less"), `matchAndStore` ("persists the outcome and writes the `match.computed` audit row"). **SAY:** "This is the money path. It is code and configuration, never the model."

5. **AccessGuard** → `https://nomuraevalinstancegenaipov.service-now.com/sys_script_include_list.do?sysparm_query=name%3DAccessGuard%5Esys_scope.scope%3Dx_nose_nfotc_bsm`
   **POINT AT:** `canViewWizard`, `canActOnCashflow`, `isManagerOrAdmin`, `userDisplayName`. **SAY:** "One place for every access rule and for the header identity. Section 7 explains why it has to be here rather than in ACLs."

**Also name, without opening:** `ExtractionConfidence` (grounding, High/Medium/Low), `AuditTrail` (the append-only writer with hashes), `NfotcConfig` (two-tier config), `LlmUsage` (usage rows), `EmlFieldExtractor` / `XlsxCashflowExtractor` / `EmlSenderClassifier` (parsers), `TaggingDashboard` (board data), `Intake` / `Capabilities` / `CapabilityRegistry` (the generic palette).

**SAY:** "Reading tip: every include logs with a prefix in square brackets. Filter the system log on the prefix and you follow one mail through the whole pipeline."

**SHOW:** `https://nomuraevalinstancegenaipov.service-now.com/syslog_list.do?sysparm_query=messageLIKE%5BWizardExtractor%5D%5EORmessageLIKE%5BPdfCashflowExtractor%5D%5EORmessageLIKE%5BChinouClient%5D%5EORDERBYDESCsys_created_on`

---

## 4 · Orchestration: Flow Designer and Workflow Studio (0:17 – 0:22)

**SAY:** "The Script Includes do the work; flows decide the order. Three flows matter."

**SHOW:** Ingest Dropped Email → `https://nomuraevalinstancegenaipov.service-now.com/$flow-designer.do?sysparm_nostack=true#/flow/df5ee4c48d3b4d2f8db3ea95980297fc`
**POINT AT:** the trigger on the attachment, the create-email step. **SAY:** "Arrival only: one email record per .eml, nothing classified yet. This is also where a live mailbox connector will plug in."

**SHOW:** OTC Settlement – Intake (Flow A) → `https://nomuraevalinstancegenaipov.service-now.com/$flow-designer.do?sysparm_nostack=true#/subflow/e895478094ac48b498073ffa81e962d1`
**POINT AT:** the four actions in a row: Ingest → Classify / Identify → Extract Counterparty → Extract Fields. **SAY:** "The board's Sync fires this once per mail in the background, so ten mails run in parallel. Each action is a thin wrapper over a Script Include: open one."

**SHOW:** the action OTC · Extract Fields → `https://nomuraevalinstancegenaipov.service-now.com/$flow-designer.do?sysparm_nostack=true#/action/3b94d9c953c44eb68f7dd94ac607ade0`
**POINT AT:** typed inputs and outputs, the script step calling the include. **SAY:** "Logic in the include, composition in the flow. That is the pattern for every new capability."

**SHOW:** OTC Match & Write-back (Flow B) → `https://nomuraevalinstancegenaipov.service-now.com/$flow-designer.do?sysparm_nostack=true#/flow/7ae1ef7b4ae846fc9cd1d29bb200037a`
**POINT AT:** the trigger condition `ai_confirmed = true and ai_match_computed empty`. **SAY:** "The analyst's confirm on the case screen is the trigger. CompareMatch.matchAndStore runs, the outcome and the audit row land."

**SHOW:** the generic palette → `https://nomuraevalinstancegenaipov.service-now.com/sys_hub_action_type_definition_list.do?sysparm_query=sys_scope.scope%3Dx_nose_nfotc_bsm%5EnameSTARTSWITHNFOTC`
**SAY:** "Thirteen generic actions over the Work Item envelope: Ingest, Classify, Extract, Transform & Enrich, Validate, Calculate & Process, Compare & Match, Report & Notify, Route & Distribute, Human-in-the-Loop, Create Work Item, Governance & Audit, Monitor & Control. The reference pipeline shows them chained; a second work driver was stood up from the same actions with configuration only."

**SHOW:** reference pipeline → `https://nomuraevalinstancegenaipov.service-now.com/$flow-designer.do?sysparm_nostack=true#/flow/5718c4aea25f45679ecc261735d26829`

**SHOW:** Workflow Studio → `https://nomuraevalinstancegenaipov.service-now.com/now/workflow-studio` — "The same flows in the newer editor; this is where a builder composes a new pipeline from the palette."

**SHOW:** executions → `https://nomuraevalinstancegenaipov.service-now.com/sys_flow_context_list.do?sysparm_query=ORDERBYDESCsys_created_on`
**SAY:** "When a mail is stuck, this is the first place: open the execution, see which step waited or failed, with the inputs and outputs of each step."

---

## 5 · The Service Portal: pages and widgets (0:22 – 0:27)

**SAY:** "Fifteen pages, sixteen widgets, one portal. Each widget is three files: a server script, a client controller and the HTML."

**SHOW:** the portal record → `https://nomuraevalinstancegenaipov.service-now.com/sp_portal_list.do?sysparm_query=url_suffix%3Dnfotcbsm` — "URL suffix `/nfotcbsm`, login page, theme."

**SHOW:** pages → `https://nomuraevalinstancegenaipov.service-now.com/sp_page_list.do?sysparm_query=sys_scope.scope%3Dx_nose_nfotc_bsm`
**POINT AT:** `bsm_work_drivers`, `bsm_nfotc_wiz_dash`, `bsm_ai_extraction`, `bsm_wizard_builder`, `bsm_llm_usage`. **SAY:** "Page id is the `id=` in the URL you saw yesterday."

**SHOW:** the widget editor on the case screen → `https://nomuraevalinstancegenaipov.service-now.com/sp_config?id=widget_editor&sys_id=7db9fe5f566b4c6f872989348c0ad81e`
**POINT AT (server script):** the AccessGuard call at the top; the `input.action` blocks (`confirm`, `select_candidate`, `resolve_matched`, `send_mo`); the `data.` assignments at the bottom. **SAY:** "Server script builds `data`, handles actions, enforces access. Client controller only sets `data.action` and calls the server. HTML binds to `c.data`. Never put a decision in the client."

**POINT AT (client controller):** the first line `function controller(`. **SAY:** "The form validates this field with a regular expression; a controller that does not start exactly like this will not save."

**SHOW:** the wizard builder widget → `https://nomuraevalinstancegenaipov.service-now.com/sp_config?id=widget_editor&sys_id=272098e98d38468bbf58b5aaf351b1a3`
**POINT AT (server):** `_normaliseFields`. **SAY:** "The mandatory fields are enforced on save and on load, so a record written by an older builder heals itself the first time it is opened."

**SHOW:** the login widget → `https://nomuraevalinstancegenaipov.service-now.com/sp_config?id=widget_editor&sys_id=6ed69f3714d54b4295d4d2306ad5c908`
**POINT AT (server):** the `sso_idp` property read and `data.ssoUrl` built as `/nav_to.do?uri=…`. **SAY:** "One widget, two modes. Here there is no Identity Provider, so it renders the local form. On bsmdev the `sso_idp` property points at your Identity Provider and the same widget renders only a Log in with SSO button. The deep link is the only carrier the platform honours through Multi-Provider SSO; that was found by testing on bsmdev, and it is documented."

**SAY:** "Hot-fix rule: you may paste directly into these three fields on bsmdev, we did it for the SSO login and the header identity. Select the update set first, so the change travels."

**SHOW (open in the portal, one click each):** `https://nomuraevalinstancegenaipov.service-now.com/nfotcbsm?id=bsm_work_drivers`, `https://nomuraevalinstancegenaipov.service-now.com/nfotcbsm?id=bsm_wizard_list`, `https://nomuraevalinstancegenaipov.service-now.com/nfotcbsm?id=bsm_llm_usage`, `https://nomuraevalinstancegenaipov.service-now.com/nfotcbsm?id=bsm_nfotc_audit`

---

## 6 · The AI connection: Chinou through the MID (0:27 – 0:32)

**SAY:** "One Global script include is the only code that talks to Chinou. Everything else calls it."

**SHOW:** `https://nomuraevalinstancegenaipov.service-now.com/sys_script_include.do?sys_id=3038318487f64f10fb15653f8bbb3553`
**POINT AT:** `invoke` and `invokeDocument`; the registration ID placed in `LLMRequest.parameters.reg_id`; the MID applied to the call. **SAY:** "Global, because the MID hop must apply in every execution context, including background flows. Here on the build instance the client uses a named REST Message; on bsmdev the same client builds the request inline from the GMET connection properties, because a Global script cannot resolve another scope's REST Message by name, and reusing GMET's connection means one Chinou configuration per instance. Same methods, same behaviour."

**SHOW:** the REST Message → `https://nomuraevalinstancegenaipov.service-now.com/sys_rest_message.do?sys_id=fec9362787e207d06da885d80cbb35b2`
**POINT AT:** the endpoint ending in `/invoke/`, the Basic auth profile, and on the invoke method the MID server pinned. **SAY:** "The three things that ever break: the path, the credential, the MID. On bsmdev those are three properties instead of this record."

**SHOW:** the Chinou properties → `https://nomuraevalinstancegenaipov.service-now.com/sys_properties_list.do?sysparm_query=nameSTARTSWITHchinou.`
**POINT AT:** `chinou.reg.id` (AIUC00337: the AI CoE registration ID, refused without it since 13 September), `chinou.model.id`. **SAY:** "Change the model here and every call changes; the switch script moves the document model with it. On bsmdev the default is Sonnet 4.5 with Sonnet 5 selectable."

**SHOW:** MID servers → `https://nomuraevalinstancegenaipov.service-now.com/ecc_agent_list.do` — "One MID here; int1 and int2 on bsmdev. The instance is in the cloud; Chinou is inside Nomura's network; every call crosses here."

**SHOW:** the ECC queue → `https://nomuraevalinstancegenaipov.service-now.com/ecc_queue_list.do?sysparm_query=ORDERBYDESCsys_created_on` — "One output and one input record per call. If a call takes more than thirty seconds the synchronous path gives up with 'No response for ECC message'; the mail is simply retried on the next Sync."

**SHOW:** outbound HTTP log → `https://nomuraevalinstancegenaipov.service-now.com/sys_outbound_http_log_list.do?sysparm_query=ORDERBYDESCsys_created_on` — "Status codes per call. The cheat sheet: 504 is Chinou down; 200 with an LLMError inside is the gateway refusing or a dead model; 401 or 403 is the credential; 404 is the endpoint path; 200 with an empty body is a model that returned nothing, which we treat as a failure and retry."

**SHOW:** the usage rows → `https://nomuraevalinstancegenaipov.service-now.com/x_nose_nfotc_bsm_llm_usage_list.do?sysparm_query=ORDERBYDESCsys_created_on`
**POINT AT:** `cost_usd`, `chinou_ms`, `roundtrip_ms`, `capability`, `email_id`, `cashflow_ids`. **SAY:** "Chinou's own numbers, attributed to the mail and the cashflows it produced. The AI Usage & Cost page aggregates them; cost per cashflow is a real number, not an estimate."

**SAY (one sentence on outage handling):** "A ping script proves a central outage in thirty seconds from any Chinou consumer; the escalation template is in the handover package."

---

## 7 · Security and configuration (0:32 – 0:36)

**SAY:** "Two roles, one authorisation model, and a rule you must remember: portal widgets bypass table ACLs."

**SHOW:** roles → `https://nomuraevalinstancegenaipov.service-now.com/sys_user_role_list.do?sysparm_query=nameSTARTSWITHx_nose_nfotc_bsm`
**SHOW:** who holds them → `https://nomuraevalinstancegenaipov.service-now.com/sys_user_has_role_list.do?sysparm_query=role.nameSTARTSWITHx_nose_nfotc_bsm`
**SHOW:** ACLs → `https://nomuraevalinstancegenaipov.service-now.com/sys_security_acl_list.do?sysparm_query=nameSTARTSWITHx_nose_nfotc_bsm`
**POINT AT:** the audit table ACLs: read only, no write, no delete, no admin override. **SAY:** "That is what append-only means on this platform."

**SAY:** "Widget server scripts run GlideRecord on the server, so an ACL never sees the request. Authorisation therefore lives in AccessGuard, called at the top of every widget server script: page gates for manager surfaces, row gates on the owning wizard, act gates for the assigned analyst. ACLs still protect lists, forms and REST."

**SHOW:** application properties → `https://nomuraevalinstancegenaipov.service-now.com/sys_properties_list.do?sysparm_query=nameSTARTSWITHx_nose_nfotc_bsm`
**POINT AT:** `demo_users` ("operator allow-list for the view-as toggle and the analyst picker; a demo aid, not access control"), `noise_domains`, `langsmith.*`. **SAY:** "Two more exist only on bsmdev, `sso_idp` and `sso_auto`, created in Global by the SSO script, so on your instance you edit them from Global."

**SHOW:** the config table → `https://nomuraevalinstancegenaipov.service-now.com/x_nose_nfotc_bsm_config_list.do`
**POINT AT:** `match.vd_tol_days`, `match.t2_amt_abs`, `match.name_fuzzy_pct`, `pdf.model`, `pdf.max_tokens`. **SAY:** "System defaults. The wizard's Compare & Match step writes per-work-driver overrides; NfotcConfig resolves override, then default, then code. Managers never come here."

**SHOW:** the wizard table → `https://nomuraevalinstancegenaipov.service-now.com/x_nose_nfotc_bsm_wizard_list.do`
**POINT AT:** `id_rules`, `input_fields`, `mapping`, `config_overrides`, `assigned_users`. **SAY:** "Everything a work driver is, in one row. Yesterday's wizard wrote this."

**SHOW:** business rules → `https://nomuraevalinstancegenaipov.service-now.com/sys_script_list.do?sysparm_query=sys_scope.scope%3Dx_nose_nfotc_bsm` — "Only two, both data-integrity: cascade-delete cashflows with their mail, clear ownership stamps when a wizard is deleted."

---

## 8 · Operations tooling (0:36 – 0:40)

**SAY:** "Four tools you will use every week."

**SHOW:** Scripts – Background → `https://nomuraevalinstancegenaipov.service-now.com/sys.scripts.do`
**SAY:** "Every administration script is run here, in the application scope unless the header says Global: the golden data seed (PCM and EVE), the PDF configuration script, the SSO configuration script, the user onboarding script, the health check and the four-path AI validation. All idempotent: run them twice and nothing doubles. Recommendation: store them as Fix Scripts in the application so they travel with it."

**SHOW:** System log filtered on the prefixes → `https://nomuraevalinstancegenaipov.service-now.com/syslog_list.do?sysparm_query=messageLIKE%5BChinouClient%5D%5EORmessageLIKE%5Bwizard-builder%5D%5EORmessageLIKE%5BLlmUsage%5D%5EORDERBYDESCsys_created_on`

**SHOW:** update sets of the application → `https://nomuraevalinstancegenaipov.service-now.com/sys_update_set_list.do?sysparm_query=application%3Deff39d2ab73de50d8051b95090f30712%5EORDERBYDESCsys_created_on`
**POINT AT:** the 11 September set *NexAI OTC BSM*, the one that went to bsmdev. **SAY:** "Release unit. On the source: Studio → Publish to Update Set → Export to XML. On the target: Retrieved Update Sets → Import → Preview → Commit. Two rules at Preview: skip `demo_users` and any widget hot-fixed on the target; accept everything else. Five commit errors are expected and harmless: four duplicate privileges, one widget XML quirk. Data rows never travel; the seed scripts do that. Rollback is Back Out on the update set."

**SHOW (in Studio, live):** Studio → Repository menu → *Publish to Update Set* — open the dialog, do not run it. "That is the whole export step."

**SHOW:** attachments on mails → `https://nomuraevalinstancegenaipov.service-now.com/sys_attachment_list.do?sysparm_query=table_name%3Dx_nose_nfotc_bsm_email%5EORDERBYDESCsys_created_on` — "Every .eml, and the PDFs the extractor materialised next to it."

**SHOW:** the audit page → `https://nomuraevalinstancegenaipov.service-now.com/nfotcbsm?id=bsm_nfotc_audit` — "Open any decision: model version, prompt hash, input hash, confidence. The FR-AUD governance triple on every AI decision."

**SAY (runbook in one breath):** "Mail stuck in running: clear `wiz_extracted` and `composed_*` on the mail, Sync again. Zero rows on a PDF-only mail: scanned PDF, no text layer. Header shows a department in brackets: AccessGuard helpers missing, re-apply the header package. SSO lands on the platform home: re-run the SSO script and confirm the login widget uses `/nav_to.do`."

---

## 9 · The platform's AI layer, and where it goes next (0:40 – 0:44)

**SAY:** "bsmdev runs direct Chinou with no Now Assist dependency, on purpose. The platform's own AI layer is where the roadmap goes, and it is all here on this instance."

**SHOW:** Now Assist Skill Kit → `https://nomuraevalinstancegenaipov.service-now.com/now/now-assist-skillkit`
**POINT AT:** the skills *Extract Field Generic* and *Extract Fields Generic Chinou*. **SAY:** "A skill is a prompt plus a model. Same extraction, packaged as a Now Assist skill instead of a script call. This is how the production-style build ran before we removed the dependency for bsmdev."

**SHOW:** the Chinou model config in the Generative AI Controller → `https://nomuraevalinstancegenaipov.service-now.com/sys_generative_ai_model_config.do?sys_id=b252548487f687d06da885d80cbb3502`
**SAY:** "Chinou registered as a selectable model, 'Chinou · Claude Sonnet 5'. Any skill can pick it. That is bring-your-own-model at platform level."

**SHOW:** Now Assist Admin → `https://nomuraevalinstancegenaipov.service-now.com/now/now-assist-admin` — "Where skills are activated, per application, and where an admin sees every AI feature on the estate."

**SHOW:** AI Agent Studio → `https://nomuraevalinstancegenaipov.service-now.com/now/agent-studio`
**SHOW:** the agents → `https://nomuraevalinstancegenaipov.service-now.com/sn_aia_agent_list.do?sysparm_query=sys_scope%3D5ef8c9f755f04bef9e78031de9c7fb9f`
**SHOW:** the orchestrator → `https://nomuraevalinstancegenaipov.service-now.com/sn_aia_usecase.do?sys_id=6ed174760f894a23a22b8e2d551b2a8f`
**SAY:** "Twelve agents with Nomura's post-trade catalogue names, one orchestrator, built in the Dev copy of this application. Every agent's tools are the same Script Includes you saw in section 3. Agents plan and explain; the matcher still decides. The Dev board has a 'Process with agents' button; the case screen shows the agent timeline and the approval gate. That is a session of its own: the design document is with you, and the run guide walks the first execution."

**SHOW (optional if time):** `https://nomuraevalinstancegenaipov.service-now.com/nfotcbsmdev?id=bmd_nfotc_wiz_dash&wiz=c05271f48317c750fe5233b8beaad362`

---

## 10 · Close (0:44 – 0:45)

**SAY:** "Three things to take away. One: it is one scoped application of native artefacts, and Studio shows all of it. Two: logic in Script Includes, order in flows, screens in widgets, decisions never in the client and never in the model. Three: the update set is the release unit and the seed scripts are the data. Next session we go deep on extraction and Chinou; bring a mail you would like to see traced end to end."

---

## Appendix A · Link index (in presentation order)

| # | Artefact | Link |
|---|---|---|
| 1 | Application record | `https://nomuraevalinstancegenaipov.service-now.com/sys_app.do?sys_id=eff39d2ab73de50d8051b95090f30712` |
| 2 | Studio | `https://nomuraevalinstancegenaipov.service-now.com/$studio.do?sysparm_transaction_scope=eff39d2ab73de50d8051b95090f30712` |
| 3 | Tables of the scope | `https://nomuraevalinstancegenaipov.service-now.com/sys_db_object_list.do?sysparm_query=sys_scope.scope%3Dx_nose_nfotc_bsm` |
| 4 | Email / cashflow / booking (PCM) / counterparty (EVE) | `https://nomuraevalinstancegenaipov.service-now.com/x_nose_nfotc_bsm_email_list.do` · `https://nomuraevalinstancegenaipov.service-now.com/x_nose_nfotc_bsm_cashflow_list.do` · `https://nomuraevalinstancegenaipov.service-now.com/x_nose_nfotc_bsm_booking_list.do` · `https://nomuraevalinstancegenaipov.service-now.com/x_nose_nfotc_bsm_counterparty_list.do` |
| 5 | Wizard / audit / config / llm_usage | `https://nomuraevalinstancegenaipov.service-now.com/x_nose_nfotc_bsm_wizard_list.do` · `https://nomuraevalinstancegenaipov.service-now.com/x_nose_nfotc_bsm_audit_list.do` · `https://nomuraevalinstancegenaipov.service-now.com/x_nose_nfotc_bsm_config_list.do` · `https://nomuraevalinstancegenaipov.service-now.com/x_nose_nfotc_bsm_llm_usage_list.do` |
| 6 | Dictionary of cashflow | `https://nomuraevalinstancegenaipov.service-now.com/sys_dictionary_list.do?sysparm_query=name%3Dx_nose_nfotc_bsm_cashflow` |
| 7 | Script Includes (scope) | `https://nomuraevalinstancegenaipov.service-now.com/sys_script_include_list.do?sysparm_query=sys_scope.scope%3Dx_nose_nfotc_bsm` |
| 8 | WizardExtractor · PdfCashflowExtractor · GenericFieldExtractor · CompareMatch · AccessGuard | link 7 with `%5Ename%3D<Name>` appended |
| 9 | Global ChinouClient | `https://nomuraevalinstancegenaipov.service-now.com/sys_script_include.do?sys_id=3038318487f64f10fb15653f8bbb3553` |
| 10 | REST Message "Chinou API" | `https://nomuraevalinstancegenaipov.service-now.com/sys_rest_message.do?sys_id=fec9362787e207d06da885d80cbb35b2` |
| 11 | Ingest Dropped Email (flow) | `https://nomuraevalinstancegenaipov.service-now.com/$flow-designer.do?sysparm_nostack=true#/flow/df5ee4c48d3b4d2f8db3ea95980297fc` |
| 12 | OTC Settlement – Intake (subflow, Flow A) | `https://nomuraevalinstancegenaipov.service-now.com/$flow-designer.do?sysparm_nostack=true#/subflow/e895478094ac48b498073ffa81e962d1` |
| 13 | OTC Match & Write-back (flow, Flow B) | `https://nomuraevalinstancegenaipov.service-now.com/$flow-designer.do?sysparm_nostack=true#/flow/7ae1ef7b4ae846fc9cd1d29bb200037a` |
| 14 | Action OTC · Extract Fields | `https://nomuraevalinstancegenaipov.service-now.com/$flow-designer.do?sysparm_nostack=true#/action/3b94d9c953c44eb68f7dd94ac607ade0` |
| 15 | Action OTC · Compare & Match | `https://nomuraevalinstancegenaipov.service-now.com/$flow-designer.do?sysparm_nostack=true#/action/5f8ca1ce82374e57a1a5bd4783baf502` |
| 16 | Generic palette (13 actions) | `https://nomuraevalinstancegenaipov.service-now.com/sys_hub_action_type_definition_list.do?sysparm_query=sys_scope.scope%3Dx_nose_nfotc_bsm%5EnameSTARTSWITHNFOTC` |
| 17 | Reference pipeline (flow) | `https://nomuraevalinstancegenaipov.service-now.com/$flow-designer.do?sysparm_nostack=true#/flow/5718c4aea25f45679ecc261735d26829` |
| 18 | Workflow Studio | `https://nomuraevalinstancegenaipov.service-now.com/now/workflow-studio` |
| 19 | Flow executions | `https://nomuraevalinstancegenaipov.service-now.com/sys_flow_context_list.do?sysparm_query=ORDERBYDESCsys_created_on` |
| 20 | Portal record / pages / widgets | `https://nomuraevalinstancegenaipov.service-now.com/sp_portal_list.do?sysparm_query=url_suffix%3Dnfotcbsm` · `https://nomuraevalinstancegenaipov.service-now.com/sp_page_list.do?sysparm_query=sys_scope.scope%3Dx_nose_nfotc_bsm` · `https://nomuraevalinstancegenaipov.service-now.com/sp_widget_list.do?sysparm_query=sys_scope.scope%3Dx_nose_nfotc_bsm` |
| 21 | Widget editor: case screen | `https://nomuraevalinstancegenaipov.service-now.com/sp_config?id=widget_editor&sys_id=7db9fe5f566b4c6f872989348c0ad81e` |
| 22 | Widget editor: wizard builder | `https://nomuraevalinstancegenaipov.service-now.com/sp_config?id=widget_editor&sys_id=272098e98d38468bbf58b5aaf351b1a3` |
| 23 | Widget editor: login (SSO-aware) | `https://nomuraevalinstancegenaipov.service-now.com/sp_config?id=widget_editor&sys_id=6ed69f3714d54b4295d4d2306ad5c908` |
| 24 | Widget editor: board | `https://nomuraevalinstancegenaipov.service-now.com/sp_config?id=widget_editor&sys_id=a457327eb58e49f7953f2e1837ce0eda` |
| 25 | Portal pages | `https://nomuraevalinstancegenaipov.service-now.com/nfotcbsm?id=bsm_work_drivers` · `https://nomuraevalinstancegenaipov.service-now.com/nfotcbsm?id=bsm_wizard_list` · `https://nomuraevalinstancegenaipov.service-now.com/nfotcbsm?id=bsm_llm_usage` · `https://nomuraevalinstancegenaipov.service-now.com/nfotcbsm?id=bsm_nfotc_audit` · `https://nomuraevalinstancegenaipov.service-now.com/nfotcbsm?id=bsm_manager_dashboard` |
| 26 | Chinou properties | `https://nomuraevalinstancegenaipov.service-now.com/sys_properties_list.do?sysparm_query=nameSTARTSWITHchinou.` |
| 27 | Application properties | `https://nomuraevalinstancegenaipov.service-now.com/sys_properties_list.do?sysparm_query=nameSTARTSWITHx_nose_nfotc_bsm` |
| 28 | MID servers / ECC queue / outbound HTTP log | `https://nomuraevalinstancegenaipov.service-now.com/ecc_agent_list.do` · `https://nomuraevalinstancegenaipov.service-now.com/ecc_queue_list.do?sysparm_query=ORDERBYDESCsys_created_on` · `https://nomuraevalinstancegenaipov.service-now.com/sys_outbound_http_log_list.do?sysparm_query=ORDERBYDESCsys_created_on` |
| 29 | Roles / role holders / ACLs | `https://nomuraevalinstancegenaipov.service-now.com/sys_user_role_list.do?sysparm_query=nameSTARTSWITHx_nose_nfotc_bsm` · `https://nomuraevalinstancegenaipov.service-now.com/sys_user_has_role_list.do?sysparm_query=role.nameSTARTSWITHx_nose_nfotc_bsm` · `https://nomuraevalinstancegenaipov.service-now.com/sys_security_acl_list.do?sysparm_query=nameSTARTSWITHx_nose_nfotc_bsm` |
| 30 | Business rules | `https://nomuraevalinstancegenaipov.service-now.com/sys_script_list.do?sysparm_query=sys_scope.scope%3Dx_nose_nfotc_bsm` |
| 31 | Scripts – Background | `https://nomuraevalinstancegenaipov.service-now.com/sys.scripts.do` |
| 32 | System log (prefix filter) | `https://nomuraevalinstancegenaipov.service-now.com/syslog_list.do?sysparm_query=messageLIKE%5BChinouClient%5D%5EORmessageLIKE%5BWizardExtractor%5D%5EORDERBYDESCsys_created_on` |
| 33 | Update sets of the application | `https://nomuraevalinstancegenaipov.service-now.com/sys_update_set_list.do?sysparm_query=application%3Deff39d2ab73de50d8051b95090f30712%5EORDERBYDESCsys_created_on` |
| 34 | Attachments on mails | `https://nomuraevalinstancegenaipov.service-now.com/sys_attachment_list.do?sysparm_query=table_name%3Dx_nose_nfotc_bsm_email%5EORDERBYDESCsys_created_on` |
| 35 | Now Assist Skill Kit | `https://nomuraevalinstancegenaipov.service-now.com/now/now-assist-skillkit` |
| 36 | Chinou model config (Generative AI Controller) | `https://nomuraevalinstancegenaipov.service-now.com/sys_generative_ai_model_config.do?sys_id=b252548487f687d06da885d80cbb3502` |
| 37 | Now Assist Admin | `https://nomuraevalinstancegenaipov.service-now.com/now/now-assist-admin` |
| 38 | AI Agent Studio | `https://nomuraevalinstancegenaipov.service-now.com/now/agent-studio` |
| 39 | The 12 agents (Dev application) | `https://nomuraevalinstancegenaipov.service-now.com/sn_aia_agent_list.do?sysparm_query=sys_scope%3D5ef8c9f755f04bef9e78031de9c7fb9f` |
| 40 | Settlement Allegation Orchestrator | `https://nomuraevalinstancegenaipov.service-now.com/sn_aia_usecase.do?sys_id=6ed174760f894a23a22b8e2d551b2a8f` |
| 41 | Dev board with "Process with agents" | `https://nomuraevalinstancegenaipov.service-now.com/nfotcbsmdev?id=bmd_nfotc_wiz_dash&wiz=c05271f48317c750fe5233b8beaad362` |

The flow, action, widget and page ids are identical on bsmdev, because the application moved there by update set; tell them so once, in section 0. If a Flow Designer deep link opens blank, open Flow Designer and search the name.

## Appendix B · Pre-session checklist (10 minutes before)

- [ ] Logged in on the evaluation instance as a user with admin and both application roles; the update set picker shows a NexAI OTC BSM set.
- [ ] Links 1, 2, 7, 12, 21, 26, 31, 33, 38 opened as pinned tabs in that order.
- [ ] One mail in the BSM application with cashflows and a match outcome, for the data-model and audit sections (any mail from yesterday's demo).
- [ ] The system log filter (32) returns rows; if empty, run one Sync on the board before the session.
- [ ] The ECC queue and outbound HTTP log (28) show today's Chinou calls; if not, run one Sync.
- [ ] Zoom level 110 percent on the widget editor so the room can read the code.
- [ ] Backup: if Flow Designer is slow, use the action list (16) and describe the flow from the TDD section 8.2.
- [ ] Say once, at the start, that the application on this instance is the same one as on bsmdev; then never switch instances.

## Appendix C · Questions you will get, and the honest answer

| Question | Answer |
|---|---|
| "Why is authorisation in scripts and not in ACLs?" | Portal widgets run server-side GlideRecord, so ACLs never see the call. AccessGuard is one rule set consumed everywhere; ACLs still protect lists, forms and REST. |
| "Why a Global script include for Chinou?" | The MID hop must apply in every execution context including background flows; a scoped connection cannot guarantee it, and a Global script cannot resolve a scoped REST Message by name. |
| "Why does the client look different on bsmdev?" | Same methods, different transport: here a named REST Message, on bsmdev an inline request built from the GMET connection properties. Behaviour is identical. |
| "Can we change the model?" | Yes, one property for text, one config row for documents; the switch script does both. Registration ID stays. |
| "Why did you not use Now Assist on bsmdev?" | No dependency on AI plugins, one hop fewer, prompts deploy with the app. Now Assist retains value for agents, surfaces and estate governance; that is the roadmap shown in section 9. |
| "What is not built?" | Live mailbox connector (EWS design ready), NEWS/PCM write-back spokes, scanned-PDF OCR, ATF suite, the agent-policies wizard step. All listed in the TDD section 20. |
| "How do we roll back?" | Back Out on the update set; widget fields also restorable from the package copies. |
| "How do we know what a run cost?" | The llm_usage table and the AI Usage & Cost page: Chinou's own cost and latency per call, attributed to the mail and cashflows. |
| "Where is the audit of a configuration change?" | Config edits through the wizard write config audit rows; the wizard table itself is not field-audited yet, a known gap. |
