# KT — Email Classifier, wired end to end

Build it live in ServiceNow, by hand, no SDK. **Every click path and every error below is from a real
dry run on the eval instance, 20 September 2026** — not an idealised version.

Scope generated on that run: **`x_nose_kt_email_0`** · Table: `x_nose_kt_email_0_email_intake`
All the code is in **`KT_Code_Snippets.js`**, numbered to match the steps here.

Allow **60 minutes** the first time, ~40 once you know it.

---

## The story you are telling

**One brain, one recipe, three doors.**

```
            EmailClassifier                the BRAIN     - written once, in JavaScript
           (Script Include)
                  |
            Classify Email                 the CONTRACT  - typed inputs/outputs, no logic
              (Action)
                  |
          Classify and Store               the RECIPE    - classify, then write it down
             (Subflow)
            /      |      \
  Classify    Classify Now   KT Email Intake
  Incoming     (UI Action)      (Widget)
 Email (Flow)       |               |
      |          a person      the page users
 record created   clicks        actually open
```

Four layers, each doing one job. The lesson: **nothing is duplicated.** Change one keyword in the
Script Include and the flow, the button, the widget and every future caller change with it.

**Why keyword rules and not AI:** milliseconds, identical answer every time, nothing external to
fail in front of an audience. Say it out loud — *"the plumbing is the point today; the brain can be
swapped later"* — because someone will ask.

---

## Before you start

- Log in as admin. Keep **Studio** in one tab, the **platform UI** in another.
- Have `KT_Code_Snippets.js` open.
- Three test emails ready (see **Test data** near the end).

> **The mistake that costs the most time:** creating something in the wrong application scope.
> Check the scope picker *every time*. "X is not defined" is almost always this.

**Build order matters.** Each step is provable before the next exists. If you build the Flow first
you end up debugging four layers at once.

---

## Step 1 — The application (3 min)

**Studio → the blue `+` in the far-left rail → "On your own" → Continue**

Not *With ServiceNow Otto* — for a KT you want to have made every piece yourself.

1. **Name** `KT Email Classifier`
   **Description** `KT demo - classifies incoming emails as relevant or irrelevant.`
   **Scope** leave **Scoped** → Continue
2. **Roles** — leave the `admin` / `user` defaults → Continue
3. **"Let's add more to your app"** → **View app details**

The generated scope is on the details page. **Write it down.**

> **Do NOT click "Convert app to ServiceNow Fluent."** That turns the app into a source-controlled
> SDK project — the opposite of this session. (Fluent *is* the now-sdk: a TypeScript DSL compiled by
> a local Node CLI. There is no in-instance Fluent editor.)

**Say this:** everything lives inside this app, exports as one unit, and cannot be edited by another
team's app. That boundary is why scoped apps exist.

**Also worth pointing at:** the app-details page groups things as **Data → Experience → Automation →
Security**. That is ServiceNow's own model of an app, and it is exactly our build order.

---

## Step 2 — The table (5 min)

**Studio → `+` → Data → Table → Continue**

| Field | Value |
|---|---|
| Label | `Email Intake` (Name auto-fills) |
| **Extends table** | **leave EMPTY** |
| Create module | ✓ |
| Add module to menu | `-- Create new --` |
| New menu name | `KT Email Classifier` |

**Submit.** Columns are much easier to add once the table exists.

**Say this about Extends:** you *could* extend `Task` and inherit state, assignment, work notes and
SLAs — but you inherit its behaviour too. Standalone means the only fields are the ones we chose.

### The columns

You land in Table Builder showing the five system fields every table gets free. **Add new field**,
five times, then **Save**:

| Column label | Type | Max length | Display |
|---|---|---|---|
| Subject | String | 255 | **ON** |
| Body | String | 4000 | |
| Classification | String | 40 | |
| Score | Decimal | | |
| Reason | String | 255 | |

**Classification is a String, not a Choice.** A Choice gives a nicer dropdown but the choice list is
extra clicks and a place to stall live. Nothing downstream cares — flow, widget and UI Action all
write plain strings.

**Leave Default value EMPTY on Classification.** That emptiness is load-bearing: the Flow triggers on
it being blank, which is both "there is work to do" *and* the loop-breaker.

**Display ON for Subject** — only one field can be the display value. It is what shows when the
record is referenced anywhere else. It pays off twice later: the Subflow test picker shows subjects
instead of sys_ids, and so does the flow execution log.

> **Say this:** every table needs one field that answers "what do I call this record?" — that is the
> display field, and if you do not pick one you get a GUID.

