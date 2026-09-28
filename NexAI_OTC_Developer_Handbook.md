# NexAI OTC — Developer Handbook

**Application:** NexAI OTC BSM · scope `x_nose_nfotc_bsm`
**Instance:** `nomurabsmdev`
**Document version:** 1.0 · 28 September 2026

---

## What this document is

This is a **reference for developers who will maintain and extend the application**. It describes what
exists, where it lives, and how the pieces connect.

It is deliberately **not** a design document. The *Technical Design Document* covers requirements and
intended design; this covers the implementation as built. Where the two disagree, the code is the fact
and this document follows the code.

Everything here is native ServiceNow: Studio, Flow Designer, Script Includes, Business Rules, Service
Portal and update sets. There is no external build step and no generated code — every artefact
described below can be opened, read and edited in the platform.

## How to read it

Three ways in, depending on what you need:

| If you want to… | Read |
|---|---|
| **understand how it works** | §2 *The life of a mail*, front to back. It is the only section written to be read in order, and everything else is reachable from it. |
| **look something up** | §4–§8. Script Includes, Actions, Flows, tables, UI — organised for lookup, not reading. |
| **understand why it is shaped this way** | §3 *The layers* |
| **operate it** | §10, plus §11 for what must be provisioned first |

### Conventions

- Table names are written without the scope prefix where the context is obvious: `email` means
  `x_nose_nfotc_bsm_email`.
- **Find:** `something` means use the editor's find (Ctrl+F) with that exact string. Line numbers are
  deliberately not quoted — they move when a file is edited, search strings do not.
- Code excerpts are exactly as they appear in the platform, abbreviated with `...` where a long block
  has been trimmed. A `§` **inside** a quoted comment refers to Nomura's own requirement documents
  (`BRD §Audit`, `FSD §15`), not to a section of this handbook.
- Where a limitation is relevant to the component being described, it is stated plainly in place.
  §11 collects the things that must be configured before the system behaves fully.

## Contents

| § | |
|---|---|
| 1 | Orientation — what it does, the environments, the shape |
| 2 | The life of a mail — the narrative spine |
| 3 | The layers — why it is built this way |
| 4 | Script Includes — all 24 |
| 5 | Flow Actions — all 24 |
| 6 | Flows and Subflows |
| 7 | Data model — all 12 tables, every column |
| 8 | User interface — widgets, pages, portal, menu |
| 9 | Cross-cutting — configuration, audit, security, observability |
| 10 | Operations — the runbooks |
| 11 | Prerequisites — what must be in place |

---

# 1. Orientation

## 1.1 What the application does

A counterparty sends a settlement email. It may carry the cashflows in the body, in a spreadsheet, in
a PDF, or in some combination. The mailbox also receives a great deal that is not a settlement
instruction at all.

The application:

1. **takes the mail in** and decodes it — body, attachments, encodings
2. **decides whether it is relevant**, and records *why* either way
3. **reads the cashflows out of it** — body text, Excel and PDF each by the appropriate route
4. **matches them against the bank's own bookings** on a three-tier cascade
5. **presents the result to an analyst**, who confirms or corrects it
6. **records every decision** — the model's and the analyst's — in an append-only trail

Nothing commits automatically. A mail carrying extracted cashflows sits at
`review_status = awaiting_confirmation` until an analyst confirms it, and only then does matching and
write-back run. The confirmation is recorded on the **mail**; each cashflow carries its own
`ai_confirmed` stamp once the analyst has acted on it.

## 1.2 The environments

The same application is installed four times on this instance, as separate scopes. The code is
identical in each; only the data and the intended use differ.

| Application | Scope | Purpose |
|---|---|---|
| **NexAI OTC BSM** | `x_nose_nfotc_bsm` | the application this document describes |
| NexAI OTC Dev | `x_nose_nexai_dev` | development |
| NexAI OTC Test | `x_nose_nexai_test` | testing, and where the current mail corpus is loaded |
| NexAI OTC UAT | `x_nose_nexai_uat` | user acceptance |

**Two consequences of this arrangement:**

The four scopes **do not share a name prefix** — `nfotc_bsm` against `nexai_*`. Any script that
enumerates the environments must use an explicit list, never a prefix test, or it will also match the
older `x_nose_nfotc` application that is present on the same instance.

**The scope name is written into every file.** A Script Include in `x_nose_nfotc_bsm` calls its
siblings as `new x_nose_nfotc_bsm.Something()`, and builds its table names from the same prefix.
Copying a file between scopes therefore means rewriting that token — a plain copy produces a file that
calls the *other* application, and the resulting cross-scope error is swallowed by the surrounding
`try/catch`, so it fails silently and returns nothing. §10 covers how to move code between scopes
safely.

## 1.3 The shape

```
                      ┌──────────────────────────────┐
                      │   Service Portal  ( /nexai ) │   16 widgets
                      │   board · case · dashboards  │
                      └──────────────┬───────────────┘
                                     │  "Sync now"
                                     ▼
                      ┌──────────────────────────────┐
                      │  OTC Settlement - Intake     │   subflow, one call per mail,
                      │  (Subflow)                   │   fired in the background
                      └──────────────┬───────────────┘
                                     │
          ┌──────────┬───────────────┼───────────────┬──────────────┐
          ▼          ▼               ▼               ▼              ▼
      Ingest     Classify /      Extract         Extract        Update the
      Email      Identify        Counterparty    Fields         email record
          │          │               │               │
          ▼          ▼               │               ▼
   EmlField   WizardExtractor        │        WizardExtractor
   Extractor    .identify()     (no Script      .extractEmail()
  .mailContents()                 Include)            │
                                                      ▼
                                              DemoExtractor ──┬── EmlFieldExtractor
                                                              ├── XlsxCashflowExtractor
                                                              └── (AiFieldExtractor — off
                                                                   on this path, see §2.6)
                                                      │
                                                      ▼
                                             GenericFieldExtractor
                                                ├── RowSegmenter
                                                └── global.ChinouClient

                      ┌──────────────────────────────┐
                      │  OTC Match & Write-back      │   separate flow, after a
                      │  (Wizard-driven)             │   human has looked
                      └──────────────┬───────────────┘
                                     ▼
                               CompareMatch
                            3-tier cascade against
                            the booking table
```

Every step of the subflow is a **Flow Action**, and almost every Flow Action is a thin wrapper that
delegates to a **Script Include**. They run from ten to forty-eight lines — the longer ones spend that
length on plumbing, such as locating the right attachment, not on logic. Two do not delegate at all:
`OTC · Extract Counterparty` is a self-contained lookup (§2.5), and the four CSG placeholders do
nothing by design.

The flow supplies the shape, the sequencing and the error handling; the Script Include holds the logic,
in one place, where it can be called straight from a background script and tested without constructing
a flow context. The Actions name this arrangement themselves — each OTC Action's header opens the
same way:

> *Spoke: OTC · Ingest Email (Capability 1) — MATERIALISE the mail.*

The flow is the hub; each Action is a **spoke** with one numbered capability.

## 1.4 What is in the application

| | Count | |
|---|---:|---|
| Tables | 12 | §7 |
| Script Includes | 24 | §4 |
| Flow Actions | 24 | §5 |
| Flows and Subflows | 6 | §6 |
| Service Portal widgets | 16 | §8 |
| Portal pages | 15 | §8 |
| Business Rules | 2 | §9 |
| System properties | 8 | §9 |
| Roles | 2 | §9 |
| Access controls | 57 | §9 |

## 1.5 Glossary

| Term | Meaning |
|---|---|
| **Work driver** | A configured pipeline — which mails it owns, which fields to extract, what tolerances to match on. Stored as one record on the `wizard` table. Sometimes called *the wizard*. |
| **Wizard** | Both the work driver record and the Service Portal builder that edits it. Context makes it clear which. |
| **Cashflow** | One settlement line extracted from a mail: amount, currency, direction, value date, reference. A mail usually yields several. |
| **Booking** | The bank's own record of a trade's cashflow — what an extracted cashflow is matched against. |
| **Direction** | `Receive` or `Pay`, from Nomura's side. |
| **Tier** | Which of the three matching rule sets found a booking. Tier 1 is exact on everything, Tier 3 the widest. See §2.9. |
| **Allege** | To raise a cashflow with the counterparty because it cannot be matched or disagrees. |
| **HITL** | Human in the loop — the analyst confirmation step that everything waits at. |
| **Relevant / irrelevant** | The classification verdict on an incoming mail. Both are recorded, with a reason. |
| **Thread mail** | A mail that quotes an earlier message. Dropped, because its figures have usually been processed already. |
| **Partial extraction** | Fewer cashflows came back than the body appears to contain. The mail is flagged rather than reported complete. |

---

# 2. The life of a mail

This section follows one settlement email from arrival to a matched, confirmed cashflow. Read it in
order — every other section is reachable from here.

At each step: **the Action** (the contract), then **the Script Include** (the logic).

---

## 2.1 Arrival

A mail reaches the system as a `.eml` file attached to a row on the **`email`** table. At this point
the row is almost empty — a name, an attachment, nothing else. The ingest flow is **upload-only**: it
lands the raw file and stops. Nothing has been read yet.

How a row gets there:

| Route | How |
|---|---|
| **Mailbox drop** | files dropped onto the `mailbox_drop` table, one row per mail |
| **Zip drop** | the `zip_drop` table, for a batch of mails in one archive |
| **Composed intake** | a row created directly, with the `.eml` attached |

Note that neither drop table is referenced from any Script Include or Action — they are staging tables
that something else loads. A live mailbox would be a further route; §3.2 sets out what connecting one
actually involves, which is more than swapping a connector.

---

## 2.2 "Sync now" — how work starts

The analyst board has a **Sync now** button. It does not process anything itself.

**Widget:** `OTC Wizard Dashboard` (`nfotcbsm-wiz-dashboard`) · **Find:** `input.action === 'sync'`

Its own comment states the design:

> *"Sync now" **runs the Workflow Studio flow — async**. For each relevant mail it invokes the callable
> subflow "OTC Settlement - Intake (Subflow)" in the **background** via `sn_fd.FlowAPI`
> (fire-and-forget), so the request returns immediately and the mails process **in parallel** off the
> request thread. Real progress is polled via `sync_status`. Mails land at "Awaiting Confirmation".*

So one press produces **one subflow execution per mail**, all running concurrently, and the browser
gets an immediate response. Progress is a separate poll.

Two conditions to know:

- It only runs for a work driver whose **activity is `Compare & Match`**. Anything else returns
  `unsupported` without doing work.
- It is **fire-and-forget**. If a mail fails, the button does not report it — the mail's own state and
  the audit trail do.

---

## 2.3 Step 1 — Ingest Email

**Action:** `OTC · Ingest Email` → **`EmlFieldExtractor.mailContents()`**

The Action resolves the `.eml` attachment on the record (preferring `*.eml`, falling back to the first
attachment), parses it, and writes `mail_to`, `mail_from`, `mail_cc`, `mail_subject` and `mail_body`
onto the row.

```javascript
if (attId && !g.getValue('mail_body')) {
    try {
        var m = new x_nose_nfotc_bsm.EmlFieldExtractor().mailContents(attId) || {};
        g.setValue('mail_to', m.to || '');
        g.setValue('mail_from', m.from || '');
        g.setValue('mail_cc', m.cc || '');
        g.setValue('mail_subject', m.subject || '');
        g.setValue('mail_body', m.body || '');
    } catch (e) { gs.warn('[cap-ingest] parse ' + e); }
}
```

**`!g.getValue('mail_body')` makes it idempotent** — a mail already parsed is left alone, so re-running
a sync is safe.

### Why `EmlFieldExtractor` is 46,000 characters

Because a `.eml` off a real mail gateway is not clean. Two defects found in production traffic, both
handled here:

**A stale MIME boundary.** The gateway rewrites messages in transit and leaves an
`X-Original-Content-Type` header naming a boundary that no longer exists in the message. Split the
body on that boundary and you get nothing back.

**Quoted-printable.** Bodies arrive with `=3D` and `=0A` escapes. Undecoded, every amount and every
date is unreadable.

**Neither of these throws.** There is no exception and nothing in a log — the body simply comes back
empty, which is indistinguishable from a mail that genuinely had nothing in it. **Silence is the
failure mode to watch for in ingestion**, and it is why this file is defensive throughout rather than
trusting the message structure.

### One more thing the Action does

Outside the idempotency guard, it defaults `source` to `Composed Intake` when empty and then calls
`g.update()` **unconditionally** — so the Action always writes, even for a mail that was already parsed.

### The thread verdict is *not* written here

**Find:** `threadState: function` in `EmlFieldExtractor`

The same file can decide whether a mail is fresh, a reply, or a quoted thread — but this step never
asks it. The verdict is computed and cached in `thread_state` by **Step 2**
(`WizardExtractor._isThreadMail`), which is the only writer of that field in the application. Once
cached, a re-sync reuses it rather than re-reading the attachment.

---

## 2.4 Step 2 — Classify / Identify

**Action:** `OTC · Classify / Identify` → **`WizardExtractor.identify()`**

The Action does two things. First it backfills `sender` from the `.eml` if empty, via
`EmlSenderClassifier` — the sender is needed by the noise rules, the board, and counterparty
derivation. Then:

```javascript
var r = new x_nose_nfotc_bsm.WizardExtractor().identify(wizId, emailId);
if (r && r.classification) { classification = r.classification; }
```

Its header comment explains what this step is really for:

> *This is what **routes a shared mailbox**: each wizard claims only the mails matching ITS own rules.*

One mailbox, several work drivers, each taking its own traffic.

### The rule chain

**File:** `WizardExtractor` · **Find:** `identify: function`

Three structural switches first, all defaulting on. They are read from the **first label** of the work
driver's `id_rules`, per the code's own comment — *"wizard-level structural toggles (default ON), taken
from the first label"* — so they are configured once on that first label, not per label:

```javascript
var exReplies = (t0.excludeReplies === undefined) ? true : !!t0.excludeReplies;
var exNoise   = (t0.excludeNoise   === undefined) ? true : !!t0.excludeNoise;
var exThreads = (t0.excludeThreads === undefined) ? true : !!t0.excludeThreads;
```

Then the tests, in order. **Order matters: the free tests run first**, so most mail is rejected without
a model call ever being made.

| # | Test | Where the logic is | Reason recorded |
|---|---|---|---|
| 1 | subject begins `Re:` / `Fw:` / `Fwd:` | inline, one line | `reply_forward` |
| 2 | body quotes an earlier message | `_isThreadMail` → `EmlFieldExtractor` | `quoted_thread` |
| 3 | sender is on the noise-domain list | `_isNoiseDomain` | `noise_domain` |
| 4 | per-label exclusion matched | `_anyMatch` | *skip this label* |
| 5 | subject / body / sender keywords matched | `_containsAny` | `rule_match` |
| 6 | the label's AI context matched | `GenericFieldExtractor.classifyMatch` | `ai_context` |
| 7 | a label with no criteria at all | — | `empty_label` |
| — | nothing matched | — | `no_label_match` |

Three further reasons never come from a test:

| Reason | When |
|---|---|
| `default` | the initial value, before any rule has spoken |
| `no_email` | the email record could not be loaded; the verdict is returned blank |
| `no_rules` | **the work driver has no identification rules configured at all** |

> **`no_rules` deserves attention.** With no rules configured the method returns *relevant* — its own
> comment reads *"nothing configured -> relevant"*. An unconfigured work driver therefore **claims every
> mail in the mailbox** rather than none. That is reasonable as a default for a single-driver instance
> and dangerous on a shared mailbox, so configure identification rules before publishing a driver.

Rule 1 is a single line:

```javascript
if (exReplies && /^\s*(re|fwd?|fw)\s*:/i.test(subject)) { ... reason = 'reply_forward'; }
```

### The thread rule, in detail

Rule 2 runs three files deep: `identify` → `_isThreadMail` → `EmlFieldExtractor` → **`THREAD_MARKERS`**.

The order inside `_isThreadMail` is worth knowing, because only the last step touches the attachment:

1. a cached `thread_state` short-circuits everything
2. otherwise `_hasQuotedHistory(body, '')` runs against the **stored body** — cheap, no attachment read
3. only if that body looks clean does it fall through to `threadState()`, which re-reads the raw `.eml`

**Find:** `THREAD_MARKERS` — seven patterns:

| Pattern | Catches |
|---|---|
| `--- Original Message ---` | Outlook |
| five or more underscores, then `From:` | Outlook variant |
| `From:` … `Sent` / `Date` / `Gesendet` / `Envoyé` / `Enviado` / `Inviato` / `送信日時` / `보낸 사람:` | any locale |
| `Von` / `De` / `Da` / `От:` … | non-English clients |
| `On … wrote:` | Gmail, Apple Mail |
| **two consecutive `>` lines** | plain-text quoting |
| `divRplyFwdMsg`, `gmail_quote`, `yahoo_quoted`, `moz-cite-prefix` | HTML clients |

Three decisions are recorded in the comments around that array, each measured against the production
corpus of 107 mails:

- **Reply headers alone do not drop a mail.** Doing so would discard about **11% of real work** — mails
  that carry `In-Reply-To` but contain a clean, fresh table. Headers only downgrade the state to
  `reply`, which keeps the mail and flags it.
- **`Thread-Index` / `Thread-Topic` are unusable.** Outlook stamps them on fresh mails too — **75 of
  107** in the corpus.
- **The gateway banner appears in every MIME alternative**, plain text and HTML both. Counting banners
  across the whole file flags **80 of 107** fresh mails as threads, so the count is taken on a single
  decoded part.

And the two-chevron rule has its own note: one `>` is decoration, not quoting — a genuine SSI-change
notice in the corpus reads `">>>SSI will become>>>"` and must not be dropped.

### The label loop — cheap first, the model last

**Find:** the `for` loop over `labels`

Per configured label, in order: per-label exclusions (free) → subject, body and sender keywords (free)
→ and **only** if none of those decided, and only if that label carries a plain-language context, one
model call via `GenericFieldExtractor.classifyMatch`.

The model is a fallback, not the first resort.

### The verdict is written down

**Find:** `_persistClassification`

The comment above the call site is the design argument:

> *a DROPPED mail must still carry its verdict, otherwise it is indistinguishable from one the system
> never saw*

A mail rejected as noise and a mail that never arrived look identical unless the rejection is recorded.

> **Which path records it matters, and it is not this Action.** `identify()` calls neither
> `_persistClassification` nor `_auditClassification`. Both are called from **`routeForWizard()`**, which
> is the board widget's ownership gate. So:
>
> | Path | What it stores |
> |---|---|
> | the board widget → `routeForWizard` | the verdict **and** the reason **and** a `classification.decided` audit event |
> | the subflow → `OTC · Classify / Identify` | the verdict only — `g2.setValue('classification', …)` |
>
> A mail classified purely through the subflow therefore carries no reason and no audit event. If you
> need the trail on every path, move both calls into `identify()` — but note the Action would then be
> writing an audit event per run, including re-runs.

