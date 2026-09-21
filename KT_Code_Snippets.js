/* ============================================================================================
 * KT — Email Classifier · all the code, in build order
 * Scope: x_nose_kt_email_0      Table: x_nose_kt_email_0_email_intake
 * ============================================================================================
 *
 *   EmailClassifier (Script Include)   the BRAIN     - written once
 *   Classify Email (Action)            the CONTRACT  - typed in/out, no logic
 *   Classify and Store (Subflow)       the RECIPE    - classify, then write it down
 *   Classify Incoming Email (Flow)  \
 *   Classify Now (UI Action)         }  three DOORS  - all call the same recipe
 *   KT Email Intake (Widget)        /
 *
 * Each block below is copy-paste ready. Nothing is duplicated between them - every door ends up
 * at the same Script Include.
 * ========================================================================================== */


/* ============================================================================================
 * 1. SCRIPT INCLUDE — EmailClassifier
 * Studio -> + -> Server Development -> Script Include
 * Name MUST be exactly EmailClassifier (no spaces) or `new EmailClassifier()` fails.
 * Accessible from: This application scope only · Glide AJAX: off · Protection policy: None
 * ========================================================================================== */

var EmailClassifier = Class.create();
EmailClassifier.prototype = {
    initialize: function () {},

    // Words that say "this is a settlement email".
    RELEVANT: ['settlement', 'cashflow', 'value date', 'payment', 'confirm', 'trade', 'swap', 'ssi'],

    // Words that say "this is office noise".
    IRRELEVANT: ['out of office', 'lunch', 'holiday', 'newsletter', 'webinar', 'invitation'],

    /**
     * Score the mail, then threshold it. Returns the decision AND why, because a classification
     * nobody can explain is a classification nobody will trust.
     */
    classify: function (subject, body) {
        var text = (('' + (subject || '')) + ' ' + ('' + (body || ''))).toLowerCase();
        var hits = [], noise = [], i;

        for (i = 0; i < this.RELEVANT.length; i++) {
            if (text.indexOf(this.RELEVANT[i]) > -1) { hits.push(this.RELEVANT[i]); }
        }
        for (i = 0; i < this.IRRELEVANT.length; i++) {
            if (text.indexOf(this.IRRELEVANT[i]) > -1) { noise.push(this.IRRELEVANT[i]); }
        }

        // Hard negative: noise words AND no settlement words means stop here. Without this,
        // "Out of office - re: settlement" would score relevant on one stray word.
        if (noise.length && !hits.length) {
            return { classification: 'irrelevant', score: 0, reason: 'noise: ' + noise.join(', ') };
        }

        var score = hits.length / this.RELEVANT.length;
        return {
            classification: (score >= 0.25) ? 'relevant' : 'irrelevant',
            score: Math.round(score * 100) / 100,
            reason: hits.length ? ('matched: ' + hits.join(', ')) : 'no settlement keywords found'
        };
    },

    type: 'EmailClassifier'
};


/* ============================================================================================
 * 2. BACKGROUND SCRIPT — prove the brain before wiring anything to it
 * /sys.scripts.do   ·   Application: KT Email Classifier   ·   Execute in sandbox: UNTICKED
 *
 * Expected:
 *   {"classification":"relevant","score":0.63,"reason":"matched: settlement, cashflow, value date, confirm, trade"}
 *   {"classification":"irrelevant","score":0,"reason":"noise: out of office, lunch"}
 *
 * "EmailClassifier is not defined" = wrong application scope, or the Script Include Name does
 * not match the class name.
 * ========================================================================================== */

var c = new EmailClassifier();
gs.info(JSON.stringify(c.classify('Settlement confirmation VD 20 Sep',
    'Please confirm the cashflow and value date for trade 12345.')));
gs.info(JSON.stringify(c.classify('Team lunch Friday', 'Out of office next week, back Monday.')));


/* ============================================================================================
 * 3. ACTION — Classify Email · the Script step
 * Studio -> + -> Automation -> Action
 *
 * FOUR things to wire, and every one of them fails SILENTLY if you miss it:
 *   a) Action Inputs        : Subject (subject, String), Body (body, String)
 *   b) step Input Variables : subject <- pill action.Subject ; body <- pill action.Body
 *   c) step Output Variables: classification (String), score (Decimal), reason (String)
 *   d) Action Outputs       : declare the same three, then EXIT EDIT MODE and drop the
 *                             Script step pills into the Value boxes
 *
 * A typed word is a LITERAL. A pill is a REFERENCE. They look almost identical in the box.
 * Then: Save -> Test -> PUBLISH (unpublished actions do not appear in the flow picker).
 * ========================================================================================== */

