/**
 * CHINOU HEALTH PROBE — run on the Nomura bsmdev instance (nomurabsmdev.service-now.com).
 *
 * WHERE:  System Definition -> Scripts - Background
 * HOW:    Application = Global   |   "Execute in sandbox?" UNCHECKED   |   Run script
 *
 * WHAT IT DOES:  sends ONE tiny text prompt to Chinou via the Global ChinouClient and logs a
 *               clear UP/DOWN verdict. Read-only, no writes, costs a fraction of a cent.
 *
 * WHY:  bsmdev has its OWN Chinou connection (separate instance, separate MID, reusing GMET's
 *       x_nose_gmet_app.chinou.* connection). It is an independent cross-check of the eval-instance
 *       outage — we have never touched bsmdev's Chinou, so its result is impartial.
 *
 * READ THE RESULT:
 *   DOWN / status 504  -> central Chinou backend is down; affects every instance (not us).
 *   UP   / status 200  -> bsmdev Chinou is healthy; the eval instance's endpoint is the narrower issue.
 *   EXCEPTION          -> ChinouClient may be named/scoped differently on bsmdev; send me the message.
 */
(function () {
    var t0 = new GlideDateTime().getNumericValue();
    var r;
    try {
        r = new global.ChinouClient().invoke('Reply with exactly: CHINOU OK');
    } catch (e) {
        gs.info('[CHINOU-PING-BSMDEV] EXCEPTION (ChinouClient not found in Global? check SI name): ' + (e.message || e));
        return;
    }
    var ms = new GlideDateTime().getNumericValue() - t0;
    var ok = r && r.success;
    gs.info('[CHINOU-PING-BSMDEV] ============================================');
    gs.info('[CHINOU-PING-BSMDEV] VERDICT : ' + (ok ? 'UP OK' : 'DOWN  status=' + (r && r.status)));
    gs.info('[CHINOU-PING-BSMDEV] status  : ' + (r && r.status) + '   roundTripMs: ' + ms);
    gs.info('[CHINOU-PING-BSMDEV] model   : ' + (r && r.model));
    gs.info('[CHINOU-PING-BSMDEV] response: ' + ('' + ((r && r.response) || '')).substring(0, 120));
    if (!ok) { gs.info('[CHINOU-PING-BSMDEV] error   : ' + ('' + ((r && r.error) || '')).substring(0, 200)); }
    gs.info('[CHINOU-PING-BSMDEV] ============================================');
})();
