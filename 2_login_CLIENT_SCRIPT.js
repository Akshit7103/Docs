function controller($scope, $http, $window, spUtil) {
    /**
     * OTC console login - custom branded sign-in for the /nfotcbsm Service Portal.
     *
     * Three modes, decided by the server (see login.server.js):
     *   1. Already authenticated               -> straight to the landing (/nfotcbsm?id=bsm_work_drivers).
     *   2. An Identity Provider is configured  -> SSO is the ONLY way in. No username / password is rendered.
     *        sso_auto on  : redirect to the platform SSO login immediately (no page shown).
     *        sso_auto off : the branded NexAI page with a single "Log in with SSO" button.
     *   3. No IdP configured (e.g. eval)       -> the username / password form, authenticating through the same
     *      endpoint the OOTB Service Portal login widget uses (view_form.login) - a real login, not a mock.
     */

    var c = this;
    c.username = '';
    c.password = '';
    c.message = '';
    c.busy = false;

    var HOME = '/nfotcbsm?id=bsm_work_drivers';

    // 1) Already authenticated (SSO / platform session established at the instance layer) -> landing.
    if (c.data && c.data.authed) {
        $window.location = c.data.redirect || HOME;
        return;
    }

    // 2a) IdP configured + auto mode -> go to the platform SSO login now. SSO completes there and returns
    //     to sysparm_goto_url (the landing), where case 1 then applies.
    if (c.data && c.data.ssoUrl && c.data.ssoAuto) {
        $window.location = c.data.ssoUrl;
        return;
    }

    // 2b) "Log in with SSO" button (the only control on an SSO instance). Defensive fallback message if the
    //     deep-link is somehow missing - cannot happen while the template only shows the button with ssoUrl set.
    c.ssoLogin = function () {
        if (c.data && c.data.ssoUrl) {
            c.busy = true;
            c.message = '';
            $window.location = c.data.ssoUrl;
            return;
        }
        c.message = 'SSO is not configured on this instance.';
    };

    // 3) Username / password sign-in (non-SSO instances only).
    c.login = function (username, password) {
        if (!username || !password) {
            c.message = 'Please enter your username and password.';
            return;
        }
        c.busy = true;
        c.message = '';

        var url = spUtil.getURL({ sysparm_type: 'view_form.login' });
        var body = {
            sysparm_type: 'login',
            'ni.nolog.user_password': true,
            remember_me: true,
            user_name: username,
            user_password: password,
            get_redirect_url: true,
            is_direct_redirect: true,
            sysparm_goto_url: HOME,
            cert_login: false
        };
        var enc = Object.keys(body).map(function (k) {
            return encodeURIComponent(k) + '=' + encodeURIComponent(body[k]);
        }).join('&');

        $http({
            method: 'post',
            url: url,
            data: enc,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        }).then(function (res) {
            c.busy = false;
            var d = res.data || {};
            if (d.status === 'success') {
                $window.location = d.redirect_url || HOME;
            } else if (d.status === 'mfa_code_required') {
                $window.location = '/validate_multifactor_auth_code.do';
            } else {
                c.message = d.message || 'Invalid username or password.';
                c.password = '';
            }
        }, function () {
            c.busy = false;
            c.message = 'Sign-in failed. Please try again.';
        });
    };
}