`_auditClassification` writes a `classification.decided` event carrying the label, the reason, the
prompt reference and content hashes. See §9.3.

---

## 2.5 Step 3 — Extract Counterparty

**Action:** `OTC · Extract Counterparty` — **no Script Include.** The whole capability is the Action,
about twenty lines, and it is readable in one screen. Not everything needs to delegate; when the logic
is a directory lookup and nothing more, it lives here.

Its header states the rule:

> *Counterparty is **DERIVED from the sender** via the `x_nose_nfotc_bsm_counterparty` directory
> (**not AI-extracted**). Stamps it on the mail.*

```javascript
var hay = ('' + (g.getValue('sender') || '') + ' ' + (g.getValue('mail_from') || '')).toLowerCase();
var m = hay.match(/[a-z0-9._%+-]+@[a-z0-9.-]+/);
var addr = m ? m[0] : '';
if (addr) {
    var d = new GlideRecord('x_nose_nfotc_bsm_counterparty');
    d.addQuery('email_address', addr);
    d.query();
    if (d.next()) { cp = d.getValue('org_name'); g.setValue('counterparty_name', cp); g.update(); }
}
```

**The model never guesses the counterparty.** It is looked up from the sender's address. No match in
the directory means the field stays blank — it is not invented.

Note the reason both `sender` and `mail_from` are searched, from the comment: some mails fold the
`From` header across two lines, leaving the display name in one field and the address in the other.
Searching only one silently misses.

> **This step is also why matching behaviour depends on reference data.** The counterparty directory
> is reference data that must be populated. Where it is empty or synthetic the lookup finds nothing,
> `counterparty_name` stays blank, and the two strongest matching tiers — which both require a
> counterparty — cannot fire. See §11.

---

## 2.6 Step 4 — Extract Fields

**Action:** `OTC · Extract Fields` → **`WizardExtractor.extractEmail()`**

```javascript
if (inputs.classification === 'irrelevant') { outputs.status = 'skipped'; return; }
...
var r = new x_nose_nfotc_bsm.WizardExtractor().extractEmail(wizId, inputs.email_record);
```

And note the catch:

```javascript
} catch (e) {
    // never throw — the subflow must reach its final step so async progress isn't left hanging
    outputs.status = 'error';
```

Because the subflow is fired asynchronously and progress is polled, a step that throws would leave the
poll waiting forever. The Action absorbs the error and reports it as a status instead.

This step is **three layers deep** — as is Classify, which reaches `EmlFieldExtractor` and
`GenericFieldExtractor` behind `identify`:

```
Action
 └─ WizardExtractor.extractEmail()  →  _processEmail()          the spine
     │
     ├─ DemoExtractor.run(attId, emailId, false)  the TEXT source
     │    ├─ EmlFieldExtractor                    mail body
     │    ├─ XlsxCashflowExtractor                Excel → text grid
     │    └─ AiFieldExtractor                     NOT reached on this path — the
     │                                            `false` argument gates it off
     │
     ├─ PdfCashflowExtractor.findAllPdfs()        any PDFs on this mail?
     │
     ├─ IF a PDF was found:
     │    PdfCashflowExtractor.extractCombined(text, pdfs, …)
     │      ├─ GenericFieldExtractor.extractRecords()   text → ONE call, NOT chunked
     │      ├─ PdfCashflowExtractor.extractRecords()    PDF  → one document call each
     │      └─ _dedupRows()                             union, then collapse duplicates
     │
     └─ ELSE (no PDF):
          WizardExtractor._textExtract()
            └─ GenericFieldExtractor.extractRecordsBatch()  text → CHUNKED, with retry
                 ├─ RowSegmenter                  where each row starts and ends
                 └─ global.ChinouClient           every model call goes through here
```

> **The branch is the thing to notice.** Chunking lives in `extractRecordsBatch`, and only
> `_textExtract` calls it. `extractCombined` calls the un-chunked `extractRecords`. So **a mail that
> carries a PDF gets its body text in a single un-chunked call** — no segmentation, no chunk retry —
> while the same mail without the PDF would get the full chunking path. A large table in the body of a
> mail that also has a PDF attached is the case to watch, and the completeness guard (below) is what
> surfaces it as `partial`.

> **A naming trap.** `DemoExtractor` is **not** demo-only, despite its name and its description. It
> gathers the **text** sources — body and spreadsheet — and is called by `WizardExtractor` on both the
> single-mail and batch paths. Treat it as production code.

### How the sources are found

**Text** — the mail body (parsed in §2.3), plus any spreadsheet converted to a text grid by the Excel
detection below.

**Spreadsheets** — `XlsxCashflowExtractor._findAllExcelParts` walks every declared MIME boundary in the
order the parts appear, and applies three tests to each:

| Test | Why |
|---|---|
| `Content-Disposition: attachment` | it must be an attachment, not an inline part |
| base64 begins `UEsD` | the zip magic `PK\x03\x04` — an `.xlsx` is a zip |
| filename ends `.xls`, `.xlsx`, `.xlsm` or `.xlsb`, **when a filename is present** | `.docx` and `.zip` share the same magic, so the magic alone is not enough |

Parts are de-duplicated on **name plus base64 length**, because a gateway commonly repeats the same
part under two boundaries.

**PDFs** — `PdfCashflowExtractor` looks in **two places**, in this order:

1. **A PDF already attached to the email record** — content type `application/pdf`, or a `.pdf`
   filename. This covers a direct drop, and anything a previous run already materialised.
2. **A PDF part inside the raw `.eml`** — the same MIME boundary scan, with these tests:

| Test | Note |
|---|---|
| `Content-Type: application/pdf` **or** `Content-Disposition: attachment` **or** `inline` | note that **`inline` counts** here, unlike the Excel scan — a PDF is often sent inline |
| base64 begins `JVBER` | the `%PDF` magic |
| filename ends `.pdf`, when present | as with Excel, the test is skipped for a part with no filename |

Anything found inside the `.eml` is **materialised as a real attachment** on the email record
(`_materialise` → `writeBase64`), so the analyst sees the PDF on the case screen rather than only the
`.eml`.

`findAllPdfs()` returns **every** PDF; `findPdf()` returns the first. `_processEmail` uses the former —
a mail with three PDFs contributes all three.

### How multiple sources are combined

**`PdfCashflowExtractor.extractCombined()`** — the obvious approach was tried first and abandoned; the
comment below records why.

Each source goes through **its own proven extractor**, and the results are merged **in code**:

```
text (body + Excel)  →  GenericFieldExtractor.extractRecords()     ONE call, not chunked
each PDF             →  PdfCashflowExtractor.extractRecords()      one document call per PDF
                     →  _dedupRows()                               union, identical rows collapse
```

The comment above the function explains why it is not one combined call:

> *This is deliberately **NOT** one combined "read both together" call: forcing the body text AND a PDF
> through a single strict field+provenance prompt made the model return an **EMPTY array** for
> overlapping mails — a PDF-only row cannot satisfy the task's "verbatim from the email" provenance
> demand, and the guardrails then resolve the contradiction by emitting nothing. Two proven calls plus
> code-level dedup gives the same "read all sources, dedup" outcome, reliably.*

And the principle it preserves: **no source-of-truth guessing.** A summary body and a detailed PDF each
contribute their rows; identical rows collapse to one. Neither is allowed to pre-empt the other.

> **A stale comment to ignore.** The block comment inside `_processEmail` describes sending everything
> to the model "in ONE call" and letting it reconcile. That is **not** what the code does — it calls
> `extractCombined`, which makes separate calls and dedups in code, as its own comment states. Trust
> `extractCombined`.

### When a source fails

`extractCombined` distinguishes two kinds of failure, and treats them differently:

| Kind | Examples | What happens |
|---|---|---|
| **Retryable** | empty result, transient error | **the whole mail is left for the next sync**, so no rows are silently dropped |
| **Deterministic** | a guardrail block on one source's content | the rows the **other** sources produced are accepted, and the blocked source is logged |

The reasoning: a transient failure will succeed later, so nothing should be persisted yet. A guardrail
block will fail identically forever, so retrying it would loop and re-charge for nothing — but the
other sources' rows are still good and should not be thrown away with it.

Zero rows overall is treated as retryable, so an empty mail is never persisted as a false "finished
with nothing".

### The spine

**Find:** `_processEmail` — picks the sources, runs each through the right reader, merges, deduplicates,
writes cashflows.

**It deletes the mail's existing cashflow rows before writing the new ones**, so a re-run replaces
rather than accumulates and stale rows cannot linger.

The delete is **gated behind a successful extraction**: the early return
`if (!out || out.status !== 'ok' || !(out.rows && out.rows.length))` precedes `deleteMultiple()`, with
the comment *"extraction failed / returned nothing — do NOT blank the cashflows"*. So a failed re-run
leaves the previous rows intact. What a *partially* successful run can leave is fewer rows than before,
which is what the completeness guard below is for.

### Why one model call is not enough

A single call has a hard time ceiling, and a mail with thirty cashflows does not fit inside it.

**`RowSegmenter`** · **Find:** `segment: function` — finds row boundaries in three body shapes: one row
per line; **multi-line records** such as SWIFT `:20:` / `:32A:` blocks or `--- begin message ---`
wrappers, found by spotting the repeated record opener — a line whose exact text recurs about once per
amount; and flattened HTML table rows. It anchors on **the amount**, because that is the one field every
cashflow has. (A fourth mode, `none`, is the nothing-to-segment case.)

**Find:** `planCalls: function` — chunk planning is **time-based, not size-based**. A call costs
roughly a fixed amount plus a per-row amount, so the planner works backwards from the time budget to
decide how many calls to make, and splits the rows evenly between them.

### The retry, and the decision inside it

**`GenericFieldExtractor`** · **Find:** `lost.length < items.length`

```javascript
// Once, deliberately. A chunk that fails twice is failing for a reason a third attempt will
// not change, and the mail is still flagged partial rather than presented as whole.
if (lost.length && lost.length < items.length) {
```

- **Some chunks failed, others worked** → transient. Retry the failures, at lower concurrency so they
  are not competing with one another.
- **Every chunk failed** → not transient. The service, the credential or the prompt is broken. Retrying
  would waste time and bury the real fault, so it does not.

**Find:** `(retry)` — a retried chunk keeps its **original** number, so the usage log reads
`chunk 4/8 (retry)` rather than `chunk 1/3`, and a run can be reconstructed afterwards.

### It checks its own work

**`WizardExtractor`** · **Find:** `extraction_status`

If fewer rows come back than the segmenter counted in the body, the mail is flagged **`partial`** — the
system says *I may have missed something* instead of reporting success. The next line **clears** the
flag when a later run recovers the missing rows, because a warning that never clears is one people
learn to ignore.

### Spreadsheets do not go to the model as files

**`XlsxCashflowExtractor`** · **Find:** `extract: function`

An Excel attachment is parsed **in the platform** — sheet and header row auto-detected — into a plain
text grid, which then takes the ordinary text path.

The principle behind the whole extraction layer: **a document cannot be chunked, text can.** Converting
early means the spreadsheet inherits the segmentation, the retry and the completeness guard for free.
Anything that remains a document — a PDF — gets none of them, and is one all-or-nothing call.

Detection is covered above. The sheet and header row are auto-detected, and the amount of each sheet
handed to the model is bounded by the `xlsx.*` configuration keys (§9.1); reaching a limit is logged as
a truncation rather than passing silently.

---

## 2.7 Steps 5 and 6 — Update and hand back

The subflow's last two steps write the accumulated values onto the `email` record and assign the
subflow outputs. No logic.

The mail now sits at **`awaiting_confirmation`**. Nothing has been matched and nothing has been sent.

---

## 2.8 The analyst

The board and case screens are Service Portal widgets (§8). An analyst opens the mail, sees the
extracted cashflows beside the original message, and confirms or corrects.

Confirmation is the gate. Until it happens, nothing proceeds.

---

## 2.9 Compare & Match

**Flow:** `OTC Match & Write-back (Wizard-driven)` — a **separate flow**, deliberately not part of
intake. §3.3 explains why.

**Action:** `OTC · Compare & Match` → **`CompareMatch.matchEmail()`**

```javascript
var r = new x_nose_nfotc_bsm.CompareMatch().matchEmail(inputs.email_record);
outputs.matched  = '' + (r.matched  || 0);
outputs.mismatch = '' + (r.mismatch || 0);
outputs.no_match = '' + (r.no_match || 0);
```

Its comment notes: *"Does NOT auto-resolve."* It records an outcome; a person still decides.

### The three tiers

**`CompareMatch`** — 61,847 characters; the tier definitions are near the top. **Find:** `Tier 1 (exact)`

| Tier | Amount | Value date | Counterparty |
|---|---|---|---|
| **1** exact | exact | exact | exact |
| **2** fuzzy | ± `T2_AMT_ABS` (50) | ± `VD_TOL_DAYS` (2) **business** days | fuzzy name ≥ `NAME_FUZZY_PCT` (0.85) |
| **3** counterparty-less | exact | exact | **dropped** |

Tried in order, first hit wins. **Tier 2 is the only tier with any tolerance.**

Immediately below the tier definitions the file records its own deviations from the specification:

> **KNOWN FSD GAPS (data not available):** value-date business days skip weekends only, **not** currency
> or bank holidays (no holiday calendar); `T2_AMT_ABS` is in the **raw currency**, not the FSD's "$50
> equivalent" (no FX rates). Both are upgradeable via config plus a rate or calendar source, with no
> rewrite.

### The guard at the top of `match()`

**Find:** `match: function`

```javascript
if (!cf.currency || !cf.direction) { return out; }
```

If direction is blank the query would match a booking of **either** direction and present it as a
Tier-1 exact — a confident, wrong answer. So a missing direction returns `no_match` deliberately: an
unmatched cashflow goes to an analyst, whereas a wrongly matched one does not.

The same principle immediately below: a blank counterparty **drops to Tier 3** rather than faking a
counterparty-confirmed match at Tier 1 or 2.

### Tolerances are configuration

**Find:** `loadConfig: function` — the value-date window, the amount tolerance and the name threshold
are read from the config store: system default, or a per-work-driver override. Widening the match
window is a configuration change, not a release. See §9.1.

### What is stored

**Find:** `matchAndStore` — persists status, tier, bank reference, confidence and candidate count onto
the cashflow, so *why did this match* can be answered later without re-running anything.

---

## 2.10 Write-back

The same flow carries a `OTC · Route / Write-back` Action.

> The outbound leg is **not connected**. The integration available today is retrieval only; the
> write-back endpoint is not yet available. The Action sets `review_status = awaiting_review` on the
> mail and writes a `workflow.routed` audit event; it does not push anything to an external system.
> See §11.

---

## 2.11 The whole path, in one table

| # | Step | Action | Logic in | Leaves behind |
|---|---|---|---|---|
| — | press Sync | widget `nfotcbsm-wiz-dashboard` | `sn_fd.FlowAPI` | one subflow run per mail |
| 1 | Ingest | `OTC · Ingest Email` | `EmlFieldExtractor` | `mail_*` fields, `source` |
| 2 | Classify | `OTC · Classify / Identify` | `WizardExtractor.identify` | `classification`, and `thread_state` when the thread rule runs. The reason and the audit event are written on the board path only — see §2.4 |
| 3 | Counterparty | `OTC · Extract Counterparty` | *(the Action itself)* | `counterparty_name` |
| 4 | Extract | `OTC · Extract Fields` | `WizardExtractor.extractEmail` | cashflow rows, `extraction_status` |
| 5 | Update | *(record update)* | — | the email record |
| 6 | Outputs | *(assign)* | — | subflow outputs |
| — | analyst confirms | portal | — | `confirmed`, an audit event |
| 7 | Match | `OTC · Compare & Match` | `CompareMatch.matchEmail` | tier, status, booking reference |
| 8 | Write-back | `OTC · Route / Write-back` | *(staged only)* | `review_status = awaiting_review`, a `workflow.routed` audit event |

---

# 3. The layers

§2 followed one mail. This section explains why the pieces are arranged the way they are — the
reasoning you would otherwise have to reconstruct from the code.

## 3.1 Flow, Action, Script Include

Three layers, each with one job:

| Layer | Job | Typical size |
|---|---|---|
| **Flow / Subflow** | sequence, error handling, what runs when | 6 steps |
| **Flow Action** | a typed contract — declared inputs and outputs | 10–48 lines |
| **Script Include** | the logic | 2,000–62,000 characters |

The Actions say it themselves. Every OTC Action's header opens by naming itself a **spoke** with a
numbered capability:

> *Spoke: OTC · Classify / Identify (Capability 2) — the SINGLE classify, now fully driven by the
> wizard's Email-Identification config (id_rules) … This is what ROUTES a shared mailbox: each wizard
> claims only the mails matching ITS own rules.*

The flow is the hub, each Action a spoke with one job.

**Why the indirection is worth it.** Put the logic in the flow and only the flow has it: the board
button, a future scheduled job and any integration each need their own copy, and copies drift. Put it
in a Script Include and every caller shares one implementation, which can be called directly from a
background script for testing without constructing a flow context.

**What this means when you change something.** Change the logic in the Script Include and every caller
changes with it. Change an Action's declared inputs or outputs and you must re-publish it, then update
every flow step that binds to it — the binding is by name, and a renamed output silently stops flowing.

## 3.2 One intake seam

**`Intake`** is 2,245 characters and does almost nothing:

```
createWorkItem(sourceType, sourceRef, rawContent, workDriver)
populate(gr, sourceType, sourceRef, rawContent, workDriver)
```

Its purpose is to be the **single place a new source plugs in**. A dropped file, a PDF, an API call, a
live mailbox — all arrive here, whatever the source. It de-duplicates on `source_ref`, so the same item
arriving twice does not become two work items.

> **Read this carefully before relying on it.** `Intake` writes the **`work_item`** table — the
> capability-platform table — and its only caller in the application today is
> `NFOTC · Create Work Item`. The mail pipeline in §2 runs entirely on the **`email`** table and never
> calls `Intake`. So this is the intended seam for a new source, not one the mail path currently goes
> through. Connecting a live mailbox means either routing it through `Intake` and moving the pipeline
> onto `work_item`, or adding the equivalent de-duplication on the `email` path. Budget for that
> decision rather than assuming the seam is already load-bearing.

## 3.3 Why intake and matching are separate flows

The intake subflow ends after extraction. Matching and write-back are a **different flow**. Five
reasons, in the order they matter:

