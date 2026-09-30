# NexAI OTC — Operations, Environments & Integration Guide

**Instance:** Nomura BSM development
**Companion to:** *NexAI OTC — Developer Handbook* (the code and architecture reference)
**Date:** 30 September 2026

---

## What this document is

The Developer Handbook describes **what the application is** — every Script Include, Flow Action,
table, widget and page, and how a mail travels through them.

This document covers **what you do with it**: how to give and take away access, how to publish a link
somebody outside the project can open, how to stand up another environment, how the model integration
got to its current shape, what differs between the four applications on this instance, and how the
three outstanding integrations — the mailbox, the counterparty directory (EVE) and the bookings source
(PCM) — are intended to connect.

Everything here is **native ServiceNow**: Studio, Background Scripts, Service Portal Configuration,
list views, update sets and the platform's own clone and publish tooling. There is no external build
step, and nothing in this document requires a developer toolchain on a laptop.

## How to read it

Sections 1 to 3 are **procedures** — follow them top to bottom and you will get the result. Each
gives two routes where two exist: the **navigation route** through the ServiceNow interface, and the
**script route** for when you are doing it for several people or several scopes at once.

Sections 4 to 7 are **explanation** — why the model integration looks the way it does, what actually
differs between the environments, and how the remaining integrations are intended to work. Read these
before you change anything in those areas.

Sections 8 and 9 are **status** — what is in flight, what is blocked and on whom, and what has not
been tested yet. These are the sections that go stale first; treat the date at the top as their expiry
warning.

### Conventions

- `<scope>` means one of the four application scopes on this instance. Substitute the real one.
- **All → X → Y** is the ServiceNow navigator. Type the module name in the filter if the path differs
  on your menu.
- A path like `sys_user.list` can be typed straight into the navigator filter.
- Where a step is easy to get wrong, the reason is given rather than just the instruction. The
  instruction on its own is what produces the silent failures described in section 3.

---

## Contents

| Section | Subject |
|---|---|
| 1 | Access — analyst, manager, superuser, and revoking |
| 2 | Publishing a shareable link |
| 3 | Standing up another environment |
| 4 | How the application was moved off Now Assist |
| 5 | What differs between the four environments |
| 6 | Integration plan — mailbox (EWS), counterparty directory (EVE), bookings (PCM) |
| 7 | Now Assist against direct integration, and the agentic question |
| 8 | Ongoing development |
| 9 | Pending to test, pending to build |
| 10 | Deliberately not in this document |

---

# 1. Access

## 1.1 Read this first — three gates, not one

**Holding a role does not give somebody access to anything they can use.** This is the most common
support question on the application, and the cause is that three independent things gate it:

| Gate | What it is | What it controls | Where it lives |
|---|---|---|---|
| **1. Role** | `<scope>.analyst` or `<scope>.manager` | table access, through the ACLs | `sys_user_has_role` (global) |
| **2. Work-driver assignment** | the person's entry in `assigned_users` on a published work driver | **whose mail they can see** | the scope's own `wizard` table (scoped) |
| **3. `demo_users`** | the `<scope>.demo_users` system property | the Manager/Analyst view toggle, the analyst picker — **and manager-level read** | `sys_properties` (global) |

A person with the role and no assignment logs in successfully and sees an **empty board**. That is the
normal failure, and it looks like a broken application rather than a missing grant.

> ### `demo_users` is a privileged grant, not a UI switch
>
> `AccessGuard.isManagerOrAdmin()` evaluates to `gs.hasRole('admin') || _hasManagerRole() ||
> isDemoUser()`, and `canViewAny()`, `canViewWizard()` and `canViewCashflow()` all short-circuit on
> it. **A name in `demo_users` therefore sees every work driver's mail with no role and no assignment
> at all**, bypassing gates 1 and 2.
>
> Treat adding a name to that property as granting manager-level read across the application. It is
> the correct mechanism for a superuser and the wrong one for an analyst.

Two more facts that shape everything below:

- **`canActOnCashflow()` does not short-circuit on manager or admin.** It delegates to
  `isAssignedAnalyst()`. So managers, admins and demo users are **read-only** on cashflows — they
  cannot confirm, override or write back from the portal. That is deliberate, and it means "make her a
  manager" never grants the ability to action work.
- **Never delete the `demo_users` property.** The code reads it with a hard-coded fallback name, so
  deleting the property silently makes that one person a demo operator. Set the value to empty
  instead.

**After any role change the person must log out and back in once.** Roles are cached in the session.

---

## 1.2 Add an analyst

An analyst works mail: confirms extractions, selects match candidates and resolves cashflows. They
need gate 1 and gate 2, and they must **not** get gate 3.

### Route A — through the application (recommended)

This is the supported route and it does gates 1 and 2 in one action, which is why it is preferred.

1. Sign in as a manager (or an admin) and open the portal — **`/nexai`** for the BSM application.
2. Go to **Onboarding Wizards**.
3. Find the **published** work driver the person should work. Assignment only exists on published
   drivers; a draft has nobody to assign.
4. On that card, click **Assign analysts**.
5. Tick the person and save.

That single action writes their entry into `assigned_users`, updates `assigned_count`, **and grants
the `<scope>.analyst` role**.

> **The one catch:** the picker in this modal is built from the `demo_users` property, not from the
> user directory. If the person is not in that property they will not be listed here — and adding them
> to it to make them selectable would hand them manager-level read, which defeats the point. When
> somebody is not in the picker, use Route B for the role and assignment, and leave `demo_users`
> alone.

### Route B — through the platform interface

Do this when the person is not in the picker, or when you want the role and the assignment to be
separate deliberate steps.

**Step 1 — grant the role**

1. **All → User Administration → Users** (or type `sys_user.list`).
2. Open the person. Confirm the **User ID** and **Email** before you change anything — user IDs on
   this instance are surname-and-initial style and easy to confuse.
3. Scroll to the **Roles** related list and click **Edit**.
4. Move **`<scope>.analyst`** into the selected column. For the BSM application that is
   `x_nose_nfotc_bsm.analyst`.
5. Save.

**Step 2 — assign them to the work driver**

1. Type **`<scope>_wizard.list`** in the navigator — for example `x_nose_nfotc_bsm_wizard.list`.
2. Open the **published** driver.
3. `assigned_users` is a **JSON array**, in this exact shape:

```json
[{"id": "<sys_id of the sys_user record>", "name": "Display Name"}]
```

4. Append the person's object. Use their **`sys_id`**, not their user name.
5. Set **`assigned_count`** to the new number of entries. Nothing recalculates it, and the manager
   dashboard reads it directly — a stale count is a wrong dashboard.
6. Save.

> Editing JSON by hand is the step that breaks. If the board goes empty afterwards, the array is
> malformed — the code wraps the parse in `try/catch` and falls back to an empty list, so a bad edit
> reads as "nobody is assigned" rather than as an error. Use the script in section 1.5 as a model when
> you have more than one person to add.

### Verify it

Impersonate them rather than asking them to check: **profile menu → Impersonate User**. They should
see one card per assigned published driver, and the board should have rows. Then end the
impersonation.

---

## 1.3 Add a manager

A manager builds and configures work drivers and oversees the analysts. They need gate 1 only.

Remember the consequence from 1.1: **a manager is read-only on cashflows.** They get the manager
dashboard, every board in read-only mode, the wizard builder and the audit trail — they cannot confirm
or write back. If somebody needs to do both jobs, give them the analyst role *and* a work-driver
assignment as well as the manager role.

### Route A — platform interface

1. **All → User Administration → Users** → open the person.
2. **Roles** related list → **Edit**.
3. Add **`<scope>.manager`** — for example `x_nose_nfotc_bsm.manager`.
4. Save, and have them sign out and in.

They will land on the **Manager Dashboard** rather than the work-driver cards; the redirect is driven
by the role.

### Route B — script

Run in **All → System Definition → Background Scripts**, with the **Application picker set to the
scope** you are granting in, and **sandbox unchecked**.

```javascript
(function () {
    // Copy the User ID exactly from sys_user.list.
    var USER_NAME = 'userid';

    var SCOPE = '' + gs.getCurrentScopeName();
    var ALLOWED = { 'x_nose_nfotc_bsm': 1, 'x_nose_nexai_dev': 1,
                    'x_nose_nexai_test': 1, 'x_nose_nexai_uat': 1 };
    if (!ALLOWED[SCOPE]) {
        gs.error('Set the Application picker to a NexAI OTC application. Nothing changed.');
        return;
    }

    var u = new GlideRecord('sys_user');
    u.addQuery('user_name', USER_NAME);
    u.setLimit(1);
    u.query();
    if (!u.next()) { gs.error('No such user: ' + USER_NAME); return; }

    var role = SCOPE + '.manager';
    var r = new GlideRecord('sys_user_role');
    if (!r.get('name', role)) { gs.error('Role does not exist: ' + role); return; }

    var has = new GlideRecord('sys_user_has_role');
    has.addQuery('user', u.getUniqueValue());
    has.addQuery('role', r.getUniqueValue());
    has.query();
    if (has.hasNext()) { gs.info(USER_NAME + ' already holds ' + role); return; }

    var i = new GlideRecord('sys_user_has_role');
    i.initialize();
    i.setValue('user', u.getUniqueValue());
    i.setValue('role', r.getUniqueValue());
    gs.info(i.insert() ? ('GRANTED ' + role + ' to ' + USER_NAME)
                       : ('REFUSED - insert returned null for ' + role));
    gs.info('They must log out and back in once. They are READ-ONLY on cashflows by design.');
})();
```

---

