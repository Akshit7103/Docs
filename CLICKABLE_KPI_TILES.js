/**
 * CLICKABLE KPI TILES ON THE WORK-DRIVER BOARD
 *
 * Scripts - Background.  "Execute in sandbox?" UNCHECKED.
 * APPLICATION = the environment to change. Run it ONCE PER SCOPE, unchanged:
 *     NexAI OTC BSM    x_nose_nfotc_bsm
 *     NexAI OTC Dev    x_nose_nexai_dev
 *     NexAI OTC Test   x_nose_nexai_test
 *     NexAI OTC UAT    x_nose_nexai_uat
 *
 * ONE RUN. There is nothing to set. It edits three fields of the board widget and one Script Include -
 * each only if every anchor it needs is found; otherwise that record is left untouched and the output
 * says what it actually saw.
 *
 * WHAT IT DOES
 * The six tiles across the top of a work-driver board were read-only numbers. Four of them now filter
 * the table beneath: PENDING CONFIRMATION, MATCHED, MISMATCH and ALLEGE. Click one and the table shows
 * exactly the rows behind that number; click it again to clear.
 *
 * The two totals - Total Mails Assigned and Total Trades Assigned - stay plain readouts, because "all
 * mails" is not a subset of anything.
 *
 * HOW IT IS WIRED, and why that matters
 * Each tile carries the matchStatus value it counted, and clicking it sets the SAME `matchFilter` the
 * "Compare and Match Status" dropdown sets. One filter, two controls - so the dropdown visibly follows
 * the tile and the two can never show different things. Nothing new decides which rows qualify; the
 * tiles simply reach the filter that already existed.
 *
 *   tile                    filter value     what the table shows
 *   Pending Confirmation    pending          extracted, not yet confirmed by an analyst
 *   Matched                 matched          a booking agreed on every key
 *   Mismatch                mismatch         a booking was found but a value disagrees
 *   Allege                  no_match         no booking shares the currency, direction and value date
 *
 * DETAILS THAT MAKE IT USABLE
 *   - the tile looks clickable BEFORE it is clicked (hover lift + pointer), or the feature is invisible
 *   - the active tile carries the Nomura red, so a filtered table always shows a visible reason
 *   - focusable, with Enter and Space doing what a click does
 *   - clicking the active tile clears it; there is deliberately no separate "clear" button, because the
 *     control you pressed to filter is the one you press to stop
 *   - a tile reading 0 still filters - the table then shows "No rows match your search / filter", which
 *     is the honest answer rather than a dead control
 *
 * PRESENTATION ONLY. No table, column, flow or matching rule is touched, and no data is written.
 *
 * SAFETY
 *   - the anchors must be found, or that record is not written
 *   - all of a record's edits apply, or none of them - never a partial change
 *   - every write is read back and verified
 *   - IDEMPOTENT: an already-changed record reports "already applied" and is skipped
 */
