# Now Assist for NexAI OTC: the platform narrative

**Speaker:** Akshit Mahajan  ·  **Instance for the demo:** `https://nomuraevalinstancegenaipov.service-now.com`  ·  **Length:** 25 minutes talk + 10 minutes questions

> Positioning in one line: *the NexAI engine already works; Now Assist is how Nomura builds, governs, surfaces and orchestrates AI across the whole ServiceNow estate, and NexAI becomes the first workload on it.*

Every segment below has a **SAY** block (your talk track), a **SHOW** block (the exact screen, with the link), and a **POINT AT** line (what to move the cursor to). Open all tabs before the meeting in the order of Appendix C.

---

## 0. Opening (2 min)

**SAY**
"Six weeks ago we set out to prove that AI can read a settlement email, extract the cashflows, match them to the bank booking, and hand an analyst a decision. That works today. The question for this meeting is different: how do we build AI at Nomura from now on, not just for OTC settlements but for every process that lands in ServiceNow. Now Assist is ServiceNow's answer to that, and I want to show you what it is, what we have already built on it, and where it takes us next."

**SHOW** Work Drivers landing page as the anchor: `https://nomuraevalinstancegenaipov.service-now.com/nfotc?id=work_drivers`

**POINT AT** the OTC Settlements work-driver card. "Everything you will see today is behind this card."

---

## 1. What Now Assist is (4 min)

**SAY**
"Now Assist is not one feature. It is five parts that work together.

First, the **Generative AI Controller**, the model gateway. Every provider is registered here, including bring-your-own models. Nomura's Chinou is registered as a first-class model, which means every Now Assist skill on this instance can run on Nomura's governed gateway.

Second, the **Skill Kit**, where a skill is authored: a prompt with typed inputs and outputs, tested in a UI, versioned and published. A skill is a reusable asset, not a script buried in code.

Third, the **surfaces**: the Now Assist panel in workspaces, buttons on forms, actions in Workflow Studio, Virtual Agent in Teams. A skill appears there without us writing a screen.

Fourth, the **AI Agent Studio**: agents with instructions, tools and triggers, an orchestrator that plans multi-step work, approval checkpoints, and a visible execution plan for every run.

Fifth, **Admin, Analytics and Guardian**: one console for who can use what, how often it runs, what it costs, and what the guardrails blocked."

**SHOW 1a** Now Assist Admin console: `https://nomuraevalinstancegenaipov.service-now.com/now/now-assist-admin`
**POINT AT** the skill list and the activation toggles. "This is where a skill is switched on for a persona. No deployment needed."

**SHOW 1b** Generative AI Controller, the model catalogue: `https://nomuraevalinstancegenaipov.service-now.com/sys_generative_ai_model_config_list.do`
**POINT AT** the row `anthropic-5-sonnet[Bedrock]` (this is Chinou, registered 15 Aug): `https://nomuraevalinstancegenaipov.service-now.com/sys_generative_ai_model_config.do?sys_id=b252548487f687d06da885d80cbb3502`
"Chinou sits in the same catalogue as every other model. Governance decides which one a skill uses, centrally, without code."

**SHOW 1c** (optional, if asked how) the Custom LLM provider mapping: `https://nomuraevalinstancegenaipov.service-now.com/sys_generative_ai_provider_mapping.do?sys_id=07ca9d94c3550210b0939bc8a840ddeb` and the request/response transformer that speaks Chinou's protocol: `https://nomuraevalinstancegenaipov.service-now.com/sys_generative_ai_custom_llm_transformer.do?sys_id=b924544887f687d06da885d80cbb35cf`

---

## 2. Skills: build once, use everywhere (5 min)

**SAY**
"A skill is the unit of reuse. We have four in production scope today.

**Extract Settlement Fields** reads an email and returns the thirteen-field structured view per cashflow.
**Extract Field Generic** is the interesting one: the field list and the prompt are inputs. One published skill serves any field a manager defines in the onboarding wizard. We did not author a skill per field, we authored one skill for all fields.
**Extract Fields Generic Chinou** is the same skill bound to Chinou.
**Enhance Field Prompt** rewrites a manager's rough prompt into a precise one.

The same skill is called from three places: the demo page, the wizard's Test button, and the intake flow. Change the prompt once, all three change. That is what 'build once, use everywhere' means in practice."