**A person sits between them.** Extraction lands everything `awaiting_confirmation` for review. A
subflow cannot pause mid-run waiting for a human — it has to return its outputs to its caller.

**Re-matching has to be free.** A cashflow that does not match today may match tomorrow once the
booking arrives. Matching must be re-runnable at will; if it were one flow, every re-match would
re-extract.

**And re-extraction is destructive.** `_processEmail` **deletes a mail's cashflow rows before writing
the new ones**. Matching is idempotent — same input, same answer, no side effects. Coupling a
destructive step to an idempotent one gives the whole thing the destructive semantics.

**The costs are not comparable.** Extraction is model calls, seconds each. Matching is database work,
milliseconds. Chaining something cheap and repeatable behind something expensive and one-shot wastes
both.

**They depend on different data.** Matching needs the booking table, which is refreshed on its own
cadence. Extraction needs only the mail. Coupled, extraction would wait on booking availability for no
reason.

A sixth applies to write-back specifically: **anything that pushes data out of the system deserves its
own governed step** — its own approval, audit and failure handling — rather than being buried inside an
ingestion flow.

## 3.4 The capability palette

Alongside the settlement pipeline sit thirteen `NFOTC ·` Actions. Twelve of them delegate to a single
Script Include:

```
Capabilities.run(key, workItemId, config)
```

which dispatches to one of twelve methods: `ingest`, `classify`, `extract`, `transform_enrich`,
`validate`, `calculate`, `compare_match`, `report_notify`, `route_distribute`, `hitl`, `monitor`,
`audit`.

The thirteenth, **`NFOTC · Create Work Item`**, delegates to `Intake` instead — creating the Work Item
is what the other twelve then operate *on*.

**`CapabilityRegistry`** is the catalogue — `list()`, `get(key)`, `validateChain(keys)` — so a chain of
capabilities can be checked before it is run.

The intent is that a new work driver can be composed in Flow Designer from typed steps, without
writing code. The `OTC ·` Actions are the specialised pipeline; the palette is the generic one.

> **Four Actions are placeholders.** `Classify`, `Ingest Email`, `Extract Fields` and
> `Compare and Match` carry the comment *"CSG dummy capability — PLACEHOLDER ONLY (demo).
> Intentionally does NO real work."* They exist so the CSG entity-data subflow has steps to display.
> They are not the pattern to copy.
>
> Do not confuse `Compare and Match` (a placeholder, ten lines, does nothing) with
> **`Compare & Match for Cashflow`** (the real match step of `OTC Match & Write-back`, which calls
> `CompareMatch.matchAndStore()`). Neither carries a name prefix; only one does work.

## 3.5 Configuration

**`NfotcConfig`** resolves a setting in three steps, stopping at the first that answers:

```
per-work-driver override  →  system default (the config table)  →  the caller's fallback
```

```
getNumber(key, wizId, default)
getString(key, wizId, default)
getBool(key, wizId, default)
```

So a tolerance can be changed for one desk without affecting another, and a key that has never been set
still has a sane value because the caller supplied one. `CompareMatch.loadConfig()` is the clearest
example — it overlays the match tolerances onto the instance before any matching runs.

The consequence for maintenance: **behaviour changes are usually data changes.** Match windows,
extraction thresholds, chunking limits and the identification rules all live in records, not code.

## 3.6 The model integration, and what constrains it

All model calls go out through a single client in the global scope. Two properties of that path shape
the design above it:

**Calls leave through the MID server.** The model gateway is on the internal network, so requests are
queued to a MID server rather than sent directly from the instance.

**A single call has a hard time ceiling.** It is a queue wait, and it is not moved by the ordinary HTTP
timeout settings. Everything about chunking follows from this:

- `RowSegmenter` plans chunks **against a time budget**, not a size limit
- concurrency is capped, because parallel calls queue behind one another and the first chunk of a wave
  waits longest
- `GenericFieldExtractor` retries lost chunks at **lower** concurrency
- the completeness guard exists because a lost chunk means lost rows

And the architectural consequence stated in §2.6: **text can be chunked, a document cannot.** That is
why spreadsheets are converted to text in the platform rather than submitted as files, and why anything
that must stay a document is a single all-or-nothing call.

## 3.7 Observability

Up to three separate records are written per run, answering three different questions:

| Record | Question | Written by |
|---|---|---|
| `llm_usage` row | *what did this cost, and how long did it take* | `LlmUsage` |
| trace | *what was the shape of the run* | `LangSmithTracer` |
| `audit` event | *what was decided, and why* | `AuditTrail` |

`LlmUsage` records the figures the model service itself reports — cost, latency and tokens per call —
rather than estimates, and counts each chunk of a chunked mail individually.

`LangSmithTracer` batches its writes and sends them asynchronously, one request per mail, so tracing
adds no measurable latency to extraction. It is **inert unless fully configured** — it needs the enable
flag, an API key *and* an endpoint — and it is sampled, so a trace is not guaranteed for any given run.
Traces containing an error are always kept regardless of the sample rate.

`AuditTrail` only ever inserts. See §9.3.

## 3.8 Supporting components

Six Script Includes are part of what an analyst sees rather than of the extraction spine. They are
listed here because they are easy to overlook when reading §2. Most are reached from a widget or a UI
Page rather than from a Flow Action — with one exception: **`ExtractionConfidence` does run inside the
pipeline**, once per cashflow, called from `WizardExtractor._processEmail`.

### `ValueLocator` — in-mail highlighting

At 35,685 characters, the second largest of the six. When the case screen shows an extracted value,
this finds and marks that value **in the original mail**.

It does not search for the raw string. It generates the **plausible written forms** of the stored value
— an amount can appear with or without thousands separators, a date in half a dozen orders — anchors
the cashflow to its row, and marks the located text in the mail HTML.

The safeguard:

> *Every mark must **round-trip** through the same normaliser that produced the value, so a wrong
> placement is impossible by construction.*

A candidate is only highlighted if normalising it back yields the value that was stored. A near-miss is
therefore not highlighted at all, rather than highlighted in the wrong place — which in a settlement
screen is the more dangerous failure.

`forms()`, `locate()`, `roundTrips()`, `markHtml()`, `markText()`, `subjectMarks()` and others; used by
the **OTC AI Extraction** widget.

### `ExtractionConfidence` — per-field confidence

`score()` produces a confidence for each extracted field from two signals: **grounding** (does the value
actually appear in the source text) and **validation** (is it well-formed for its type). Each score
carries a stated reason, so the screen can explain itself rather than showing a bare number.

Its description notes it is *"AI-only friendly (no second extractor)"* — the confidence is derived from
the one extraction rather than from agreement between two, which would double the cost.

### `AmountDirection` — sign and direction helpers

Small and shared. `isNeg()`, `absAmt()`, `normDir()`, `flip()`, `dispDir()`.

It exists because the sign convention is easy to apply twice. The stored amount carries the sign of
Nomura's side, derived from the direction — so a screen that flips the sign *and* flips the direction
displays the opposite of the truth. Centralising the helpers means the double-flip is decided once.

### `PromptEnhancer` — prompt authoring assistance

`enhance()` rewrites a custom field's extraction prompt through the shared model client. Used by the
**OTC Wizard Builder** so someone configuring a work driver can improve a prompt without writing one
from scratch. It edits configuration, never data.

### `TaggingDashboard` — the Outlook tagging view

`render()`, `data()`, `dataAi()` — the dashboard showing mails assigned and their state. Used by three
widgets and by the `tagging` UI Page. At 41,065 characters it is the fourth-largest file in the
application, after `CompareMatch`, `WizardExtractor` and `EmlFieldExtractor`, and almost all of it is
presentation.

### `AnalystScreen` — reached only from a UI Page

`render()` produces the single-screen analyst view: mail contents beside extracted fields.

> **No Action, Script Include or widget calls it — but the `analyst` UI Page does**, live:
> `new x_nose_nfotc_bsm.AnalystScreen().render(_sid, _cf, _save, _fields)`. It is not dead code.
>
> What it is *not* is the portal's analyst screen. The **OTC Analyst Screen** widget renders that view
> itself, calling `EmlFieldExtractor` directly, and its own header describes itself as a *"faithful
> replica of the classic UI Page"*. So the same screen exists twice, by two routes, and **a change here
> reaches the UI Page only, not the portal**. Change both or neither.

---

# 4. Script Includes

Twenty-four Script Includes carry the whole of the application's logic. Almost every Flow Action
is a thin wrapper over one of them, so this is where behaviour actually lives.

Each entry below states what the file is for, its public methods, what it calls, what calls it,
and which tables it touches. Private helpers are listed by name only — they are implementation
detail and change more often.

**Read the *Called by* column carefully.** A Script Include can be reached from four different
places — a Flow Action, another Script Include, a portal widget, a UI Page, or an ACL script.
Several are called *only* from a surface: `AnalystScreen` from a UI Page, `AccessGuard` from ACL
rules. Judging a file unused from the Action list alone would be wrong.

**How to open one:** Studio → the application → **Server Development → Script Include**, or the
list at `sys_script_include.list` filtered on this application.

## 4.1 At a glance

| Script Include | Size | Public methods | Calls | Called by |
|---|---:|---:|---|---|
| **`AccessGuard`** | 9,112 | 10 | — | 13 widgets, 5 ACLs |
| **`AiFieldExtractor`** | 11,846 | 1 | `ChinouClient`, `LlmUsage`, `LangSmithTracer` | `DemoExtractor` |
| **`AmountDirection`** | 2,550 | 5 | — | `TaggingDashboard`, 1 widget |
| **`AnalystScreen`** | 18,973 | 1 | `EmlFieldExtractor` | 1 UI Page |
| **`AuditTrail`** | 4,821 | 2 | — | `Compare & Match for Cashflow`, `CompareMatch`, `OTC · Route / Write-back`, `WizardExtractor` … |
| **`Capabilities`** | 15,648 | 13 | `CapabilityRegistry`, `GenericFieldExtractor`, `CompareMatch` | `NFOTC · Calculate & Process`, `NFOTC · Classify`, `NFOTC · Compare & Match`, `NFOTC · Extract` … |
| **`CapabilityRegistry`** | 4,381 | 4 | — | `Capabilities` |
| **`CompareMatch`** | 61,847 | 11 | `NfotcConfig`, `AuditTrail` | `Capabilities`, `Compare & Match for Cashflow`, `OTC · Compare & Match`, `TaggingDashboard` … |
| **`DemoExtractor`** | 6,501 | 1 | `EmlFieldExtractor`, `XlsxCashflowExtractor`, `AiFieldExtractor` | `WizardExtractor`, 2 widgets |
| **`EmlFieldExtractor`** | 46,212 | 8 | — | `AnalystScreen`, `DemoExtractor`, `OTC · Ingest Email`, `TaggingDashboard` … |
| **`EmlSenderClassifier`** | 3,790 | 1 | — | `OTC · Classify / Identify` |
| **`ExtractionConfidence`** | 7,798 | 1 | — | `WizardExtractor`, 1 widget |
| **`GenericFieldExtractor`** | 21,257 | 4 | `ChinouClient`, `LlmUsage` | `Capabilities`, `PdfCashflowExtractor`, `WizardExtractor`, 1 widget |
| **`Intake`** | 2,245 | 2 | — | `NFOTC · Create Work Item` |
| **`LangSmithTracer`** | 13,666 | 4 | — | `AiFieldExtractor`, `PromptEnhancer`, `WizardExtractor` |
| **`LlmUsage`** | 5,808 | 2 | — | `AiFieldExtractor`, `GenericFieldExtractor`, `PdfCashflowExtractor`, `PromptEnhancer` … |
| **`NfotcConfig`** | 5,899 | 7 | — | `CompareMatch`, `PdfCashflowExtractor`, `WizardExtractor`, `XlsxCashflowExtractor` … |
| **`PdfCashflowExtractor`** | 22,810 | 4 | `GenericFieldExtractor`, `NfotcConfig`, `WizardExtractor`, `ChinouClient`, `LlmUsage` | `WizardExtractor` |
| **`PromptEnhancer`** | 5,519 | 1 | `ChinouClient`, `LlmUsage`, `LangSmithTracer` | 1 widget |
| **`RowSegmenter`** | 16,037 | 5 | — | `WizardExtractor`, 1 widget |
| **`TaggingDashboard`** | 41,065 | 3 | `EmlFieldExtractor`, `CompareMatch`, `AmountDirection` | 3 widgets, 1 UI Page |
| **`ValueLocator`** | 35,685 | 12 | `WizardExtractor` | 1 widget |
| **`WizardExtractor`** | 50,491 | 5 | `DemoExtractor`, `GenericFieldExtractor`, `AuditTrail`, `EmlFieldExtractor`, `LangSmithTracer`, `PdfCashflowExtractor`, `ExtractionConfidence`, `LlmUsage`, `NfotcConfig`, `RowSegmenter` | `OTC · Classify / Identify`, `OTC · Extract Fields`, `PdfCashflowExtractor`, `ValueLocator` … |
| **`XlsxCashflowExtractor`** | 35,521 | 1 | `NfotcConfig` | `DemoExtractor` |

## 4.2 Reference

### `AccessGuard`

Centralised board/case access rules: isManagerOrAdmin(), canViewWizard(wizId), canViewAny().

| | |
|---|---|
| Size | 9,112 characters, 173 lines |
| Accessible from | this application only (`package_private`) |
| Writes records | no — read-only |
| Used by widgets | OTC AI Dashboard, OTC AI Extraction, OTC AI Usage & Cost, OTC Analyst Screen, OTC Audit Trail, OTC Compare & Match, OTC Dashboard, OTC Email Extraction Demo, OTC Manager Dashboard, OTC Wizard Builder, OTC Wizard Dashboard, OTC Wizard List, OTC Work Drivers |
| Enforced by ACLs | `x_nose_nfotc_bsm_cashflow (read)`, `x_nose_nfotc_bsm_cashflow (write)`, `x_nose_nfotc_bsm_email (read)`, `x_nose_nfotc_bsm_email (write)`, `x_nose_nfotc_bsm_wizard (read)` |
| Tables | `sys_user_has_role`, `wizard`, `email` |
| System properties | `x_nose_nfotc_bsm.demo_users` |

**Public methods**

| Method | Parameters |
|---|---|
| `isManagerOrAdmin()` | — |
| `isDemoUser()` | — |
| `roleLabel()` | — |
| `userDisplayName()` | `fallback` |
| `userInitials()` | `fallback` |
| `isAssignedAnalyst()` | `wizId` |
| `canViewWizard()` | `wizId` |
| `canViewAny()` | — |
| `canViewCashflow()` | `cfGr` |
| `canActOnCashflow()` | `cfGr` |

**Private helpers:** `_hasManagerRole`, `_isTestUser`, `_viewAs`, `_assigned`

---

### `AiFieldExtractor`

Extracts settlement cashflows by calling Chinou directly (global ChinouClient); no Now Assist. Best-effort, deterministic fallback handled by the caller.

| | |
|---|---|
| Size | 11,846 characters, 187 lines |
| Accessible from | this application only (`package_private`) |
| Writes records | no — read-only |
| Calls | `ChinouClient`, `LlmUsage`, `LangSmithTracer` |
| Called by | `DemoExtractor` |

**Public methods**

| Method | Parameters |
|---|---|
| `extract()` | `content` |

**Private helpers:** `_s`, `_unwrap`, `_salvageFlows`, `_parseJson`

---

### `AmountDirection`

Never-negative amount + direction double-flip helpers (shared by case screen and board).

| | |
|---|---|
| Size | 2,550 characters, 51 lines |
| Accessible from | this application only (`package_private`) |
| Writes records | no — read-only |
| Called by | `TaggingDashboard` |
| Used by widgets | OTC AI Extraction |

**Public methods**

| Method | Parameters |
|---|---|
| `isNeg()` | `a` |
| `absAmt()` | `a` |
| `normDir()` | `raw` |
| `flip()` | `d` |
| `dispDir()` | `amt, dir` |

**Private helpers:** `_num`

---

### `AnalystScreen`

Renders the single-screen analyst view (mail contents + extracted fields) for a record.

| | |
|---|---|
| Size | 18,973 characters, 251 lines |
| Accessible from | this application only (`package_private`) |
| Writes records | yes |
| Calls | `EmlFieldExtractor` |
| Used by UI Pages | `analyst` |
| Tables | `email`, `cashflow`, `sys_attachment` |

**Public methods**

| Method | Parameters |
|---|---|
| `render()` | `sysId, confirmId, saveFlag, fields` |

**Private helpers:** `_options`, `_html`, `_esc`, `_setIf`, `_empty`

---

### `AuditTrail`

Append-only writer for the OTC audit event store; logs system actions and AI inferences with AI-specific attributes (model, confidence, source passage, tier).

| | |
|---|---|
| Size | 4,821 characters, 82 lines |
| Accessible from | this application only (`package_private`) |
| Writes records | yes |
| Called by | `Compare & Match for Cashflow`, `CompareMatch`, `OTC · Route / Write-back`, `WizardExtractor` |
| Used by widgets | OTC AI Extraction |
| Tables | `audit` |

**Public methods**

| Method | Parameters |
|---|---|
| `log()` | `eventType, o` |
| `hash()` | `str` |

**Private helpers:** `_json`

---

### `Capabilities`

Reusable generic capabilities over the Work Item: ingest/classify/extract/transform_enrich/validate/calculate/compare_match/report_notify/route_distribute + hitl/monitor/audit, via run(key, wiId, config).

| | |
|---|---|
| Size | 15,648 characters, 282 lines |
| Accessible from | this application only (`package_private`) |
| Writes records | yes |
| Calls | `CapabilityRegistry`, `GenericFieldExtractor`, `CompareMatch` |
| Called by | `NFOTC · Calculate & Process`, `NFOTC · Classify`, `NFOTC · Compare & Match`, `NFOTC · Extract`, `NFOTC · Governance & Audit`, `NFOTC · Human-in-the-Loop`, `NFOTC · Ingest`, `NFOTC · Monitor & Control`, `NFOTC · Report & Notify`, `NFOTC · Route & Distribute`, `NFOTC · Transform & Enrich`, `NFOTC · Validate` |
| Tables | `work_item` |

**Public methods**

| Method | Parameters |
|---|---|
| `run()` | `key, wiId, config` |
| `ingest()` | `gr, cfg` |
| `classify()` | `gr, cfg` |
| `extract()` | `gr, cfg` |
| `transform_enrich()` | `gr, cfg` |
| `validate()` | `gr, cfg` |
| `calculate()` | `gr, cfg` |
| `compare_match()` | `gr, cfg` |
| `report_notify()` | `gr, cfg` |
| `route_distribute()` | `gr, cfg` |
| `hitl()` | `gr, cfg` |
| `monitor()` | `gr, cfg` |
| `audit()` | `gr, cfg` |