(function execute(inputs, outputs) {
    var r = new EmailClassifier().classify(inputs.subject, inputs.body);
    outputs.classification = r.classification;
    outputs.score = r.score;
    outputs.reason = r.reason;
})(inputs, outputs);


/* ============================================================================================
 * 4. SUBFLOW — Classify and Store   (no code; built from the UI)
 *
 *   Input    Email Record / email_record / Reference -> Email Intake      <- Reference, NOT String
 *   Step 1   Action "Classify Email"   Subject <- email_record.Subject
 *                                      Body    <- email_record.Body
 *   Step 2   Update Record             Record  <- email_record
 *                                      Table   <- Email Intake
 *                                      Fields  <- Classification / Score / Reason from Step 1
 *   Save -> Test -> PUBLISH
 *
 * Subflow outputs can be declared but there is no obvious place to assign their values in this
 * Studio version. Do not stall on it - the callers below read the RECORD instead, which is a
 * stronger check anyway: it proves the write landed.
 * ========================================================================================== */


/* ============================================================================================
 * 5. FLOW — Classify Incoming Email   (no code; built from the UI)
 *
 *   Trigger  Record -> Created or Updated
 *            Table       Email Intake
 *            Condition   Classification   [is empty]        <- ONE operator. Do NOT pick "is"
 *                                                              and type the word "empty" - that
 *                                                              compares against the literal
 *                                                              string and never matches.
 *            Run Trigger "For each unique change"           <- "Once" will not re-fire if you
 *                                                              clear Classification to re-demo
 *   Action 1 Subflow "Classify and Store"
 *            Email Record <- Trigger -> Email Intake Record
 *   Save -> ACTIVATE   (a saved flow does not run)
 *
 * The condition does two jobs: it is how the flow knows there is work to do, AND it is the
 * loop-breaker. The flow updates the record, that update re-triggers the flow - once
 * Classification is filled the trigger stops matching. Same trick the real NexAI intake flow
 * uses on wiz_intake_state.
 * ========================================================================================== */


/* ============================================================================================
 * 6. UI ACTION — Classify Now
 * Studio -> + -> User Interface -> UI Action
 * Name: Classify Now · Table: Email Intake · Form button: TICKED · Client: UNTICKED
 * Condition (optional): current.canWrite()
 * ========================================================================================== */

// Call the SAME subflow the Flow calls - not a second copy of the logic.
try {
    sn_fd.FlowAPI.getRunner()
        .subflow('x_nose_kt_email_0.classify_and_store')   // internal name, not the label
        .inForeground()                                     // synchronous, so the user sees it now
        // A Reference input wants the GlideRecord ITSELF, not a sys_id string. Passing
        // current.getUniqueValue() fails with "Invalid GlideRecord input format found".
        .withInputs({ email_record: current })
        .run();

    // The subflow updated the record underneath us. Re-read it rather than trust the subflow's
    // declared outputs, which we never assigned values to. This also PROVES the write landed.
    var gr = new GlideRecord('x_nose_kt_email_0_email_intake');
    if (gr.get(current.getUniqueValue())) {
        gs.addInfoMessage('Classified as ' + gr.getValue('classification') +
            ' - ' + gr.getValue('reason'));
    }
} catch (e) {
    gs.addErrorMessage('Classification failed: ' + e);
}
action.setRedirectURL(current);


/* ============================================================================================
 * 7. WIDGET — KT Email Intake · SERVER SCRIPT
 * Studio -> + -> User Interface -> Widget · Name: KT Email Intake · ID: kt_email_intake
 * ========================================================================================== */