**SHOW 2a** Now Assist Skill Kit: `https://nomuraevalinstancegenaipov.service-now.com/now/now-assist-skillkit`
Open the skill **Extract Settlement Fields** (production scope record): `https://nomuraevalinstancegenaipov.service-now.com/sys_one_extend_capability.do?sys_id=30caf56cd8c54449a9f409f45ec53562`
**POINT AT** the prompt, the inputs, the output schema, the test tab. "Authored, tested and published here. No IDE."

**SHOW 2b** The generic skill: `https://nomuraevalinstancegenaipov.service-now.com/sys_one_extend_capability.do?sys_id=802eaeb8afcd47ea81743ba3350ef2a8`
**POINT AT** the `instruction` and `content` inputs. "The prompt is a parameter. This one skill scales to every work driver."

**SHOW 2c** The skill running, live. Email Extraction Demo: `https://nomuraevalinstancegenaipov.service-now.com/nfotc?id=nfotc_demo`
Upload one `.eml` from `Desktop\BENCH_MAILS` (use `EML-0036.eml`, three cashflows), click **Run AI extraction**.
**POINT AT** the unstructured text on the left becoming the structured cashflows on the right. "That is the Extract Settlement Fields skill, invoked from a page, through the controller, on Chinou."

**SHOW 2d** The same skill family behind a manager's configuration. Wizard Builder: `https://nomuraevalinstancegenaipov.service-now.com/nfotc?id=wizard_builder&edit=6e29fe1887facf10fb15653f8bbb356e`
Go to Input Configuration, Field Extraction. **POINT AT** a field's prompt, the **Test** button and the **Enhance prompt** button. "A manager wrote this prompt. The skill runs it. Enhance is itself a skill."

**Pre-check before the meeting:** in Now Assist Admin confirm **Extract Settlement Fields** and **Enhance Field Prompt** are Active for the production scope. Installs reset activation.

---

## 3. Workflow Studio: the capability palette (4 min)

**SAY**
"Skills do the reading. Workflow Studio does the orchestration, visibly. We decomposed the settlement pipeline into typed Flow Actions: Ingest, Classify and Identify, Extract Counterparty, Extract Fields, Compare and Match, Route and Write-back. Each has typed inputs and outputs, so they chain in the designer, and each is registered in a capability registry.

Beyond the six OTC actions there is a thirteen-capability generic palette: Ingest, Classify, Extract, Validate, Transform and Enrich, Compare and Match, Calculate and Process, Route and Distribute, Human-in-the-Loop, Create Work Item, Governance and Audit, Report and Notify, Monitor and Control. A new work driver is composed from these in the designer plus a wizard, not coded.

This matters for Now Assist for one reason: every Flow Action is also a tool an agent can call. The palette we built for humans is the toolbox for agents."

**SHOW 3a** Workflow Studio home: `https://nomuraevalinstancegenaipov.service-now.com/now/workflow-studio`

**SHOW 3b** The intake subflow in the designer: `https://nomuraevalinstancegenaipov.service-now.com/$flow-designer.do?sysparm_nostack=true#/flow/5e00e257664b46c8bc115a5a41d11b40`
**POINT AT** the four steps Ingest, Classify, Counterparty, Extract Fields and the final record update. "Visible, editable, testable by a process owner."

**SHOW 3c** The match and write-back flow: `https://nomuraevalinstancegenaipov.service-now.com/$flow-designer.do?sysparm_nostack=true#/flow/82c7132f892449a7914f716effd641dd`

**SHOW 3d** One palette action, so they see typed inputs and outputs. `OTC · Extract Fields`: `https://nomuraevalinstancegenaipov.service-now.com/$flow-designer.do?sysparm_nostack=true#/action/e796e0cbb5a542349f290cdf8fd9fe93`
The full palette list: `https://nomuraevalinstancegenaipov.service-now.com/sys_hub_action_type_definition_list.do?sysparm_query=sys_scope%3D91b2d0e14c0d40deb17a7c26b4091a2e%5EORDERBYname`
**POINT AT** the thirteen `NFOTC ·` actions. "This is the marketplace of capabilities. Any team can drag them into their own flow."

**SHOW 3e** (optional) Flow Designer Now Assist, text to flow: `https://nomuraevalinstancegenaipov.service-now.com/now/fd-now-assist`. "Describe the flow in a sentence, Now Assist drafts it."

---

## 4. Agents: where Now Assist goes beyond what we could build (5 min)