**Private helpers:** `_json`, `_sid`, `_trace`, `_flipDir`, `_isArray`

---

### `CapabilityRegistry`

Read/validate the capability marketplace: list, get(key), validateChain(keys).

| | |
|---|---|
| Size | 4,381 characters, 99 lines |
| Accessible from | this application only (`package_private`) |
| Writes records | no — read-only |
| Called by | `Capabilities` |
| Tables | `capability` |

**Public methods**

| Method | Parameters |
|---|---|
| `list()` | — |
| `listByType()` | `type` |
| `get()` | `key` |
| `validateChain()` | `keys` |

**Private helpers:** `_json`, `_shape`

---

### `CompareMatch`

Compare & Match: match email cashflows to bank bookings on currency/direction/value_date (+ amount tolerance) and render the two-panel screen.

| | |
|---|---|
| Size | 61,847 characters, 988 lines |
| Accessible from | this application only (`package_private`) |
| Writes records | yes |
| Calls | `NfotcConfig`, `AuditTrail` |
| Called by | `Capabilities`, `Compare & Match for Cashflow`, `OTC · Compare & Match`, `TaggingDashboard` |
| Used by widgets | OTC AI Dashboard, OTC AI Extraction, OTC AI Usage & Cost, OTC Analyst Screen, OTC Audit Trail, OTC Compare & Match, OTC Email Extraction Demo, OTC Manager Dashboard, OTC Wizard Builder, OTC Wizard Dashboard, OTC Wizard List, OTC Work Drivers |
| Used by UI Pages | `compare` |
| Tables | `cashflow`, `email`, `booking` |
| Config keys | `match.name_fuzzy_pct`, `match.t2_amt_abs`, `match.vd_tol_days` |

**Public methods**

| Method | Parameters |
|---|---|
| `titleCase()` | `s` |
| `taxonomy()` | — |
| `resolveTaxonomy()` | `bu, subBu, service, workDriver` |
| `loadConfig()` | `wizId` |
| `matchAndStore()` | `cfSysId` |
| `matchEmail()` | `emailId` |
| `match()` | `cf` |
| `classify()` | `cf` |
| `render()` | `cfSysId, emailSysId` |
| `buildData()` | `cfSysId, emailSysId` |
| `buildDataAi()` | `cfSysId, emailSysId, selectedRef` |

**Private helpers:** `_search`, `_rankLess`, `_finish`, `_amtTol`, `_addDays`, `_addBusinessDays`, `_dateDiffDays`, `_cpNorm`, `_cpEq`, `_cpFuzzy`, `_nameSim`, `_lev`, `_tierLabel`, `_num`, `_bookingObj`, `_counterpartyFor`, `_cfValues`, `_cfValuesAi`, `_cfFromEmailAi`, `_email`, `_cfFromEmail`, `_buildDataFromCf`, `_compareOne`, `_submitted`, `_applySelection`, `_findBooking`, `_candList`, `_fmtDelta`, `_confBucket`, `_confWord`, `_confidence`, `_drow`, `_amtPlain`, `_toDisp`, `_dbanner`, `_renderCompare`, `_cmp`, `_amtCmp`, `_norm`, `_discBanner`, `_comparePage`, `_panel`, `_row`, `_banner`, `_amt`, `_clean`, `_v`, `_esc`, `_page`

---

### `DemoExtractor`

One-shot email extraction (EmlFieldExtractor + XlsxCashflowExtractor + AiFieldExtractor) for the Demo page; returns results in-memory without persisting cashflows.

| | |
|---|---|
| Size | 6,501 characters, 121 lines |
| Accessible from | this application only (`package_private`) |
| Writes records | no — read-only |
| Calls | `EmlFieldExtractor`, `XlsxCashflowExtractor`, `AiFieldExtractor` |
| Called by | `WizardExtractor` |
| Used by widgets | OTC AI Extraction, OTC Email Extraction Demo |

**Public methods**

| Method | Parameters |
|---|---|
| `run()` | `attSysId, emailSysId, withAi` |

**Private helpers:** `_flipDir`, `_refKey`

---

### `EmlFieldExtractor`

Best-effort deterministic extraction of settlement fields from a relevant email body (no LLM). Skips emails with real file attachments.

| | |
|---|---|
| Size | 46,212 characters, 860 lines |
| Accessible from | this application only (`package_private`) |
| Writes records | no — read-only |
| Called by | `AnalystScreen`, `DemoExtractor`, `OTC · Ingest Email`, `TaggingDashboard`, `WizardExtractor` |
| Used by widgets | OTC AI Extraction, OTC Analyst Screen |
| Tables | `counterparty`, `sys_attachment` |

**Public methods**

| Method | Parameters |
|---|---|
| `extract()` | `attachmentSysId, classification` |
| `extractAll()` | `attachmentSysId, classification` |
| `extractFromText()` | `raw, classification` |
| `mailContents()` | `attachmentSysId` |
| `emailDate()` | `attachmentSysId` |
| `threadState()` | `attachmentSysId, bodyText` |
| `isThreadMail()` | `attachmentSysId, bodyText` |
| `mailHtml()` | `attachmentSysId` |

**Private helpers:** `_fromEmail`, `_counterpartyOrg`, `_analyze`, `_emptyRow`, `_copyRow`, `_filledCount`, `_empty`, `_emptyAll`, `_readText`, `_counterparty`, `_decodeParts`, `_boundaryOf`, `_encodingOf`, `_decodeBody`, `_qp`, `_afterHeaders`, `_b64`, `_parseHtml`, `_parsePipe`, `_parseColon`, `_parseProse`, `_parseSwift`, `_parseCompact`, `_splitPipe`, `_stripTags`, `_clean`, `_norm`, `_field`, `_normDir`, `_findDate`, `_refFromSubject`, `_isSsiOnly`, `_ssiCurrency`, `_normDate`, `_decodeMime`, `_headerVal`, `_bodyText`, `_hasReplyHeaders`, `_hasQuotedHistory`, `_findHtmlPart`, `_sanitiseHtml`, `_safeAttrs`, `_postClean`, `_stripGatewayBanner`, `_decodeEntities`, `_findBodyPart`, `_headerEnd`, `_htmlToText`, `_cleanText`

---

### `EmlSenderClassifier`

Reads a dropped .eml attachment, extracts the sender domain, and returns Relevant / Irrelevant against the x_nose_nfotc_bsm.noise_domains property.

| | |
|---|---|
| Size | 3,790 characters, 102 lines |
| Accessible from | this application only (`package_private`) |
| Writes records | no — read-only |
| Called by | `OTC · Classify / Identify` |
| Tables | `sys_attachment` |
| System properties | `x_nose_nfotc_bsm.noise_domains` |

**Public methods**

| Method | Parameters |
|---|---|
| `classifyAttachment()` | `attachmentSysId` |

**Private helpers:** `_subject`, `_isReplyOrForward`, `_readText`, `_fromHeader`, `_domainOf`, `_isNoise`

---

### `ExtractionConfidence`

Per-field extraction confidence from grounding (value found in the source text) + validation (well-formed), with a stated reason per field. AI-only friendly (no second extractor).

| | |
|---|---|
| Size | 7,798 characters, 134 lines |
| Accessible from | this application only (`package_private`) |
| Writes records | no — read-only |
| Called by | `WizardExtractor` |
| Used by widgets | OTC AI Extraction |

**Public methods**

| Method | Parameters |
|---|---|
| `score()` | `fields, content` |

**Private helpers:** `_field`, `_grounded`, `_dateGrounded`, `_valid`

---

### `GenericFieldExtractor`

Runs a runtime extraction instruction against Chinou directly (global ChinouClient); no Now Assist. Single value or record set.

| | |
|---|---|
| Size | 21,257 characters, 369 lines |
| Accessible from | this application only (`package_private`) |
| Writes records | no — read-only |
| Calls | `ChinouClient`, `LlmUsage` |
| Called by | `Capabilities`, `PdfCashflowExtractor`, `WizardExtractor` |
| Used by widgets | OTC Wizard Builder |

**Public methods**

| Method | Parameters |
|---|---|
| `extract()` | `instruction, content, ctx` |
| `classifyMatch()` | `context, content, ctx` |
| `extractRecords()` | `instruction, content, ctx` |
| `extractRecordsBatch()` | `instruction, parts, ctx, cap` |

**Private helpers:** `_call`, `_collectChunks`, `_guarded`, `_parseRows`, `_isArray`, `_tryJson`, `_escapeControlChars`, `_unwrap`

---

### `Intake`

Create an NFOTC Work Item from any source (createWorkItem/populate, with source_ref dedup). The single intake seam for email/PDF/API/Outlook.

| | |
|---|---|
| Size | 2,245 characters, 49 lines |
| Accessible from | this application only (`package_private`) |
| Writes records | yes |
| Called by | `NFOTC · Create Work Item` |
| Tables | `work_item` |

**Public methods**

| Method | Parameters |
|---|---|
| `populate()` | `gr, sourceType, sourceRef, rawContent, workDriver` |
| `createWorkItem()` | `sourceType, sourceRef, rawContent, workDriver` |

**Private helpers:** `_number`

---

### `LangSmithTracer`

LangSmith Runs-API tracer — one batched, async POST /runs/batch per email (parent extraction run + child Chinou LLM run) with real cost/latency/tokens. Best-effort; off unless enabled+apikey+endpoint are set.

| | |
|---|---|
| Size | 13,666 characters, 236 lines |
| Accessible from | this application only (`package_private`) |
| Writes records | no — read-only |
| Called by | `AiFieldExtractor`, `PromptEnhancer`, `WizardExtractor` |
| System properties | `chinou.reg.id` |

**Public methods**

| Method | Parameters |
|---|---|
| `startRun()` | `name, inputs` |
| `logLlm()` | `parentRunId, r, prompt, completion, meta` |
| `endRun()` | `runId, outputs, errorMsg` |
| `ping()` | — |

**Private helpers:** `_flush`, `_send`, `_decideSample`, `_tokens`, `_pick`, `_num`, `_iso`, `_now`, `_uuid`

---

### `LlmUsage`

Per-call LLM metrics writer — records Chinou-reported cost, latency and tokens per invocation into x_nose_nfotc_bsm_llm_usage. Best-effort, never throws.

| | |
|---|---|
| Size | 5,808 characters, 107 lines |
| Accessible from | this application only (`package_private`) |
| Writes records | yes |
| Called by | `AiFieldExtractor`, `GenericFieldExtractor`, `PdfCashflowExtractor`, `PromptEnhancer`, `WizardExtractor` |
| Tables | `llm_usage` |

**Public methods**

| Method | Parameters |
|---|---|
| `record()` | `r, ctx` |
| `attach()` | `usageId, o` |

**Private helpers:** `_num`, `_int`, `_firstNum`, `_json`

---

### `NfotcConfig`

Two-tier configuration reader: per-driver wizard override -> system default (x_nose_nfotc_bsm_config) -> caller fallback. Makes matcher/classifier tolerances editable data, not code.

| | |
|---|---|
| Size | 5,899 characters, 139 lines |
| Accessible from | this application only (`package_private`) |
| Writes records | yes |
| Called by | `CompareMatch`, `PdfCashflowExtractor`, `WizardExtractor`, `XlsxCashflowExtractor` |
| Used by widgets | OTC Wizard Builder |
| Tables | `config`, `wizard` |
| Config keys | `match.vd_tol_days` |

**Public methods**

| Method | Parameters |
|---|---|
| `getNumber()` | `key, wizId, def` |
| `getString()` | `key, wizId, def` |
| `getBool()` | `key, wizId, def` |
| `all()` | — |
| `set()` | `sysId, value` |
| `forWizard()` | `wizId, groupFilter` |
| `setOverride()` | `wizId, key, value` |

**Private helpers:** `_sys`, `_wizOverride`, `_raw`

---

### `PdfCashflowExtractor`

Settlement PDF -> structured cashflow rows in one Chinou document call (Claude reads the PDF, incl. scanned). Reuses the Global ChinouClient.invokeDocument(); Sonnet 5 + 8192 tokens by default. Best-effort.

| | |
|---|---|
| Size | 22,810 characters, 373 lines |
| Accessible from | this application only (`package_private`) |
| Writes records | yes |
| Calls | `GenericFieldExtractor`, `NfotcConfig`, `WizardExtractor`, `ChinouClient`, `LlmUsage` |
| Called by | `WizardExtractor` |
| Tables | `sys_attachment`, `email` |
| Config keys | `pdf.max_tokens`, `pdf.model` |

**Public methods**

| Method | Parameters |
|---|---|
| `findPdf()` | `emlAttSysId, emailSysId` |
| `findAllPdfs()` | `emlAttSysId, emailSysId` |
| `extractCombined()` | `textContent, pdfDocs, instruction, ctx` |
| `extractRecords()` | `pdfInfo, instruction, ctx` |

**Private helpers:** `_dedupRows`, `_findAllPdfParts`, `_readText`, `_findPdfPart`, `_afterHeaders`, `_partFilename`, `_materialise`

---

### `PromptEnhancer`

Rewrites a custom field's extraction prompt by calling Chinou directly (global ChinouClient); no Now Assist.

| | |
|---|---|
| Size | 5,519 characters, 85 lines |
| Accessible from | this application only (`package_private`) |
| Writes records | no — read-only |
| Calls | `ChinouClient`, `LlmUsage`, `LangSmithTracer` |
| Used by widgets | OTC Wizard Builder |

**Public methods**

| Method | Parameters |
|---|---|
| `enhance()` | `draft, fieldName, mode` |

---

### `RowSegmenter`

Cashflow row boundaries in a mail body (line / block / flattened-HTML tables), plus time-based chunk planning for big multi-cashflow mails. Shared by chunked extraction and row-anchored highlighting.

| | |
|---|---|
| Size | 16,037 characters, 307 lines |
| Accessible from | this application only (`package_private`) |
| Writes records | no — read-only |
| Called by | `WizardExtractor` |
| Used by widgets | OTC AI Extraction |

**Public methods**

| Method | Parameters |
|---|---|
| `moneyCount()` | `s` |
| `segment()` | `text, html` |
| `planCalls()` | `dataCount, fieldCount, o` |
| `chunks()` | `seg, calls` |
| `windows()` | `text, seg` |

**Private helpers:** `_segmentText`, `_segmentBlocks`, `_validBounds`, `_segmentHtml`, `_rowText`, `_nil`

---

### `TaggingDashboard`

Renders the Outlook Tagging dashboard (Total Mails Assigned + activity table with Awaiting Confirmation/Review).

| | |
|---|---|
| Size | 41,065 characters, 609 lines |
| Accessible from | this application only (`package_private`) |
| Writes records | no — read-only |
| Calls | `EmlFieldExtractor`, `CompareMatch`, `AmountDirection` |
| Used by widgets | OTC Audit Trail, OTC Dashboard, OTC Wizard Dashboard |
| Used by UI Pages | `tagging` |
| Tables | `email`, `cashflow`, `sys_attachment` |

**Public methods**

| Method | Parameters |
|---|---|
| `render()` | — |
| `data()` | — |
| `dataAi()` | `wizId, readOnly` |

**Private helpers:** `_ad`, `_normDir`, `_flipDir`, `_countReview`, `_fmtElapsedText`, `_vdTagData`, `_toDispDate`, `_aiMatch`, `_countRelevant`, `_cashflows`, `_attId`, `_parseEmailDate`, `_fmtElapsed`, `_vdTag`, `_emailIso`, `_toIso`, `_v`, `_esc`, `_html`

---

### `ValueLocator`

Deterministic email highlighting: generates the plausible written forms of a stored value, anchors the cashflow to its row, and marks the located text in the mail HTML. Every mark must round-trip through the same normaliser that produced the value, so a wrong placement is impossible by construction.

| | |
|---|---|
| Size | 35,685 characters, 652 lines |
| Accessible from | this application only (`package_private`) |
| Writes records | no — read-only |
| Calls | `WizardExtractor` |
| Used by widgets | OTC AI Extraction |

**Public methods**

| Method | Parameters |
|---|---|
| `forms()` | `value, kind` |
| `findDirection()` | `hay, senderDir, from, to` |
| `findDirLegend()` | `hay` |
| `roundTrips()` | `found, value, kind, safe` |
| `findAll()` | `hay, value, kind, from, to` |
| `locate()` | `hay, cf, rows` |
| `lineWindows()` | `hay` |
| `htmlView()` | `html` |
| `markHtml()` | `html, view, marks, row` |
| `markText()` | `text, marks, row` |
| `markInline()` | `text, marks, row, noAnchor` |
| `subjectMarks()` | `subject, cf` |

**Private helpers:** `_n`, `_dateForms`, `_amountForms`, `_group`, `_dedupeForms`, `_firstToken`, `_absEq`, `_bounded`, `_longestNonOverlapping`, `_rowOf`, `_tieBreak`, `_anchorIndex`, `_cls`, `_title`, `_dropOverlaps`

---

### `WizardExtractor`

Re-runs AI extraction on dropped mails using a published wizard's per-field prompts and maps the results onto each cashflow's ai_* fields.

| | |
|---|---|
| Size | 50,491 characters, 821 lines |
| Accessible from | this application only (`package_private`) |
| Writes records | yes |
| Calls | `DemoExtractor`, `GenericFieldExtractor`, `AuditTrail`, `EmlFieldExtractor`, `LangSmithTracer`, `PdfCashflowExtractor`, `ExtractionConfidence`, `LlmUsage`, `NfotcConfig`, `RowSegmenter` |
| Called by | `OTC · Classify / Identify`, `OTC · Extract Fields`, `PdfCashflowExtractor`, `ValueLocator` |
| Used by widgets | OTC Wizard Builder, OTC Wizard Dashboard |
| Tables | `wizard`, `email`, `sys_attachment`, `cashflow` |
| System properties | `chinou.model.id`, `x_nose_nfotc_bsm.noise_domains` |

**Public methods**

| Method | Parameters |
|---|---|
| `syncWizard()` | `wizId` |
| `extractEmail()` | `wizId, emailId` |
| `identify()` | `wizId, emailId` |
| `routeForWizard()` | `wizId, emailId` |
| `validateField()` | `name, v` |

**Private helpers:** `_slug`, `_sid`, `_flipDir`, `_wizFields`, `_aiMeta`, `_persistClassification`, `_auditClassification`, `_ensureIngested`, `_splitList`, `_containsAny`, `_anyMatch`, `_isThreadMail`, `_isNoiseDomain`, `_processEmail`, `_normaliseCounterparty`, `_textExtract`, `_buildSources`, `_hlGroup`, `_buildInstruction`, `_clearFields`, `_applyRow`, `_signFromDirection`, `_normDate`, `_normCcy`, `_normDirection`, `_normAmount`, `_emlAtt`

---

