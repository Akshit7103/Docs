/**
 * DID THE invokeBatch FIX TAKE? - verify BEFORE re-syncing any mail.
 *
 * Scripts - Background.  APPLICATION = **Global**.  "Execute in sandbox?" UNCHECKED.
 * Global because ChinouClient is a Global Script Include and this reads Global properties.
 *
 * SAFE: it sends three tiny throwaway prompts to Chinou. It touches no mail, no cashflow, no
 * work driver, and writes nothing to any table. It costs a fraction of a cent.
 *
 * WHY RUN THIS FIRST
 * The big mail failed with `TypeError: Cannot find function invokeBatch in object [object Object]`
 * - WizardExtractor chunked it into 8 concurrent calls and the Global ChinouClient had no method to
 * make them. Re-syncing the mail to find out whether the paste worked costs minutes and muddies the
 * record. This answers it in seconds, and separates the three things that can still be wrong:
 *
 *   1. the paste did not take            -> invokeBatch still missing
 *   2. the connection is broken          -> even a single invoke() fails
 *   3. async-over-MID does not work      -> invoke() works, invokeBatch returns errors
 *
 * (3) is the one genuinely unproven bit: eval only ever ran executeAsync() through a NAMED REST
 * Message, while bsmdev must configure the request inline. Same class, same ECC path, so it should
 * behave identically - but if it does not, this is where it shows up, and the fix is a serial
 * fallback rather than anything to do with chunking.
 *
 * IT ALSO TIMES THE BATCH. Three calls fired together should take about as long as the SLOWEST one,
 * not the sum of all three. If the total is close to the sum, the calls are running serially and
 * chunking will still hit the 30-second wall on a big mail even though no error is raised.
 */