## 1.4 Add a superuser

A superuser sees **everything** — every work driver's mail in the scope, with no assignment — plus the
Manager/Analyst view toggle. That is gates 1 and 3. Gate 2 is deliberately skipped, because
`demo_users` already bypasses it and an assignment would add nothing.

They remain read-only on cashflows unless they are also assigned to a driver (see 1.1).

### Route A — platform interface

**Step 1 — the two roles**

1. **All → User Administration → Users** → open the person → **Roles** → **Edit**.
2. Add both **`<scope>.analyst`** and **`<scope>.manager`**.
3. Save.

**Step 2 — the view toggle and the wide read**

1. **All → System Properties → All Properties** (or `sys_properties.list`).
2. Filter **Name** *contains* `demo_users`. You will see one per scope — pick the right one:
   `x_nose_nfotc_bsm.demo_users`, `x_nose_nexai_dev.demo_users`, and so on.
3. Open it. The **Value** is a **comma-separated list of User IDs** — user names, not email addresses
   and not sys_ids.
4. **Append** the person's User ID to the existing list. Do not replace the value: removing an
   existing name silently removes that person's access.
5. Update.

> If the property does not exist for that scope, **create it** rather than relying on the default —
> and when you do, seed it with the existing fallback name as well as the new one, or you will remove
> the fallback user's access at the moment you create it. Name it exactly `<scope>.demo_users`, type
> `string`.

### Route B — script (covers all four scopes at once)

Roles and properties are **global** tables, so a single run from **Global** covers every scope. That
is the reason this script does not do the work-driver assignment — that table is scoped and would
force one run per scope for no benefit, since `demo_users` already bypasses assignment.

Run in **Background Scripts**, **Application = Global**.

```javascript
(function () {
    var USER_NAME = 'userid';                     // copy from sys_user.list
    var SCOPES = ['x_nose_nfotc_bsm', 'x_nose_nexai_dev',
                  'x_nose_nexai_test', 'x_nose_nexai_uat'];
    var FALLBACK = 'the.fallback.userid';         // see the note under this script

    var log = [];
    function p(s) { log.push(s); }

    var here = '' + gs.getCurrentScopeName();
    if (here !== 'global' && here !== 'rhino.global') {
        gs.error('Set the Application picker to Global and run again. Nothing changed.');
        return;
    }

    var u = new GlideRecord('sys_user');
    u.addQuery('user_name', USER_NAME);
    u.setLimit(1);
    u.query();
    if (!u.next()) { gs.error('No such user: ' + USER_NAME); return; }
    var uid = u.getUniqueValue(), uname = '' + u.getValue('user_name');
    p('user ' + u.getValue('name') + '  (' + uname + ')  active=' + u.getValue('active'));

    for (var s = 0; s < SCOPES.length; s++) {
        var scope = SCOPES[s];
        p('');
        p(scope);

        // --- gate 1: both roles
        var wanted = [scope + '.analyst', scope + '.manager'];
        for (var w = 0; w < wanted.length; w++) {
            var r = new GlideRecord('sys_user_role');
            if (!r.get('name', wanted[w])) {
                p('   role ' + wanted[w] + '  does not exist - skipped');
                continue;
            }
            var c = new GlideRecord('sys_user_has_role');
            c.addQuery('user', uid);
            c.addQuery('role', r.getUniqueValue());
            c.query();
            if (c.hasNext()) { p('   role ' + wanted[w] + '  already held'); continue; }
            var i = new GlideRecord('sys_user_has_role');
            i.initialize();
            i.setValue('user', uid);
            i.setValue('role', r.getUniqueValue());
            p('   role ' + wanted[w] + (i.insert() ? '  GRANTED' : '  REFUSED'));
        }

        // --- gate 3: the view toggle (and the wide read that comes with it)
        var key = scope + '.demo_users';
        var pr = new GlideRecord('sys_properties');
        pr.addQuery('name', key);
        pr.setLimit(1);
        pr.query();

        if (!pr.next()) {
            // The code reads this with a hard-coded fallback, so a MISSING property is not the same
            // as an empty one: creating it with only the new name would remove the fallback user's
            // access. Carry the fallback in.
            var np = new GlideRecord('sys_properties');
            np.initialize();
            np.setValue('name', key);
            np.setValue('value', FALLBACK + ',' + uname);
            np.setValue('type', 'string');
            np.setValue('description', 'Comma-separated User IDs who get the Manager/Analyst view ' +
                'toggle and appear in the analyst picker. NOTE: a name here also grants ' +
                'manager-level READ across the application.');
            p('   ' + key + (np.insert() ? '  CREATED with the fallback carried in' : '  create FAILED'));
            continue;
        }

        var cur = '' + (pr.getValue('value') || '');
        var parts = cur.split(','), found = false;
        for (var k = 0; k < parts.length; k++) {
            if (parts[k].replace(/^\s+|\s+$/g, '') === uname) { found = true; break; }
        }
        if (found) {
            p('   ' + key + '  already lists ' + uname);
        } else {
            var next = cur.replace(/^\s+|\s+$/g, '');
            pr.setValue('value', next ? (next + ',' + uname) : uname);
            pr.update();
            p('   ' + key + '  APPENDED');
        }
    }

    p('');
    p('They must log out and back in once.');
    p('They are still READ-ONLY on cashflows - demo_users bypasses visibility, not action.');
    gs.info('\n' + log.join('\n'));
})();
```

> Before running it, replace `FALLBACK` with the name the code actually defaults to. Find it by
> opening `AccessGuard` in Studio and reading the default in the `demo_users` lookup. If the property
> already exists in every scope — which it does today — the fallback is never used and the value is
> irrelevant.

---

## 1.5 Revoke access

**Removing the role is not enough.** This is the mirror of 1.1 and the most important paragraph in
this section: if you remove somebody's role but leave their name in `demo_users`, they still have
**manager-level read across the whole application**, because `isManagerOrAdmin()` short-circuits on
the property before it ever looks at a role.

> The Developer Handbook's section 10.2 currently says *"`demo_users` only controls the view toggle"*
> when describing removal. That is wrong, and it contradicts section 9.4 of the same document. Revoke
> all three gates.

Work in this order — widest grant first, so there is no window where they still have broad read.

### Step 1 — remove them from `demo_users`

1. **All → System Properties → All Properties** → filter **Name** contains `demo_users`.
2. For **each scope** they should lose: open the property and delete just their User ID from the
   comma-separated **Value**, leaving the other names and the commas intact.
3. Update. **Do not delete the property**, even if they were the only name — set the value empty.

### Step 2 — remove the work-driver assignment

**In the application:** Onboarding Wizards → the published driver → **Assign analysts** → untick them
→ save.

**In the platform:** `<scope>_wizard.list` → open each driver → remove their object from the
`assigned_users` JSON → **decrement `assigned_count`** to match → save.

Do this on **drafts as well as published drivers**. A draft can carry an assignment from before it was
demoted, and leaving it there means the person regains visibility the moment somebody republishes that
driver.

### Step 3 — remove the roles

1. **All → User Administration → Users** → open the person → **Roles** related list.
2. Select `<scope>.analyst` and `<scope>.manager` and **Delete**.
3. Alternatively work from `sys_user_has_role.list`, filtered on User, which is faster when you are
   removing them from all four scopes at once.

### Step 4 — check for a grant that outranks all of it