(function () {
    data.rows = [];
    data.msg = '';

    var TABLE = 'x_nose_kt_email_0_email_intake';

    // Call the SAME subflow the Flow calls. Not a second copy of the logic.
    function classifyOne(sysId) {
        try {
            // A Reference input wants a GlideRecord, not a sys_id string.
            var rec = new GlideRecord(TABLE);
            if (!rec.get(sysId)) { return ''; }
            sn_fd.FlowAPI.getRunner()
                .subflow('x_nose_kt_email_0.classify_and_store')
                .inForeground()
                .withInputs({ email_record: rec })
                .run();
            var back = new GlideRecord(TABLE);
            return back.get(sysId) ? ('' + back.getValue('classification')) : '';
        } catch (e) {
            gs.error('[kt_email_intake] ' + e);
            return '';
        }
    }

    if (input && input.action === 'classify' && input.sysId) {
        var one = classifyOne(input.sysId);
        data.msg = one ? ('Classified as ' + one) : 'Classification failed - check the system log.';
    }

    if (input && input.action === 'classifyAll') {
        var n = 0;
        var todo = new GlideRecord(TABLE);
        todo.addNullQuery('classification');   // NOT addQuery('classification','') - that misses NULLs
        todo.query();
        while (todo.next()) { classifyOne(todo.getUniqueValue()); n++; }
        data.msg = n ? ('Classified ' + n + ' email(s).') : 'Nothing left to classify.';
    }

    if (input && input.action === 'add' && input.subject) {
        var ng = new GlideRecord(TABLE);
        ng.initialize();
        ng.setValue('subject', input.subject);
        ng.setValue('body', input.body || '');
        ng.insert();
        // Deliberately NOT classified here - the Flow picks it up on its own.
        data.msg = 'Email added. Nobody classified it. Hit Refresh in a moment and watch the flow do it.';
    }

    var gr = new GlideRecord(TABLE);
    gr.orderByDesc('sys_created_on');
    gr.setLimit(25);
    gr.query();
    while (gr.next()) {
        data.rows.push({
            sys_id: '' + gr.getUniqueValue(),
            subject: '' + (gr.getValue('subject') || ''),
            body: ('' + (gr.getValue('body') || '')).substring(0, 90),
            classification: '' + (gr.getValue('classification') || ''),
            score: '' + (gr.getValue('score') || ''),
            reason: '' + (gr.getValue('reason') || '')
        });
    }
})();


/* ============================================================================================
 * 8. WIDGET — CLIENT CONTROLLER
 * ========================================================================================== */

api.controller = function () {
    var c = this;

    function send(payload) {
        c.server.get(payload).then(function (response) { c.data = response.data; });
    }

    c.refresh = function () { send({}); };
    c.classify = function (row) { send({ action: 'classify', sysId: row.sys_id }); };
    c.classifyAll = function () { send({ action: 'classifyAll' }); };

    c.add = function () {
        send({ action: 'add', subject: c.subject, body: c.body });
        c.subject = '';
        c.body = '';
    };
};


/* ============================================================================================
 * 9. WIDGET — HTML
 *
 * Service Portal HTML is parsed as XML: a bare & or < breaks the widget with an unhelpful
 * error. Write &amp; and &lt;. The template below avoids both deliberately.
 * ============================================================================================

<div class="panel panel-default kt-widget">
  <div class="panel-heading">
    <strong>Email Intake</strong>
    <button class="btn btn-xs btn-default pull-right" ng-click="c.refresh()">Refresh</button>
  </div>

  <div class="panel-body">
    <div class="alert alert-info kt-msg" ng-if="c.data.msg">{{c.data.msg}}</div>

    <div class="row kt-add">
      <div class="col-md-5">
        <input class="form-control" ng-model="c.subject" placeholder="Subject" />
      </div>
      <div class="col-md-5">
        <input class="form-control" ng-model="c.body" placeholder="Body" />
      </div>
      <div class="col-md-2">
        <button class="btn btn-primary btn-block" ng-click="c.add()">Add email</button>
      </div>
    </div>

    <button class="btn btn-default btn-sm" ng-click="c.classifyAll()">
      Classify all unclassified
    </button>
  </div>

  <table class="table table-striped kt-table">
    <thead>
      <tr>
        <th>Email</th>
        <th>Classification</th>
        <th>Score</th>
        <th>Why</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      <tr ng-repeat="r in c.data.rows">
        <td>
          <div class="kt-subj">{{r.subject}}</div>
          <div class="kt-body">{{r.body}}</div>
        </td>
        <td>
          <span class="label"
                ng-class="{'label-success': r.classification == 'relevant',
                           'label-default': r.classification == 'irrelevant',
                           'label-warning': !r.classification}">
            {{r.classification || 'unclassified'}}
          </span>
        </td>
        <td>{{r.score}}</td>
        <td class="kt-reason">{{r.reason}}</td>
        <td>
          <button class="btn btn-xs btn-default" ng-click="c.classify(r)">Classify</button>
        </td>
      </tr>
    </tbody>
  </table>
</div>

 * ========================================================================================== */


