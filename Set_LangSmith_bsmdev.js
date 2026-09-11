/**
 * Enable LangSmith on bsmdev — run in Scripts - Background, Application = "NexAI OTC BSM" (the
 * x_nose_nfotc_bsm scope), sandbox UNCHECKED. (Must be the bsm scope: LangSmithTracer is package_private,
 * so a Global script can't call ping().)
 *
 * It (1) points the tracer's MID at bsmdev's own Chinou MID, (2) sets the apikey (PASTE IT BELOW),
 * (3) pings. If the ping does NOT return 202, LangSmith isn't reachable from bsmdev — that's fine, leave it
 * off (the app works without it). The endpoint carried over from eval = Nomura's internal LangSmith host.
 */
(function () {
    var APIKEY = 'PASTE_LANGSMITH_KEY_HERE';   // <-- paste the LangSmith API key here, then run

    // Point LangSmith at bsmdev's own MID (the tracer calls setMIDServer). Reuse the Chinou MID.
    var mid = gs.getProperty('x_nose_gmet_app.chinou.mid_server', '');
    if (mid) { gs.setProperty('x_nose_nfotc_bsm.langsmith.midserver', mid); }
    gs.info('[LS-BSMDEV] midserver -> ' + (mid || '(NONE — set x_nose_nfotc_bsm.langsmith.midserver manually)'));
    gs.info('[LS-BSMDEV] endpoint  -> ' + gs.getProperty('x_nose_nfotc_bsm.langsmith.endpoint', '(empty)'));
    gs.info('[LS-BSMDEV] project   -> ' + gs.getProperty('x_nose_nfotc_bsm.langsmith.project', '(empty)'));

    if (!APIKEY || APIKEY === 'PASTE_LANGSMITH_KEY_HERE') {
        gs.info('[LS-BSMDEV] apikey NOT set — edit APIKEY in this script first, then re-run. (Skipping ping.)');
        return;
    }
    gs.setProperty('x_nose_nfotc_bsm.langsmith.apikey', APIKEY);
    gs.info('[LS-BSMDEV] apikey set (len=' + APIKEY.length + ', value not shown)');

    var res = new x_nose_nfotc_bsm.LangSmithTracer().ping();
    gs.info('[LS-BSMDEV] ping -> ' + res + '   (expect 202/true if LangSmith is reachable from bsmdev)');
})();