**Verify:** left nav → **KT Email Classifier → Email Intake → New**, save one record by hand with the
relevant example. Classification stays blank. **Do this now — step 5's test needs a record to exist.**

---

## Step 3 — The brain: Script Include (7 min)

**Studio → `+` → Server Development → Script Include → Continue**

| Field | Value |
|---|---|
| **Name** | `EmailClassifier` — **no spaces, no trailing space** |
| Accessible from | This application scope only |
| Glide AJAX enabled | **off** |
| Active | ✓ |
| Protection policy | change `Read-only` → **`-- None --`** |

Paste **§1** from the snippets file.

> ### ⚠ TRAP 1 — the Name must match the class name exactly
> Typed as `Email Classifier` the API Name became `x_nose_kt_email_0.Email_Classifier_` — note the
> underscore, and the **trailing** one from a stray space. The script declares `var EmailClassifier`,
> so `new EmailClassifier()` fails with **"EmailClassifier is not defined"**, and the message points
> nowhere near the cause.
>
> **Confirm the API Name reads `x_nose_kt_email_0.EmailClassifier` with no underscore before
> submitting.**
>
> **Worth doing WRONG on purpose live.** Most common Script Include mistake, unhelpful error, and
> people remember a bug they watched get solved.

> **Harmless noise:** a red banner may say *"putRow() must be called for catalog [Default Builder]…"*.
> Unrelated platform warning. Dismiss it.

### Verify before wiring anything to it

**`/sys.scripts.do`** · Application **KT Email Classifier** · *Execute in sandbox* **unticked**.
Paste **§2**. Real output from the dry run:

```
x_nose_kt_email_0: {"classification":"relevant","score":0.63,"reason":"matched: settlement, cashflow, value date, confirm, trade"}
x_nose_kt_email_0: {"classification":"irrelevant","score":0,"reason":"noise: out of office, lunch"}
```

> **The most important moment of the session.** The brain is finished and proven, and nothing is
> wired to it. Say: *"If I'd started with the Flow, I'd be debugging two things at once right now."*

**Three asides that came up — have the answers ready:**

- **Fix Script vs Background Script.** A Fix Script really exists for *data migration on app upgrade*
  — it ships with the app and runs on install. It works as a scratchpad (lives in the app, inherits
  the scope, one-click re-run) but say what it is actually for.
- **Script Action vs UI Action.** A **UI Action** is a button a person clicks. A **Script Action**
  listens for an event (`gs.eventQueue(...)`) and runs asynchronously — the old way of doing what
  Flows do now.
- **Cross-scope.** Inside this app, `new EmailClassifier()`. From another scope you need
  `new x_nose_kt_email_0.EmailClassifier()` **and** *Accessible from: All application scopes*.

---

## Step 4 — The contract: Action (10 min)

**Studio → `+` → Automation → Action → Continue.** Creating it from Studio **guarantees the right
scope** — Flow Designer on its own defaults to Global.

Name `Classify Email`, Description `Takes a subject and body, returns classification, score and
reason. Wraps the EmailClassifier Script Include.` → **Build action**.

This step has **four separate wiring points, and every one fails silently.** Go slowly.

### 4a. Action Inputs

| Label | Name | Type |
|---|---|---|
| Subject | subject | String |
| Body | body | String |

They appear as pills in the right-hand **Data** panel — that panel is the "typed contract" made
visible. Point at it.

### 4b. The Script step

Click the blue **+** on the right edge of the **Inputs** row in the Action Outline → **Script**.
Paste **§3**.

### 4c. The step's own Input Variables ← *easy to miss*

**Input Variables**, near the top of the step. **Create Variable** twice:

| Name | Value |
|---|---|
| `subject` | pill → **action ▸ Subject** |
| `body` | pill → **action ▸ Body** |

### 4d. The step's own Output Variables ← *also easy to miss*

Scroll to the **bottom** of the step. **Create Variable** three times:

| Label | Name | Type |
|---|---|---|
| Classification | classification | String |
| Score | score | Decimal |
| Reason | reason | String |

Once declared they appear in the Data panel under **Script step**.

### 4e. Action Outputs

**Outputs** in the Action Outline → **Create Output** three times (Label / Name / Type) → then
**Exit Edit Mode** and set each **Value** from the Data panel under **Script step**.

> **Edit Mode declares the SHAPE. Normal mode assigns the VALUE.** Two different jobs behind one
> button, and nothing on screen says so.