### `XlsxCashflowExtractor`

Deterministic extraction of settlement cashflows from an Excel (.xlsx) attachment inside a dropped .eml. Auto-detects the cashflow sheet + header row and returns one flow per row (best-effort).

| | |
|---|---|
| Size | 35,521 characters, 652 lines |
| Accessible from | this application only (`package_private`) |
| Writes records | yes |
| Calls | `NfotcConfig` |
| Called by | `DemoExtractor` |
| Tables | `sys_attachment`, `email` |

**Public methods**

| Method | Parameters |
|---|---|
| `extract()` | `emlAttachmentSysId, emailRecordSysId` |

**Private helpers:** `_lim`, `_readText`, `_findAllExcelParts`, `_afterHeaders`, `_partFilename`, `_decodeMime`, `_materialise`, `_scanWorkbook`, `_label`, `_rawRows`, `_mapSsiHeaders`, `_ssiRows`, `_ssiFor`, `_assemble`, `_close`, `_rows`, `_cell`, `_mapHeaders`, `_dirFromAmount`, `_isNegative`, `_signed`, `_normDir`, `_absAmount`, `_normDate`, `_2`, `_mon`, `_b64str`

---

---

# 5. Flow Actions

Twenty-four Flow Actions, in three groups. An Action is a **typed contract** — declared inputs and
outputs, and a script step that delegates to a Script Include. Most are ten to twenty lines.

| Group | Count | Purpose |
|---|---:|---|
| the settlement pipeline | 7 | the Actions the intake subflow and the match flow run |
| `NFOTC ·` | 13 | the generic capability palette |
| CSG placeholders | 4 | demo steps that do no work |

Note that the settlement group is **not** the same as the `OTC ·` name prefix: `Compare & Match for Cashflow` carries no prefix but is the real match step of `OTC Match & Write-back`. Group Actions by what they call, not by what they are called.

**How to open one:** Studio → the application → **Automation → Action**.

## 5.1 The settlement pipeline

These are the Actions the intake subflow and the match flow actually run. Six carry the `OTC ·` prefix; `Compare & Match for Cashflow` does not, but belongs here — it is the step `OTC Match & Write-back` runs when an analyst confirms an extraction.

### `Compare & Match for Cashflow`

| | |
|---|---|
| Implementation | 32 lines |
| Delegates to | `CompareMatch`, `AuditTrail` |
| Tables | `cashflow`, `email` |

```javascript
(function execute(inputs, outputs) {
    var r = new x_nose_nfotc_bsm.CompareMatch().matchAndStore(inputs.cashflow_record);
    outputs.status = r.status || '';
    outputs.tier = '' + (r.tier || 0);
    outputs.bank_ref = r.bankRef || '';
    outputs.confidence = '' + Math.round(r.confidence || 0);   // r.confidence is already a 0-100 integer % — do NOT re-scale
    outputs.candidates = '' + (r.candidates || 0);

    // Audit the automated match (BRD §Audit / FSD §15) — the flow ran this, not the analyst.
    try {
        var cf = new GlideRecord('x_nose_nfotc_bsm_cashflow');
        if (cf.get(inputs.cashflow_record)) {
            var mailId = '', cp = '';
            var em = new GlideRecord('x_nose_nfotc_bsm_email');
            if (em.get(cf.getValue('email'))) { mailId = em.getValue('name'); cp = em.getValue('counterparty_name'); }
            new x_nose_nfotc_bsm.AuditTrail().log('match.computed', {
                entityType: 'cashflow', entityId: inputs.cashflow_record, cashflowId: inputs.cashflow_record, emailId: cf.getValue('email'),
                mailId: mailId, counterparty: cp, actor: 'system (Flow B)',
                summary: 'Flow ran Compare & Match after extraction confirmation: ' + (r.status || 'no_match') + (r.tier ? (' at Tier ' + r.tier) : ''),
    // ...
```

### `OTC · Classify / Identify`

| | |
|---|---|
| Implementation | 48 lines |
| Delegates to | `EmlSenderClassifier`, `WizardExtractor` |
| Tables | `email`, `sys_attachment` |

```javascript
(function execute(inputs, outputs) {
    var emailId = inputs.email_record;
    if (emailId && typeof emailId === 'object' && typeof emailId.getUniqueValue === 'function') { emailId = emailId.getUniqueValue(); }
    var g = new GlideRecord('x_nose_nfotc_bsm_email');
    if (!g.get(emailId)) { outputs.classification = 'relevant'; return; }
    var wizId = g.getValue('composed_run') || g.getValue('wiz_extracted') || '';

    // backfill sender from the .eml (needed by sender/noise rules + board + counterparty), if empty
    if (!g.getValue('sender')) {
        var attId = '', first = '';
        var ag = new GlideRecord('sys_attachment');
        ag.addQuery('table_name', 'x_nose_nfotc_bsm_email');
        ag.addQuery('table_sys_id', emailId);
        ag.orderBy('sys_created_on');
        ag.query();
        while (ag.next()) {
            var fn = ('' + ag.getValue('file_name')).toLowerCase();
            if (!first) { first = ag.getUniqueValue(); }
            if (/\.eml$/.test(fn) || ag.getValue('content_type') === 'message/rfc822') { attId = ag.getUniqueValue(); break; }
        }
        if (!attId) { attId = first; }
        if (attId) {
            try {
                var sc = new x_nose_nfotc_bsm.EmlSenderClassifier().classifyAttachment(attId);
                if (sc && sc.sender) { g.setValue('sender', sc.sender); g.update(); }
    // ...
```

### `OTC · Compare & Match`

| | |
|---|---|
| Implementation | 11 lines |
| Delegates to | `CompareMatch` |

```javascript
(function execute(inputs, outputs) {
    var r = new x_nose_nfotc_bsm.CompareMatch().matchEmail(inputs.email_record);
    outputs.matched = '' + (r.matched || 0);
    outputs.mismatch = '' + (r.mismatch || 0);
    outputs.no_match = '' + (r.no_match || 0);
})(inputs, outputs);
```

### `OTC · Extract Counterparty`

| | |
|---|---|
| Implementation | 27 lines |
| Delegates to | *nothing — the Action is the whole capability* |
| Tables | `email`, `counterparty` |

```javascript
(function execute(inputs, outputs) {
    var cp = '';
    var g = new GlideRecord('x_nose_nfotc_bsm_email');
    if (g.get(inputs.email_record)) {
        cp = g.getValue('counterparty_name') || '';
        if (!cp) {
            // Find the sender's email ADDRESS across BOTH sender and mail_from. Some mails fold the From
            // header across two lines, so `sender` (captured single-line) holds only the display name while
            // `mail_from` carries the address — search both so the EVE lookup always sees the address.
            var hay = ('' + (g.getValue('sender') || '') + ' ' + (g.getValue('mail_from') || '')).toLowerCase();
            var m = hay.match(/[a-z0-9._%+-]+@[a-z0-9.-]+/);
            var addr = m ? m[0] : '';
            if (addr) {
                var d = new GlideRecord('x_nose_nfotc_bsm_counterparty');
                d.addQuery('email_address', addr);
                d.query();
                if (d.next()) { cp = d.getValue('org_name'); g.setValue('counterparty_name', cp); g.update(); }
            }
        }
    }
    outputs.counterparty = cp;
})(inputs, outputs);
```

### `OTC · Extract Fields`

| | |
|---|---|
| Implementation | 22 lines |
| Delegates to | `WizardExtractor` |
| Tables | `email` |

```javascript
(function execute(inputs, outputs) {
    outputs.status = 'failed';
    outputs.cashflows = '0';
    try {
        if (inputs.classification === 'irrelevant') { outputs.status = 'skipped'; return; }
        var wizId = '';
        var g = new GlideRecord('x_nose_nfotc_bsm_email');
        if (g.get(inputs.email_record)) { wizId = g.getValue('composed_run') || g.getValue('wiz_extracted') || ''; }
        var r = new x_nose_nfotc_bsm.WizardExtractor().extractEmail(wizId, inputs.email_record);
        outputs.status = r.status || 'failed';
        outputs.cashflows = '' + (r.cashflows || 0);
    } catch (e) {
        // never throw — the subflow must reach its final step so async progress isn't left hanging
        outputs.status = 'error';
        gs.warn('[cap-extract-fields] ' + e);
    }
})(inputs, outputs);
```

### `OTC · Ingest Email`

| | |
|---|---|
| Implementation | 45 lines |
| Delegates to | `EmlFieldExtractor` |
| Tables | `email`, `sys_attachment` |

```javascript
(function execute(inputs, outputs) {
    outputs.mail_id = '';
    outputs.status = 'not_found';

    var emailId = inputs.email_record;
    var g = new GlideRecord('x_nose_nfotc_bsm_email');
    if (!g.get(emailId)) { return; }

    // resolve the raw .eml attachment sitting on this email record (prefer *.eml; else first attachment)
    var attId = '', first = '';
    var ag = new GlideRecord('sys_attachment');
    ag.addQuery('table_name', 'x_nose_nfotc_bsm_email');
    ag.addQuery('table_sys_id', emailId);
    ag.orderBy('sys_created_on');
    ag.query();
    while (ag.next()) {
        var fn = ('' + ag.getValue('file_name')).toLowerCase();
        if (!first) { first = ag.getUniqueValue(); }
        if (/\.eml$/.test(fn) || ag.getValue('content_type') === 'message/rfc822') { attId = ag.getUniqueValue(); break; }
    }
    if (!attId) { attId = first; }

    // parse headers + body into the record (materialise). Idempotent: only if not already parsed.
    if (attId && !g.getValue('mail_body')) {
        try {
            var m = new x_nose_nfotc_bsm.EmlFieldExtractor().mailContents(attId) || {};
            g.setValue('mail_to', m.to || '');
            g.setValue('mail_from', m.from || '');
            g.setValue('mail_cc', m.cc || '');
            g.setValue('mail_subject', m.subject || '');
            g.setValue('mail_body', m.body || '');
    // ...
```

### `OTC · Route / Write-back`

| | |
|---|---|
| Implementation | 23 lines |
| Delegates to | `AuditTrail` |
| Tables | `email` |

```javascript
(function execute(inputs, outputs) {
    var g = new GlideRecord('x_nose_nfotc_bsm_email');
    if (g.get(inputs.email_record)) {
        g.setValue('review_status', 'awaiting_review');
        g.update();
        outputs.status = 'routed';
        try {
            new x_nose_nfotc_bsm.AuditTrail().log('workflow.routed', {
                entityType: 'email', entityId: inputs.email_record, emailId: inputs.email_record,
                mailId: g.getValue('name'), counterparty: g.getValue('counterparty_name'), actor: 'system (Composed Flow)',
                summary: 'Composed workflow routed the mail for analyst review'
            });
        } catch (e) { /* audit best-effort */ }
    } else {
        outputs.status = 'not_found';
    }
})(inputs, outputs);
```


## 5.2 The capability palette — `NFOTC ·`

13 generic capabilities over a Work Item. All but one delegate to `Capabilities`, which dispatches on the capability key; `NFOTC · Create Work Item` delegates to `Intake` instead, because creating the Work Item is what the other twelve operate *on*. They exist so a work driver can be composed from typed steps in Flow Designer without writing code.

### `NFOTC · Calculate & Process`

| | |
|---|---|
| Implementation | 12 lines |
| Delegates to | `Capabilities` |

```javascript
(function execute(inputs, outputs) {
    var wiId = inputs.work_item;
    if (wiId && typeof wiId === 'object' && typeof wiId.getUniqueValue === 'function') { wiId = wiId.getUniqueValue(); }
    var config = { sum_field: inputs.sum_field || '' };
    var res = new x_nose_nfotc_bsm.Capabilities().run('calculate', wiId, config);
    outputs.status = res.status || '';
    outputs.output = res.output || '';
})(inputs, outputs);
```

### `NFOTC · Classify`

| | |
|---|---|
| Implementation | 18 lines |
| Delegates to | `Capabilities` |

```javascript
(function execute(inputs, outputs) {
    var wiId = inputs.work_item;
    if (wiId && typeof wiId === 'object' && typeof wiId.getUniqueValue === 'function') { wiId = wiId.getUniqueValue(); }
    var config = {
        keywords: inputs.keywords || '',
        subject: inputs.subject || '',
        exclusions: inputs.exclusions || '',
        context: inputs.context || '',
    };
    var res = new x_nose_nfotc_bsm.Capabilities().run('classify', wiId, config);
    outputs.status = res.status || '';
    outputs.output = res.output || '';
})(inputs, outputs);
```

### `NFOTC · Compare & Match`

| | |
|---|---|
| Implementation | 21 lines |
| Delegates to | `Capabilities` |

```javascript
(function execute(inputs, outputs) {
    var wiId = inputs.work_item;
    if (wiId && typeof wiId === 'object' && typeof wiId.getUniqueValue === 'function') { wiId = wiId.getUniqueValue(); }
    var parse = function (s, d) { try { return JSON.parse('' + (s || '')); } catch (e) { return d; } };
    var config = {
        mode: inputs.match_mode || 'golden',
        match_key: inputs.match_key || '',
        golden: parse(inputs.golden, []),
        fields: parse(inputs.fields, {}),
    };
    var res = new x_nose_nfotc_bsm.Capabilities().run('compare_match', wiId, config);
    outputs.status = res.status || '';
    outputs.output = res.output || '';
})(inputs, outputs);
```

### `NFOTC · Create Work Item`

| | |
|---|---|
| Implementation | 11 lines |
| Delegates to | `Intake` |

```javascript
(function execute(inputs, outputs) {
    var id = new x_nose_nfotc_bsm.Intake().createWorkItem(
        inputs.source_type, inputs.source_ref, inputs.raw_content, inputs.work_driver);
    outputs.work_item_id = id || '';
    outputs.status = id ? 'created' : 'skipped';
})(inputs, outputs);
```

### `NFOTC · Extract`

| | |
|---|---|
| Implementation | 12 lines |
| Delegates to | `Capabilities` |

```javascript
(function execute(inputs, outputs) {
    var wiId = inputs.work_item;
    if (wiId && typeof wiId === 'object' && typeof wiId.getUniqueValue === 'function') { wiId = wiId.getUniqueValue(); }
    var config = { instruction: inputs.instruction || '' };
    var res = new x_nose_nfotc_bsm.Capabilities().run('extract', wiId, config);
    outputs.status = res.status || '';
    outputs.output = res.output || '';
})(inputs, outputs);
```

### `NFOTC · Governance & Audit`

| | |
|---|---|
| Implementation | 11 lines |
| Delegates to | `Capabilities` |

```javascript
(function execute(inputs, outputs) {
    var wiId = inputs.work_item;
    if (wiId && typeof wiId === 'object' && typeof wiId.getUniqueValue === 'function') { wiId = wiId.getUniqueValue(); }
    var res = new x_nose_nfotc_bsm.Capabilities().run('audit', wiId, {});
    outputs.status = res.status || '';
    outputs.output = res.output || '';
})(inputs, outputs);
```

### `NFOTC · Human-in-the-Loop`

| | |
|---|---|
| Implementation | 12 lines |
| Delegates to | `Capabilities` |

```javascript
(function execute(inputs, outputs) {
    var wiId = inputs.work_item;
    if (wiId && typeof wiId === 'object' && typeof wiId.getUniqueValue === 'function') { wiId = wiId.getUniqueValue(); }
    var config = { review_form: inputs.review_form || '' };
    var res = new x_nose_nfotc_bsm.Capabilities().run('hitl', wiId, config);
    outputs.status = res.status || '';
    outputs.output = res.output || '';
})(inputs, outputs);
```

### `NFOTC · Ingest`

| | |
|---|---|
| Implementation | 12 lines |
| Delegates to | `Capabilities` |

```javascript
(function execute(inputs, outputs) {
    var wiId = inputs.work_item;
    if (wiId && typeof wiId === 'object' && typeof wiId.getUniqueValue === 'function') { wiId = wiId.getUniqueValue(); }
    var config = { source_type: inputs.source_type || '', source: inputs.source || '' };
    var res = new x_nose_nfotc_bsm.Capabilities().run('ingest', wiId, config);
    outputs.status = res.status || '';
    outputs.output = res.output || '';
})(inputs, outputs);
```

### `NFOTC · Monitor & Control`

| | |
|---|---|
| Implementation | 12 lines |
| Delegates to | `Capabilities` |

```javascript
(function execute(inputs, outputs) {
    var wiId = inputs.work_item;
    if (wiId && typeof wiId === 'object' && typeof wiId.getUniqueValue === 'function') { wiId = wiId.getUniqueValue(); }
    var config = { sla_hours: inputs.sla_hours || '' };
    var res = new x_nose_nfotc_bsm.Capabilities().run('monitor', wiId, config);
    outputs.status = res.status || '';
    outputs.output = res.output || '';
})(inputs, outputs);
```

### `NFOTC · Report & Notify`

| | |
|---|---|
| Implementation | 12 lines |
| Delegates to | `Capabilities` |

```javascript
(function execute(inputs, outputs) {
    var wiId = inputs.work_item;
    if (wiId && typeof wiId === 'object' && typeof wiId.getUniqueValue === 'function') { wiId = wiId.getUniqueValue(); }
    var config = { channel: inputs.channel || '', message: inputs.message || '' };
    var res = new x_nose_nfotc_bsm.Capabilities().run('report_notify', wiId, config);
    outputs.status = res.status || '';
    outputs.output = res.output || '';
})(inputs, outputs);
```

### `NFOTC · Route & Distribute`

| | |
|---|---|
| Implementation | 12 lines |
| Delegates to | `Capabilities` |

```javascript
(function execute(inputs, outputs) {
    var wiId = inputs.work_item;
    if (wiId && typeof wiId === 'object' && typeof wiId.getUniqueValue === 'function') { wiId = wiId.getUniqueValue(); }
    var config = { target: inputs.target || '', queue: inputs.queue || '' };
    var res = new x_nose_nfotc_bsm.Capabilities().run('route_distribute', wiId, config);
    outputs.status = res.status || '';
    outputs.output = res.output || '';
})(inputs, outputs);
```

### `NFOTC · Transform & Enrich`

| | |
|---|---|
| Implementation | 14 lines |
| Delegates to | `Capabilities` |

```javascript
(function execute(inputs, outputs) {
    var wiId = inputs.work_item;
    if (wiId && typeof wiId === 'object' && typeof wiId.getUniqueValue === 'function') { wiId = wiId.getUniqueValue(); }
    var parse = function (s, d) { try { return JSON.parse('' + (s || '')); } catch (e) { return d; } };
    var config = { mappings: parse(inputs.mappings, {}), flip_direction: inputs.flip_direction || '' };
    var res = new x_nose_nfotc_bsm.Capabilities().run('transform_enrich', wiId, config);
    outputs.status = res.status || '';
    outputs.output = res.output || '';
})(inputs, outputs);
```

