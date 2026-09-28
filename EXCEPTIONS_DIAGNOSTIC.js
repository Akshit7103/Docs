/**
 * EXCEPTIONS DIAGNOSTIC - read-only. Run once in Background Scripts on nomurabsmdev.
 *
 * RUN WITH: Application = NexAI OTC Test   (scope x_nose_nexai_test - the corpus scope)
 *
 * Purpose: establish the REAL state of the mail corpus before building the Exceptions view, so
 * the buckets are defined from data instead of from assumption. Specifically it answers:
 *
 *   1  how mails distribute across classification / composed_state / extraction_status
 *   2  is extraction_status ever set to 'extracted'?  (the Analyst Screen filters on
 *      "IN extracted,partial", but the code I can see only ever writes 'partial' or clears it)
 *   3  how ownership is really represented - wiz_extracted vs composed_run vs wiz_assigned
 *   4  the actual exception buckets, with counts and sample mail ids:
 *        UNCLAIMED        relevant, but no work driver owns it
 *        STUCK            composed_state still 'running'
 *        ZERO CASHFLOWS   relevant and owned, but produced no rows   <- the "9" case
 *        PARTIAL          extraction_status = partial
 *        DROPPED          classification = irrelevant, with the reason
 *
 * These tables are small (hundreds of rows), so counting here is cheap. Nothing is written.
 */
(function () {
    var SCOPE = 'x_nose_nexai_test';
    var EMAIL = SCOPE + '_email';
    var CASHFLOW = SCOPE + '_cashflow';
    var out = [];
    function p(s) { out.push(s); }
    function pad(s, n) { s = '' + s; while (s.length < n) { s += ' '; } return s; }

    p('==================================================================');
    p('EXCEPTIONS DIAGNOSTIC   scope: ' + gs.getCurrentScopeName());
    p('table: ' + EMAIL);
    p('==================================================================');

    // ---------------------------------------------------------------- 1. distributions
    function dist(field) {
        var t = {}, n = 0;
        var g = new GlideRecord(EMAIL);
        g.query();
        while (g.next()) {
            n++;
            var v = g.getValue(field);
            v = (v === null || v === '') ? '(empty)' : v;
            t[v] = (t[v] || 0) + 1;
        }
        var keys = Object.keys(t).sort(function (a, b) { return t[b] - t[a]; });
        var parts = [];
        for (var i = 0; i < keys.length; i++) { parts.push(keys[i] + '=' + t[keys[i]]); }
        p('   ' + pad(field, 20) + parts.join('   '));
        return n;
    }

    p('');
    p('1. DISTRIBUTIONS');
    var total = dist('classification');
    dist('composed_state');
    dist('extraction_status');
    dist('review_status');
    p('   ' + pad('TOTAL MAILS', 20) + total);

    // ---------------------------------------------------------------- 2. is 'extracted' written
    p('');
    p('2. IS extraction_status EVER "extracted"?');
    var ex = new GlideRecord(EMAIL);
    ex.addQuery('extraction_status', 'extracted');
    ex.setLimit(1);
    ex.query();
    p('   rows with extraction_status = "extracted" : ' + (ex.hasNext() ? 'YES' : 'NONE'));
    p('   -> if NONE, the Analyst Screen filter "IN extracted,partial" matches only partial mails.');

    // ---------------------------------------------------------------- 3. ownership
    p('');
    p('3. OWNERSHIP');
    var owned = 0, byExtract = 0, byRun = 0, byAssign = 0, unowned = 0;
    var o = new GlideRecord(EMAIL);
    o.query();
    while (o.next()) {
        var we = o.getValue('wiz_extracted') || '';
        var cr = o.getValue('composed_run') || '';
        var wa = o.getValue('wiz_assigned') || '';
        if (we) { byExtract++; }
        if (cr) { byRun++; }
        if (wa) { byAssign++; }
        if (we || cr || wa) { owned++; } else { unowned++; }
    }
    p('   wiz_extracted set : ' + byExtract);
    p('   composed_run  set : ' + byRun);
    p('   wiz_assigned  set : ' + byAssign);
    p('   owned (any)       : ' + owned);
    p('   OWNED BY NOTHING  : ' + unowned);

    // ---------------------------------------------------------------- 4. the buckets
    p('');
    p('4. EXCEPTION BUCKETS');

    function bucket(label, build, showReason) {
        var g = new GlideRecord(EMAIL);
        build(g);
        g.orderByDesc('sys_created_on');
        g.query();
        var n = 0, samples = [];
        while (g.next()) {
            n++;
            if (samples.length < 6) {
                var s = '        ' + pad(g.getValue('name') || '(no name)', 34) +
                        ' cls=' + pad(g.getValue('classification') || '-', 11) +
                        ' state=' + pad(g.getValue('composed_state') || '-', 9) +
                        ' extr=' + pad(g.getValue('extraction_status') || '-', 9);
                if (showReason) { s += ' reason=' + (g.getValue('classification_reason') || '-'); }
                samples.push(s);
            }
        }
        p('');
        p('   ' + pad(label, 26) + n);
        for (var i = 0; i < samples.length; i++) { p(samples[i]); }
        return n;
    }

    bucket('UNCLAIMED (relevant, no owner)', function (g) {
        g.addQuery('classification', 'relevant');
        g.addNullQuery('wiz_extracted');
        g.addNullQuery('composed_run');
    });

    bucket('STUCK (composed_state running)', function (g) {
        g.addQuery('composed_state', 'running');
    });

    bucket('PARTIAL extraction', function (g) {
        g.addQuery('extraction_status', 'partial');
    });

    bucket('DROPPED (irrelevant)', function (g) {
        g.addQuery('classification', 'irrelevant');
    }, true);

    // zero-cashflow needs a per-record check
    p('');
    var zero = 0, zsamples = [];
    var r = new GlideRecord(EMAIL);
    r.addQuery('classification', 'relevant');
    r.query();
    while (r.next()) {
        var c = new GlideAggregate(CASHFLOW);
        c.addQuery('email', r.getUniqueValue());
        c.addAggregate('COUNT');
        c.query();
        var cnt = c.next() ? parseInt(c.getAggregate('COUNT'), 10) : 0;
        if (!cnt) {
            zero++;
            if (zsamples.length < 10) {
                zsamples.push('        ' + pad(r.getValue('name') || '(no name)', 34) +
                              ' state=' + pad(r.getValue('composed_state') || '-', 9) +
                              ' extr=' + pad(r.getValue('extraction_status') || '-', 9) +
                              ' owner=' + (r.getValue('wiz_extracted') ? 'yes' : 'no'));
            }
        }
    }
    p('   ' + pad('RELEVANT, ZERO CASHFLOWS', 26) + zero + '   <- the silent case');
    for (var z = 0; z < zsamples.length; z++) { p(zsamples[z]); }

    p('');
    p('==================================================================');
    gs.info('\n' + out.join('\n'));
})();