### 4f. Save → Test → Publish

Test with the relevant example:

```
Classification   relevant
Score            0.63
Reason           matched: settlement, cashflow, value date, confirm, trade
```

**Publish.** An unpublished Action does not appear in the subflow/flow picker.

> **Say this:** the Action is a *wrapper*, not a second copy — four lines, all it does is call the
> Script Include. What it adds is a **typed contract** so Flow Designer can draw it as pills, and
> someone who cannot write JavaScript can use it.

---

## Step 5 — The recipe: Subflow (10 min)

**Studio → `+` → Automation → Subflow.** Name `Classify and Store`, Application `KT Email Classifier`.

### Input

| Label | Name | Type |
|---|---|---|
| Email Record | email_record | **Reference → Email Intake** |

> **⚠ Type is Reference, NOT String.** In the type dropdown pick **Reference** (not *Reference Name*,
> which gives you the table's name as text), then find **`Email Intake [x_nose_kt_email_0_...]`** in
> the table list. Beware the platform decoys: `Email Access Restriction`, `Email Configuration`,
> `Email Server` all match "email".
>
> A String input only carries a sys_id as text — you could not drag `email_record ▸ Subject` pills,
> and *Update Record* could not target it. When it is right, the Data panel shows **Email Record —
> Record** with a ▸ arrow you can expand.

Click **Done** — leave Outputs for later, their values come from a step that does not exist yet.

### Step 1 — Action `Classify Email`

**Add an Action, Flow Logic, or Subflow → Action** → search `Classify`.

> **⚠ If only "NFOTC · Classify" appears, your Action was never Published.** Go back to the Action
> tab and Publish it. The only symptom is that it quietly is not in the list.

- Subject ← expand `Email Record` in the Data panel → drag **Subject**
- Body ← drag **Body**

Confirm they render as chips (`Input ▸ … ▸ Subject`), not typed text.

### Step 2 — Update Record

**Add an Action → Action → Update Record** (ServiceNow Core).

Fill in **this order** — the Fields picker will not list your columns until it knows the table:

1. **Record** ← drag `Email Record` from Subflow Inputs
2. **Table** ← `Email Intake`
3. **Fields** → *+ Add field value* ×3:

| Field | Value |
|---|---|
| Classification | `1 - Classify Email ▸ Classification` |
| Score | `1 - Classify Email ▸ Score` |
| Reason | `1 - Classify Email ▸ Reason` |

The step renames itself to **"Update Email Intake Record"** — that is ServiceNow confirming it knows
the table.

### Outputs — declare them, then move on

Declare `Classification` and `Reason` (String). **In this Studio version there is no value-assignment
UI for subflow outputs** — the chevron only reveals Advanced options (max length, hint, default).

**Do not stall.** The subflow's real job is steps 1 and 2. Everything downstream reads the **record**
instead, which is a stronger check anyway: it proves the write landed.

> **Say this:** *"I declared outputs the callers turned out not to need — the record is the source of
> truth. Leaving them is harmless; pretending they're load-bearing wouldn't be."*

### Save → Test → Publish

> **⚠ The test picker will say "No matches found" if the table is empty.** Create a record first
> (step 2's verify).

Test shows both steps **Completed** in ~9ms. **Then open the record** and confirm Classification,
Score and Reason were actually written. *"Completed" and "it wrote the data" are different claims.*

> **Say this:** the Action answers *"what is this email?"*. The Subflow answers *"what do we DO about
> it?"* Keeping them separate means the decision is reusable somewhere that does not want a record
> updated.

---

## Step 6 — Door one: the Flow (8 min)

**Studio → `+` → Automation → Flow.**

> **⚠ Pick Flow, not Subflow.** Mis-clicking here leaves a stray subflow with the flow's name, and
> later you pick the wrong one in a picker. If it happens, delete it.

Name `Classify Incoming Email` — **no trailing space** — **Show additional properties → Run as: System
User** → **Build flow on your own**.

> **Why a Flow at all, when we have a Subflow?** *A subflow cannot trigger itself.* A subflow is
> reusable but passive; a flow is active but single-purpose. Put the logic in the subflow and the
> flow is just the doorbell — which is why the button and the widget can ring the same bell later.

### Trigger

Record → **Created or Updated** · Table `Email Intake`

**Condition: `Classification` → operator `is empty`**

> ### ⚠ TRAP 2 — `is empty` is ONE operator
> Picking `is` and typing the word `empty` in the value box compares against the literal string
> "empty" and **never matches a blank field**. And the header reads back *"where (Classification is
> empty)"* in **both** cases — it displays identically.
>
> You would activate the flow, create a record, see nothing happen, and have no error to chase.

**Run Trigger: `For each unique change`** — not `Once`. `Once` fires for a record one time ever, so
clearing Classification to re-demo does nothing and looks broken.

> **The loop-breaker — say this explicitly.** Without the condition: the flow updates the record, the
> update re-triggers the flow, forever. Once Classification is filled the trigger stops matching. The
> real NexAI intake flow uses exactly this trick on `wiz_intake_state`.

### The one action

**Add an Action, Flow Logic, or Subflow → Subflow → `Classify and Store`**
- **Wait For Completion** ✓
- **Email Record** ← drag **Trigger ▸ Email Intake Record**

Do **not** pick a specific record from the dropdown — that would hard-wire the flow to one row.

**Save → Activate.** A saved flow does not run; the `Inactive` badge by the title must clear.

### Verify — the demo moment

Create a record with the **irrelevant** example, save, refresh the list. It classifies itself:

```
Team lunch Friday   irrelevant   noise: out of office, lunch   0
```

Using the irrelevant one is deliberate — it proves the hard-negative branch fires, not just the happy
path. Then open **Flow Designer → Executions** and walk the run with them.

> **Say this:** *"Nobody clicked anything, and look how thin the flow is — one step. All the substance
> is in the layers underneath, which is why the next two doors take minutes."*

---

## Step 7 — Door two: the UI Action (7 min)

**Studio → `+` → User Interface → UI Action.**

| Field | Value |
|---|---|
| Name | `Classify Now` |
| Table | Email Intake |
| **Form button** | **✓ TICK IT** |
| **Client** | **✗ leave unticked** |
| Condition | `current.canWrite()` |

Paste **§6**.

> **⚠ Form button unticked = an invisible button.** It saves perfectly and appears nowhere.

> ### ⚠ TRAP 3 — a Reference input wants a GlideRecord, not a sys_id
> `.withInputs({ email_record: current.getUniqueValue() })` fails with
> **`Invalid GlideRecord input format found`**. Pass **`current`** — it *is* the GlideRecord.
>
> This trap has two ends. Calling a subflow, a Reference input wants the record. *Inside* a subflow,
> a Reference input **arrives** as a record, so reading `.sys_id` off it needs `'' + x.sys_id` or you
> get `[object Object]`. Reference inputs are records on both ends.

**Expect blue info banners** the first time: *"Execute operation on API 'ScriptableFlowRunner.subflow'
… was granted and added to cross scope privileges."* Calling Flow Designer's API from your scope
needs permission, and the platform records it rather than failing silently. You will see **Cross scope
privilege (5)** appear in the file tree.

**Why the script re-reads the record** rather than using subflow outputs: those were never assigned
(step 5), and reading the record **proves the write landed**.

### Verify — mind the race

The Flow is also watching this record. If you clear Classification and **save**, the flow fires first.

1. Open the record, clear **Classification** and **Reason** — **do not save**
2. Click **Classify Now**

The UI Action saves and runs the subflow itself, so it gets there first.

```
Classified as irrelevant - noise: out of office, lunch
```

> **Say this:** *"Two doors are now watching the same record. If I save it myself, the flow wins. The
> button only wins because it runs the subflow without saving first."* That is a real thing people
> hit when they add automation on top of manual actions.

---

## Step 8 — Door three: the Widget (12 min)

This is what the real app looks like — NexAI's analyst board is a widget, not a native form.

**Studio → `+` → User Interface → Widget → `Widget (sp_widget)`**

> **⚠ Pick `sp_widget`.** The decoys: `sys_widgets` (Performance Analytics), `pa_widgets`,
> `pa_widget_elements`, `pa_widget_indicators` (dashboards), `sys_ux_widget` / `sys_aix_widget`
> (Next Experience / UI Builder).

Name `KT Email Intake`, ID `kt_email_intake`, **Public unticked**.

A widget is **four panes in one record**:

| Pane | Snippet |
|---|---|
| Body HTML template | **§9** |
| CSS | **§10** |
| Server script | **§7** |
| Client controller | **§8** |

§9 and §10 sit inside block comments in the file — strip the `/* */` wrapper. **Replace** the
placeholder boilerplate in each pane, do not append.

You may land in the **Widget Editor** (nicer, panes side by side). If so, **tick every box in the
"Show" row** — *Server Script is unticked by default* and nothing works without it.

**Save (Ctrl+S).**

> **The client/server split, visible as two panes that cannot reach each other:**
> - **Client Script** runs in the *browser* — knows `row.sys_id`, can call `c.server.get()`
> - **Server Script** runs on the *instance* — can touch GlideRecord and FlowAPI
>
> The client cannot call the subflow. The server cannot see the click. `c.server.get()` is the
> bridge and `data` is what comes back. That is the entire Service Portal model in one sentence.

### Where the email list actually comes from — walk this, they will ask

Nothing about that table on screen is magic. It is four hops, and you can point at each one:

**1. The server script queries the table** — the last block of §7:

```js
var gr = new GlideRecord(TABLE);           // TABLE = 'x_nose_kt_email_0_email_intake'
gr.orderByDesc('sys_created_on');          // newest first
gr.setLimit(25);                           // never render an unbounded list
gr.query();
while (gr.next()) {
    data.rows.push({
        sys_id: '' + gr.getUniqueValue(),
        subject: '' + (gr.getValue('subject') || ''),
        classification: '' + (gr.getValue('classification') || ''),
        score: '' + (gr.getValue('score') || ''),
        reason: '' + (gr.getValue('reason') || '')
    });
}
```

**2. `data` is the hand-off.** Anything you put on `data` is serialised and shipped to the browser.
Anything you do not put there, the browser cannot see — which is also the security boundary. We send
five fields per row, not the whole record.

**3. The client receives it** — §8:

```js
c.server.get(payload).then(function (response) { c.data = response.data; });
```

**4. The HTML renders one `<tr>` per row** — §9:

```html
<tr ng-repeat="r in c.data.rows">
```

> **Say this:** *"`data.rows` is built by a GlideRecord query on the server, shipped to the browser as
> JSON, and `ng-repeat` draws one row per entry. If a column is blank on screen, the question is
> always 'did the server put it on `data`?' — not 'is the HTML wrong?'"*

**Trace one value end to end in front of them.** Pick the *Why* column:

```
table column  reason
  -> server   gr.getValue('reason')        pulled out of the record
  -> data     data.rows.push({ reason: })  put on the wire
  -> client   c.data.rows                  arrives in the browser
  -> html     {{r.reason}}                 drawn on screen
```

Four names, one value. Break any link and the column goes blank with no error — which is exactly the
silent-failure pattern from the Action.

**And the buttons are the same trip in reverse.** `ng-click="c.classify(r)"` sends
`{action:'classify', sysId: row.sys_id}` to the server, the server runs the subflow, re-queries, and
returns fresh `data`. The list refreshes because `c.data` was replaced — not because anything told it
to redraw.

---

## Step 9 — Give the widget a home (8 min)

> **A widget has no URL.** There is no `/widget/kt_email_intake`. You visit a **page**, and the page
> renders whatever widgets are *placed* on it. Like a React component and a route — the component is
> real, but nobody can browse to it.
>
> At this point you have a widget ✅, no page ❌, and nothing connecting them ❌.

### 9a. The page

**Studio → `+` → User Interface → `Page (sp_page)`**

> **⚠ Pick `sp_page`.** Decoys: `sys_ui_page` (the old Jelly/HTML custom screens, pre-Service Portal),
> `sn_ace_page`, `sys_portal_page` (old CMS), `sys_ux_page_registry` (UI Builder).

Title `KT Email Intake`, ID `kt_email`, Public and Draft unticked, Page Content empty. **Submit.**

### 9b. Place the widget

**`/$spd.do?id=kt_email`**

> **⚠ Not `/$sp.do?id=sp_page_designer`** — that 404s (with a playable Breakout game, admittedly).

Click the **KT Email Intake** tile, then **two drags**.

**Drag 1 — the `12` tile**, from **Layouts** in the left pane, onto the dashed area.

> **Why that tile and not the others.** The left pane's Layouts section is **Bootstrap's 12-column
> grid**. Every tile is a way of slicing a row into 12 parts:
>
> | tile | gives you |
> |---|---|
> | **`12`** | **one column, full width** ← what we want |
> | `6 \| 6` | two equal halves |
> | `3 \| 9` | a narrow sidebar and a wide main area |
> | `4 \| 4 \| 4` | three equal thirds |
> | `2\|2\|2\|2\|2\|2` | six narrow columns |
>
> The numbers always add to 12. We have one widget and want it to fill the page, so `12`.
>
> **Why a layout at all, rather than dropping the widget straight on the canvas?** A widget must
> live in a column. The canvas says so: *"Drag and drop a set of columns from the Left pane — then
> drag and drop widgets inside."* With no column there is nowhere for it to go, and the drag simply
> refuses, which looks like a broken mouse rather than a missing wrapper.

**Drag 2 — the widget.** Type `KT` in **Filter Widget** (the list is hundreds long; unfiltered you
will not find it), then drag **KT Email Intake** into the empty column.

> **Where that widget list comes from:** it is every `sp_widget` record on the instance — the stock
> ones plus yours. Yours only appeared because you created it in step 8. Same table, same list,
> no registration step.

### What the two drags actually created

```
sp_page        kt_email
 └ sp_container
    └ sp_row
       └ sp_column      size = 12
          └ sp_instance  sp_widget = kt_email_intake
```

**Four records.** The Designer is a GUI over four tables — nothing more.

> **Say this:** *"Everything in ServiceNow is a record — including the layout of the page you are
> looking at."*

> **Why placement lives apart from the widget:** one widget can appear on many pages, in different
> columns and widths, even twice on the same page. So *where it sits* cannot be a property of the
> widget itself.

### The same thing as a script

Run it in **Global** — the `sp_*` tables belong to the platform, not your app. Safe to re-run: it
reuses whatever already exists and will not add the widget twice.

```js
(function () {
    var PAGE_ID = 'kt_email';
    var WIDGET_ID = 'kt_email_intake';

    var page = new GlideRecord('sp_page');
    if (!page.get('id', PAGE_ID)) { gs.error('[KT] no sp_page "' + PAGE_ID + '"'); return; }
    var widget = new GlideRecord('sp_widget');
    if (!widget.get('id', WIDGET_ID)) { gs.error('[KT] no sp_widget "' + WIDGET_ID + '"'); return; }

    // Each level: reuse what is there, otherwise create it.
    function childOf(table, parentField, parentId, extra) {
        var g = new GlideRecord(table);
        g.addQuery(parentField, parentId);
        g.orderBy('order');
        g.setLimit(1);
        g.query();
        if (g.next()) { gs.info('[KT] reusing ' + table); return g.getUniqueValue(); }
        var n = new GlideRecord(table);
        n.initialize();
        n.setValue(parentField, parentId);
        n.setValue('order', 100);
        for (var k in extra) { if (extra.hasOwnProperty(k)) { n.setValue(k, extra[k]); } }
        var id = '' + n.insert();
        gs.info('[KT] created ' + table + ' ' + id);
        return id;
    }

    var containerId = childOf('sp_container', 'sp_page', page.getUniqueValue(), { width: 'container-fluid' });
    var rowId = childOf('sp_row', 'sp_container', containerId, {});
    var colId = childOf('sp_column', 'sp_row', rowId, { size: 12 });   // 12 of 12 = full width

    var dup = new GlideRecord('sp_instance');
    dup.addQuery('sp_column', colId);
    dup.addQuery('sp_widget', widget.getUniqueValue());
    dup.query();
    if (dup.next()) {
        gs.info('[KT] the widget is already on this page - nothing to do.');
    } else {
        var i = new GlideRecord('sp_instance');
        i.initialize();
        i.setValue('sp_column', colId);
        i.setValue('sp_widget', widget.getUniqueValue());
        i.setValue('title', 'Email Intake');
        i.setValue('order', 100);
        // insert() returns null when a policy refuses the write. Never assume it worked.
        if (!i.insert()) { gs.error('[KT] could not create sp_instance - check ACLs.'); return; }
        gs.info('[KT] placed the widget.');
    }
    gs.info('[KT] Open it: /sp?id=' + PAGE_ID);
})();
```

> **Do the drag first, then show this.** The drag teaches what a container/row/column *is*; the
> script proves it was only ever four inserts. Showing the script first makes the concept look
> harder than it is.

> **And if they ask "can we write this in Fluent instead?"** — Fluent *is* the now-sdk: a TypeScript
> DSL compiled by a local Node CLI. There is no in-instance Fluent editor. In-instance you have this
> script, or an update set. Fluent mainly buys you git and pull requests around the same records.

### 9c. Strip the ServiceNow chrome

`/sp?id=kt_email` works, but wraps your widget in ServiceNow's logo, nav and footer. Those come from
the **portal**, not the page.

**All → Service Portal → Portals → New**

| Field | Value |
|---|---|
| Title | `KT` |
| URL suffix | `kt` |
| Homepage | `KT Email Intake` — **use the magnifier, make it a real reference** |
| Main menu | *leave empty* |
| Theme | *leave empty* |
| Hide portal name | ✓ |

**Submit** → open **`/kt`**. Just your app, nothing else.

> **Say this:** the portal is a wrapper — theme, header, footer, homepage. The same page can live
> inside different wrappers, so one widget serves a branded portal *and* a bare kiosk screen. That is
> exactly what NexAI does: `/nexai` is a portal record wrapping widgets like this one.

---

## Step 10 — The closing demo

Open **`/kt`** and run it in this order:

**1.** Type the relevant example → **Add email** → row appears **unclassified**. *Nobody classified it.*

**2.** Pause, hit **Refresh** → now `relevant`, with score and reason. ← **that was the Flow**

**3.** Clear a record's Classification in the platform list, come back, click **Classify** on its row
→ fills instantly. ← **that was the Subflow, called straight from the widget**

> **Say this:** two completely different doors on one screen. Adding an email went through the
> **trigger**; the button went through the **subflow** directly. Neither knows how classification
> works — they both just ask the same recipe, which asks the same brain.

---

## Test data

**Relevant — the clean case**
```
Subject:  Payment confirmation for value date 25 Sep
Body:     Please confirm the settlement amount and cashflow for trade 99887.
```
→ `relevant`, 0.63

**Irrelevant — pure noise**
```
Subject:  Town hall invitation
Body:     Join us for the quarterly newsletter briefing and lunch.
```
→ `irrelevant`, 0, *noise: lunch, newsletter, invitation*

**The one that earns its keep**
```
Subject:  Out of office - re: settlement confirmation
Body:     Please confirm the cashflow for trade 55123 when I return.
```
→ **`relevant`**

It contains "out of office" and is still relevant, because the hard negative only fires when there
are **no** settlement words — and there are five.

> **Say this:** *"A naive keyword filter bins this. The rule is that noise words only win when
> nothing real is present. That is the difference between a filter people trust and one they switch
> off."*

Have 4–5 of each kind in the table before you start so the list looks convincing.

---

## Every trap, in one table

We hit **eight** on the dry run. Most were silent.

| # | Symptom | Cause | Fix |
|---|---|---|---|
| 1 | "EmailClassifier is not defined" | Script Include Name had a space, so it did not match the class name | retype Name; check the API Name |
| 2 | Action outputs blank after Test | the **script step** never declared Output Variables | declare them on the step |
| 3 | Action outputs still blank | declared on the Action but never **mapped** — Edit Mode only declares | **Exit Edit Mode**, drop the Script step pills into the Value boxes |
| 4 | `irrelevant` / `no settlement keywords found` — a confident wrong answer | the script step had no **Input Variables**, so `inputs.subject` was `undefined` | declare `subject`/`body` on the step, map the Action pills |
| 5 | Still `no settlement keywords found` | the Value boxes held the **literal text** "Subject"/"Body", so `text` became `"subject body"` | use the pill picker; a real pill renders as a chip |
| 6 | Only "NFOTC · Classify" in the action picker | the Action was never **Published** | Publish it |
| 7 | Flow never fires | operator `is` + the typed word `empty` — compares to a literal string | use the single operator **`is empty`** |
| 8 | `Invalid GlideRecord input format found` | passed `current.getUniqueValue()` to a Reference input | pass **`current`** |

**The pattern behind 2–5:**

```
                declare            map
   IN    step Input Variables  ←  Action inputs
   OUT   step Output Variables →  Action outputs
```

**Flow Designer never assumes data flows between layers.** You declare what each layer has, then you
connect them. Four failures, one mistake, four places.

> **Say this:** *"Look how they failed — not with errors, but with empty or confidently wrong values.
> The script defended itself against nulls so well (`'' + (subject || '')`) that it hid the bug. In
> Flow Designer, if a step produces nothing or nonsense, check the wiring before the code."*

> **Typed text is a literal. A pill is a reference.** They look nearly identical in the box, and
> nothing warns you. Traps 5 and 7 are the same mistake in different clothes.

> **And when an error IS loud (trap 8), that is a gift.** It named the field it wanted. The expensive
> bugs are the quiet ones.

### Where to see what actually ran

The Test dialog's *"View the Action execution details"* link did not open on this instance. Use:

- **`/sys_flow_context_list.do?sysparm_query=ORDERBYDESCsys_created_on`** — every flow, subflow and
  action run, newest first. Open the top row → **Open in Operations View**.
- **System Log → All** for `gs.error` output from the widget.

---

## How this maps to the real app

Show this at the end. It turns the toy into a map of NexAI.

| What you built | In NexAI OTC |
|---|---|
| `Email Intake` table | `x_nose_nfotc_bsm_email` — same idea, more fields |
| `EmailClassifier` Script Include | `EmlSenderClassifier` + the field extractors |
| `Classify Email` Action | the typed Flow Actions in the capability palette |
| `Classify and Store` Subflow | the per-mail extraction subflow the board runs |
| `Classify Incoming Email` Flow | **Flow A — OTC Intake**, triggered on `wiz_intake_state` **is empty** |
| `Classify Now` button | the board's **Sync now** — same subflow, human-triggered |
| `KT Email Intake` widget | `nfotc_wiz_dash`, the analyst board |
| `/kt` portal | `/nexai` |

**Say this:** the real trigger condition is `wiz_intake_state is empty` — *the exact same "blank means
there is work to do" trick you just used, including the same loop prevention.* This is not a
simplified teaching model; it is the same wiring with fewer fields.

**What the KT leaves out**, one sentence each:

- **The brain.** Keyword matching versus an LLM call through a gateway, with a 13-field catalogue,
  chunking and retries. Same *shape* — a Script Include returning a result — far more inside it.
- **Config store.** NexAI reads tolerances and thresholds from a key/value table with per-driver
  overrides, so behaviour changes without a deployment.
- **Audit trail.** Every AI decision written to an append-only table even admins cannot edit.
- **Roles and ACLs.** Analyst versus manager, enforced at the table and on every widget.

**The honest framing:** *"This is the skeleton, and it is the real skeleton. NexAI adds muscle — a
smarter brain, config, audit, security — but nothing about how these pieces connect changes."*

---

## The close

Redraw the diagram, then land these four:

- *"Why not put the script straight in the flow?"* — Then only the flow has it. The button, the
  widget and any future integration each need their own copy, and copies drift.
- *"Why an Action AND a Subflow?"* — The Action decides; the Subflow acts. Separating them keeps the
  decision reusable where you do not want a record written.
- *"Where would real emails come from?"* — **Inbound Email Actions**: point a mailbox at the instance
  and a script creates a record per email. A swap at that end of the pipe; everything downstream is
  untouched.
- *"How do we make this AI instead of keywords?"* — **Change `classify()`. Nothing else moves.** The
  action, subflow, flow, button, widget, table and portal all stay exactly as they are.

Save the last one for the end. It is the payoff of the whole session.

---

## If something breaks live

| Symptom | Almost certainly |
|---|---|
| "X is not defined" | wrong application scope, or Script Include Name ≠ class name |
| Action/step outputs blank | declared but never mapped — Exit Edit Mode, drag the pills |
| Step gets `undefined` inputs | the **step's** Input Variables were never created |
| Values look like literal words | typed text instead of a pill |
| Action missing from the picker | never **Published** |
| Subflow missing from "Call a Subflow" | never **Published** |
| Subflow test says "No matches found" | the table has no records yet |
| Flow does nothing on create | not **Activated**, or the `is` + "empty" trap |
| Flow will not re-fire on re-demo | Run Trigger is `Once` — use `For each unique change` |
| Flow loops forever | trigger condition missing `Classification is empty` |
| Button invisible | **Form button** unticked |
| Button does nothing | **Client** ticked — untick it |
| `Invalid GlideRecord input format found` | pass `current`, not `current.getUniqueValue()` |
| `[object Object]` in a script | a Reference input is a record — coerce with `'' + x.sys_id` |
| Widget renders, table empty | wrong table name in the server script |
| Widget shows a raw parse error | unescaped `&` or `<` — SP HTML is XML; write `&amp;` and `&lt;` |
| Widget buttons do nothing | Server Script pane unticked in the editor, or `c.data` not set in `.then()` |
| "Classify all" finds nothing | used `addQuery('classification','')` — use `addNullQuery()` |
| Page renders blank | the widget was never placed — no `sp_instance` record |
| ServiceNow chrome everywhere | that is the **portal**; make your own with empty Main menu and Theme |
| Test result link will not open | use `/sys_flow_context_list.do` → top row → **Open in Operations View** |

**If you get properly stuck:** *"This is exactly the trial and error I wanted you to see — the log
tells us where it stopped."* Then open the execution and read it with them. **A debugged failure
teaches more than a smooth demo** — and on the dry run there were eight of them, which is why this
sheet exists.