**SAY**
"Everything so far is deterministic: a fixed pipeline. The next step is an agent that is given a goal and decides the steps. Building that ourselves means writing a planner, tool schemas, memory, approvals and tracing. Agent Studio gives all of that.

There is already a settlement agentic workflow on this instance, built by the platform team as a proof of concept: the **Settlement Allegation Workflow Orchestrator**. It runs three agents in sequence: **Settlement Email Processor** extracts, **Settlement Quality Gate** assesses confidence, and **Settlement Trade Match Assessment Agent** retrieves the candidate trade and assesses the match. Each agent has tools, and two of those tools are Now Assist skills. That is skills becoming agent tools, exactly the reuse story.

We also proved we can author agents as code in our own scope: the **OTC Settlement Extraction Agent**, with a tool that calls our extraction. Agents can be version-controlled and deployed with the app.

Where this takes NexAI: an agent that works the alleged queue overnight, drafts the counterparty reply, escalates the ones outside tolerance, and asks an analyst to approve, with the plan visible for every case."

**SHOW 4a** AI Agent Studio home: `https://nomuraevalinstancegenaipov.service-now.com/now/agent-studio`
Find **Settlement Allegation Workflow Orchestrator** under agentic workflows. Record link: `https://nomuraevalinstancegenaipov.service-now.com/sn_aia_usecase.do?sys_id=bd640d0887d60710fb15653f8bbb35d4`
**POINT AT** the three agents in order and the trigger. "Goal in, sequence of agents, human checkpoint."

**SHOW 4b** One agent with its tools. **Settlement Email Processor**: `https://nomuraevalinstancegenaipov.service-now.com/sn_aia_agent.do?sys_id=f7ff3c4087d60710fb15653f8bbb3554`
**POINT AT** the instructions and the tool list. Then the tool that is a skill, **Extract Settlement Fields** (tool record): `https://nomuraevalinstancegenaipov.service-now.com/sn_aia_tool.do?sys_id=14d2c94487d60710fb15653f8bbb35b2`
"Same skill you saw in the Skill Kit, now a tool in an agent's hands."

**SHOW 4c** The other two agents if time allows: Quality Gate `https://nomuraevalinstancegenaipov.service-now.com/sn_aia_agent.do?sys_id=f9f2098487d60710fb15653f8bbb3558`, Trade Match `https://nomuraevalinstancegenaipov.service-now.com/sn_aia_agent.do?sys_id=3aa1cf6887960b106da885d80cbb3544` with its record tool **Get Phoenix Trade Record**: `https://nomuraevalinstancegenaipov.service-now.com/sn_aia_tool.do?sys_id=d73d47ac87d60b106da885d80cbb3561`

**SHOW 4d** Our own agent authored as code: `https://nomuraevalinstancegenaipov.service-now.com/sn_aia_agent.do?sys_id=c7f3a99911ad414b91668f3c2dde104a` and its tool `https://nomuraevalinstancegenaipov.service-now.com/sn_aia_tool.do?sys_id=e8744251267a413692767f61d043c3d3`
"Agents are software artefacts. They ship in the update set like everything else."

**Do not run the orchestrator live** unless you have tested it that morning. Show the design, not the execution.

---

## 5. Governance, analytics and guardrails (3 min)

**SAY**
"When risk or audit asks 'what AI runs inside ServiceNow, on which model, how often, and what did it refuse', the answer has to be one screen. That is what Now Assist Admin, the AI Control Tower and Guardian give.

Every skill invocation is logged centrally. Guardian sits in front of every call for prompt injection, toxicity and data privacy masking, in addition to Chinou's own guardrails. Activation is by role, so an analyst sees analyst skills and a manager sees manager skills.

And because NexAI already records Chinou's own cost and latency per call with attribution to the mail and the cashflow, we can show unit economics per work driver alongside the platform view."

**SHOW 5a** Now Assist Admin, usage and adoption dashboards: `https://nomuraevalinstancegenaipov.service-now.com/now/now-assist-admin`
**SHOW 5b** AI Control Tower: `https://nomuraevalinstancegenaipov.service-now.com/now/ai-control-tower`
**SHOW 5c** The central generative-AI log, every call recorded: `https://nomuraevalinstancegenaipov.service-now.com/sys_gen_ai_log_metadata_list.do?sysparm_query=ORDERBYDESCsys_created_on`
**SHOW 5d** Guardian providers in the controller (filter the provider list for Guardian): `https://nomuraevalinstancegenaipov.service-now.com/sys_generative_ai_provider_mapping_list.do?sysparm_query=nameLIKEGuardian`
**SHOW 5e** Our complementary view, AI Usage and Cost (manager page on the BSM build): `https://nomuraevalinstancegenaipov.service-now.com/nfotcbsm?id=bsm_llm_usage`
**POINT AT** cost per cashflow and latency p50 and p95. "Platform-level governance from Now Assist, unit economics from the app. Together they answer every question a CFO or a risk officer asks."

