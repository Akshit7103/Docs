/**
 * SSO-aware gate for the OTC console login widget (BSM handover build).
 *
 * The BSM instance (nomurabsmdev) authenticates users via SSO at the instance layer. Three cases:
 *   1. Already authenticated (real user, not "guest")  -> skip the page, forward straight to the landing.
 *   2. Guest + an Identity Provider is CONFIGURED       -> SSO is the ONLY way in; no username / password is
 *      ever rendered. With sso_auto on, the visitor is sent into the platform SSO flow immediately; with
 *      sso_auto off, the branded NexAI page shows a single "Log in with SSO" button that does the same.
 *      HOW THE TARGET SURVIVES SSO (verified on bsmdev 2026-09-15): the platform ignores sysparm_goto_url and
 *      RelayState on login_with_sso.do (both land on the platform home page). The ONLY carrier it honours is
 *      its own deep link /nav_to.do?uri=<page>: an unauthenticated nav_to stores the page as the session's
 *      starting page, auto-redirects to the default IdP (Multi-Provider SSO "auto redirect" is on), and
 *      returns to that page after login. nav_to renders the page inside the platform frame, so the landing
 *      widget (work-drivers.client.js) pops itself out to full screen. This is what makes the raw /nfotcbsm
 *      link work without first visiting the instance base URL: our login page is PUBLIC, so the platform
 *      never issues an SSO challenge on its own.
 *   3. Guest + no IdP configured (e.g. eval)             -> the branded username / password form, as before.
 *
 * SSO CONFIG - per instance, set ONCE via background script (deliberately NOT a Fluent seed: the value is
 * instance-specific and a Property() seed would re-assert on every install / ride along in an update set):
 *   x_nose_nfotc_bsm.sso_idp   sys_id of the Identity Provider (Multi-Provider SSO > Identity Providers). Acts as
 *                              the ON switch for SSO mode; the platform's default IdP handles the redirect.
 *   x_nose_nfotc_bsm.sso_auto  'true' (default) = auto-redirect guests to the IdP immediately (no page);
 *                              'false' = show the NexAI page with only the "Log in with SSO" button
 *   Clearing sso_idp restores the username / password form (fallback if the IdP is ever unavailable).
 */
(function () {
    var HOME = '/nfotcbsm?id=bsm_work_drivers';
    data.redirect = HOME;

    // In Service Portal an unauthenticated visitor runs as the built-in "guest" user; a real (SSO /
    // platform) session returns the actual username. Use gs.getUserName() - the scoped-safe GlideSystem
    // call - NOT gs.getUser().getUserName() (the scoped ScopedUser has no getUserName()).
    var userName = gs.getUserName();
    data.authed = !!(userName && userName !== 'guest');

    // SSO entry for guests: the platform deep link to the landing (see header). nav_to stores the target as
    // the session's starting page, triggers the default IdP, and returns to the landing after login. Empty
    // when no IdP is configured, so the client renders the form instead.
    data.ssoUrl = '';
    data.ssoAuto = false;
    if (!data.authed) {
        var idp = ('' + (gs.getProperty('x_nose_nfotc_bsm.sso_idp', '') || '')).trim();
        if (idp) {
            data.ssoUrl = '/nav_to.do?uri=' + encodeURIComponent(HOME);
            data.ssoAuto = ('' + gs.getProperty('x_nose_nfotc_bsm.sso_auto', 'true')).toLowerCase() !== 'false';
        }
    }
})();