### `NFOTC · Validate`

| | |
|---|---|
| Implementation | 13 lines |
| Delegates to | `Capabilities` |

```javascript
(function execute(inputs, outputs) {
    var wiId = inputs.work_item;
    if (wiId && typeof wiId === 'object' && typeof wiId.getUniqueValue === 'function') { wiId = wiId.getUniqueValue(); }
    var parse = function (s, d) { try { return JSON.parse('' + (s || '')); } catch (e) { return d; } };
    var config = { required: parse(inputs.required, []) };
    var res = new x_nose_nfotc_bsm.Capabilities().run('validate', wiId, config);
    outputs.status = res.status || '';
    outputs.output = res.output || '';
})(inputs, outputs);
```


## 5.3 CSG placeholders

**These do no work.** Their own header comment says so: *"CSG dummy capability — PLACEHOLDER ONLY (demo). Intentionally does NO real work."* They exist so the CSG entity-break subflow has steps to show. Do not extend them; they are not the pattern to copy.

### `Classify`

| | |
|---|---|
| Implementation | 10 lines |
| Delegates to | *nothing — the Action is the whole capability* |

```javascript
(function execute(inputs, outputs) {
    outputs.status = 'ok';
})(inputs, outputs);
```

### `Compare and Match`

| | |
|---|---|
| Implementation | 10 lines |
| Delegates to | *nothing — the Action is the whole capability* |

```javascript
(function execute(inputs, outputs) {
    outputs.status = 'ok';
})(inputs, outputs);
```

### `Extract Fields`

| | |
|---|---|
| Implementation | 10 lines |
| Delegates to | *nothing — the Action is the whole capability* |

```javascript
(function execute(inputs, outputs) {
    outputs.status = 'ok';
})(inputs, outputs);
```

### `Ingest Email`

| | |
|---|---|
| Implementation | 10 lines |
| Delegates to | *nothing — the Action is the whole capability* |

```javascript
(function execute(inputs, outputs) {
    outputs.status = 'ok';
})(inputs, outputs);
```

---

# 6. Flows and Subflows

Six records, in two kinds. A **subflow** is called by something else and returns outputs; a
**flow** runs on its own trigger.