(function () {

    var SITES = [{"label":"Board template  (tiles become controls)","table":"sp_widget","query":"idLIKEwiz-dash","field":"template","done":"c.statClick(s)","all":false,"edits":[{"name":"clickable tile with a selected state","start":"      <div class=\"stats\">\n        <div class=\"stat\" ng-repeat=\"s in c.data.stats track by $index\">","end":"        </div>\n      </div>","replace":"      <!-- A tile with a `filter` is a control: clicking it filters the table below to the rows it\n           counted, clicking it again clears. It drives the same c.matchFilter the dropdown does, so the\n           two can never show different things. The two totals are plain readouts. -->\n      <div class=\"stats\">\n        <div class=\"stat\" ng-repeat=\"s in c.data.stats track by $index\"\n             ng-class=\"{'stat-click': s.filter, 'stat-on': s.filter &amp;&amp; c.matchFilter === s.filter}\"\n             ng-click=\"c.statClick(s)\" ng-keydown=\"c.statKey($event, s)\"\n             ng-attr-role=\"{{s.filter ? 'button' : undefined}}\"\n             ng-attr-tabindex=\"{{s.filter ? 0 : undefined}}\"\n             ng-attr-aria-pressed=\"{{s.filter ? (c.matchFilter === s.filter) : undefined}}\"\n             ng-attr-title=\"{{s.filter ? (c.matchFilter === s.filter ? 'Showing only these - click to clear' : 'Click to show only these') : undefined}}\">\n          <div class=\"stat-num\" ng-class=\"s.numCls\">{{s.num}}</div>\n          <div class=\"stat-lbl\">{{s.label}}</div>\n        </div>\n      </div>"}]},{"label":"Board client script  (the handler)","table":"sp_widget","query":"idLIKEwiz-dash","field":"client_script","done":"c.statClick = function (s)","all":false,"edits":[{"name":"statClick + keyboard parity","start":"    c.clearWf = function () { c.wfSel = {}; c.onFilterChange(); };","end":"    c.clearWf = function () { c.wfSel = {}; c.onFilterChange(); };","replace":"    c.clearWf = function () { c.wfSel = {}; c.onFilterChange(); };\n\n    // The KPI tiles are filters. A tile carries the matchStatus it counted, so clicking Matched shows\n    // exactly the rows behind that number \u2014 the count and the table can never tell different stories.\n    // Clicking the active tile clears it, which is why there is no separate \"clear\" button: the thing\n    // you pressed to filter is the thing you press to stop. The two totals carry no filter and do nothing.\n    // It sets the same c.matchFilter as the dropdown, so the dropdown visibly follows the tile.\n    c.statClick = function (s) {\n        if (!s || !s.filter) { return; }\n        c.matchFilter = (c.matchFilter === s.filter) ? '' : s.filter;\n        c.onFilterChange();\n    };\n    // Keyboard parity \u2014 the tiles are focusable, so Enter and Space must do what a click does.\n    c.statKey = function (ev, s) {\n        if (!ev || !s || !s.filter) { return; }\n        if (ev.keyCode === 13 || ev.keyCode === 32) { ev.preventDefault(); c.statClick(s); }\n    };"}]},{"label":"Board css  (it must look clickable)","table":"sp_widget","query":"idLIKEwiz-dash","field":"css","done":".stat-click","all":false,"edits":[{"name":"hover, focus and selected styles","start":".stat-lbl { font-size: 11.5px; color: #6b7280; margin-top: 4px; line-height: 1.3; }","end":".stat-lbl { font-size: 11.5px; color: #6b7280; margin-top: 4px; line-height: 1.3; }","replace":".stat-lbl { font-size: 11.5px; color: #6b7280; margin-top: 4px; line-height: 1.3; }\n// A tile that filters has to LOOK like it does, before it is clicked \u2014 otherwise the feature is\n// invisible. Hover lifts it; the selected one keeps the Nomura red so the table below always has a\n// visible reason for showing a subset.\n// NOTE: rgba(), never 8-digit hex. ServiceNow compiles this with Vaadin SASS, which rejects\n// #RRGGBBAA outright (\"invalid hexadecimal notation for RGB\") \u2014 and a failed compile drops the\n// WHOLE page's stylesheet, so the board renders as raw unstyled HTML. Same reason :focus rather\n// than :focus-visible: keep to what that parser has always understood.\n.stat-click { cursor: pointer; transition: border-color .12s, box-shadow .12s, transform .12s; }\n.stat-click:hover { border-color: rgba(200,16,46,.45); box-shadow: 0 3px 10px rgba(20,30,60,.10); transform: translateY(-1px); }\n.stat-click:focus { outline: 2px solid #C8102E; outline-offset: 2px; }\n.stat-on { border-color: #C8102E; box-shadow: inset 0 0 0 1px #C8102E, 0 3px 10px rgba(200,16,46,.12); background: #fffafb; }\n.stat-on .stat-lbl { color: #C8102E; font-weight: 600; }"}]},{"label":"TaggingDashboard  (tiles carry their filter)","table":"sys_script_include","query":"name=TaggingDashboard","field":"script","done":"filter: 'no_match'","all":true,"edits":[{"name":"add the filter key to the stats array (both boards)","start":"        out.stats = [\n            { label: 'Total Mails Assigned', num: '' + relevant, on: true, numCls: '' },","end":"            { label: 'Allege', num: '' + noMatch, on: false, numCls: 'n-red' }\n        ];","replace":"        // `filter` makes the tile a control, not just a readout: clicking it filters the table below to\n        // exactly the rows it counted. The value IS the row's matchStatus, so the tile and the \"Compare\n        // and Match Status\" dropdown drive the same one field and can never disagree. The two totals\n        // carry '' because \"all mails\" and \"all trades\" are not a subset of anything.\n        out.stats = [\n            { label: 'Total Mails Assigned', num: '' + relevant, on: true, numCls: '', filter: '' },\n            { label: 'Total Trades Assigned', num: '' + out.rows.length, on: true, numCls: '', filter: '' },\n            { label: 'Pending Confirmation', num: '' + pending, on: false, numCls: 'n-amber', filter: 'pending' },\n            { label: 'Matched', num: '' + matched, on: false, numCls: 'n-green', filter: 'matched' },\n            { label: 'Mismatch', num: '' + mismatch, on: false, numCls: 'n-amber', filter: 'mismatch' },\n            { label: 'Allege', num: '' + noMatch, on: false, numCls: 'n-red', filter: 'no_match' }\n        ];"}]}];

    var ENVIRONMENTS = {
        'x_nose_nfotc_bsm':  'NexAI OTC BSM',
        'x_nose_nexai_dev':  'NexAI OTC Dev',
        'x_nose_nexai_test': 'NexAI OTC Test',
        'x_nose_nexai_uat':  'NexAI OTC UAT'
    };

    var SCOPE = '' + gs.getCurrentScopeName();
    if (!ENVIRONMENTS[SCOPE]) {
        gs.error('[TILES] ABORT: Application is "' + SCOPE + '", not a NexAI OTC environment.');
        for (var k in ENVIRONMENTS) {
            if (ENVIRONMENTS.hasOwnProperty(k)) { gs.error('[TILES]     ' + ENVIRONMENTS[k] + '   (' + k + ')'); }
        }
        return;
    }

    gs.info('[TILES] ================================================================');
    gs.info('[TILES] environment : ' + ENVIRONMENTS[SCOPE] + '   (' + SCOPE + ')');
    gs.info('[TILES] mode        : applying - per record, every edit or none');
    gs.info('[TILES] ================================================================');

    var changed = 0, already = 0, failed = 0;

    for (var s = 0; s < SITES.length; s++) {
        var site = SITES[s];
        gs.info('[TILES]');
        gs.info('[TILES] ' + site.label);

        var gr = new GlideRecord(site.table);
        gr.addEncodedQuery(site.query + '^sys_scope.scope=' + SCOPE);
        gr.query();

        if (!gr.hasNext()) {
            gs.error('[TILES]   NOT FOUND in this scope (' + site.table + ': ' + site.query + ')');
            failed++;
            continue;
        }

        while (gr.next()) {
            var id = gr.getUniqueValue();
            var src = '' + (gr.getValue(site.field) || '');
            var who = '' + (gr.getValue('name') || gr.getValue('id') || site.table);

            if (src.indexOf(site.done) > -1) {
                gs.info('[TILES]   ' + who + ': already applied, skipped.');
                already++;
                continue;
            }

            // Every edit, or none. A record carrying half the change would read as done while the
            // other half still inverted the value.
            var out = src, ok = true;
            for (var e = 0; e < site.edits.length; e++) {
                var ed = site.edits[e];
                // The table names are baked into these records, so text cut from one scope carries
                // that scope; retarget before matching.
                var start = ed.start.split('x_nose_nfotc_bsm').join(SCOPE);
                var endAt = ed.end.split('x_nose_nfotc_bsm').join(SCOPE);
                var repl = ed.replace.split('x_nose_nfotc_bsm').join(SCOPE);

                // Most edits must match EXACTLY ONCE - more than one means the record is not the
                // version this was built against. One edit is different by design: the stats array
                // exists on BOTH boards (OTC and AI) and both need it, so that site is marked `all`
                // and every occurrence is replaced.
                var n = out.split(start).length - 1;
                if (n === 0 || (!site.all && n !== 1)) {
                    gs.error('[TILES]   "' + ed.name + '": start anchor found ' + n + ' times, expected ' +
                             (site.all ? 'at least 1' : 'exactly 1') + '.');
                    ok = false;
                    break;
                }
                var applied = 0, from = 0;
                while (true) {
                    var i = out.indexOf(start, from);
                    if (i === -1) { break; }
                    var j = out.indexOf(endAt, i);
                    if (j === -1) {
                        gs.error('[TILES]   "' + ed.name + '": end anchor not found after occurrence ' + (applied + 1) + '.');
                        ok = false;
                        break;
                    }
                    out = out.substring(0, i) + repl + out.substring(j + endAt.length);
                    from = i + repl.length;
                    applied++;
                    if (!site.all) { break; }
                }
                if (!ok) { break; }
                gs.info('[TILES]   - ' + ed.name + (applied > 1 ? ('  (x' + applied + ')') : ''));
            }

            if (!ok) {
                gs.error('[TILES]   ' + who + ': NOT APPLIED - nothing written. This record differs from');
                gs.error('[TILES]   the version this script was built against. Send the line above back.');
                failed++;
                continue;
            }

            gs.info('[TILES]   ' + who + ': ' + src.length + ' -> ' + out.length + ' chars');

            gr.setValue(site.field, out);
            if (!gr.update()) {
                gs.error('[TILES]   ' + who + ': UPDATE REFUSED (read-only app, or wrong scope?)');
                failed++;
                continue;
            }
            // Read back - a refused scoped write looks exactly like success otherwise.
            var v = new GlideRecord(site.table);
            v.get(id);
            if (('' + (v.getValue(site.field) || '')).indexOf(site.done) === -1) {
                gs.error('[TILES]   ' + who + ': WRITE DID NOT STICK.');
                failed++;
            } else {
                gs.info('[TILES]   applied and verified.');
                changed++;
            }
        }
    }

    gs.info('[TILES]');
    gs.info('[TILES] ================================================================');
    gs.info('[TILES] changed : ' + changed + '   already applied: ' + already + '   FAILED: ' + failed);
    if (!failed) {
        gs.info('[TILES]');
        gs.info('[TILES] Done. Repeat with the Application set to each other environment.');
        gs.info('[TILES]');
        gs.info('[TILES] Open a board and click Pending Confirmation, Matched, Mismatch or Allege.');
        gs.info('[TILES] The table filters to exactly the rows behind that number, the tile turns red,');
        gs.info('[TILES] and the "Compare and Match Status" dropdown follows it. Click it again to clear.');
        gs.info('[TILES]');
        gs.info('[TILES] No re-sync needed - this is presentation only. No data changes.');
    } else {
        gs.warn('[TILES]');
        gs.warn('[TILES] Some records were NOT changed - see above. Nothing partial was saved.');
    }
    gs.info('[TILES] ================================================================');
})();