(function () {

    var CAP = 3;              // how many to fire at once
    var TIMEOUT_SEC = 120;    // how long to wait for each reply

    function mask(v) {
        v = '' + (v || '');
        if (!v) { return '(EMPTY)'; }
        if (v.length <= 4) { return '***'; }
        return v.substring(0, 2) + '***' + v.substring(v.length - 2);
    }

    var scope = '' + gs.getCurrentScopeName();
    gs.info('[VERIFY] ================================================================');
    gs.info('[VERIFY] scope: ' + scope + (scope === 'global' || scope === 'rhino.global' ? '' : '   (Global is preferred)'));
    gs.info('[VERIFY] ================================================================');

    // ---------------------------------------------------------------- 0. is the client even there?
    var c;
    try {
        c = new global.ChinouClient();
    } catch (e0) {
        gs.error('[VERIFY] Cannot construct global.ChinouClient: ' + (e0.message || e0));
        gs.error('[VERIFY] Check System Definition > Script Includes > ChinouClient exists, is Active,');
        gs.error('[VERIFY] Application = Global and "Accessible from" = All application scopes.');
        return;
    }

    gs.info('[VERIFY] ---- 1. methods on the client ----');
    var NEEDED = ['invoke', 'invokeDocument', 'invokeBatch', '_fireAsync', '_collectAsync',
                  '_textBody', '_docBody', '_parseChinou'];
    var missing = [];
    for (var m = 0; m < NEEDED.length; m++) {
        var present = (typeof c[NEEDED[m]] === 'function');
        gs.info('[VERIFY]   ' + (NEEDED[m] + '                  ').substring(0, 18) + (present ? 'present' : '*** MISSING ***'));
        if (!present) { missing.push(NEEDED[m]); }
    }
    if (missing.length) {
        gs.error('[VERIFY] The paste did NOT take. Missing: ' + missing.join(', '));
        gs.error('[VERIFY] Paste the WHOLE file into the Script field and press Update.');
        gs.error('[VERIFY] If it still shows missing, there is MORE THAN ONE ChinouClient on this');
        gs.error('[VERIFY] instance and you edited the other one - see section 2.');
    }

    // ---------------------------------------------------------------- 1b. how many copies exist?
    // bsmdev reuses GMET's Chinou plumbing, so a second ChinouClient is plausible. Editing the wrong
    // copy looks EXACTLY like "the change had no effect".
    gs.info('[VERIFY]');
    gs.info('[VERIFY] ---- 2. how many ChinouClient records exist ----');
    try {
        var si = new GlideRecord('sys_script_include');
        si.addQuery('name', 'ChinouClient');
        si.query();
        var n = 0;
        while (si.next()) {
            n++;
            var src = '' + si.getValue('script');
            gs.info('[VERIFY]   scope=' + si.getValue('sys_scope') +
                    '  active=' + si.getValue('active') +
                    '  ' + src.length + ' chars' +
                    '  updated=' + si.getValue('sys_updated_on') +
                    '  invokeBatch=' + (src.indexOf('invokeBatch') > -1));
        }
        if (n > 1) {
            gs.warn('[VERIFY]   *** ' + n + ' copies. Only the Global one is used by the app. If the copy');
            gs.warn('[VERIFY]   *** showing invokeBatch=false is the Global one, you edited the wrong record.');
        }
    } catch (eSI) {
        gs.info('[VERIFY]   (cannot read sys_script_include from this scope - run as Global)');
    }

    if (missing.length) {
        gs.error('[VERIFY] Stopping - fix the paste before testing the calls.');
        return;
    }

    // ---------------------------------------------------------------- 2. the connection properties
    gs.info('[VERIFY]');
    gs.info('[VERIFY] ---- 3. connection properties ----');
    var endpoint  = gs.getProperty('x_nose_gmet_app.chinou.endpoint', '');
    var midServer = gs.getProperty('x_nose_gmet_app.chinou.mid_server', '');
    var user      = gs.getProperty('x_nose_gmet_app.chinou.username', '');
    var pass      = gs.getProperty('x_nose_gmet_app.chinou.password', '');
    gs.info('[VERIFY]   endpoint   ' + (endpoint || '*** EMPTY - nothing will work ***'));
    gs.info('[VERIFY]   mid_server ' + (midServer || '*** EMPTY - internal DNS will not resolve ***'));
    gs.info('[VERIFY]   username   ' + (user || '(empty)'));
    gs.info('[VERIFY]   password   ' + mask(pass));
    gs.info('[VERIFY]   model      ' + gs.getProperty('chinou.model.id', '(unset -> client default)'));
    gs.info('[VERIFY]   reg id     ' + gs.getProperty('chinou.reg.id', '(unset)'));

    // ---------------------------------------------------------------- 3. one plain call
    gs.info('[VERIFY]');
    gs.info('[VERIFY] ---- 4. a single invoke() - is the connection alive at all? ----');
    var t0 = new GlideDateTime().getNumericValue();
    var one = c.invoke('Reply with exactly: CHINOU OK');
    var t1 = new GlideDateTime().getNumericValue();
    gs.info('[VERIFY]   success=' + one.success + '  status=' + one.status +
            '  ' + ((t1 - t0) / 1000).toFixed(1) + 's');
    gs.info('[VERIFY]   reply  = ' + ('' + (one.response || '')).substring(0, 120));
    if (!one.success) {
        gs.error('[VERIFY]   error  = ' + one.error);
        gs.error('[VERIFY] The connection itself is down - this is NOT about invokeBatch.');
        gs.error('[VERIFY]   HTTP 401 -> the svcnewsd credential');
        gs.error('[VERIFY]   HTTP 0 / UnknownHost -> the MID server');
        gs.error('[VERIFY]   HTTP 504 -> Chinou itself is down (check another instance to confirm)');
        return;
    }

    // ---------------------------------------------------------------- 4. the batch
    gs.info('[VERIFY]');
    gs.info('[VERIFY] ---- 5. invokeBatch with ' + CAP + ' concurrent calls ----');
    var items = [
        { kind: 'text', prompt: 'Reply with exactly: ONE' },
        { kind: 'text', prompt: 'Reply with exactly: TWO' },
        { kind: 'text', prompt: 'Reply with exactly: THREE' }
    ];

    var b0 = new GlideDateTime().getNumericValue();
    var res = c.invokeBatch(items, CAP, TIMEOUT_SEC);
    var b1 = new GlideDateTime().getNumericValue();
    var batchSec = (b1 - b0) / 1000;

    var ok = 0, slowest = 0, sumSec = 0;
    for (var i = 0; i < res.length; i++) {
        var r = res[i] || {};
        var sec = (r.roundTripMs || 0) / 1000;
        if (sec > slowest) { slowest = sec; }
        sumSec += sec;
        if (r.success) { ok++; }
        gs.info('[VERIFY]   [' + i + '] success=' + r.success + '  status=' + r.status +
                '  ' + sec.toFixed(1) + 's  reply="' + ('' + (r.response || '')).substring(0, 40) + '"' +
                (r.error ? ('  error=' + r.error) : ''));
    }

    gs.info('[VERIFY]');
    gs.info('[VERIFY]   returned ' + res.length + ' results for ' + items.length + ' items, ' + ok + ' succeeded');
    gs.info('[VERIFY]   wall time ' + batchSec.toFixed(1) + 's   slowest single call ' + slowest.toFixed(1) +
            's   sum of all calls ' + sumSec.toFixed(1) + 's');

    // ---------------------------------------------------------------- verdict
    gs.info('[VERIFY]');
    gs.info('[VERIFY] ================================================================');
    if (ok === items.length) {
        gs.info('[VERIFY] PASS - invokeBatch works. Re-sync the big mail; it should produce 61 rows.');

        // Concurrency is the whole point. If the wall time is near the SUM rather than the slowest
        // call, the calls ran one after another: no error, but a big mail will still die at the
        // 30-second wall because the chunks are not overlapping.
        if (sumSec > 0 && batchSec > (sumSec * 0.8)) {
            gs.warn('[VERIFY]');
            gs.warn('[VERIFY] *** BUT THEY RAN SERIALLY. Wall time ' + batchSec.toFixed(1) + 's is close to the');
            gs.warn('[VERIFY] *** sum (' + sumSec.toFixed(1) + 's), not to the slowest call (' + slowest.toFixed(1) + 's).');
            gs.warn('[VERIFY] *** executeAsync() is not overlapping over the MID here. Chunking will raise');
            gs.warn('[VERIFY] *** no error but a big mail can still hit the 30s wall. Tell Akshit.');
        } else {
            gs.info('[VERIFY] Concurrency confirmed: wall time tracks the slowest call, not the sum.');
        }
    } else if (ok === 0) {
        gs.error('[VERIFY] FAIL - every batched call failed while a single invoke() succeeded.');
        gs.error('[VERIFY] That points at executeAsync() over the MID with an inline request, which is');
        gs.error('[VERIFY] the one part not previously proven on this instance. The fallback is a serial');
        gs.error('[VERIFY] invokeBatch (slower, certain). Send this output back.');
    } else {
        gs.warn('[VERIFY] PARTIAL - ' + ok + ' of ' + items.length + ' succeeded. Read the per-call errors above:');
        gs.warn('[VERIFY]   "collect failed" / empty  -> the wait timed out; raise TIMEOUT_SEC and retry');
        gs.warn('[VERIFY]   HTTP 429 / 504            -> the shared Chinou gateway is throttling or down');
    }
    gs.info('[VERIFY] ================================================================');
})();