---

## 6. Surfaces: putting AI in front of hundreds of users without building screens (2 min)

**SAY**
"The last piece is reach. Today the analyst uses our portal. With Now Assist the same skills appear where people already are: the Now Assist panel inside the workspace for 'summarise this email' or 'explain why this alleged', a button on the cashflow form, and Virtual Agent in Teams so an analyst can ask 'what is pending for Counterparty 5' and get an answer from our tables. None of that needs a new page from us."

**SHOW 6a** Now Assist in Virtual Agent: `https://nomuraevalinstancegenaipov.service-now.com/now/now-assist-in-virtual-agent`
**SHOW 6b** Virtual Agent topics already on the instance (proof the channel exists): `https://nomuraevalinstancegenaipov.service-now.com/sys_cs_topic_list.do`
**SHOW 6c** Now Assist for documents, DocIntel: `https://nomuraevalinstancegenaipov.service-now.com/now/now-assist-docintel`. "Native document reading for the PDF confirmations, the next attachment type we want to cover natively."

---

## 7. Configurability and scalability, in one story (2 min)

**SAY**
"Let me tie configurability and scalability together with one example. Tomorrow a new business unit wants a work driver for a different confirmation type.

Configuration: a manager opens the onboarding wizard, defines the identification rules, the fields and their prompts, the mapping and the tolerances. The generic skill runs those prompts. No skill authoring, no code.

Orchestration: the process owner composes the pipeline in Workflow Studio from the palette. Same actions, different order or subset.

Reach: the same skills are activated for that unit's persona in Now Assist Admin, and appear in their workspace and in Teams.

Agents: an agent for that queue is composition, the palette actions are already its tools.

Governance: it shows up in the same dashboards, under the same guardrails, on the same model catalogue, on day one.

Build once at each layer, reuse at every layer above. That is what scaling on a platform means, as opposed to scaling by writing more integrations."

---

## 8. Close and ask (1 min)

**SAY**
"What we have: a working extraction and matching engine, four production skills on Chinou through the controller, a fifteen-action capability palette in Workflow Studio, an agentic proof of concept on this instance, and per-call unit economics.

What Now Assist adds on top: agents that orchestrate, surfaces that reach every analyst, and governance that answers audit in one screen.

The ask: agreement to position NexAI as the first workload on Nomura's Now Assist platform, and a decision on the agent layer's model governance so we can design the alleged-queue agent."

---

## Appendix A. Link cheat sheet