`isManagerOrAdmin()` begins with `gs.hasRole('admin')`. **If the person holds `admin`, none of the
above restricts them at all** — and `admin` also defeats the cashflow write ACL, which is set to allow
admin override. Check the Roles related list for `admin` and for any group membership that carries it
(**All → User Administration → Groups**, or the person's **Groups** related list). Removing platform
`admin` is a decision for whoever owns the instance, not an application change.

### Step 5 — end the session

Role changes are cached for the life of the session, so somebody already signed in keeps their old
access until they sign out. To cut it immediately, either set **Active** to false on the user record,
or terminate the session: **All → User Administration → Active Sessions**, find the row, delete it.

### Script route

Reverses all three gates across every scope in one run. **Application = Global.**

```javascript
(function () {
    var USER_NAME = 'userid';
    var SCOPES = ['x_nose_nfotc_bsm', 'x_nose_nexai_dev',
                  'x_nose_nexai_test', 'x_nose_nexai_uat'];

    var log = [];
    function p(s) { log.push(s); }

    if (('' + gs.getCurrentScopeName()).indexOf('global') === -1) {
        gs.error('Set the Application picker to Global. Nothing changed.');
        return;
    }

    var u = new GlideRecord('sys_user');
    u.addQuery('user_name', USER_NAME);
    u.setLimit(1);
    u.query();
    if (!u.next()) { gs.error('No such user: ' + USER_NAME); return; }
    var uid = u.getUniqueValue(), uname = '' + u.getValue('user_name');
    p('REVOKING  ' + u.getValue('name') + '  (' + uname + ')');

    for (var s = 0; s < SCOPES.length; s++) {
        var scope = SCOPES[s];
        p('');
        p(scope);

        // --- gate 3 first: the widest grant
        var key = scope + '.demo_users';
        var pr = new GlideRecord('sys_properties');
        pr.addQuery('name', key);
        pr.setLimit(1);
        pr.query();
        if (pr.next()) {
            var parts = ('' + (pr.getValue('value') || '')).split(','), keep = [], removed = false;
            for (var k = 0; k < parts.length; k++) {
                var t = parts[k].replace(/^\s+|\s+$/g, '');
                if (!t) { continue; }
                if (t === uname) { removed = true; } else { keep.push(t); }
            }
            if (removed) {
                pr.setValue('value', keep.join(','));  // empty is correct; never delete the row
                pr.update();
                p('   ' + key + '  REMOVED  (now "' + keep.join(',') + '")');
            } else {
                p('   ' + key + '  was not listed');
            }
        } else {
            p('   ' + key + '  no such property');
        }

        // --- gate 2: work-driver assignment, drafts included
        var w = new GlideRecord(scope + '_wizard');
        w.query();
        while (w.next()) {
            var a = [];
            try { a = JSON.parse(w.getValue('assigned_users') || '[]'); } catch (e) { a = []; }
            var out = [], hit = false;
            for (var j = 0; j < a.length; j++) {
                if (a[j] && a[j].id === uid) { hit = true; } else { out.push(a[j]); }
            }
            if (!hit) { continue; }
            w.setValue('assigned_users', JSON.stringify(out));
            w.setValue('assigned_count', out.length);   // nothing recalculates this
            p('   driver "' + w.getValue('name') + '"  UNASSIGNED' + (w.update() ? '' : '  (REFUSED)'));
        }

        // --- gate 1: the roles
        var wanted = [scope + '.analyst', scope + '.manager'];
        for (var x = 0; x < wanted.length; x++) {
            var r = new GlideRecord('sys_user_role');
            if (!r.get('name', wanted[x])) { continue; }
            var h = new GlideRecord('sys_user_has_role');
            h.addQuery('user', uid);
            h.addQuery('role', r.getUniqueValue());
            h.query();
            var n = 0;
            while (h.next()) { h.deleteRecord(); n++; }
            p('   role ' + wanted[x] + (n ? '  REVOKED' : '  was not held'));
        }
    }

    p('');
    p('If this person holds the platform admin role, everything above is cosmetic until that is');
    p('removed - isManagerOrAdmin() short-circuits on admin and the cashflow write ACL allows');
    p('admin override. Check the Roles related list.');
    p('');
    p('Their current session keeps the old access until they sign out. To cut it now, delete their');
    p('row in Active Sessions, or set Active = false on the user record.');
    gs.info('\n' + log.join('\n'));
})();
```

> One caveat on this script: `wizard` is a **scoped** table, so a write to it from Global can be
> refused. If the run reports `(REFUSED)` against a driver, do gate 2 from inside that scope — set the
> Application picker to it and re-run with the role and property blocks commented out, or simply
> untick the person in the Assign analysts modal.

---

## 1.6 Quick reference

| | Role(s) | Work-driver assignment | `demo_users` | Can action cashflows? |
|---|---|---|---|---|
| **Analyst** | `.analyst` | **yes — required** | no | **yes** |
| **Manager** | `.manager` | no | no | no — read-only |
| **Superuser** | `.analyst` + `.manager` | not needed | **yes** | no — unless also assigned |
| **Revoke** | delete both | remove from every driver, fix `assigned_count` | remove the name, keep the row | — |

**Sanity checks after any change:** impersonate the person; confirm the board has rows; confirm the
role label in the header reads what you expect. For a revocation, confirm the portal refuses them
rather than showing an empty board — an empty board means they still have a surface.
---

# 2. Publishing a shareable link

The application is already reachable — the BSM build lives at **`/nexai`**. This section is about
producing a **second, separate link**: a different audience, a different landing page, or a view
without the application's header and menu. That is done by creating **another portal record** that
points at pages you already have. You do not duplicate a single page or widget to do it.

## 2.1 What a link is actually made of

A Service Portal URL has three parts:

```
https://<instance>.service-now.com / nexai        ? id= bsm_nfotc_home
                                     ^^^^^             ^^^^^^^^^^^^^^^
                                     the portal        the page
                                     (URL suffix)      (page ID)
```

- The **portal** (`sp_portal`) is the wrapper: theme, header, menu, homepage, login page. It owns the
  URL suffix.
- The **page** (`sp_page`) is the content, identified by its **ID**. Page IDs are **unique across the
  whole instance**, not per portal.
- Any page can be opened through **any** portal, simply by changing the suffix in front of it. This is
  the mechanism that makes a second link cheap: the same page inside a different wrapper looks
  different without a single change to the page or its widgets.

The pages that exist today, for reference:

| Page | ID |
|---|---|
| NexAI OTC (home) | `bsm_nfotc_home` |
| OTC Settlements (the board) | `bsm_nfotc_wiz_dash` |
| OTC AI Extraction (the case screen) | `bsm_ai_extraction` |
| Work Drivers | `bsm_work_drivers` |
| Onboarding Wizards | `bsm_wizard_list` |
| Wizard Builder | `bsm_wizard_builder` |
| Manager Dashboard | `bsm_manager_dashboard` |
| Audit Trail | `bsm_nfotc_audit` |
| AI Usage & Cost | `bsm_llm_usage` |
| Compare & Match | `bsm_comparematch` |
| Sign in | `bsm_nfotc_login` |

Other scopes follow their own prefix — the test application names its pages `nexaitest_*`. Keep to the
scope's convention when you add one, because the ID is instance-unique and a clash is rejected.

## 2.2 Before you create anything

Confirm these, in this order. Creating the portal is two minutes; the mistakes below cost an afternoon.

1. **The pages exist and work.** Open each one through the existing portal first. A new portal will not
   fix a page that is broken.
2. **The widgets gate themselves.** This application does its access control **in widget server
   scripts through `AccessGuard`**, not through page ACLs — thirteen of the sixteen widgets call it.
   That is what makes a second portal safe: the same checks run whichever wrapper the page is in. If
   you add a widget of your own, it must call `AccessGuard` too, or it will be readable through any
   portal by anyone who can sign in.
3. **Decide the audience.** A link for Nomura reviewers who should see but not touch is a different
   decision from a link for analysts who will work in it. The portal does not decide this — the roles
   and the assignment from section 1 do.
4. **Pick a URL suffix nobody is using.** Check `sp_portal.list` first. Suffixes must be unique, and a
   clash silently shadows one of the two portals.

## 2.3 Create the portal

1. **All → Service Portal → Service Portal Configuration**.
2. Click **Portals**. This is the `sp_portal` list.
3. **New**, and fill in:

| Field | What to put | Notes |
|---|---|---|
| **Title** | e.g. `NexAI OTC — Review` | shown in the browser tab and the header |
| **URL suffix** | e.g. `nexaireview` | **this is the link.** Lower case, no spaces, no leading slash |
| **Homepage** | the `sp_page` the bare link should open | what somebody sees when they type the suffix with no `?id=` |
| **Login page** | `bsm_nfotc_login` | see 2.6 — omitting this is the usual mistake |
| **Theme** | the same theme as the existing portal | leave blank only if you want stock Service Portal styling |
| **Logo / Icon** | optional | |
| **Hide portal name in header** | tick to match the existing portal | the current portal hides it |

4. Save.

The link is now live:

```
https://<instance>.service-now.com/nexaireview
```

and any page can be reached through it:

```
https://<instance>.service-now.com/nexaireview?id=bsm_nfotc_wiz_dash
```

## 2.4 Add a menu, if the link needs to navigate

A portal with no menu shows only its homepage and whatever that page links to. If people need to move
between pages:

1. In **Service Portal Configuration**, open **Menus**.
2. **New** — give it a name, save.
3. In the **Menu Items** related list, add one item per destination. Each item takes a **Label**, a
   **Type** (usually *Page*), and the **Page** or URL. Use **Order** to sequence them.
4. Open your portal record and set its **Main menu** to the menu you just created.

If you want the second link to be deliberately **bare** — one screen, no navigation, nothing to
wander into — leave the menu empty. That is the cleanest way to hand somebody a single view.

## 2.5 The bare-view pattern

This is worth knowing because it solves the "can you send me just that one screen" request without any
build work:

> Create a portal with **no menu**, **no theme** (or a minimal one), and the target page as its
> **Homepage**. The page and its widgets are untouched — the same records serve both links. The
> original portal keeps its full chrome.

The Developer Handbook records this as the intended mechanism, and it is the reason there is no
"printable" or "embed" variant of any page in the application: the wrapper does that job.

## 2.6 Sign-in behaviour, and what the link does for somebody who is not logged in

Two things decide this:

- **The portal's Login page.** If it is set, an unauthenticated visitor is sent there. If it is blank,
  they get the platform's default login, which looks nothing like the application.
- **The `sso_idp` property.** The application's login widget is **SSO-only whenever that property is
  set** — it will not show a username and password form. That is the configured behaviour on this
  instance, and it is correct for Nomura.

So a link sent to somebody **with** an account takes them through SSO into the page. A link sent to
somebody **without** one fails at sign-in. There is no anonymous or public mode, and you should not
create one:

> **Do not tick `Public` on any page of this application.** Every widget's access check assumes an
> authenticated user — `AccessGuard` resolves the current user to decide what they may see. A public
> page would evaluate those checks against no user at all. The correct way to widen access is a role
> and an assignment (section 1), never a public page.

## 2.7 Test the link before you send it

Do all four. The first two pass even when the link is wrong for the recipient.

1. **As yourself** — open the suffix with no `?id=`, then with each page ID you intend people to use.
2. **Impersonated as a manager** — confirm the read-only banner appears and the boards populate.
3. **Impersonated as an analyst** — confirm they see their assigned driver and nothing else.
4. **Impersonated as somebody with no application role** — confirm they are refused. If they instead
   see an empty page with working chrome, a widget is missing its `AccessGuard` check.

Then send the link with one line saying which role the recipient needs, because the link alone will not
tell them why they cannot see anything.

---

# 3. Standing up another environment

"Duplicate the instance" can mean two different things, and they have very different costs. Settle
which one you need before starting.

| You want | Route | Cost | Use when |
|---|---|---|---|
| Another **application environment** — a fifth build alongside dev, test, UAT and BSM, on this instance, with its own data and its own link | **Route A: a new application scope** (3.2) | half a day, scriptable | a new workstream, a parallel pilot, a training sandbox |
| Another **instance** — a separate ServiceNow URL entirely | **Route B: clone, or publish and install** (3.3) | a request and a wait; a clone overwrites its target | a genuine environment promotion, or somewhere isolated from this instance's data |

Most requests that arrive as "can we have our own copy" are satisfied by Route A, because the four
existing environments on this instance are exactly that pattern.

## 3.1 The one thing that makes this harder than it looks

**The scope name is written into every file.** A Script Include in one application calls its siblings
as `new x_nose_nfotc_bsm.Something()` and builds its table names from the same prefix. Copy that file
into another application without rewriting the token and you get a file that calls the **other**
application — and because those calls sit inside `try/catch`, **it fails silently and returns empty**.
No error, no log entry, just no data.

Every procedure in this section exists to prevent that one failure. Do not skip the verification steps;
they are the only thing that catches it.

## 3.2 Route A — a new application scope

### Step 1 — create the application

1. **All → System Applications → Studio**.
2. **Create Application** → *Start from scratch*.
3. Set the **Name** and let the platform derive the **Scope**, or set it deliberately — e.g.
   `x_nose_nexai_sit`. Note the prefix it gives you.
4. **You cannot rename a scope afterwards.** It is baked into every table name and every cross-file
   call you are about to create. Get it right now.

> A word on naming: the four existing scopes **do not share a prefix** — `nfotc_bsm` against
> `nexai_*`. Any script that enumerates the environments must therefore use an explicit list, never a
> prefix test, or it will also catch the older application that is present on the same instance.
> Whatever you name the new one, add it to the `SCOPES` array in the scripts in section 1.

### Step 2 — create the roles

In Studio: **File → New → Role**, twice — `<newscope>.analyst` and `<newscope>.manager`. Create them
explicitly rather than letting them appear implicitly, so the ACLs you copy later have something to
bind to.

### Step 3 — create the tables

Twelve tables, with the same column names as the source. In Studio, **File → New → Table** for each,
then add the columns.

This is the most tedious step and the one worth scripting. If you script it, read the source
application's dictionary rows and create the equivalents stamped to the new application — and run that
**from Global**, because `sys_dictionary` refuses creates from a scoped application (see the table in
Step 5).

The twelve: `audit`, `booking`, `capability`, `cashflow`, `config`, `counterparty`, `email`,
`llm_usage`, `mailbox_drop`, `wizard`, `work_item`, `zip_drop`.

### Step 4 — copy the code, rewriting the scope token

For every Script Include, Flow Action, widget, page, ACL and Business Rule:

1. Read the source record **from the instance**, not from any copy.
2. Replace **every** occurrence of the source scope token with the target token, in memory.
3. Write it to the new record.
4. **Read it back and verify** — all four of these, per artefact:
   - the expected character length,
   - **zero** occurrences of the source token,
   - the expected count of the target token,
   - a known marker string from the body survived.

Step 4 is not optional. It is the only thing standing between you and the silent failure in 3.1.

### Step 5 — which application context to run each write from

This catches people out, and it is not consistent:

| Writing to | Run from |
|---|---|
| `sys_dictionary`, `sys_script`, `sys_script_include`, `sys_ui_action`, and **all `sp_*` tables** (widgets, pages, containers, rows, columns, instances) | **Global** — a scoped application cannot create these, even for its own tables. Stamp both `sys_scope` **and** `sys_package` to the new application, or the records land in Global and never travel with the app |
| the new application's **own data tables** (`config`, `wizard`, `counterparty`, `booking`, …) | **inside the new scope** — these refuse writes from Global |

So a full stand-up is **two passes from two different application contexts**. There is no single
context that can do both. Plan the run order around that rather than discovering it halfway.

### Step 6 — seed the data

An application with no data looks broken in a specific, confusing way: the board renders and is empty.

| Seed | Why |
|---|---|
| **At least one published work driver** | Sync does nothing at all without one |
| **Analysts assigned to it** | otherwise the board is empty even with roles |
| **The counterparty directory** | otherwise counterparty resolution returns blank for every mail |
| **The booking golden source** | otherwise Compare & Match has nothing to match against |
| **The `config` rows** | extraction, match and spreadsheet keys — copy the source set |
| **The properties** | `demo_users`, `noise_domains`, `sso_idp`, the model and trace settings |

For the reference tables, the native route is **System Import Sets → Load Data** with a transform map,
or an XML export from the source list and **System Definition → Import XML** on the target. XML
preserves sys_ids, which is what you want for reference data and emphatically not what you want for
transactional data.

### Step 7 — turn on record auditing

From **Global**, tick **Audit** on the **collection-level dictionary entry** (the row where `element`
is empty) for each of the eight tables that are audited in the other environments: `booking`,
`capability`, `cashflow`, `config`, `counterparty`, `email`, `wizard`, `work_item`.

Deliberately **not** audited: `audit` (already append-only), `llm_usage` (high volume), `mailbox_drop`,
`zip_drop`.

### Step 8 — give it its own link

Follow section 2. New portal record, new URL suffix, homepage pointing at the new application's home
page. Remember page IDs are instance-unique — prefix the new application's pages so they do not collide
with `bsm_*` or `nexaitest_*`.

### Step 9 — smoke test, in this order

Each step depends on the one before it, so stop at the first failure rather than working through the
list.

1. Drop one mail in and run **Sync now**. A row should appear.
2. Confirm the classification landed, with a reason.
3. Confirm cashflows were extracted — if zero, the scope token is wrong somewhere in the extraction
   chain. That is the classic symptom.
4. Confirm a field on a cashflow, and check the audit trail recorded it.
5. Run **Compare & Match** and confirm candidates appear.
6. Check the board counts against the row count.
7. Impersonate an analyst and confirm they see only their driver.

### A realistic note on effort

Steps 3 and 4 are the whole job. The other seven are an hour between them. If you are doing this more
than once, write the copy-and-verify pass as a reusable Background Script rather than clicking through
Studio — the per-artefact read-back is easy to script and impossible to do reliably by hand.

## 3.3 Route B — a separate instance

### Option 1: clone

A clone copies one instance over another. Native path: **All → System Clone**.

| Module | What you do there |
|---|---|
| **Request Clone** | choose the target, schedule it |
| **Exclude Tables** | tables whose **data** should not come across |
| **Preserve Data** (data preservers) | records on the **target** that must survive the clone |
| **Clone History** | what happened, and when |

Before requesting one, understand three things:

- **A clone overwrites the target completely.** Everything on it is replaced. This is not a merge and
  there is no undo.
- **Sub-production only.** You cannot clone onto production.
- **Instance-specific configuration does not survive meaningfully.** After a clone you must re-check,
  at minimum: the **MID server** records and every property that names one, the credential records,
  outbound email (disabled by default on a freshly cloned target), and any integration endpoint that
  differs per environment.

Add to that list one item specific to this application: the **trace collector MID server property is
environment-specific** and must be corrected after any move. The Developer Handbook flags it for
exactly this reason.

### Option 2: publish the application and install it

This moves the **application**, not the data — which is often what you actually want.

1. In **Studio**, open the application → **Publish** → *to Application Repository*. Give it a version.
2. On the target instance: **All → System Applications → All Available Applications → All**, find it,
   **Install**.

Then bring the reference data across separately, with Import Sets or XML as in Step 6 above. The
advantages over a clone are that nothing on the target is destroyed, and you can move one application
without moving the other three.

### Which to choose

| | Clone | Publish and install |
|---|---|---|
| Brings data | yes, all of it | no — application only |
| Destroys the target | **yes** | no |
| Granularity | whole instance | one application |
| Good for | standing up a like-for-like environment from scratch | promoting this application to an instance already in use |

For moving this application to somewhere that is already being used for something else, **publish and
install**. Reach for a clone only when you genuinely want the target to become a copy of the source.

## 3.4 Post-move checklist

Applies to both routes. Work down it — every item has bitten somebody.

- [ ] MID server records exist and are **Up**; every property naming a MID server points at one that
      exists on this instance
- [ ] Credential records re-entered (they do not travel usefully)
- [ ] The model gateway is reachable **through the MID server**, not directly — a direct call fails
      host resolution
- [ ] `sso_idp` correct for the environment, and the login page reachable
- [ ] `noise_domains` set to the domains this mailbox actually receives — it ships with a placeholder
- [ ] `extract.chunk_cap` tuned for this environment (see section 5.5)
- [ ] At least one **published** work driver, with analysts assigned
- [ ] Counterparty directory and booking table seeded
- [ ] Record auditing ticked on the eight tables
- [ ] Portal suffix resolves, and page IDs do not collide with another application's
- [ ] One mail processed end to end, with a cashflow and an audit trail to show for it
---

# 4. How the application was moved off Now Assist

This is the migration people mean when they ask how the current build differs from the earlier one.
It was not a data migration and not an instance move — it was a change of **how the application reaches
the language model**, and it removed a whole platform layer from the path.

## 4.1 What the path used to be

The earlier build reached the model through **Now Assist**:

```
Script Include
   -> a Now Assist skill  (authored in the Skill Kit)
      -> a Custom LLM provider registration
         -> a subflow that called the enterprise model gateway
            -> the gateway
```

The gateway was registered as a **bring-your-own-model provider**, so it appeared as a selectable model
inside Now Assist and the skills invoked it like any platform model. One further piece was needed to
make it work at all: model calls made from a background context could not reach the MID server the way
the skill layer expected, so a **loopback bridge** sat in the middle to get the call out.

It worked. Extraction ran end to end through it. The reasons for leaving were operational, not a
failure to function.

## 4.2 Why it moved

Five things, in roughly the order they hurt:

**1. Skill configuration is install-once, and duplicated.** Each skill existed as **five or six
separate definition records**. A configuration change therefore had to be applied to every copy. When
the token ceiling had to be raised for large mails, changing the code changed nothing — the live value
sat in the duplicated definition records and had to be updated across all sixteen of them by hand
before the fix took effect. A build where the deployed artefact does not carry the setting is a build
that drifts.

**2. One shared model configuration across all four applications.** The skill layer's model settings
were shared instance-wide, which made them a **single point of failure across every scope**. An entire
outage was once traced not to code but to edits in that shared configuration — restoring the earlier
settings fixed it. Four environments that cannot be configured independently are not four
environments.

**3. The orchestration layer does not support a bring-your-own model.** This is the decisive one and it
is covered in section 7: native agent orchestration requires one of the platform's integrated
providers. So the gateway could only ever live at the skill layer, never at the orchestration layer —
which capped what Now Assist could contribute.

**4. Failures were hard to attribute.** With a skill, a provider registration, a subflow, a bridge and
a gateway in the chain, a timeout could originate in any of five places. Several incidents were
diagnosed to the wrong layer before the real cause was found.

**5. Licensing.** Authoring the higher-tier pieces depends on entitlements the project cannot assume
are present in every environment, which makes a design that requires them fragile.

## 4.3 What changed, artefact by artefact

The path is now:

```
Script Include  ->  the global gateway client  ->  the gateway
```

| Before | After |
|---|---|
| Three AI Script Includes invoked Now Assist skills | The same three call the **global gateway client's** `invoke()` directly |
| Skills authored and versioned in the Skill Kit | Removed from the path; no skill is invoked |
| A loopback bridge to get background calls out to the MID server | **Deleted** — no longer needed once the client is called directly |
| A Custom LLM provider registration and its subflow | No longer on the extraction path |
| Prompts lived in skill definitions, duplicated five or six times each | Prompts live in **the work-driver record's field definitions** and the `config` table — one place, editable by a manager |
| Usage and cost reported at the skill layer | The application's **own `llm_usage` table**, populated from the gateway's own returned metrics — not estimates |
| Compliance registration handled by the platform layer | Stamped by the client on **every** call |

The three Script Includes that changed are the ones that make model calls: the document/field extractor,
the generic runtime extractor, and the prompt-authoring helper. Everything downstream — classification
rules, the comparison tiers, the audit trail, the boards — was untouched. That is why the migration did
not disturb the settlement logic.

## 4.4 The gotchas — read these before touching the model path

**Call the global client, fully qualified.** The client wraps a REST Message that is
**package-private**, which means a scoped copy of the client **cannot reach it**. A scoped Script
Include must call the Global one by its fully qualified name. Copying the client into a scope looks
tidy and produces a client that cannot make a request.

**The client is shared, and that is the residual trade-off.** Having removed a shared *skill
configuration*, the build now has a shared *client*. A change to it affects all four applications.
It is a smaller surface and a far more legible one — it is one script, not sixteen definition records —
but it is still shared. Treat an edit to it as a change to every environment.

**The compliance registration must go in the request body.** It belongs in the request's parameters
object. Supplied as a query parameter it is **silently ignored**, and the call proceeds without it —
which is worse than failing, because nothing tells you the mandate was not met.

**Read the failure code before theorising.** The mapping is reliable:

| Symptom | Cause |
|---|---|
| **404** | the endpoint **path** is wrong — usually a lost path segment on the invoke URL |
| **401 / 403** | the token |
| **200, with an error payload in the body** | the gateway or the model behind it, not your code |
| Host resolution failure | the call went **direct** instead of through the MID server |

A whole extraction outage was once nothing but a missing path segment on the endpoint. Check the cheap
thing first.

**There is a hard 30-second ceiling on a single call.** It is a platform-level wait on the MID channel,
and **neither raising the response timeout nor asking for a longer wait moves it**. This is why
extraction segments a large mail into chunks instead of sending one big request, and why the chunk cap
is tuned per environment (section 5.5). If you "fix" a slow extraction by making the request bigger, it
will fail at almost exactly thirty seconds.

**The deterministic fallback stayed.** Where a model call fails, callers fall back to deterministic
behaviour rather than producing nothing. Keep that property in anything you add — it is what stops a
gateway outage from emptying the boards.

## 4.5 How to confirm a given application is fully off Now Assist

Five checks. Do them in Studio against the scope in question.

1. **The three AI Script Includes** reference the global client directly. Search the scope for the
   client name; you should find it in exactly those three.
2. **No skill invocation remains.** Search the scope's Script Includes and Flow Actions for skill API
   calls. Zero hits.
3. **No Custom LLM subflow on the path.** Open the extraction Flow Action and follow it — it should
   reach a Script Include, not a subflow that fronts a model.
4. **The usage table is being written.** Process one mail and confirm a new row appears in `llm_usage`
   with a latency and a cost. If the row is absent, the call is going somewhere other than the client.
5. **One mail, end to end.** Drop it, sync, and confirm cashflows appear. This is the only check that
   proves the whole chain.

---

# 5. What differs between the four environments

## 5.1 The four applications

The same application is installed four times on this instance, as separate scopes:

| Application | Scope | Purpose |
|---|---|---|
| **NexAI OTC BSM** | `x_nose_nfotc_bsm` | the build the Developer Handbook describes |
| NexAI OTC Dev | `x_nose_nexai_dev` | development |
| NexAI OTC Test | `x_nose_nexai_test` | testing — **and where the real mail corpus is loaded** |
| NexAI OTC UAT | `x_nose_nexai_uat` | user acceptance |

Two structural consequences, both of which have caused real bugs:

- **They do not share a name prefix** — `nfotc_bsm` against `nexai_*`. Any script that enumerates the
  environments must use an **explicit list**, never a prefix test, or it will also match the older
  application present on the same instance.
- **The scope name is written into every file**, which is what makes moving code between them a
  rewrite rather than a copy. Section 3.1 covers the failure mode.

## 5.2 What actually differs

This is the table people want, and it is more interesting than "the code is identical".

| | BSM | Dev | Test | UAT |
|---|---|---|---|---|
| Mail corpus loaded | sample | sample | **the real 107-mail corpus** | sample |
| Page ID prefix | `bsm_*` | its own | `nexaitest_*` | its own |
| Native record auditing on the 8 tables | yes | yes | yes | yes |
| **Exceptions view** | no | no | **yes** | no |
| **Gross / Net settlement switch** | no | no | **yes** | no |
| Documented in the Developer Handbook | **yes** | by implication | by implication | by implication |

**The corpus lives in the test application.** 107 mails — 72 relevant, 35 dropped as irrelevant. Of
the 72, 63 carried an extraction stamp when last measured on 29 September, and **9 produced no cashflow
at all**. That gap is the signature the Exceptions view keys on, and it is why measurements taken
against any other environment will not reproduce the numbers quoted in project reporting.

**Two features exist only in the test application:**

- The **Exceptions view** — a page with five buckets (Nothing extracted, Partial extraction, Unclaimed,
  Stuck in sync, Dropped as irrelevant) that surfaces, to an analyst, *why* a mail did not produce
  work. The reason is joined from the event store, because the reason column on the mail record is
  blank on every dropped mail.
- The **Gross / Net settlement switch** — a `NettingEngine` Script Include, a guard Business Rule, a
  cashflow widget, and four new columns (`netting_group`, `is_net`, `amount_origin` on the cashflow,
  `settle_granularity` on the mail). It lets a mail that states a net total settle as one cashflow
  rather than every leg.

Neither has been reproduced in the other three applications.

## 5.3 What is the same

- The **code**, as far as the extraction, classification, comparison and audit logic goes.
- The **twelve tables** and their columns.
- The **two roles** per scope, and the three access gates.
- **Native record auditing**, on the same eight tables in each: `booking`, `capability`, `cashflow`,
  `config`, `counterparty`, `email`, `wizard`, `work_item`. Thirty-two audited table definitions in
  total. Deliberately excluded: the event store itself (already append-only), the usage table (high
  volume), and the two drop tables.

## 5.4 One claim to stop repeating

The Developer Handbook's section 1.2 says *"The code is identical in each; only the data and the
intended use differ."*

**That is no longer true, and it is the sentence to correct first.** The audit-trail install, the
Exceptions view and the Gross/Net switch were all built in the test application between 26 and 29
September and exist nowhere else. Until they are reproduced, "identical" describes the intent, not the
state.

Two consequences worth being explicit about:

- Anything measured or demonstrated against the test application — the Exceptions buckets, the Gross/Net
  behaviour, the board counts after netting — **will not reproduce** in BSM, Dev or UAT.
- Any comparison of numbers between two environments has to account for which features each one has
  before concluding anything about extraction quality. A difference in a funnel count between two
  environments is more likely to be a feature difference than a model difference.

## 5.5 Configuration to check per environment

These are the settings that are genuinely environment-specific. Copying an application without
revisiting them is the usual cause of "it worked over there".

| Setting | Where | Why it differs |
|---|---|---|
| `extract.chunk_cap` | `config` table | tuned against the 30-second ceiling (section 4.4). The first chunk of each wave carries nearly all the risk, so a lower cap is safer on a slower environment |
| `noise_domains` | system property | **ships with a placeholder.** Set it to the domains this mailbox actually receives noise from, or classification will keep mail it should drop |
| `sso_idp` | system property | decides whether the login widget is SSO-only |
| `<scope>.demo_users` | system property | different people per environment — and remember it is a privileged grant (section 1.1) |
| Trace collector MID server | system property | **named per instance.** Must be corrected after any move |
| Match tolerances | `config` table | shipped to the specification where the data allows; two documented exceptions |
| At least one published work driver | `wizard` table | Sync does nothing without one |

There is one more, and it is a gap rather than a setting: **no `config` row exists for the document
extraction keys.** They fall back to code defaults. That is fine until somebody tries to tune them
through configuration and finds nothing to tune.
---

# 6. Integration plan

Three integrations are outstanding: the **mailbox** (where mail comes from), the **counterparty
directory — EVE** (who sent it), and the **bookings source — PCM** (what to match it against, and where
the answer goes back). This section covers what each one is today, how it is intended to connect, and what has to
be settled before it can be built.

## 6.1 Everything lands in one seam

Before the detail, the architectural point that makes all of this tractable:

> **The intake seam is source-agnostic.** Whatever the source — a dropped file, a mailbox poll, a
> folder, an upstream store — it arrives at the same front door, carrying a source type and a source
> reference, and it is de-duplicated on that reference. Everything downstream reads the mail record,
> never the source.

So changing where mail comes from is an **adapter**, not a re-architecture. The same is true at the
other end: the write-back leg is a single Flow Action that stages the outcome. When an endpoint exists,
that Action is the only place that connects.

Two prerequisites apply to **every** mailbox option below, and neither exists today:

| Prerequisite | Why |
|---|---|
| A column on the mail record for the **Internet Message-ID** | the only reliable de-duplication key for a mailbox feed. Today nothing stores it, so a re-poll cannot tell a new mail from one already seen |
| A column for the **mailbox received time** | today the record carries the *upload* time. Ageing, the settlement-timing label and any service measure all need the real received time |

Add both before building a feed, not after.

## 6.2 The mailbox today

**Upload-only.** A file is dropped, the ingest flow lands it as a mail record, and the pipeline parses
headers, body and attachments from it. There is no mailbox poll, no schedule, and no alerting. Every
number quoted in project reporting comes from a corpus loaded this way.

The parsing path is mature and worth protecting: it handles MIME boundary headers that have gone stale
in transit, quoted-printable bodies, nested attachments and embedded spreadsheets. Several fixed defects
were specifically about that. **Any feed that does not deliver raw MIME bypasses it** — which is the
single most important consideration in choosing between the two methods below.

## 6.3 Method A — ServiceNow pulls from Exchange over EWS

ServiceNow talks to the on-premise Exchange server itself, through a MID server.

```
Exchange (on-prem)  <--EWS/SOAP--  MID server  <-- scheduled job in ServiceNow
```

### What you need in place

| Item | Detail |
|---|---|
| **MID server** | installed inside the network with line of sight to the Exchange host, and showing **Up**. The instance cannot reach an on-premise host directly — a direct call fails host resolution |
| **Service account** | domain-qualified, with **delegate** access to the shared mailbox. This is a security approval, not a configuration step — start it early |
| **Credential record** | **Connections & Credentials → Credentials**. Basic or NTLM, depending on what the endpoint advertises |
| **Connection alias** | so the endpoint differs per environment without a code change |

### The steps

1. **Confirm the authentication scheme first.** Call the EWS endpoint and read the `WWW-Authenticate`
   header on the 401. This decides whether you configure Basic or NTLM, and getting it wrong wastes the
   most time of anything in this section. Do this before building.
2. Create an **outbound SOAP Message** (**System Web Services → Outbound → SOAP Message**) against
   `https://<host>/EWS/Exchange.asmx`, with the operations you need:
   - **`SyncFolderItems`** — incremental: returns what changed since a sync token. Prefer this to
     `FindItem`, because it gives you a watermark for free.
   - **`GetItem`** — fetch one item. **Request the MIME content property.** This is what gives you the
     raw message, and therefore the mature parsing path from 6.2.
   - optionally **`UpdateItem`** or **`MoveItem`** — to flag or move a processed item, if Nomura wants
     the mailbox to reflect processing.
3. Tick **Use MID server** on the message, and bind the credential.
4. Build a **Scheduled Flow** (or a Scheduled Script Execution) that, each run:
   - calls `SyncFolderItems` with the stored sync token,
   - for each new item calls `GetItem` for the MIME,
   - creates a mail record, attaches the MIME as a `.eml`, and hands it to the existing pipeline,
   - **stores the new sync token only after the batch has landed.**
5. **De-duplicate on the Message-ID** (the column from 6.1), not on the Exchange item id — the item id
   changes if an item is moved between folders.
6. **Error handling:** on failure, do not advance the sync token. The item is then re-read next run
   rather than lost. Log the failure against the run so it is visible rather than silent.
7. **Respect throttling.** Exchange applies throttling policies to EWS. Page the results, keep batches
   modest, and back off on a throttle response instead of retrying immediately.

### Trade-offs

**For:** ServiceNow owns the state end to end; you get **raw MIME**, so the best extraction path stays
in play; incremental sync is cheap; you can reflect processing back into the mailbox.

**Against:** EWS is SOAP and verbose to assemble natively; NTLM through a MID server needs proving;
it needs a mailbox service account with delegate rights; and Microsoft treats EWS as legacy — fine for
on-premise Exchange, but it is not the long-term API.

## 6.4 Method B — read from the existing upstream store

There is **already a Nomura-side service** pulling this mail from the on-premise Exchange over EWS —
domain-qualified service account, delegate access to the shared mailbox — and writing the **text body
and the attachments** into SQL Server. It is read-only and batch.

So the second method is not to build a mailbox integration at all, but to read what that service has
already collected.

```
Exchange  -->  existing EWS service  -->  SQL Server  <--JDBC--  MID server  <--  ServiceNow import
```

### The steps

1. Agree the **contract on the store**: which tables, which columns, how an unprocessed row is
   identified, and how attachments are held. This schema becomes an interface — say so explicitly, so
   it is not changed underneath us.
2. Create a **JDBC Data Source** (**System Import Sets → Data Sources**), through the **MID server**,
   pointed at the store with a read-only account.
3. Build a **Transform Map** onto the mail record: body, subject, sender, received time, Message-ID.
   Coalesce on the Message-ID so a re-import is idempotent.
4. Bring attachments across as attachments on the mail record.
5. **Schedule the import**, and have it insert only rows newer than the last watermark.
6. Point the ingest Flow Action at the pre-parsed shape. **This is the real work in Method B** — see
   the caveat below.

### Trade-offs

**For:** the hard part is already solved and already security-approved. No new mailbox credentials for
ServiceNow, no EWS work, no new service account, no delegate-access approval. Fastest route to a real
feed.

**Against, and it is significant:** **that store holds no raw MIME.** It has the text body and the
attachment bytes. The parsing path described in 6.2 — stale MIME boundaries, quoted-printable bodies,
nested parts — is bypassed entirely, and those were real defects found on real Nomura mail. In exchange
for a faster start you take on the risk that the upstream parse loses something ours would have caught.

Also: batch latency rather than near-real-time; an extra hop the project does not own; and the store
becomes a dependency for a pipeline that is otherwise self-contained.

> **Mitigation:** ask whether that service can be asked to retain the raw MIME alongside what it already
> stores. If it can, Method B keeps its advantages and loses its main drawback. That is one question,
> and it is worth asking before choosing.

## 6.5 The cloud option, for later

If the mailbox moves to Exchange Online, **Microsoft Graph** is the better integration in every
respect: REST and JSON rather than SOAP, OAuth2 client credentials rather than NTLM, delta queries for
incremental reads, and full MIME available on request. The connector design already anticipates this —
the swap would be at the seam described in 6.1, leaving classification, extraction and matching
untouched.

Worth noting, and not recommending: mail could also be **forwarded into the instance** and picked up by
ServiceNow's own inbound email processing. It is the least work of any option. It also means the
instance only ever sees forwarded copies, loses the original headers that classification depends on, and
gives up any control over what reaches it. Mention it for completeness, then choose one of the two
methods above.

## 6.6 Choosing between A and B

| | **A — direct EWS** | **B — upstream store** |
|---|---|---|
| Time to a working feed | longer | **shorter** |
| Raw MIME | **yes** | no, unless it is added upstream |
| New credentials and approvals | service account + delegate access | read-only database account |
| Latency | near real-time | batch |
| Who owns the failure | us | shared |
| Long-term fit | good until the mailbox moves to the cloud | dependent on another service's roadmap |

**Recommendation:** ask the MIME question from 6.4 first. If raw MIME can be retained upstream, take
**Method B** — it is materially faster and reuses an approved path. If it cannot, take **Method A**,
because the parsing path is worth more than the time saved.

Either way, add the two columns from 6.1 first.

## 6.7 The counterparty directory (EVE)

### Today

A scoped table holding organisation name, entity and email address. Resolution is **sender address to
organisation name, exact match only** — and it returns **blank** on a miss rather than guessing, which
is the right behaviour.

**The problem is the data, not the code:** the directory is **synthetic**. Real mail therefore derives a
blank counterparty, and because counterparty is one of the Tier 1 and Tier 2 match keys, **matching
falls through to Tier 3** — the counterparty-less tier. Every match rate quoted for this application is
a Tier 3 rate for that reason. It is not a matching defect; Tiers 1 and 2 effectively cannot fire.

### The plan

1. **Get the real extract.** Agree the fields up front: organisation name, legal entity, **every**
   email address, the **domains**, known **aliases and short forms**, and a stable identifier to join
   on. Aliases matter more than they sound — see step 4.
2. **Load it natively.** A Data Source (file, JDBC or REST) into an Import Set, a Transform Map onto the
   directory table, coalescing on the stable identifier, with a **scheduled refresh**.
3. **Keep it a load, not a live call.** Matching must never depend on a synchronous external call — a
   slow directory would become a slow settlement decision.
4. **Add two things the code does not do today:**
   - **Domain-level fallback.** Only the exact address matches now, so a new sender at a
     well-known counterparty derives blank. Domain matching removes most misses for one small change.
   - **Alias resolution.** The name read from the mail body is compared fuzzily but never *resolved* to
     a master name. An alias table turns a fuzzy comparison into a lookup.
5. **Then re-measure.** Tiers 1 and 2 become reachable, and the match rate should move sharply. Do the
   measurement before and after so the improvement is attributable.

### The question for Nomura

Can the real directory be provided in a lower environment, and is any of it restricted? If it cannot
leave production, the fallback is to agree a reduced extract — organisations, domains and aliases only,
without contact-level detail — which is enough for matching.

## 6.8 The bookings source (PCM)

### What works today

**Retrieval works from this instance, over the MID server**, at roughly 700 milliseconds. A direct call
fails host resolution, so **the MID route is not optional** — it is the only route.

### What the contract demands

Four facts, all measured, all of which constrain the adapter:

1. **All seven search criteria are mandatory.** There is no partial search.
2. **The amount must be positive** — a magnitude, with direction supplied separately. **Ours is
   signed**, because the stored sign carries Nomura's side of the trade. The adapter must therefore send
   magnitude and direction as two values and never the signed number. Send the signed number and a
   payment reads as a receipt.
3. **The counterparty name is mandatory and is masked in the development environment.** This is the
   blocker. A mandatory search key that is masked cannot be supplied.
4. **The counterparty reference was blank on most sample rows**, so it cannot substitute as a key.

### The plan

1. **Resolve the masking question. This is on Nomura and it blocks everything else.** Either the name
   is unmasked in UAT and production — in which case development testing needs a workaround — or an
   alternative mandatory key has to be agreed. Until it is settled, retrieval cannot be driven from a
   real counterparty name.
2. **Agree the amount-sign contract in writing**, and implement the conversion in exactly one place so
   it cannot drift.
3. **Build retrieval** as a REST Message through the MID server, with a credential record and a
   connection alias per environment. **Land the results in the local bookings table** so the matcher
   continues to read one local table — do not make the matcher call out mid-comparison.
4. **Write-back: the endpoint does not exist yet.** The leg is built up to the point of sending: the
   Flow Action stages the outcome on the cashflow and writes an audit event, and nothing is pushed.
   When the endpoint arrives, that Action is the **single** place it connects and nothing else in the
   pipeline changes.
5. **Add a queue and retry.** Neither exists today. Nothing defers, holds or replays a call when the
   far side is unavailable, and no queued state is shown to the analyst. Both directions need it before
   this can be called production-ready.

Credentials are Basic authentication and require the service account password, which is held outside
this document.

## 6.9 Suggested sequence

| Order | Work | Why here |
|---|---|---|
| **1** | The two mail-record columns (6.1) | cheap, and every later step needs them |
| **2** | The real EVE counterparty directory (6.7) | **highest value for least effort.** It unblocks Tiers 1 and 2, which changes the headline match rate without touching the matcher |
| **3** | Mailbox feed, whichever method (6.3 / 6.4) | turns a loaded corpus into a live pipeline |
| **4** | PCM bookings retrieval (6.8) | gated on the masking answer, which is not ours to give |
| **5** | Write-back, plus queue and retry | gated on an endpoint that does not exist yet |

The directory is deliberately ahead of the mailbox. A live feed into a pipeline that still resolves
every counterparty to blank produces more Tier 3 matches, not better ones.

---

# 7. Now Assist against direct integration

Section 4 covered **how** the application moved off Now Assist. This section covers **whether that was
right**, and what it costs — including the part that matters most for what comes next: the platform's
native agentic components.

## 7.1 The two architectures

**Now Assist route**

```
Script Include -> Now Assist skill -> provider registration -> subflow -> gateway
                  ^^^^^^^^^^^^^^^^
                  platform governance, versioning and usage reporting live here
```

**Direct route (current)**

```
Script Include -> global gateway client -> gateway
                  ^^^^^^^^^^^^^^^^^^^^^
                  one script; governance and usage are ours to build
```

## 7.2 The comparison

| | **Now Assist** | **Direct (current)** |
|---|---|---|
| **Governance surfaces** | native — skill catalogue, usage reporting, admin console | **we built our own**: an event store, a usage-and-cost page, per-field confidence |
| **Where a prompt lives** | a skill definition, **duplicated five or six times** | the work-driver record and the `config` table — **one place, manager-editable** |
| **Per-environment isolation** | poor — shared model configuration across all four scopes | **good** — each application carries its own configuration |
| **Model swap** | platform setting | one property |
| **Cost and latency data** | platform reporting | **the gateway's own returned metrics**, so actuals rather than estimates |
| **Licensing** | depends on entitlements, per instance | **none** |
| **Debuggability** | five layers can time out | two |
| **Native agent orchestration** | **available** | **not available** — see 7.3 |
| **Shared-failure surface** | sixteen definition records | one Global client |
| **Effort already spent** | — | already done and working |

**On balance, for this application, direct is the right call** — and the deciding factor is not the
table above, it is the second-to-last line of section 4.2: the settlement path must be configurable per
environment and a prompt must have exactly one home. Now Assist could not give either.

**But the honest cost is real**: everything in the governance row was built rather than inherited. A
future team maintaining this will maintain an event store, a usage page and a confidence model that the
platform would otherwise have provided.

## 7.3 The agentic question

This is the part that changes future decisions, and it is the reason the comparison above is not the
end of it.

ServiceNow's native agentic components — **AI Agent Studio**, **AI Agents**, **Agentic Workflows** and
the Now Assist panel — let you compose agents that reason over a goal and call tools, rather than
running a fixed pipeline. For this problem space the appeal is obvious: triage, chasing missing
information, deciding which of several extraction strategies to try, escalating an exception.

**The constraint that decides the architecture:**

> **A bring-your-own model is not supported for agent orchestration.** The orchestrating model must be
> one of the platform's integrated providers. Our enterprise gateway can serve the *skill* or *tool*
> layer; it cannot be the orchestrator.

Four consequences follow:

1. **The orchestrator and the workers can be different models.** If native agents are wanted, the
   orchestration runs on an integrated provider configured at instance level — which can include a
   current Claude-family model where the platform offers it — while our own gateway continues to serve
   the deterministic extraction and matching calls. That is a supportable split, not a compromise.
2. **Authoring needs the higher licence tier.** Assume nothing about entitlement in a given
   environment; confirm it before designing around agents.
3. **Role masking cascades.** An agent runs under an identity and is subject to the same ACLs as a
   person. An agent that appears to do nothing is usually an agent that cannot read the table — which
   is the same diagnosis as the empty board in section 1.1.
4. **Agents can install inactive.** After deploying any agent, check its state before concluding it is
   broken.

**The guardrail that should not move:**

> **The money path stays deterministic.** Comparison tiers, tolerances, the amount-sign convention and
> the netting key are deterministic, auditable code, and they must remain so. An agent may decide
> *what to do next* — which source to read, whether to chase, when to escalate — but it must not decide
> *whether two cashflows match*. That decision has to be reproducible months later for an auditor, from
> a stored trail, without re-running a model.

This is not caution for its own sake. Internal Audit's requirement is to reconstruct any cashflow end
to end, and a non-deterministic matching decision cannot be reconstructed — only re-sampled.

## 7.4 The recommended split

| Layer | Runs on | Why |
|---|---|---|
| **Extraction and classification** | the enterprise gateway, called directly | mandated gateway, per-environment config, one home per prompt |
| **Matching, tolerances, netting, signs** | **deterministic code, no model at all** | auditability and reproducibility |
| **Orchestration, triage, exception handling** | the platform's integrated provider, if and when native agents are adopted | it is the only supported option, and it is a genuinely good fit |
| **Governance and audit** | the application's own event store | already built, and richer per-item than the platform's |

## 7.5 If you ever had to go back

For completeness, because the question gets asked. Reverting to Now Assist would mean: re-registering
the gateway as a provider, re-authoring the skills, reinstating a bridge for background calls,
**re-duplicating each prompt across five or six definition records**, and re-accepting one shared model
configuration across four environments.

The only reason that would be worth doing is to reach native agent orchestration — and 7.3 shows that
is achievable **without** it, by running the orchestrator on an integrated provider and leaving the
gateway where it is. There is no scenario on the current roadmap that requires going back.
---

# 8. Ongoing development

Status as at **30 September 2026**. This is the section that ages fastest.

## 8.1 Built, and waiting to be propagated

Three pieces of work were completed in the **test** application between 26 and 29 September and exist
nowhere else. Reproducing them in the other three applications is the largest single item of outstanding
work, and it is mechanical rather than difficult — section 3.2, steps 4 and 5.

| Work | What it is | Where it is |
|---|---|---|
| **Native record auditing** | the Audit flag on eight tables per scope, plus the Audit History actions and audit-event rules | all four scopes |
| **Exceptions view** | five buckets showing an analyst *why* a mail produced no work, with the reason joined from the event store | **test only** |
| **Gross / Net switch** | a netting engine, a guard rule, a cashflow widget and four columns, so a mail stating a net total settles as one cashflow rather than every leg | **test only** |

**On Gross/Net specifically:** the mechanism is complete and self-healing — the nets are rebuilt on every
read, so they survive a re-extraction, and a guard rule prevents a net and its components ever both
claiming the same money. There are further behaviours still to work through before it is proposed as
finished; they are known and not yet written down.

## 8.2 Documentation in flight

- The **Developer Handbook has two deliberately deferred sections**: the audit-trail install and the
  bookings integration. Neither involved application code changes, which is why they were held back.
- Before those can be written accurately, the extraction tooling behind the handbook needs re-running:
  it currently reports **zero UI Actions**, which is a known blind spot rather than a true count. Any
  statement about UI Actions taken from the current extract is unreliable.
- **Two lines in the handbook need correcting**, both identified while writing this document:
  - section 1.2, *"the code is identical in each"* — no longer true (section 5.4);
  - section 10.2, *"`demo_users` only controls the view toggle"* — wrong, and it contradicts section
    9.4 of the same document (section 1.5).
- The **feature status assessment** was completed on 30 September: all 100 features on the pilot feature
  list now carry a status and a comment. The headline: **15 done, 67 partially done, 15 not started, 1
  deferred by the BRD, 2 unsupported by the BRD.** Section 9.2 is drawn from it.

## 8.3 Blocked, and on whom

Everything here is waiting on Nomura. None of it can be unblocked from the project side.

| Blocked | Waiting on | Impact |
|---|---|---|
| PCM **write-back** | the endpoint does not exist yet | the write-back leg cannot be completed. Five features on the pilot list are partly held by this one gap |
| PCM **retrieval** driven by a real counterparty name | the name is **mandatory and masked** in development | retrieval cannot be exercised realistically |
| **Real EVE counterparty directory** | the extract, and whether it can leave production | **all matching is stuck at Tier 3** until this lands — the single highest-value unblock |
| **Mailbox method** | a decision between the two routes, plus the raw-MIME question in 6.4 | no live feed |
| **Shadow-mode exit criteria** | the BRD leaves how long it runs, and what must be true to go live, open with Nomura | cannot plan the path to live |
| **4-eye threshold** | the BRD gives two different figures in different places | the requirement cannot be implemented as written even if it were in scope |

## 8.4 Known defects and noise

Small, real, and none of them currently breaking anything. Worth fixing while touching the surrounding
code rather than as a campaign.

| Item | Note |
|---|---|
| **The native audit trail is mostly noise** | on the mail table, around half the entries are deletion markers, and one high-churn status column accounts for much of the rest. **Recommendation: exclude that column from auditing** — it would make the trail legible at no cost |
| `extraction_status` is never set to `extracted` | only `partial`, or cleared — yet one screen filters on `extracted` or `partial`. Harmless today, wrong as written |
| `classification_reason` is blank on every dropped mail | the reason lives **only** in the event store, which is why the Exceptions view joins to it instead of reading the column |
| `assigned_count` is not recalculated | anything editing assignments must set it (section 1.2) |
| The Exceptions page breaks its scope's naming convention | that application names its pages with one prefix; this page does not |
| Two inert buttons in the wizard builder | "add a rule" and "add a target system" render but do nothing, so only one of each is ever possible |
| Builder labels are shifted one level | three fields are labelled one level off the BRD's vocabulary. The behaviour is right; the wording misleads |
| No `config` rows for the document extraction keys | they fall back to code defaults, so there is nothing to tune through configuration |
| The usage table has **no ACLs** | worth knowing before exposing it to anyone without admin |

---

# 9. Pending to test, pending to build

## 9.1 Pending to test

Ordered by how much a surprise here would cost.

| # | To test | Why it matters |
|---|---|---|
| 1 | **Gross/Net end to end**, including a full re-sync afterwards | the nets are designed to be rebuilt on every read so they survive re-extraction. That property is the whole design and has not been tested across a full re-sync |
| 2 | **Board counts with several netted mails at once** | counts are filtered at a single choke point; one mail proved it, many have not |
| 3 | **What an analyst actually sees of the audit trail** | the native trail is admin-only and the platform's own history action is not reachable from the portal. Confirm by impersonation what an analyst can genuinely retrieve |
| 4 | **PCM retrieval with a real, unmasked counterparty name** | blocked (8.3), but it is the first thing to test when it unblocks |
| 5 | **The three genuinely blocked mails** | two carry their figures **only inside an image**, one is a password-protected workbook. All three are understood; none is fixed |
| 6 | **Legacy `.xls` and `.csv` attachments** | the attachment gate checks for a modern spreadsheet signature, so both should be rejected. **Inferred from the code, never tested** |
| 7 | **Non-English mail** | keywords and prompts are English-only and the extraction guardrail forbids translation. A current model may well read a German or Japanese mail unaided — **nobody has tried** |
| 8 | **Magnitude expressions in amounts** | "50M" or "50 mio" — the prompt asks for a plain number and the normaliser strips non-digits, so "50M" could plausibly yield 50. Unmeasured, and it would be a large error |
| 9 | **The Exceptions view against a fresh corpus** | the bucket definitions were derived from one corpus; confirm they still partition cleanly on another |

Items 6, 7 and 8 share a property worth naming: each is a **conclusion drawn from reading the code, not
a measurement**. They are the most likely places for a confident statement in project reporting to be
wrong.

## 9.2 Pending to build

From the 30 September assessment of the pilot feature list. Fifteen features have nothing built; they
group into five themes.

**Matching completeness** — the largest cluster, and the one that most limits match rates.

| Feature | What is missing |
|---|---|
| Nomura entity matching | no entity table and no short-form mapping; the extracted entity is free text and the bookings table has no entity column, so it is never used |
| Holiday calendar | the date-tolerance helper skips Saturday and Sunday only; the required market calendars are absent |
| SSI comparison | SSI is extracted and displayed but **never compared** — the bookings table has no SSI columns |
| Matched-but-Settled handling | the booking status is read but never tested or displayed, so a settled match is not flagged and confirm is not suppressed |
| Matching queue and retry | nothing defers, holds or replays a match when the far side is unavailable, and no queued state is shown |

**Controls**

| Feature | What is missing |
|---|---|
| Routing percentage | no throttle of any kind — no property, no config key, no allocation logic. Every rule-matching mail is processed |
| Configurable thresholds | confidence levels are hard-coded, and the matcher's confidence bands are fixed constants. Nothing is per product |
| Counterparty-to-analyst mapping | only work-driver-to-analyst assignment exists; there is no counterparty mapping and no alphabet rule |

**AI quality**

| Feature | What is missing |
|---|---|
| Golden-dataset deployment gate | no stored expected labels, values or match outcomes; no accuracy comparison; no gate before a prompt change goes out |
| Drift signals | no scheduled check or alert over the audit or usage data. The usage page shows the numbers; nothing is ever raised |
| Override reporting | only an overall override rate exists — no breakdown per component, per counterparty or per product |

**Coverage**

| Feature | What is missing |
|---|---|
| Figures held only in an image | no image path at all; an inline screenshot is never read |
| Non-English mail | no language handling anywhere (see 9.1 item 7 — the gap is in the artefacts, not necessarily in the outcome) |

**Reference data**

| Feature | What is missing |
|---|---|
| Credit-compliance / criticality input | the directory holds organisation, entity and address only; no compliance or watch value exists anywhere, so no criticality can be derived |

**Two more, both excluded by the BRD rather than merely unbuilt:**

- **Password-protected attachments** — the BRD places these outside Phase 1. Note that the feature list's
  own detail line claims the opposite; the contradiction is flagged on that row and needs a decision.
- **4-eye / value-threshold controls** — the BRD states in three places that these operate outside the
  solution and are not part of its interface, and the use case has the analyst do it manually.

## 9.3 A note on the 67 partially-done features

They are not a backlog of 67 items. Several resolve together:

- **Five** are held wholly or partly by the missing **write-back endpoint** (8.3).
- **Several more** improve the moment the **real counterparty directory** lands, because Tiers 1 and 2
  become reachable.
- **Three** are wizard-builder gaps behind the two inert buttons and the missing unpublish control.

Sequencing against those three unblocks is worth more than working the list in order.

---

# 10. Deliberately not in this document

| Subject | Why, and where it will live |
|---|---|
| **API keys, endpoints and credential values** | held back by agreement. Nothing secret is written here by design — the gateway and bookings credential set will be documented separately once it is settled. What *is* here is where each credential is configured (a credential record, a connection alias, a property) and how to diagnose a failure by its status code (4.4) |
| **Backup, update sets and static-data strategy** | to be covered separately, as agreed |
| **The user manual** | a separate, completed deliverable — *NexAI OTC User Manual*. This document is for the people running the application, not the analysts using it |
| **Anything discussed verbally without an artefact** | deliberately not recorded here. If it matters, it needs an artefact first |

---

## Keeping this current

Three sections go stale in predictable ways, and each has an obvious trigger:

| Section | Revisit when |
|---|---|
| **5 — environment differences** | any of the three test-only features is propagated. The table in 5.2 is then wrong |
| **8 — ongoing development** | anything in 8.3 unblocks, which will usually come as an answer from Nomura rather than a code change |
| **9 — pending** | after each round of testing. Items in 9.1 that get measured should move out of it and into a recorded result, because "not yet tested" and "tested and fine" look identical in a status report otherwise |

Sections 1, 2, 3 and 6 describe procedures and intent, and should only change when the application does.

*End of document.*
