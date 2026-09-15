/**
 * STEP B - configure SSO for the /nfotcbsm login on THIS instance (nomurabsmdev). Run ONCE, re-run to change the mode.
 * Scripts - Background, Application = "NexAI OTC BSM" (x_nose_nfotc_bsm), sandbox UNCHECKED.
 * (Do NOT run on eval - it has no IdP; eval keeps the username / password form.)
 *
 * IDP_SYS_ID = the ACTIVE, DEFAULT Identity Provider from STEP A (4_List_SSO_IdPs.js). On bsmdev that is
 *              "30-Nomura-Internal-IDP-INT" = bd2202afdb8862006c487bec0f96196d (listed 2026-09-15, active=1 default=1).
 * SSO_AUTO   = 'false' -> the NexAI login page shows ONLY the "Log in with SSO" button (no username / password).
 *              'true'  -> no page at all: guests are redirected to the IdP immediately.
 * Fallback: to bring the username / password form back, set x_nose_nfotc_bsm.sso_idp to '' (empty).
 */
(function () {
    var IDP_SYS_ID = 'bd2202afdb8862006c487bec0f96196d';   // 30-Nomura-Internal-IDP-INT (bsmdev)
    var SSO_AUTO = 'false';                                // 'false' = button page (tested 2026-09-15) | 'true' = auto-redirect

    if (!/^[0-9a-f]{32}$/i.test(IDP_SYS_ID)) { gs.error('[SSO-CFG] IDP_SYS_ID must be a 32-char sys_id - got: ' + IDP_SYS_ID); return; }
    // Best-effort sanity check of the IdP (sso_properties is a Global table; if this scope cannot read it, just proceed).
    var idpName = '(not verified from this scope)';
    try {
        var idp = new GlideRecord('sso_properties');
        if (idp.get(IDP_SYS_ID)) {
            idpName = '' + idp.getValue('name');
            var act = '' + idp.getValue('active');
            if (act !== '1' && act !== 'true') { gs.warn('[SSO-CFG] IdP "' + idpName + '" is NOT active - the SSO redirect will fail until it is'); }
        } else { gs.warn('[SSO-CFG] could not read IdP ' + IDP_SYS_ID + ' from this scope - check it against STEP A output; proceeding'); }
    } catch (e) { gs.warn('[SSO-CFG] IdP lookup skipped (' + e + '); proceeding'); }

    gs.setProperty('x_nose_nfotc_bsm.sso_idp', IDP_SYS_ID);
    gs.setProperty('x_nose_nfotc_bsm.sso_auto', SSO_AUTO === 'true' ? 'true' : 'false');
    gs.info('[SSO-CFG] idp="' + idpName + '"  sso_idp=' + gs.getProperty('x_nose_nfotc_bsm.sso_idp') +
            '  sso_auto=' + gs.getProperty('x_nose_nfotc_bsm.sso_auto') +
            '  -> /nfotcbsm now shows ' + (gs.getProperty('x_nose_nfotc_bsm.sso_auto') === 'true' ? 'NO page (auto-redirect to the IdP)' : 'the NexAI page with only the "Log in with SSO" button'));
})();