| Name | Kind | Status | Purpose |
|---|---|---|---|
| **Ingest Dropped Email** | flow | published | On each .eml attached to a Mailbox Drop record: create one email record (Name = file name) and move the .eml onto it. |
| **NFOTC · Corporate Actions (pipeline)** | flow | published | Second work-driver pipeline, built entirely from the existing capability actions with different config + trigger condition — zero new capabilities/code. |
| **NFOTC · OTC Settlements (pipeline)** | flow | published | The OTC Compare & Match pipeline REPLICATED on the reusable capability platform (no bespoke code): Classify → Extract → Transform & Enrich (flip direction to … |
| **OTC Match & Write-back (Wizard-driven)** | flow | published | Flow B. On extraction confirmation (cashflow.ai_confirmed = true): run Compare & Match under the owning wizard’s config, persist + audit the outcome, and … |
| **CSG Entity Data - Intake (Subflow)** | subflow | published | DUMMY / PLACEHOLDER intake subflow for the CSG entity-data work-driver (demo only). |
| **OTC Settlement - Intake (Subflow)** | subflow | published | Callable intake orchestration (Ingest → Classify → Extract Counterparty → Extract Fields) for ONE email, using the owning wizard config from composed_run. |

**How to open one:** Studio → the application → **Automation → Flow** or **Subflow**.

The paragraph under each entry below is the flow record's **own description**, quoted as it stands so it matches what you see on the record. A few were written while the platform was being demonstrated and read that way.

## 6.1 Subflows

Called by something else — a flow, a board button or a script — and return outputs to their caller. A subflow cannot pause for a human.

### CSG Entity Data - Intake (Subflow)

| | |
|---|---|
| Kind | subflow |
| Internal name | `csg_intake_subflow` |
| Status | published |
| Runs as | system |
| Accessible from | all application scopes |

DUMMY / PLACEHOLDER intake subflow for the CSG entity-data work-driver (demo only). Runs generic no-op steps Ingest Email → Classify → Extract Fields → Compare and Match so CSG "Sync now" flows through a real, visible Workflow Studio subflow like OTC. The CSG board display is driven by the hardcoded EVE lookup, NOT by this subflow; nothing here is wired to real extraction / match. Marks the mail composed_state=done so the board can track progress.


### OTC Settlement - Intake (Subflow)

| | |
|---|---|
| Kind | subflow |
| Internal name | `otc_intake_subflow` |
| Status | published |
| Runs as | system |
| Accessible from | all application scopes |

Callable intake orchestration (Ingest → Classify → Extract Counterparty → Extract Fields) for ONE email, using the owning wizard config from composed_run. Invoked synchronously by the wizard board Sync via sn_fd.FlowAPI. Stops at Awaiting Confirmation (HITL); Compare & Match runs when the analyst confirms.


## 6.2 Flows

Run on their own trigger rather than being called.

### Ingest Dropped Email

| | |
|---|---|
| Kind | flow |
| Internal name | `ingest_dropped_email` |
| Status | published |
| Runs as | system |
| Accessible from | all application scopes |

On each .eml attached to a Mailbox Drop record: create one email record (Name = file name) and move the .eml onto it. Upload only — the OTC Settlement - Intake subflow does classify / counterparty / extract on Sync.


### NFOTC · Corporate Actions (pipeline)

| | |
|---|---|
| Kind | flow |
| Internal name | `nfotc__corporate_actions_pipeline` |
| Status | published |
| Runs as | system |
| Accessible from | all application scopes |

Second work-driver pipeline, built entirely from the existing capability actions with different config + trigger condition — zero new capabilities/code. Classify → Extract → Validate → Compare & Match → HITL (real pause) → Report → Route → Audit, in try/catch. Triggers on Work Item created where work_driver = Corporate Actions. Additive; OTC/CSG untouched.


### NFOTC · OTC Settlements (pipeline)

| | |
|---|---|
| Kind | flow |
| Internal name | `nfotc__otc_settlements_pipeline` |
| Status | published |
| Runs as | system |
| Accessible from | all application scopes |

The OTC Compare & Match pipeline REPLICATED on the reusable capability platform (no bespoke code): Classify → Extract → Transform & Enrich (flip direction to bank POV) → Validate → Compare & Match (TIERED — reuses the CompareMatch cascade against the bookings golden source) → Human-in-the-Loop (real pause until confirmed) → Report → Route → Audit, in try/catch. Triggered on Work Item created (work_driver OTC Settlements/empty). The real OTC demo is untouched; this proves the platform can do OTC.


### OTC Match & Write-back (Wizard-driven)

| | |
|---|---|
| Kind | flow |
| Internal name | `otc_match__writeback_wizarddriven` |
| Status | published |
| Runs as | system |
| Accessible from | all application scopes |

Flow B. On extraction confirmation (cashflow.ai_confirmed = true): run Compare & Match under the owning wizard’s config, persist + audit the outcome, and surface it for the analyst’s write-back. The visible back half of the OTC pipeline; triggered at the analyst checkpoint where Flow A ended.

---

# 7. Data model

Twelve tables. Every one is prefixed `x_nose_nfotc_bsm_`; the prefix is omitted in the headings below.

| Table | Label | Columns | Written by |
|---|---|---:|---|
| **`audit`** | OTC Audit Event | 34 | `AuditTrail` |
| **`booking`** | Bank Booking | 19 | `CompareMatch` |
| **`capability`** | NFOTC Capability | 20 | `CapabilityRegistry` |
| **`cashflow`** | OTC Cashflow | 44 | `AnalystScreen`, `CompareMatch`, `TaggingDashboard` … |
| **`config`** | OTC System Config | 12 | `NfotcConfig` |
| **`counterparty`** | Counterparty Directory | 9 | `EmlFieldExtractor` |
| **`email`** | NexAI OTC | 35 | `AccessGuard`, `AnalystScreen`, `CompareMatch` … |
| **`llm_usage`** | LLM Usage | 28 | `LlmUsage` |
| **`mailbox_drop`** | Mailbox Drop | 7 | — |
| **`wizard`** | OTC Wizard | 28 | `AccessGuard`, `NfotcConfig`, `WizardExtractor` |
| **`work_item`** | NFOTC Work Item | 17 | `Capabilities`, `Intake` |
| **`zip_drop`** | Zip Drop | 8 | — |

## `audit`

**OTC Audit Event** — full name `x_nose_nfotc_bsm_audit`

Touched by: `AuditTrail`

| Column | Label | Type | Notes |
|---|---|---|---|
| `actor` | Actor | string | max 100 |
| `after_state` | After (JSON) | string | max 4000 |
| `ai_attributes` | AI Attributes (JSON) | string | max 4000 |
| `ai_component` | AI Component | string | max 30 |
| `ai_confidence` | Confidence (numeric %) | string | max 6 |
| `ai_label` | AI Label | string | max 40 |
| `ai_value` | AI Recommended | string | max 1000 |
| `analyst_value` | Analyst Value | string | max 1000 |
| `before_state` | Before (JSON) | string | max 4000 |
| `cashflow_id` | Cashflow (sys_id) | string | max 32 |
| `confidence_level` | Confidence Level | string | max 10 |
| `config_key` | Config Key | string | max 100 |
| `config_new` | Config New Value | string | max 1000 |
| `config_old` | Config Old Value | string | max 1000 |
| `counterparty` | Counterparty | string | max 100 |
| `effective_from` | Effective From | string | max 40 |
| `email_id` | Email (sys_id) | string | max 32 |
| `entity_id` | Entity (sys_id) | string | max 32 |
| `entity_type` | Entity Type | string | max 20 |
| `event_type` | Event Type | string | max 40 |
| `field_name` | Field | string | max 60 |
| `input_hash` | Input Hash | string | max 40 |
| `mail_id` | Mail Id | string | max 120 |
| `model_version` | Model Version | string | max 80 |
| `product` | Product | string | max 60 |
| `prompt_hash` | Prompt Hash | string | max 40 |
| `prompt_ref` | Prompt Reference | string | max 120 |
| `summary` | Summary | string | max 500 |

*Plus the platform columns: `sys_id`, `sys_created_on`, `sys_created_by`, `sys_updated_on`, `sys_updated_by`, `sys_mod_count`.*

## `booking`

**Bank Booking** — full name `x_nose_nfotc_bsm_booking`

Touched by: `CompareMatch`

| Column | Label | Type | Notes |
|---|---|---|---|
| `amount` | Amount | decimal |  |
| `bank_trade_ref` | Bank Trade Ref | string | max 40 |
| `cashflow_id` | Cashflow Id | string | max 20 |
| `cashflow_type` | Cashflow Type | string | max 40 |
| `counterparty_entity` | Counterparty Entity | string | max 160 |
| `counterparty_org_name` | Counterparty | string | max 100 |
| `counterparty_trade_ref` | Counterparty Trade Ref | string | max 40 |
| `currency` | Currency | string | max 10 |
| `direction` | Direction | string | max 20 |
| `product_type` | Product Type | string | max 60 |
| `status` | Status | string | max 30 |
| `trade_system` | Trade System | string | max 40 |
| `value_date` | Value Date | string | max 20 |

*Plus the platform columns: `sys_id`, `sys_created_on`, `sys_created_by`, `sys_updated_on`, `sys_updated_by`, `sys_mod_count`.*

## `capability`

**NFOTC Capability** — full name `x_nose_nfotc_bsm_capability`

Touched by: `CapabilityRegistry`

| Column | Label | Type | Notes |
|---|---|---|---|
| `active` | Active | string | max 5 |
| `cap_type` | Type | choice | default `pipeline` |
| `capability_name` | Name | string | max 100 |
| `category` | Category | string | max 60 |
| `config_schema` | Config Schema (JSON) | string | max 4000 |
| `consumes` | Consumes (JSON) | string | max 2000 |
| `description` | Description | string | max 1000 |
| `flags` | Flags (JSON) | string | max 500 |
| `impl` | Implementation | string | max 200 |
| `key` | Key | string | max 60 |
| `owner` | Owner | string | max 100 |
| `produces` | Produces (JSON) | string | max 2000 |
| `seq` | Order | integer |  |
| `version` | Version | string | max 20 |

*Plus the platform columns: `sys_id`, `sys_created_on`, `sys_created_by`, `sys_updated_on`, `sys_updated_by`, `sys_mod_count`.*

## `cashflow`

**OTC Cashflow** — full name `x_nose_nfotc_bsm_cashflow`

Touched by: `AnalystScreen`, `CompareMatch`, `TaggingDashboard`, `WizardExtractor`, `Compare & Match for Cashflow` (Action)

| Column | Label | Type | Notes |
|---|---|---|---|
| `ai_amount` | AI Amount | string | max 40 |
| `ai_analyst_outcome` | AI Analyst Outcome | string | max 20 |
| `ai_candidate_count` | AI Candidate Count | string | max 6 |
| `ai_confirmed` | AI Confirmed | string | max 10 |
| `ai_counterparty` | AI Counterparty | string | max 100 |
| `ai_currency` | AI Currency | string | max 20 |
| `ai_direction` | AI Direction | string | max 20 |
| `ai_match_booking` | AI Match Booking (bank ref) | string | max 60 |
| `ai_match_computed` | AI Match Computed | string | max 10 |
| `ai_match_confidence` | AI Match Confidence (%) | string | max 6 |
| `ai_match_status` | AI Match Status | string | max 20 |
| `ai_match_tier` | AI Match Tier | string | max 4 |
| `ai_mo_sent` | AI Sent to Middle Office | string | max 10 |
| `ai_model` | AI Model | string | max 60 |
| `ai_nomura_entity` | AI Nomura Entity | string | max 100 |
| `ai_product` | AI Product | string | max 60 |
| `ai_reference` | AI Reference | string | max 60 |
| `ai_resolution` | AI Resolution | string | max 20 |
| `ai_review_confirmed` | AI Review Confirmed | string | max 10 |
| `ai_selected_booking` | AI Selected Booking (bank ref) | string | max 60 |
| `ai_sources` | AI Source Snippets (JSON) | string | max 8000 |
| `ai_ssi_account` | AI SSI Account | string | max 60 |
| `ai_ssi_bank` | AI SSI Bank | string | max 120 |
| `ai_ssi_beneficiary` | AI SSI Beneficiary | string | max 120 |
| `ai_ssi_intermediary` | AI SSI Intermediary | string | max 120 |
| `ai_trade_date` | AI Trade Date | string | max 20 |
| `ai_value_date` | AI Value Date | string | max 20 |
| `amount` | Amount | string | max 40 |
| `analyst_outcome` | Analyst Outcome | string | max 20 |
| `confirmed` | Confirmed | string | max 10 |
| `currency` | Currency | string | max 20 |
| `direction` | Direction | string | max 20 |
| `email` | Email | reference | → `email` |
| `flow_index` | Flow # | integer |  |
| `reference` | Trade Reference | string | max 60 |
| `resolution` | Resolution | string | max 20 |
| `review_confirmed` | Review Confirmed | string | max 10 |
| `value_date` | Value Date | string | max 20 |

*Plus the platform columns: `sys_id`, `sys_created_on`, `sys_created_by`, `sys_updated_on`, `sys_updated_by`, `sys_mod_count`.*

## `config`

**OTC System Config** — full name `x_nose_nfotc_bsm_config`

Touched by: `NfotcConfig`

| Column | Label | Type | Notes |
|---|---|---|---|
| `config_group` | Group | choice | default `matching` |
| `description` | Description | string | max 500 |
| `key` | Key | string | max 80 |
| `label` | Label | string | max 120 |
| `type` | Type | choice | default `number` |
| `value` | Value | string | max 400 |

*Plus the platform columns: `sys_id`, `sys_created_on`, `sys_created_by`, `sys_updated_on`, `sys_updated_by`, `sys_mod_count`.*

## `counterparty`

**Counterparty Directory** — full name `x_nose_nfotc_bsm_counterparty`

Touched by: `EmlFieldExtractor`, `OTC · Extract Counterparty` (Action)

| Column | Label | Type | Notes |
|---|---|---|---|
| `email_address` | Email Address | string | max 255 |
| `entity` | Counterparty Entity | string | max 160 |
| `org_name` | Counterparty Org Name | string | max 100 |

*Plus the platform columns: `sys_id`, `sys_created_on`, `sys_created_by`, `sys_updated_on`, `sys_updated_by`, `sys_mod_count`.*

## `email`

**NexAI OTC** — full name `x_nose_nfotc_bsm_email`

Touched by: `AccessGuard`, `AnalystScreen`, `CompareMatch`, `PdfCashflowExtractor`, `TaggingDashboard`, `WizardExtractor`, `XlsxCashflowExtractor`, `Compare & Match for Cashflow` (Action), `OTC · Classify / Identify` (Action), `OTC · Extract Counterparty` (Action), `OTC · Extract Fields` (Action), `OTC · Ingest Email` (Action), `OTC · Route / Write-back` (Action)

| Column | Label | Type | Notes |
|---|---|---|---|
| `ai_amount` | AI Amount | string | max 40 |
| `ai_currency` | AI Currency | string | max 20 |
| `ai_direction` | AI Direction | string | max 20 |
| `ai_flow_count` | AI Flow Count | string | max 10 |
| `ai_reference` | AI Reference | string | max 60 |
| `ai_result` | AI Raw JSON | string | max 8000 |
| `ai_status` | AI Status | string | max 30 |
| `ai_summary` | AI Summary (flow 1) | string | max 500 |
| `ai_value_date` | AI Value Date | string | max 20 |
| `classification` | Classification | choice | `relevant`, `irrelevant` or `demo`, and empty before classification. `demo` is written by the demo widget precisely because it is not `relevant`, which keeps demo mail off every dashboard |
| `classification_reason` | Classification Reason | string | max 40, why the classification was reached — see the reason table in §2.4 |
| `classified_by` | Classified By | string | max 60 |
| `composed_run` | Composed run (wizard sys_id) | string | max 32 |
| `composed_state` | Composed State | string | max 20 |
| `counterparty_name` | Counterparty Name | string | max 100 |
| `extraction_status` | Extraction Status | choice | `partial` when the completeness guard finds fewer rows than expected; cleared back to empty on a later complete run. No other value is written |
| `mail_body` | Mail Body | string | max 8000 |
| `mail_cc` | Mail Cc | string | max 255 |
| `mail_from` | Mail From | string | max 255 |
| `mail_subject` | Mail Subject | string | max 255 |
| `mail_to` | Mail To | string | max 255 |
| `name` | Email File Name | string | max 255 |
| `review_status` | Review Status | choice | default `awaiting_confirmation`, `awaiting_confirmation` (default) until an analyst confirms, then `awaiting_review` |
| `sender` | Sender | string | max 255 |
| `source` | Source | string | max 40, default `Email Drop` |
| `thread_state` | Thread State | string | max 10 |
| `wiz_assigned` | Wizard assigned (sys_id) | string | max 32 |
| `wiz_extracted` | Wizard-extracted by (sys_id) | string | max 32 |
| `wiz_intake_state` | Intake State | string | max 30 |

*Plus the platform columns: `sys_id`, `sys_created_on`, `sys_created_by`, `sys_updated_on`, `sys_updated_by`, `sys_mod_count`.*

## `llm_usage`

**LLM Usage** — full name `x_nose_nfotc_bsm_llm_usage`

Touched by: `LlmUsage`

| Column | Label | Type | Notes |
|---|---|---|---|
| `capability` | Capability | string | max 40 |
| `cashflow_count` | Cashflows Produced | integer |  |
| `cashflow_id` | Cashflow (sys_id) | string | max 32 |
| `cashflow_ids` | Cashflows (sys_ids) | string | max 4000 |
| `chinou_ms` | Chinou Exec (ms) | string | max 20 |
| `correlation_id` | Correlation Id | string | max 40 |
| `cost_usd` | Cost (USD) | string | max 24 |
| `driver` | Work Driver | string | max 60 |
| `email_id` | Email (sys_id) | string | max 32 |
| `error` | Error / Block Reason | string | max 500 |
| `field_name` | Field | string | max 60 |
| `input_tokens` | Input Tokens | integer |  |
| `mail_id` | Mail Id | string | max 120 |
| `metrics_json` | Metrics (raw JSON) | string | max 4000 |
| `model` | Model | string | max 80 |
| `output_tokens` | Output Tokens | integer |  |
| `prompt_chars` | Prompt Chars | integer |  |
| `response_chars` | Response Chars | integer |  |
| `roundtrip_ms` | Round-trip (ms) | string | max 20 |
| `status` | Status | string | max 20 |
| `success` | Success | string | max 5 |
| `total_tokens` | Total Tokens | integer |  |

*Plus the platform columns: `sys_id`, `sys_created_on`, `sys_created_by`, `sys_updated_on`, `sys_updated_by`, `sys_mod_count`.*

## `mailbox_drop`

**Mailbox Drop** — full name `x_nose_nfotc_bsm_mailbox_drop`

| Column | Label | Type | Notes |
|---|---|---|---|
| `name` | Name | string | max 100, default `Inbox` |

*Plus the platform columns: `sys_id`, `sys_created_on`, `sys_created_by`, `sys_updated_on`, `sys_updated_by`, `sys_mod_count`.*

## `wizard`

**OTC Wizard** — full name `x_nose_nfotc_bsm_wizard`

Touched by: `AccessGuard`, `NfotcConfig`, `WizardExtractor`

| Column | Label | Type | Notes |
|---|---|---|---|
| `activity` | Activity | string | max 40 |
| `assigned_count` | Assigned Count | integer |  |
| `assigned_users` | Assigned Users (JSON) | string | max 8000 |
| `bu` | BU | string | max 40 |
| `config_overrides` | Config Overrides (JSON) | string | max 4000 |
| `description` | Description | string | max 4000 |
| `frequency` | Frequency | string | max 20 |
| `id_rules` | Email Identification Rules (JSON) | string | max 8000 |
| `ingestion_type` | Ingestion Type | string | max 20 |
| `input_fields` | Input Fields (JSON) | string | max 8000 |
| `input_format` | Input Format | string | max 20 |
| `mailbox` | Mailbox | string | max 120 |
| `mapping` | Mapping (JSON) | string | max 8000 |
| `name` | Name | string | max 100 |
| `service` | Service | string | max 60 |
| `status` | Status | string | max 20 |
| `sub_bu` | Sub BU | string | max 60 |
| `tagging` | Outlook Tagging (JSON) | string | max 8000 |
| `target_system` | Target System | string | max 40 |
| `version` | Version | string | max 10 |
| `work_driver` | Work Driver | string | max 80 |
| `writeback` | Analyst Writeback (JSON) | string | max 4000 |

*Plus the platform columns: `sys_id`, `sys_created_on`, `sys_created_by`, `sys_updated_on`, `sys_updated_by`, `sys_mod_count`.*

## `work_item`

**NFOTC Work Item** — full name `x_nose_nfotc_bsm_work_item`

Touched by: `Capabilities`, `Intake`

| Column | Label | Type | Notes |
|---|---|---|---|
| `classification` | Classification | string | max 40 |
| `enrichments` | Enrichments (JSON) | string | max 4000 |
| `match_result` | Match Result (JSON) | string | max 4000 |
| `raw_content` | Raw Content | string | max 8000 |
| `source_ref` | Source Ref | string | max 400 |
| `source_type` | Source Type | string | max 40 |
| `structured` | Structured (JSON) | string | max 8000 |
| `trace` | Trace (JSON) | string | max 8000 |
| `wi_number` | Number | string | max 40 |
| `wi_status` | Status | choice | default `new` |
| `work_driver` | Work Driver | string | max 100 |

*Plus the platform columns: `sys_id`, `sys_created_on`, `sys_created_by`, `sys_updated_on`, `sys_updated_by`, `sys_mod_count`.*

## `zip_drop`

**Zip Drop** — full name `x_nose_nfotc_bsm_zip_drop`

| Column | Label | Type | Notes |
|---|---|---|---|
| `name` | Name | string | max 200, default `Zip Drop` |
| `notes` | Notes | string | max 1000 |

*Plus the platform columns: `sys_id`, `sys_created_on`, `sys_created_by`, `sys_updated_on`, `sys_updated_by`, `sys_mod_count`.*

---

# 8. User interface

The analyst and manager experience is Service Portal. Sixteen widgets, fifteen pages, one portal.

## 8.1 Widgets

| Widget | ID | Server script | Uses |
|---|---|---:|---|
| OTC AI Dashboard | `nfotcbsm-ai-dashboard` | 1,003 | `AccessGuard`, `CompareMatch` |
| OTC AI Extraction | `nfotcbsm-ai-extraction` | 41,401 | `AccessGuard`, `AmountDirection`, `AuditTrail`, `CompareMatch`, `DemoExtractor`, `EmlFieldExtractor`, `ExtractionConfidence`, `RowSegmenter`, `ValueLocator` |
| OTC AI Usage & Cost | `nfotcbsm-llm-usage` | 10,110 | `AccessGuard`, `CompareMatch` |
| OTC Analyst Screen | `nfotcbsm-analyst` | 22,867 | `AccessGuard`, `CompareMatch`, `EmlFieldExtractor` |
| OTC Audit Trail | `nfotcbsm-audit` | 9,372 | `AccessGuard`, `CompareMatch`, `TaggingDashboard` |
| OTC Blank Footer | `nfotcbsm-blank-footer` | 109 | — |
| OTC Blank Header | `nfotcbsm-blank-header` | 109 | — |
| OTC Compare & Match | `nfotcbsm-compare` | 2,415 | `AccessGuard`, `CompareMatch` |
| OTC Console Login | `nfotcbsm-login` | 3,432 | — |
| OTC Dashboard | `nfotcbsm-dashboard` | 1,462 | `AccessGuard`, `TaggingDashboard` |
| OTC Email Extraction Demo | `nfotcbsm-demo` | 5,527 | `AccessGuard`, `CompareMatch`, `DemoExtractor` |
| OTC Manager Dashboard | `nfotcbsm-manager` | 7,541 | `AccessGuard`, `CompareMatch` |
| OTC Wizard Builder | `nfotcbsm-wizard-builder` | 52,577 | `AccessGuard`, `CompareMatch`, `GenericFieldExtractor`, `NfotcConfig`, `PromptEnhancer`, `WizardExtractor` |
| OTC Wizard Dashboard | `nfotcbsm-wiz-dashboard` | 17,413 | `AccessGuard`, `CompareMatch`, `TaggingDashboard`, `WizardExtractor` |
| OTC Wizard List | `nfotcbsm-wizard-list` | 9,092 | `AccessGuard`, `CompareMatch` |
| OTC Work Drivers | `nfotcbsm-work-drivers` | 3,138 | `AccessGuard`, `CompareMatch` |

## 8.2 Portal pages

| Page | ID |
|---|---|
| OTC AI Dashboard | `bsm_ai_dashboard` |
| OTC AI Extraction | `bsm_ai_extraction` |
| OTC Dashboard | `bsm_analystdashboard` |
| Compare & Match | `bsm_comparematch` |
| AI Usage & Cost | `bsm_llm_usage` |
| Manager Dashboard | `bsm_manager_dashboard` |
| OTC Analyst Screen | `bsm_nfotc_analyst` |
| Audit Trail | `bsm_nfotc_audit` |
| Email Extraction Demo | `bsm_nfotc_demo` |
| NexAI OTC | `bsm_nfotc_home` |
| Sign in · NexAI OTC | `bsm_nfotc_login` |
| OTC Settlements | `bsm_nfotc_wiz_dash` |
| Wizard Builder | `bsm_wizard_builder` |
| Onboarding Wizards | `bsm_wizard_list` |
| Work Drivers | `bsm_work_drivers` |

## 8.3 Portal

| | |
|---|---|
| Title | NexAI OTC |
| URL | `/nexai` |
| Homepage | `bsm_nfotc_home` — NexAI OTC |
| Portal name hidden | yes |

The portal record is the **wrapper** — theme, header, menu and homepage. The same page
can be placed inside a different portal record to present it without that chrome, which is
how a bare view is produced without altering the widget or the page.

## 8.4 Application menu

| Module | Table / link |
|---|---|
| Analyst Screen (BSM) | DIRECT |
| Dashboard (BSM) | DIRECT |
| Zip Drop (BSM) | `x_nose_nfotc_bsm_zip_drop` |
| Mailbox Drop (BSM) | `x_nose_nfotc_bsm_mailbox_drop` |
| NexAI OTC — All (BSM) | `x_nose_nfotc_bsm_email` |
| Cashflows — All (BSM) | `x_nose_nfotc_bsm_cashflow` |
| Settlement Emails Relevant (BSM) | `x_nose_nfotc_bsm_email` |
| Noise Irrelevant (BSM) | `x_nose_nfotc_bsm_email` |

## 8.5 UI Pages

| Page | Description |
|---|---|
| `analyst` | NexAI OTC — analyst screen (mail contents + extracted fields). |
| `compare` | NexAI OTC — Compare & Match (email cashflows vs bank booking golden source). |
| `tagging` | NexAI OTC — Outlook Tagging dashboard. |

---

# 9. Cross-cutting concerns

## 9.1 Configuration

Behaviour is tuned through the **`config`** table rather than code. `NfotcConfig` resolves each key in
three steps, stopping at the first that answers:

```
per-work-driver override  →  the config table  →  the caller's fallback
```

The per-driver override lives in `config_overrides` on the work driver record, as JSON. So one desk can
run wider tolerances than another without a release, and a key that has never been set still behaves
because the calling code supplied a default.

### Extraction keys

| Key | Default | What it controls |
|---|---|---|
| `extract.chunk_threshold` | `12` | A mail with at least this many cashflow rows is split across several concurrent calls instead of one. |
| `extract.chunk_budget_s` | `15` | Target duration of **one** chunk call. Half the response-wait ceiling, leaving headroom. |
| `extract.chunk_overhead_s` | `9` | Measured fixed cost of any model call before the first row is produced. Subtracted from the budget when planning. |
| `extract.chunk_sec_per_row` | `0` | Per-row cost. `0` means derive it from the field count. |
| `extract.chunk_cap` | `4` | How many chunk calls are in flight at once. |
| `extract.chunk_html_fallback` | `1` | When the plain-text table has been flattened onto one line, read row boundaries from the HTML part instead. |

> **`extract.chunk_cap` is the key most likely to need tuning.** Raising it finishes a large mail
> sooner but puts more calls in the queue at the same time, and concurrent calls wait on one another —
> the *first* chunk of a wave waits longest, so it is the one that fails when the ceiling is reached.
> Lowering it trades wall-clock for reliability. Change it per environment.

### Matching keys

| Key | Default | What it controls |
|---|---|---|
| `match.vd_tol_days` | `2` | Tier 2 value-date window, ± N **business** days. Weekends are skipped; bank holidays are not — see §11. |
| `match.t2_amt_abs` | `50.0` | Tier 2 amount tolerance, in **raw currency units**. |
| `match.name_fuzzy_pct` | `0.85` | Tier 2 counterparty-name similarity threshold, 0–1. |

### Spreadsheet keys

(These carry `config_group = extraction` on the record, like the extraction keys above — they are
separated here for reading, not by group.)

| Key | Default | What it controls |
|---|---|---|
| `xlsx.max_rows` | `400` | Most rows of one sheet handed to the model. Hitting it is logged as a truncation. |
| `xlsx.max_cols` | `40` | Most columns of one sheet. |
| `xlsx.max_chars_sheet` | `40000` | Character ceiling for one sheet block. |
| `xlsx.max_chars_total` | `100000` | Character ceiling across every sheet of every attachment. |

### Document keys — **no row exists for these**

| Key | Code default | What it controls |
|---|---|---|
| `pdf.model` | `anthropic-5-sonnet[Bedrock]` | Which model reads a PDF. The document path may warrant a different model from the text path. |
| `pdf.max_tokens` | `8192` | Output ceiling for a document call. Too low truncates a long PDF mid-answer, which surfaces as a parse failure rather than a clear error. |

> **These two are read by `PdfCashflowExtractor` but have no row in the `config` table**, so they are
> invisible to anyone browsing it — the code default is what applies. Insert a row to change either, or
> set a per-driver override. Everything else in this section has a row.

**Where to change them:** the `config` table directly for a system default, or the work driver's
**Config Overrides** for one driver. `NfotcConfig.setOverride(wizId, key, value)` does the latter
programmatically.

## 9.2 System properties

Eight properties belong to the application, all prefixed `x_nose_nfotc_bsm.`. Unlike the config table
these are **instance-wide** — there is no per-driver override.

One further property is *read* but not owned: `WizardExtractor` reads **`chinou.model.id`**, which is
unprefixed and global to the instance. It has no record in this application, so changing it affects
every consumer on the instance, not only this application.

| Property | Purpose |
|---|---|
| `noise_domains` | Comma-separated sender domains treated as noise. Mail from them is classified irrelevant with reason `noise_domain`. Subdomains match too. |
| `demo_users` | Comma-separated user names who get the Manager/Analyst view toggle and appear in the analyst picker. See §9.4. |
| `langsmith.enabled` | Master on/off for tracing. |
| `langsmith.endpoint` | Base URL of the trace collector. The tracer appends the batch path. |
| `langsmith.project` | Project name that runs are grouped under. |
| `langsmith.apikey` | Credential for the collector. **Treat as a secret** — do not export it in an update set or quote it in a ticket. |
| `langsmith.midserver` | MID server used to reach the collector, which is on the internal network. **This value is environment-specific and must be corrected when the application is moved.** |
| `langsmith.sample_pct` | Percentage of traces sent, 0–100. |

## 9.3 The audit trail

Three separate mechanisms record three different things. They are complementary, and a developer should
know which answers which question.

### The application's own event store — `audit` table

The primary trail. **Append-only**: `AuditTrail.log()` only ever inserts, never updates or deletes, so
a recorded decision cannot be revised.

It is an **instance** method — every call site reads
`new x_nose_nfotc_bsm.AuditTrail().log(…)`, and because the class is `package_private`, a caller in
another scope (a Global Business Rule, for instance) must qualify it exactly that way.

```
new AuditTrail().log(eventType, {
    entityType, entityId, emailId, cashflowId, mailId, counterparty,
    summary, fieldName, aiValue, analystValue,
    actor, aiComponent, product, effectiveFrom,
    ai: { model_version, prompt_ref, prompt_hash, input_hash,
          label, status, confidence, confidence_level },
    before, after, configKey, configOld, configNew
})
```

`ai.label` falls back to `ai.status` when no label is supplied. Every key above has its own column on
the `audit` table.

The AI attributes are promoted out of the JSON blob into their own indexed columns, so a question like
*which prompt version produced this* can be answered with a list filter rather than a script.

`AuditTrail.hash(str)` produces a deterministic fingerprint of an input — stored instead of the full
text, so a prompt or payload can be identified later without duplicating it in the trail. It is a djb2
hash returning `djb2:<hex>:<length>`: adequate for *"is this the same prompt as that one"*, and
**not a cryptographic digest** — do not rely on it to prove a payload has not been altered.

**Event types written today — eleven, from three different kinds of caller:**

| Event | Written by | When |
|---|---|---|
| `classification.decided` | `WizardExtractor` | a classification is reached, relevant or not, with the reason. **Board path only** — see §2.4 |
| `cashflow.extracted` | `WizardExtractor` | one per cashflow produced |
| `match.computed` | `CompareMatch`, and the `Compare & Match for Cashflow` Action | the tiered cascade ran automatically — tier, candidates and outcome |
| `workflow.routed` | `OTC · Route / Write-back` | the write-back step staged its outcome |
| `extraction.overridden` | `OTC AI Extraction` widget | an analyst changed an extracted value |
| `extraction.confirmed` | `OTC AI Extraction` widget | an analyst accepted the extraction |
| `match.confirmed` | `OTC AI Extraction` widget | an analyst accepted a match |
| `match.selected` | `OTC AI Extraction` widget | an analyst chose among candidates |
| `match.no_match` | `OTC AI Extraction` widget | an analyst recorded no match |
| `writeback` | `OTC AI Extraction` widget | write-back requested |
| `writeback.mo` | `OTC AI Extraction` widget | middle-office write-back requested |

The seven widget events all go through one local helper, `auditCf()`, inside the
**OTC AI Extraction** widget — which is why the analyst's half of the trail is written from the portal
rather than from a Flow Action.

> A mail that classifies as relevant but yields **no** cashflows writes no `cashflow.extracted` event,
> so nothing marks the attempt. To find those, compare the email list against the cashflow table, or
> add an event at the end of `_processEmail`.

### Native record auditing — `sys_audit`

Ticking **Audit** on a table's *collection-level* dictionary entry makes the platform record one
`sys_audit` row per changed field per update, and a `sys_audit_delete` row on deletion. This is
per-field history, and it is what the History view reads.

Two properties to know: it is **not retrospective** — the trail starts when the box is ticked — and it
appears at table and record level, not in the portal.

The dictionary entry is a **protected platform record**, so it can only be changed from the Global
application, never from inside a scoped one.

### Flow execution history

Flow Designer records each run: every step, its inputs and outputs, and timings. This is where to look
to debug *what executed*. It is not a substitute for the event store — it is purged on a schedule, it is
organised per run rather than per record, and it captures step outputs rather than reasons.

| Question | Look at |
|---|---|
| what executed, and did it fail | flow execution history |
| what was decided, and why | the `audit` table |
| what changed on this record, and who changed it | `sys_audit` (History → Record) |

## 9.4 Security

### Roles

| Role | Intended holder |
|---|---|
| `x_nose_nfotc_bsm.analyst` | runs published work drivers, confirms and writes back |
| `x_nose_nfotc_bsm.manager` | builds and configures work-driver onboarding |

### Three things gate access, not one

A common source of confusion: **holding a role is not sufficient**.

1. **The role** grants table access through the ACLs.
2. **Assignment to the work driver** — the `assigned_users` JSON on the wizard record — determines
   whose mails a person can see. Without it, the board is empty even with the role.
3. **`demo_users`** — the property — controls the Manager/Analyst view toggle and who appears in the
   analyst picker.

> **`demo_users` is an access grant, not just a UI toggle — treat it as privileged.**
> `AccessGuard.isManagerOrAdmin()` is `gs.hasRole('admin') || _hasManagerRole() || isDemoUser()`, and
> `canViewWizard`, `canViewAny` and `canViewCashflow` all short-circuit on it. A user named in
> `demo_users` therefore sees **every work driver's mail** with no role and no work-driver assignment,
> bypassing gates 1 and 2 entirely. The property's stated purpose is to let a demo operator preview the
> manager surfaces without an admin grant; the effect is manager-level read across the application.
>
> Note also the code's fallback default: if the property is ever **deleted**, `gs.getProperty` returns
> the hard-coded fallback name, silently making that one user a demo operator. Set the property empty
> rather than deleting it.

`AccessGuard` centralises the resulting rules so no widget invents its own:

```
isManagerOrAdmin()        isDemoUser()          roleLabel()
canViewWizard(wizId)      canViewAny()          isAssignedAnalyst(wizId)
canViewCashflow(cfGr)     canActOnCashflow(cfGr)
userDisplayName(fallback) userInitials(fallback)
```

Every widget calls it — thirteen of the sixteen do, and five ACL scripts call it as well, so it is the
single chokepoint for both surface and record access. The last two exist so every header widget derives
the displayed name and initials the same way. If you add a widget, use all of them.

### Access controls

57 ACLs covering read, write, create and delete — six each on `wizard` and `config`, five on each of the
other nine, and **none at all on `llm_usage`**, which is worth knowing before exposing that table to a
non-admin. Delete is sparse: three rules in total across the application.

## 9.5 Business Rules

Only two, and both are **before-delete** — neither runs on insert or update:

| Rule | Table | Fires on | Purpose |
|---|---|---|---|
| **NFOTC: cascade delete cashflows on email delete** | `email` | delete | Deleting a mail removes its cashflows, so orphans cannot accumulate. **Destructive — understand it before deleting mail records in bulk.** |
| **NFOTC: clear wizard ownership stamps on …** | `wizard` | delete | When a work driver is **deleted** it takes its sys_id with it, and any mail still stamped with that id would be *claimed by a ghost* and vanish from every board. So on delete it clears `wiz_extracted`, `wiz_assigned` and `composed_run`. |

> Two things to note on the second rule. It fires **only on delete** — editing a work driver's
> configuration clears nothing, so mails keep their existing stamps. And its record name is longer than
> the 40 characters shown in most list views; search on `clear wizard ownership stamps` to find it.

There is very little in Business Rules by design. Logic lives in Script Includes where it can be called
directly and tested; rules are reserved for data integrity that must hold regardless of the caller.

## 9.6 Cost and tracing

**`LlmUsage`** writes one row per model call to the `llm_usage` table: the model, the capability, the
field, the mail and cashflow it belongs to, and the figures the model service itself reports rather than
estimates. Each chunk of a chunked mail is a separate row — which is what makes `chunk 4/8 (retry)`
legible in the field name.

> **Cost and latency are populated today; token counts and round-trip time are not.** The writer reads
> them defensively (`if (inTok !== null)`), and its own header says they *"light up automatically"* once
> the global model client is updated to surface them. Until then those columns are empty — empty tokens
> are a missing upstream metric, not a failed call.

**`LangSmithTracer`** sends one batched, asynchronous request per mail: a parent extraction run with a
child run per model call. Because it is batched and asynchronous it adds no measurable latency.

It is **off unless fully configured**: `active = enabled && apiKey && baseUrl`, so a half-configured
instance makes zero calls and reports no error. `langsmith.sample_pct` then throttles volume — but a
trace containing an **error is always kept**, whatever the sample rate, so a low percentage does not
cost you the failures.

---

# 10. Operations

Runbooks for the things you will actually do. All of them are native platform operations — Studio,
Background Scripts, list views and update sets.

## 10.1 Process a batch of mail

1. Attach the `.eml` files to the intake table, one row each.
2. Open the board and press **Sync now**.
3. The button returns immediately. It fires one subflow per relevant mail in the background — progress
   is polled separately, not returned by the press.
4. Mails finish at **Awaiting Confirmation**.

**It runs only for a work driver whose activity is `Compare & Match`.** Anything else reports
`unsupported` and does nothing.

**To watch a run:** flow execution history, newest first. Each mail is its own execution.

## 10.2 Grant someone access

Three things must all be true, and a role alone is not enough (§9.4). The script below is idempotent
and append-only, and must be run **once per application scope** — a scoped table refuses writes from
any other scope, so the work-driver assignment cannot be done centrally.

It covers all three **for a superuser**. At `analyst` level it grants the role and the work-driver
assignment but does **not** add the person to `demo_users` — which is deliberate, because that property
confers manager-level read (§9.4). The consequence to know is that the manager's analyst picker is built
only from `demo_users`, so an analyst added this way will not appear in it. Add them to the property
only if they need to be selectable there, accepting the access that comes with it.

**Background Scripts · Application = the scope you are onboarding them to · sandbox unchecked**

```javascript
(function () {
    // Find each person at sys_user.list and copy Email and User ID exactly.
    var USERS = [
        { email: 'first.last@nomura.com', user_name: 'userid', level: 'superuser' }
        // level: 'superuser' = analyst + manager + view toggle;  'analyst' = analyst only
    ];

    var SCOPE = '' + gs.getCurrentScopeName();
    var ALLOWED = { 'x_nose_nfotc_bsm': 1, 'x_nose_nexai_dev': 1,
                    'x_nose_nexai_test': 1, 'x_nose_nexai_uat': 1 };
    if (!ALLOWED[SCOPE]) { gs.error('Set the Application picker to a NexAI OTC application.'); return; }

    function grant(uid, role) {
        var r = new GlideRecord('sys_user_role');
        if (!r.get('name', role)) { return 'role not found: ' + role; }
        var c = new GlideRecord('sys_user_has_role');
        c.addQuery('user', uid); c.addQuery('role', r.getUniqueValue()); c.query();
        if (c.hasNext()) { return 'already has ' + role; }
        var i = new GlideRecord('sys_user_has_role');
        i.initialize(); i.setValue('user', uid); i.setValue('role', r.getUniqueValue());
        return i.insert() ? 'granted ' + role : 'REFUSED ' + role;   // insert() returns null on refusal
    }

    for (var n = 0; n < USERS.length; n++) {
        var s = USERS[n];
        var u = new GlideRecord('sys_user');
        u.addQuery('email', s.email); u.setLimit(1); u.query();
        if (!u.next()) {
            u = new GlideRecord('sys_user');
            u.addQuery('user_name', s.user_name); u.setLimit(1); u.query();
            if (!u.next()) { gs.error('not found: ' + s.email); continue; }
        }
        var uid = u.getUniqueValue(), uname = '' + u.getValue('user_name');
        var disp = '' + (u.getValue('name') || uname);

        gs.info(disp + ' -> ' + grant(uid, SCOPE + '.analyst'));
        if (s.level === 'superuser') {
            gs.info('   ' + grant(uid, SCOPE + '.manager'));
            // the view toggle
            var key = SCOPE + '.demo_users';
            var list = ('' + (gs.getProperty(key, '') || '')).split(',');
            var clean = [];
            for (var i = 0; i < list.length; i++) {
                var t = list[i].replace(/^\s+|\s+$/g, '');
                if (t && t !== uname) { clean.push(t); }
            }
            clean.push(uname);
            gs.setProperty(key, clean.join(','));
            gs.info('   demo_users -> ' + gs.getProperty(key, ''));
        }
        // assignment to every published work driver - this is what makes mail visible
        var w = new GlideRecord(SCOPE + '_wizard');
        w.addQuery('status', 'published');
        w.query();
        while (w.next()) {
            var a = [];
            try { a = JSON.parse(w.getValue('assigned_users') || '[]'); } catch (e) { a = []; }
            var has = false;
            for (var k = 0; k < a.length; k++) { if (a[k] && a[k].id === uid) { has = true; } }
            if (has) { continue; }
            a.push({ id: uid, name: disp });
            w.setValue('assigned_users', JSON.stringify(a));
            w.setValue('assigned_count', a.length);
            gs.info('   driver "' + w.getValue('name') + '" -> ' + (w.update() ? 'assigned' : 'REFUSED'));
        }
    }
})();
```

**Afterwards:** each person must log out and back in once before the roles take effect.

**To remove access**, reverse it by hand — the script never deletes. Removing the role and the
assignment is usually enough; `demo_users` only controls the view toggle.

## 10.3 A mail produced no cashflows — where to look

In order, because each step rules out the one before:

| # | Check | If it is wrong |
|---|---|---|
| 1 | Is `mail_body` populated on the record? | Ingestion failed — the `.eml` did not decode. §2.3. |
| 2 | What is `classification`? | `irrelevant` means it was rejected on purpose. The reason is on the `classification.decided` audit event. |
| 3 | What is `thread_state`? | `thread` means it quotes an earlier mail and was dropped by design. |
| 4 | Is `extraction_status` = `partial`? | Rows were lost. Check the usage rows for a failed chunk. |
| 5 | Are there `llm_usage` rows for this mail? | None means no call was made. Some, with an error, means the call failed. |
| 6 | Does the mail carry a PDF? | See the note in §11 on document types. |
| 7 | Does the work driver's configuration claim this mail? | If no label matches, the reason is `no_label_match`. |

**Useful filters**

```
email.list      classification=irrelevant
email.list      extraction_status=partial
audit.list      event_type=classification.decided
llm_usage.list  (sort by created, newest first)
```

## 10.4 Failures that do not announce themselves

This application handles untrusted input at several boundaries, and most failures there are silent by
nature. These are the ones to recognise.

| Symptom | Almost certainly |
|---|---|
| `mail_body` empty, no error anywhere | a rewritten MIME boundary or an undecoded transfer encoding — §2.3 |
| Extraction returns nothing for a 20,000-character prompt | a Script Include is calling **another** application because its scope token was not rewritten; the cross-scope error is swallowed by the surrounding `try/catch` |
| Fewer cashflows than the mail plainly contains | a chunk was lost. `extraction_status` = `partial` is the flag |
| A spreadsheet attachment ignored | it failed one of the detection tests — attachment disposition, or the `UEsD` zip magic, or the Excel extension. The extension test is skipped when the part has no filename, so a nameless part needs only the first two — §2.6 |
| Everything matches at the widest tier | the counterparty directory is not populated — §11 |
| A query returns every row instead of a filtered set | an invalid field name in `addQuery` — the platform drops the condition instead of failing |
| A role granted but the board is still empty | the person is not assigned to the work driver — §9.4 |
| A Script Include reads as "not defined" | the record's **Name** does not match the class name in the script. Record lookups are case-insensitive, so it will look present while being unreachable |

## 10.5 Move code between application scopes

**The scope name is written into every file.** A Script Include in one scope calls its siblings as
`new x_nose_nfotc_bsm.Something()` and builds table names from the same prefix. Copying a file to
another scope without rewriting that token produces a file that calls the *wrong* application — and
because the calls sit inside `try/catch`, it fails silently and returns empty.

**The safe procedure:**

1. Read the source file **from the instance**, not from a copy.
2. Replace every occurrence of the source scope token with the target one, in memory.
3. Write it to the target record.
4. **Read it back and verify**: expected length, zero occurrences of the source token, the expected
   count of target tokens, and that a known marker string from the body survived.

**Which application must you run it from?** This catches people out, and it is not consistent:

| Writing to | Run from |
|---|---|
| `sys_dictionary`, `sys_ui_action`, `sys_script` and other platform metadata | **Global** — a scoped application cannot create or edit these, even for its own tables |
| a scoped application's own data tables (`config`, `wizard`, …) | **inside that scope** — they refuse writes from Global |

So a change that touches both halves is two runs, from two different application contexts. There is no
single context that can do both.

## 10.6 Turn on native record auditing

Per table, once, and **from the Global application** — the dictionary is a protected platform record.

1. Open the table's dictionary entry: the row whose **Column name is empty** and whose **Type is
   `collection`**. That row describes the table; the others describe its fields.
2. Tick **Audit**. Save.

It is **not retrospective** — do it before a testing cycle, not after. History then appears per record
through the form header context menu, **History → Record**.

Audit the business tables. Insert-only tables — usage metrics, the event store itself, ingestion
staging — gain nothing: record auditing captures field *changes*, and an insert has none, so auditing
them roughly doubles their write volume and records nothing readable.

## 10.7 Change a tolerance, a threshold or a prompt

| To change | Where | Effect |
|---|---|---|
| a match tolerance or chunking limit, everywhere | the `config` table | immediate, all work drivers |
| the same, for one desk | **Config Overrides** on the work driver | immediate, that driver only |
| which mails a driver claims | **Email Identification Rules** on the work driver | next sync |
| a field's extraction prompt | **Input Fields** on the work driver, through the builder | next extraction |
| the noise-domain list | the `noise_domains` property | next classification |

**None of these is a release.** They are records.

## 10.8 Add a work driver

1. Open the wizard builder in the portal and work through its steps.
2. Set **Activity** to `Compare & Match` if it should run the settlement pipeline — Sync is gated on it.
3. Define the **Email Identification Rules** so it claims only its own mail. Test against a handful of
   mails before publishing; a driver with no criteria claims everything.
4. Define the **Input Fields** — the per-field extraction prompts.
5. **Publish**. Unpublished drivers are not picked up.
6. Assign analysts (§10.2), or nobody will see its mail.

---

# 11. Prerequisites

The application runs without any of the following, but parts of it will not behave as intended until
they are in place. Check these first when something does not work as expected.

## 11.1 Reference data

### The counterparty directory

**Table:** `counterparty` — `email_address` → `org_name`

The counterparty on a mail is **looked up, never inferred** (§2.5). If the sender's address is not in
this table, `counterparty_name` stays blank.

**Consequence if it is empty or incomplete:** Tier 1 and Tier 2 both require a counterparty, so every
cashflow falls to Tier 3 — amount and value date exact, counterparty dropped. The matching logic is
unaffected; it simply never reaches the tiers that need the field. Populate the directory and the tier
distribution changes without any code change.

### The booking table

**Table:** `booking` — what extracted cashflows are matched against.

It must hold the bank's own cashflow records for the value dates being processed. An empty or stale
booking table produces `no_match` for everything, which is indistinguishable at a glance from an
extraction problem — §10.3 step 5 separates the two.

Note the **sign convention**: the stored amount carries the sign of Nomura's side (Receive positive,
Pay negative), and the matcher compares raw signed values. A loader that writes unsigned magnitudes
will match every Receive and no Pay.

