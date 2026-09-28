/**
 * SCOPED READ TEST - read-only, run once.
 *
 * RUN THIS WITH:  Application = NexAI OTC BSM   (NOT Global - that is the whole point)
 * Background Scripts -> set the Application picker to the scoped app -> run.
 *
 * Question: a Service Portal widget's server script runs in the application scope. Can code in
 * that scope read the Global sys_audit table? Analysts cannot read it through the UI (confirmed:
 * "Security constraints prevent access"), but server-side GlideRecord is governed by cross-scope
 * privileges rather than by record ACLs - so this may still work. If it does, a widget can show
 * the trail for records the analyst is already allowed to see.
 *
 * SAFETY: pinned to one tablename (indexed), setLimit(3). No COUNT. Nothing written.
 */
(function () {
    var out = [];
    function p(s) { out.push(s); }

    p('=================================================');
    p('SCOPED READ TEST');
    p('scope : ' + gs.getCurrentScopeName());
    p('user  : ' + gs.getUserName() + '   admin: ' + gs.hasRole('admin'));
    p('=================================================');

    if (gs.getCurrentScopeName() === 'rhino.global' || gs.getCurrentScopeName() === 'global') {
        p('');
        p('!! You are in GLOBAL. This test only means something in the scoped app.');
        p('!! Set the Application picker to "NexAI OTC BSM" and run it again.');
        gs.info('\n' + out.join('\n'));
        return;
    }

    var TABLES = ['x_nose_nfotc_bsm_cashflow', 'x_nose_nexai_test_cashflow'];
    for (var i = 0; i < TABLES.length; i++) {
        p('');
        p('reading sys_audit for ' + TABLES[i]);
        try {
            var a = new GlideRecord('sys_audit');
            p('   isValid()        : ' + a.isValid());
            if (!a.isValid()) { p('   -> the scope cannot even see the table'); continue; }
            a.addQuery('tablename', TABLES[i]);       // indexed - keeps it cheap
            a.orderByDesc('sys_created_on');
            a.setLimit(3);
            a.query();
            var n = 0;
            while (a.next()) {
                n++;
                p('   ROW ' + n + ' : ' + a.getValue('fieldname') +
                  '  ' + JSON.stringify((a.getValue('oldvalue') || '').substring(0, 20)) +
                  ' -> ' + JSON.stringify((a.getValue('newvalue') || '').substring(0, 20)) +
                  '   by ' + a.getValue('user') +
                  '   on ' + a.getValue('sys_created_on'));
            }
            p('   rows returned    : ' + n);
            p('   VERDICT          : ' + (n > 0 ? 'READABLE from this scope - the widget approach works'
                                                : 'query ran but returned nothing'));
        } catch (e) {
            p('   BLOCKED: ' + e);
            p('   VERDICT          : NOT readable from this scope - use the mirror table instead');
        }
    }

    p('');
    p('=================================================');
    gs.info('\n' + out.join('\n'));
})();