| What | Link |
|---|---|
| Work Drivers landing | `https://nomuraevalinstancegenaipov.service-now.com/nfotc?id=work_drivers` |
| Now Assist Admin | `https://nomuraevalinstancegenaipov.service-now.com/now/now-assist-admin` |
| Now Assist Skill Kit | `https://nomuraevalinstancegenaipov.service-now.com/now/now-assist-skillkit` |
| AI Agent Studio | `https://nomuraevalinstancegenaipov.service-now.com/now/agent-studio` |
| Workflow Studio | `https://nomuraevalinstancegenaipov.service-now.com/now/workflow-studio` |
| AI Control Tower | `https://nomuraevalinstancegenaipov.service-now.com/now/ai-control-tower` |
| Now Assist in Virtual Agent | `https://nomuraevalinstancegenaipov.service-now.com/now/now-assist-in-virtual-agent` |
| Now Assist DocIntel | `https://nomuraevalinstancegenaipov.service-now.com/now/now-assist-docintel` |
| Flow Designer Now Assist (text to flow) | `https://nomuraevalinstancegenaipov.service-now.com/now/fd-now-assist` |
| Model catalogue | `https://nomuraevalinstancegenaipov.service-now.com/sys_generative_ai_model_config_list.do` |
| Chinou model record | `https://nomuraevalinstancegenaipov.service-now.com/sys_generative_ai_model_config.do?sys_id=b252548487f687d06da885d80cbb3502` |
| Custom LLM provider mapping | `https://nomuraevalinstancegenaipov.service-now.com/sys_generative_ai_provider_mapping.do?sys_id=07ca9d94c3550210b0939bc8a840ddeb` |
| Chinou transformer | `https://nomuraevalinstancegenaipov.service-now.com/sys_generative_ai_custom_llm_transformer.do?sys_id=b924544887f687d06da885d80cbb35cf` |
| Skill: Extract Settlement Fields (prod) | `https://nomuraevalinstancegenaipov.service-now.com/sys_one_extend_capability.do?sys_id=30caf56cd8c54449a9f409f45ec53562` |
| Skill: Extract Field Generic (prod) | `https://nomuraevalinstancegenaipov.service-now.com/sys_one_extend_capability.do?sys_id=802eaeb8afcd47ea81743ba3350ef2a8` |
| Skill: Extract Fields Generic Chinou (prod) | `https://nomuraevalinstancegenaipov.service-now.com/sys_one_extend_capability.do?sys_id=1f8fe1e912fb48138799e9a1b8fd66ec` |
| Skill: Enhance Field Prompt (prod) | `https://nomuraevalinstancegenaipov.service-now.com/sys_one_extend_capability.do?sys_id=c5aa01bdd024474d86ea5c18c9ba6986` |
| Email Extraction Demo page | `https://nomuraevalinstancegenaipov.service-now.com/nfotc?id=nfotc_demo` |
| Wizard Builder (edit the live wizard) | `https://nomuraevalinstancegenaipov.service-now.com/nfotc?id=wizard_builder&edit=6e29fe1887facf10fb15653f8bbb356e` |
| Wizard list | `https://nomuraevalinstancegenaipov.service-now.com/nfotc?id=wizard_list` |
| OTC board | `https://nomuraevalinstancegenaipov.service-now.com/nfotc?id=nfotc_wiz_dash&wiz=6e29fe1887facf10fb15653f8bbb356e` |
| Flow: OTC Settlement - Intake (Subflow) | `https://nomuraevalinstancegenaipov.service-now.com/$flow-designer.do?sysparm_nostack=true#/flow/5e00e257664b46c8bc115a5a41d11b40` |
| Flow: OTC Match & Write-back | `https://nomuraevalinstancegenaipov.service-now.com/$flow-designer.do?sysparm_nostack=true#/flow/82c7132f892449a7914f716effd641dd` |
| Flow: NFOTC · OTC Settlements (pipeline) | `https://nomuraevalinstancegenaipov.service-now.com/$flow-designer.do?sysparm_nostack=true#/flow/fd5f00aa14764342ae49f041439b143a` |
| Action: OTC · Extract Fields | `https://nomuraevalinstancegenaipov.service-now.com/$flow-designer.do?sysparm_nostack=true#/action/e796e0cbb5a542349f290cdf8fd9fe93` |
| Action: OTC · Compare & Match | `https://nomuraevalinstancegenaipov.service-now.com/$flow-designer.do?sysparm_nostack=true#/action/6f3a2121ee0c40b689d9bff761a68f26` |
| All palette actions (list) | `https://nomuraevalinstancegenaipov.service-now.com/sys_hub_action_type_definition_list.do?sysparm_query=sys_scope%3D91b2d0e14c0d40deb17a7c26b4091a2e%5EORDERBYname` |
| Agentic workflow: Settlement Allegation Orchestrator | `https://nomuraevalinstancegenaipov.service-now.com/sn_aia_usecase.do?sys_id=bd640d0887d60710fb15653f8bbb35d4` |
| Agent: Settlement Email Processor | `https://nomuraevalinstancegenaipov.service-now.com/sn_aia_agent.do?sys_id=f7ff3c4087d60710fb15653f8bbb3554` |
| Agent: Settlement Quality Gate | `https://nomuraevalinstancegenaipov.service-now.com/sn_aia_agent.do?sys_id=f9f2098487d60710fb15653f8bbb3558` |
| Agent: Settlement Trade Match Assessment | `https://nomuraevalinstancegenaipov.service-now.com/sn_aia_agent.do?sys_id=3aa1cf6887960b106da885d80cbb3544` |
| Agent: OTC Settlement Extraction Agent (ours, as code) | `https://nomuraevalinstancegenaipov.service-now.com/sn_aia_agent.do?sys_id=c7f3a99911ad414b91668f3c2dde104a` |
| Tool: Extract Settlement Fields (skill as tool) | `https://nomuraevalinstancegenaipov.service-now.com/sn_aia_tool.do?sys_id=14d2c94487d60710fb15653f8bbb35b2` |
| Tool: Assess Settlement Extraction Confidence | `https://nomuraevalinstancegenaipov.service-now.com/sn_aia_tool.do?sys_id=3cc30dc487d60710fb15653f8bbb350b` |
| Tool: Get Phoenix Trade Record | `https://nomuraevalinstancegenaipov.service-now.com/sn_aia_tool.do?sys_id=d73d47ac87d60b106da885d80cbb3561` |
| Tool: Extract Settlement Cashflows (ours) | `https://nomuraevalinstancegenaipov.service-now.com/sn_aia_tool.do?sys_id=e8744251267a413692767f61d043c3d3` |
| Central gen-AI log | `https://nomuraevalinstancegenaipov.service-now.com/sys_gen_ai_log_metadata_list.do?sysparm_query=ORDERBYDESCsys_created_on` |
| Guardian providers | `https://nomuraevalinstancegenaipov.service-now.com/sys_generative_ai_provider_mapping_list.do?sysparm_query=nameLIKEGuardian` |
| AI Usage and Cost (our page, BSM build) | `https://nomuraevalinstancegenaipov.service-now.com/nfotcbsm?id=bsm_llm_usage` |
| Virtual Agent topics | `https://nomuraevalinstancegenaipov.service-now.com/sys_cs_topic_list.do` |