## 11.2 Connectivity

| Needs | Used by | If absent |
|---|---|---|
| **MID server to the model gateway** | every extraction and classification call | all model-backed extraction fails; deterministic classification still works |
| **MID server to the trace collector** | `LangSmithTracer` | traces are not recorded; extraction is unaffected |
| Credentials for the above | stored as system properties and credential records | calls are refused |

The MID server named in `langsmith.midserver` is **environment-specific** and must be corrected when
the application is moved to another instance.

## 11.3 Configuration to review before first use

| Item | Where | Why |
|---|---|---|
| `noise_domains` | system property | ships with a placeholder; set it to the domains this mailbox actually receives noise from |
| `extract.chunk_cap` | `config` table | tune per environment — see the note in §9.1 |
| Match tolerances | `config` table | the shipped values follow the specification where the data allows; see the two exceptions below |
| At least one **published** work driver | `wizard` table | Sync does nothing without one |
| Analysts assigned to that driver | the driver record | the board is empty otherwise |

## 11.4 Known data dependencies in matching

Two tolerance behaviours differ from the specification because the supporting data is not available on
the instance. Both are recorded in `CompareMatch` beside the constants they affect, and both are
resolved by supplying a data source rather than by changing code.

| Behaviour | Specified | Current | Resolved by |
|---|---|---|---|
| Tier 2 value-date window | business days, excluding currency and bank holidays | business days, weekends only | a holiday calendar source |
| Tier 2 amount tolerance | a fixed value in a reference currency | the same figure applied in the raw currency of the cashflow | an FX rate source |

## 11.5 Document types

| Input | Handled by | Notes |
|---|---|---|
| Mail body, plain text or HTML | `EmlFieldExtractor` → the text path | the primary route |
| Excel attachment (`.xls`, `.xlsx`, `.xlsm`, `.xlsb`) | `XlsxCashflowExtractor` | parsed in the platform into a text grid, then the ordinary text path — so it inherits chunking, retry and the completeness guard |
| PDF | `PdfCashflowExtractor` | sent **natively as a document**, one call per PDF, alongside the work driver's own field instruction. The model returns rows directly — there is no transcribe-then-extract step, and no separate OCR component. Because a document cannot be split, each call is all-or-nothing |
| Password-protected attachments | — | not supported; the file cannot be opened |

> **On scanned and image-only PDFs.** The document path submits the file natively, so the model
> receives the pages rather than a text extraction, and the component is written on the basis that this
> covers scanned documents as well as born-digital ones — its own description in §4.2 says so
> (*"incl. scanned"*). Measured behaviour does not bear that out. **In practice, mails whose figures exist only
> inside an image have returned no rows.** Treat the capability as unproven for that case rather than
> guaranteed: such a mail surfaces as a relevant mail with no cashflows, which §10.3 shows how to find.
> A detection note worth knowing: the scan requires the `%PDF` magic (`JVBER`), so a PDF that is
> corrupt or wrapped in another encoding is not picked up at all.

## 11.6 Outbound integration

The write-back leg of `OTC Match & Write-back` **is not connected**. The external integration available
today is retrieval only; the write-back endpoint is not yet available.

The Action stages the outcome on the cashflow and writes an audit event. Nothing is pushed to an
external system. When the endpoint becomes available, that Action is the single place it connects —
nothing else in the pipeline changes.
