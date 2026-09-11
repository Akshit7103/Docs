/**
 * Check bsmdev's configured Chinou model + test whether the gateway actually SERVES Sonnet 5.
 *
 * WHERE: Scripts - Background   |   Application = Global   |   "Execute in sandbox?" UNCHECKED
 * READ-ONLY: prints the configured model, then makes ONE tiny text call asking for Sonnet 5. Changes nothing.
 * (Uses only invoke(), so it works even before pasting the new ChinouClient.)
 */
(function () {
    gs.info('[CHK] chinou.model.id (default) = ' + gs.getProperty('chinou.model.id', '(unset)'));
    gs.info('[CHK] chinou.reg.id             = ' + gs.getProperty('chinou.reg.id', '(unset)'));
    gs.info('[CHK] gmet endpoint set?        = ' + (gs.getProperty('x_nose_gmet_app.chinou.endpoint', '') ? 'yes' : 'NO'));

    // Does bsmdev's Chinou serve Sonnet 5? (explicit model override, tiny prompt)
    var r = new global.ChinouClient().invoke('Reply with exactly: SONNET5 OK', 'anthropic-5-sonnet[Bedrock]');
    gs.info('[S5] success=' + (r && r.success) + '  status=' + (r && r.status) + '  model=' + (r && r.model));
    gs.info('[S5] response=' + ('' + ((r && r.response) || '')).substring(0, 100));
    if (!r || !r.success) { gs.info('[S5] error=' + ('' + ((r && r.error) || '')).substring(0, 250)); }
    gs.info('[S5] VERDICT: ' + ((r && r.success)
        ? 'Sonnet 5 IS served -> safe to switch pdf.model (and optionally chinou.model.id) to anthropic-5-sonnet[Bedrock]'
        : 'Sonnet 5 NOT available (or error above) -> keep anthropic-4.5-sonnet[Bedrock]'));
})();