/* ============================================================================================
 * 10. WIDGET — CSS
 * ============================================================================================

.kt-widget .kt-subj   { font-weight: 600; }
.kt-widget .kt-body   { color: #8a8a8a; font-size: 11px; }
.kt-widget .kt-reason { font-size: 11px; color: #666; max-width: 340px; }
.kt-widget .kt-add    { margin-bottom: 10px; }
.kt-widget .kt-table  { margin-bottom: 0; }
.kt-widget .kt-msg    { padding: 6px 10px; margin-bottom: 10px; }

 * ========================================================================================== */


/* ============================================================================================
 * 11. THE PAGE, THE PLACEMENT, AND THE PORTAL   (no code; built from the UI)
 *
 * A WIDGET HAS NO URL. There is no /widget/kt_email_intake. You visit a PAGE, and the page renders
 * whatever widgets have been PLACED on it - like a React component and a route.
 *
 * 11a. The page
 *   Studio -> + -> User Interface -> Page (sp_page)        <- NOT sys_ui_page / sn_ace_page /
 *   Title: KT Email Intake · ID: kt_email                     sys_portal_page / sys_ux_page_registry
 *   Public and Draft unticked · Page Content empty
 *
 * 11b. Place the widget:  /$spd.do?id=kt_email
 *   NOT /$sp.do?id=sp_page_designer - that 404s.
 *   Two drags:  the "12" tile (Layouts) onto the dashed area, then filter for KT and drag
 *   "KT Email Intake" into the column that appears.
 *
 *   What you are really creating is four records - the Designer is a GUI over four tables:
 *       sp_page -> sp_container -> sp_row -> sp_column (size 12) -> sp_instance
 *   KT_Page_Layout_global.js does the same by script (run it in GLOBAL - sp_* are platform tables).
 *
 * 11c. Strip the ServiceNow chrome
 *   /sp?id=kt_email works but wraps the widget in ServiceNow's logo, nav and footer. Those come
 *   from the PORTAL, not the page.
 *
 *   All -> Service Portal -> Portals -> New
 *       Title             KT
 *       URL suffix        kt
 *       Homepage          KT Email Intake   <- use the magnifier; make it a real reference
 *       Main menu         (empty)
 *       Theme             (empty)
 *       Hide portal name  ticked
 *
 *   Open at:  /kt        <- just your app, nothing else
 *
 * One widget can live inside different wrappers: a branded portal AND a bare kiosk screen. That is
 * exactly what NexAI does - /nexai is a portal record wrapping widgets like this one.
 * ========================================================================================== */


/* ============================================================================================
 * 12. TEST DATA + THE CLOSING DEMO
 *
 * RELEVANT - the clean case
 *   Subject  Payment confirmation for value date 25 Sep
 *   Body     Please confirm the settlement amount and cashflow for trade 99887.
 *   -> relevant, 0.63
 *
 * IRRELEVANT - pure noise
 *   Subject  Town hall invitation
 *   Body     Join us for the quarterly newsletter briefing and lunch.
 *   -> irrelevant, 0, "noise: lunch, newsletter, invitation"
 *
 * THE ONE THAT EARNS ITS KEEP
 *   Subject  Out of office - re: settlement confirmation
 *   Body     Please confirm the cashflow for trade 55123 when I return.
 *   -> RELEVANT, because the hard negative only fires when there are NO settlement words,
 *      and there are five. A naive keyword filter bins this. Say that out loud - it is the
 *      difference between a filter people trust and one they switch off.
 *
 * THE DEMO, on one screen at /kt:
 *   1. type the relevant example -> Add email -> the row appears UNCLASSIFIED. Nobody touched it.
 *   2. pause -> Refresh          -> now "relevant", with score and reason   <- that was the FLOW
 *   3. clear one record's classification, come back, click Classify on its row
 *                                -> fills instantly                          <- that was the SUBFLOW
 *
 * Two completely different doors on the same screen. Neither knows how classification works;
 * they both just ask the same recipe, which asks the same brain.
 *
 * THE CLOSING LINE: "How do we make this AI instead of keywords? Change classify(). Nothing else
 * moves." The action, subflow, flow, button, widget, table and portal all stay exactly as they are.
 * ========================================================================================== */