If a `/now/...` console link lands on a blank page, open it from the navigator by typing the console name instead. Deep links into Agent Studio and Skill Kit vary by release, so the record links above are the reliable fallback.

---

## Appendix B. Likely questions, and the honest answers

**"Does Now Assist change the model?"** No. Under Nomura governance every call reaches Chinou. Now Assist is the layer that builds, governs and surfaces; Chinou stays the model. The controller shows Chinou registered like any other provider.

**"Can the agents run on Chinou too?"** Skills can, and do. The Agent Studio orchestrator itself uses ServiceNow's integrated provider for its reasoning today; bring-your-own is not supported at that layer yet. That is a governance decision Nomura should take before we design the agent layer, and I would rather raise it now than discover it later.

**"Is it faster?"** Neither approach changes the time Chinou takes to answer, which dominates. Now Assist adds orchestration and governance, not latency reduction. Speed work is about concurrency and prompt size, and applies equally to both.

**"Why did you build a direct-Chinou version as well?"** For an environment without the Now Assist plugins we needed the engine to run standalone, and it proved the extraction logic is independent of the layer above. The two are complementary: the engine processes, Now Assist orchestrates and governs. Skills are thin wrappers over the same logic.

**"What about PDFs?"** Today PDFs go through Chinou's document protocol from the engine. The native path forward is Now Assist DocIntel, which is on this instance and is the next thing to evaluate.

**"What does it take to deploy a skill to another environment?"** The skill ships in the app; activation for a persona is done once in Now Assist Admin on the target environment. Add that to the release checklist.

**"How much of this is live in production today?"** The engine, the four skills on Chinou, the flows and the palette are live. The agentic workflow is a proof of concept on this instance. Virtual Agent, DocIntel and Control Tower are platform capabilities we have not yet wired to NexAI.

---

## Appendix C. Pre-meeting checklist

1. Log in to the eval instance as yourself, application scope set to **NexAI OTC** (production scope, `x_nose_nfotc`).
2. Open these tabs in order: Work Drivers, Now Assist Admin, model catalogue, Skill Kit, skill Extract Settlement Fields, skill Extract Field Generic, Email Extraction Demo, Wizard Builder, Workflow Studio, intake subflow, palette action list, Agent Studio, Settlement Allegation Orchestrator, Settlement Email Processor, skill-as-tool record, AI Control Tower, gen-AI log, AI Usage and Cost, Now Assist in Virtual Agent, DocIntel.
3. In Now Assist Admin confirm **Extract Settlement Fields** and **Enhance Field Prompt** are Active.
4. Run the Email Extraction Demo once with `Desktop\BENCH_MAILS\EML-0036.eml` so you know Chinou is up and the skill answers. If it does not, fall back to the OTC board, which already shows extracted rows.
5. Have `EML-0036.eml` on the Desktop for the live upload.
6. Do not click Run on the agentic orchestrator during the meeting unless tested the same morning.
7. Keep Appendix B open on a second screen.
