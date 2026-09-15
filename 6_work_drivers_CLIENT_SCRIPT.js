function controller($window) {
    var c = this;
    // FRAME POP-OUT: after SSO the platform returns here via its own deep link (/nav_to.do?uri=...), which
    // renders the portal INSIDE the platform frame (left navigator + banner). Same origin, so replace the top
    // window with this page's own URL -> the console opens full screen. No-op when not framed.
    try {
        if ($window.top && $window.top !== $window.self) { $window.top.location.replace($window.location.href); return; }
    } catch (eFrame) { /* cross-origin frame (never the case on the instance) - just render in place */ }
    // Managers (and admins) land on the Manager Dashboard, not the analyst card grid.
    if (c.data && c.data.isManager) { $window.location.replace('/nfotcbsm?id=bsm_manager_dashboard'); return; }
    c.userMenu = false;
    c.signOut = function () {
        $window.location.href = '/logout.do?sysparm_goto_url=' + encodeURIComponent('/nfotcbsm');
    };
    // View-as toggle (test user only): set the session view, then land on that view.
    c.switchView = function (view) {
        c.data.action = 'set_view';
        c.data.viewAs = view;
        c.server.update().then(function () {
            c.data.action = '';
            $window.location.href = (view === 'manager') ? '/nfotcbsm?id=bsm_manager_dashboard' : '/nfotcbsm?id=bsm_work_drivers';
        });
    };
}
