/**
 * CHINOU BSMDEV TEST — run on NOMURA BSMDEV (nomurabsmdev): Scripts - Background, Application = GLOBAL, sandbox UNCHECKED.
 * One run, two pings: (1) with bsmdev's current Registration ID (AIUC00337), (2) with AIUC00336. Restores the property after.
 * NON-DESTRUCTIVE — nothing is changed permanently.
 *   both 'not authorized'  => bsmdev is down too; svcnewsd needs CoE authorization (urgent — this is Nomura's live instance).
 *   current id works       => bsmdev is fine; only eval is affected.
 */
(function () {
    var _scope = '' + gs.getCurrentScopeName();
    if (_scope !== 'rhino.global' && _scope !== 'global') {
        gs.error('[BSMDEV-TEST] ABORTED - you are in scope "' + _scope + '". Set the Application picker to GLOBAL and re-run.');
        return;
    }
    function ping(label) {
        var r = new global.ChinouClient().invoke('Reply with the single word OK and nothing else.');
        gs.info('[BSMDEV-TEST] ' + label + ' -> success=' + (r && r.success) + ' status=' + (r && r.status) +
            ' error=' + ((r && r.error) || '(none)') + ' response=' + ('' + ((r && r.response) || '')).substring(0, 40));
    }
    var prev = gs.getProperty('chinou.reg.id', '');
    ping('current reg.id=' + prev);
    gs.setProperty('chinou.reg.id', 'AIUC00336');
    ping('reg.id=AIUC00336');
    gs.setProperty('chinou.reg.id', prev);   // restore
    gs.info('[BSMDEV-TEST] done - chinou.reg.id restored to ' + prev);
})();
