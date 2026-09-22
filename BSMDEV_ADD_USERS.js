// ============================================================================================
// ONBOARD PEOPLE ONTO A NexAI OTC ENVIRONMENT
//
// Scripts - Background. "Execute in sandbox?" UNCHECKED.
// APPLICATION = the environment you are onboarding them to. On bsmdev these are:
//     NexAI OTC BSM    x_nose_nfotc_bsm
//     NexAI OTC Dev    x_nose_nexai_dev
//     NexAI OTC Test   x_nose_nexai_test
//     NexAI OTC UAT    x_nose_nexai_uat
// Note BSM does NOT share a prefix with the other three - the script allow-lists them by name.
//
// RUN IT ONCE PER ENVIRONMENT, UNCHANGED. Everything scope-specific is derived from the scope the
// script is running in, so the same file cannot target the wrong environment by accident. Edit the
// USERS list once; run it in each app.
//
// Why it cannot do all four in one pass: a scoped app's tables refuse writes from ANY other scope,
// including Global. Roles and properties would be reachable, but the work-driver assignment is not
// - so that half has to execute inside each app. One run per environment is the honest shape.
//
// LEVELS
//   superuser = analyst + manager roles + demo_users + assigned to the work driver(s).
//               demo_users is a demo allow-list: anyone in it gets the manager-level view and the
//               Manager/Analyst toggle, and appears in the "Assign analysts" picker.
//   analyst   = analyst role + assigned to the work driver(s). NOT added to demo_users.
//
// IDEMPOTENT AND APPEND-ONLY. It never removes a role, a demo_users entry or an existing
// assignment, so re-running it is safe.
// ============================================================================================
(function () {

  // Identified by Nomura email AND user_name (User ID) - email is tried first, user_name is the
  // fallback. Both are taken from the sys_user records on bsmdev, so they should resolve directly.
  //
  // >>> CHECK THE LEVELS BEFORE YOU RUN. <<<
  // Everyone below is 'superuser', matching the first batch. A superuser gets the manager-level
  // view and the Manager/Analyst toggle. If someone should only see the analyst board, change
  // their level to 'analyst' NOW - demo_users is append-only, so undoing it afterwards means
  // editing the property by hand.
  var USERS = [
    // --- first batch (already onboarded; re-running is a harmless no-op) -------------------
    { email: 'gopinath.adhikary@nomura.com',     user_name: 'adhikarg', level: 'superuser' },  // Gopinath Adhikary
    { email: 'vishnu.wala@nomura.com',           user_name: 'walavisv', level: 'superuser' },  // Vishnu Wala
    { email: 'paramjeetsingh.nigam@nomura.com',  user_name: 'nigamp',   level: 'superuser' },  // Paramjeet Singh Nigam

    // --- new, 21 Sep ---------------------------------------------------------------------
    { email: 'mayur.nachnani@nomura.com',        user_name: 'nachnanm', level: 'superuser' },  // Mayur Nachnani - Executive Director
    { email: 'satyadarshi.mohanty@nomura.com',   user_name: 'mohansat', level: 'superuser' },  // Satyadarshi Mohanty
    { email: 'aastha.makkar@nomura.com',         user_name: 'makkaraa', level: 'superuser' },  // Aastha Makkar
    { email: 'manav.khatri@nomura.com',          user_name: 'khatrim',  level: 'superuser' },  // Manav Khatri
    { email: 'dheeraj.khatri@nomura.com',        user_name: 'khatridh', level: 'superuser' },  // Dheeraj Khatri
    { email: 'harshil.solanki1@nomura.com',      user_name: 'solharsh', level: 'superuser' },  // Harshil Solanki - Analyst   (note the "1" in the email)
    { email: 'aanshuvi.shah1@nomura.com',        user_name: 'shahaans', level: 'superuser' }   // Aanshuvi Shah  - Analyst   (note the "1" in the email)
  ];

  var ASSIGN_TO = 'published';   // every published work driver, or one work driver's exact name

  // ------------------------------------------------------------------ derive the environment
  // Everything below comes from the scope this is running in. Change the Application picker and the
  // whole script retargets - nothing to edit, and no way to write to the wrong environment.
  // An explicit allow-list, not a prefix test. The environments do NOT share a prefix - BSM is
  // x_nose_nfotc_bsm while dev/test/uat are x_nose_nexai_* - and the instance also carries
  // x_nose_nfotc (the older Names and Forms OTC app) plus assorted scratch scopes. A loose check
  // would happily onboard people onto the wrong app.
  var ENVIRONMENTS = {
    'x_nose_nfotc_bsm':  'NexAI OTC BSM',
    'x_nose_nexai_dev':  'NexAI OTC Dev',
    'x_nose_nexai_test': 'NexAI OTC Test',
    'x_nose_nexai_uat':  'NexAI OTC UAT'
  };

  var SCOPE = '' + gs.getCurrentScopeName();
  if (!ENVIRONMENTS[SCOPE]) {
    gs.error('[ONBOARD] ABORT: Application is "' + SCOPE + '", which is not a NexAI OTC environment.');
    gs.error('[ONBOARD] Set the Application picker to one of:');
    for (var e in ENVIRONMENTS) {
      if (ENVIRONMENTS.hasOwnProperty(e)) { gs.error('[ONBOARD]     ' + ENVIRONMENTS[e] + '   (' + e + ')'); }
    }
    return;
  }

  var DEMO_PROP = SCOPE + '.demo_users';
  var ROLE_ANALYST = SCOPE + '.analyst';
  var ROLE_MANAGER = SCOPE + '.manager';
  var WIZ_TABLE = SCOPE + '_wizard';

  gs.info('[ONBOARD] ================================================================');
  gs.info('[ONBOARD] environment : ' + ENVIRONMENTS[SCOPE] + '   (' + SCOPE + ')');
  gs.info('[ONBOARD] roles       : ' + ROLE_ANALYST + ' / ' + ROLE_MANAGER);
  gs.info('[ONBOARD] toggle prop : ' + DEMO_PROP);
  gs.info('[ONBOARD] work drivers: ' + WIZ_TABLE + '  (' + ASSIGN_TO + ')');
  gs.info('[ONBOARD] ================================================================');

  // ------------------------------------------------------------------ helpers
  function findUser(s) {
    var u;
    if (s.email) {
      u = new GlideRecord('sys_user'); u.addQuery('email', s.email); u.setLimit(1); u.query();
      if (u.next()) { return u; }
    }
    if (s.user_name) {
      u = new GlideRecord('sys_user'); u.addQuery('user_name', s.user_name); u.setLimit(1); u.query();
      if (u.next()) { return u; }
    }
    return null;
  }

  function grantRole(uid, roleName) {
    var rr = new GlideRecord('sys_user_role');
    if (!rr.get('name', roleName)) { return 'ROLE NOT FOUND: ' + roleName + ' (is the app installed here?)'; }
    var chk = new GlideRecord('sys_user_has_role');
    chk.addQuery('user', uid); chk.addQuery('role', rr.getUniqueValue()); chk.query();
    if (chk.hasNext()) { return 'already has ' + roleName; }
    var ins = new GlideRecord('sys_user_has_role');
    ins.initialize(); ins.setValue('user', uid); ins.setValue('role', rr.getUniqueValue());
    // insert() returns null when a policy refuses the write - never assume it worked.
    return ins.insert() ? 'granted ' + roleName : 'FAILED ' + roleName + ' (add it on the user record > Roles)';
  }

  function addToDemoUsers(uname) {
    var raw = '' + (gs.getProperty(DEMO_PROP, '') || '');
    var arr = raw.split(','), clean = [], i, t;
    for (i = 0; i < arr.length; i++) { t = ('' + arr[i]).replace(/^\s+|\s+$/g, ''); if (t) { clean.push(t); } }
    for (i = 0; i < clean.length; i++) { if (clean[i] === uname) { return 'already in demo_users'; } }
    clean.push(uname);
    gs.setProperty(DEMO_PROP, clean.join(','));
    // Read it back. A property write that silently did nothing would leave the person without the
    // toggle and nothing else would tell you.
    var back = '' + (gs.getProperty(DEMO_PROP, '') || '');
    return (back.indexOf(uname) > -1) ? ('added to demo_users -> ' + back)
                                      : ('FAILED to write ' + DEMO_PROP);
  }

  function assignToWizards(uid, disp) {
    var w = new GlideRecord(WIZ_TABLE);
    if (ASSIGN_TO === 'published') { w.addQuery('status', 'published'); } else { w.addQuery('name', ASSIGN_TO); }
    w.query();
    var out = [];
    while (w.next()) {
      var list = [];
      try { list = JSON.parse(w.getValue('assigned_users') || '[]'); } catch (e) { list = []; }
      if (!(list instanceof Array)) { list = []; }
      var has = false;
      for (var i = 0; i < list.length; i++) { if (list[i] && list[i].id === uid) { has = true; break; } }
      if (!has) {
        list.push({ id: uid, name: disp });
        w.setValue('assigned_users', JSON.stringify(list));
        w.setValue('assigned_count', list.length);
        if (!w.update()) { out.push('"' + w.getValue('name') + '" (UPDATE REFUSED - wrong scope?)'); continue; }
      }
      out.push('"' + w.getValue('name') + '"' + (has ? ' (already)' : ' (assigned)'));
    }
    return out.length ? out.join(', ')
                      : 'NO WORK DRIVER MATCHED - is one published in this environment?';
  }

  // ------------------------------------------------------------------ run
  if (!USERS.length) { gs.info('[ONBOARD] USERS is empty - fill it in first.'); return; }

  var done = 0, missing = 0;
  for (var n = 0; n < USERS.length; n++) {
    var spec = USERS[n], u = findUser(spec);
    if (!u) {
      gs.error('[ONBOARD] NOT FOUND on this instance: ' + JSON.stringify(spec));
      missing++;
      continue;
    }
    var uid = u.getUniqueValue();
    var uname = '' + u.getValue('user_name');
    var disp = '' + (u.getValue('name') || u.getValue('email') || uname);
    var lvl = ('' + (spec.level || 'analyst')).toLowerCase();

    gs.info('[ONBOARD] ----------------------------------------------------------------');
    gs.info('[ONBOARD] ' + disp + ' (' + uname + ') as ' + lvl.toUpperCase());
    gs.info('   role   : ' + grantRole(uid, ROLE_ANALYST));
    if (lvl === 'superuser') {
      gs.info('   role   : ' + grantRole(uid, ROLE_MANAGER));
      gs.info('   toggle : ' + addToDemoUsers(uname));
    }
    gs.info('   driver : ' + assignToWizards(uid, disp));
    done++;
  }

  gs.info('[ONBOARD] ================================================================');
  gs.info('[ONBOARD] ' + done + ' onboarded to ' + SCOPE + (missing ? ('   ' + missing + ' NOT FOUND') : ''));
  gs.info('[ONBOARD] Each person: log out and back in once, then open the portal.');
  gs.info('[ONBOARD] Repeat with the Application set to each other environment.');
  gs.info('[ONBOARD] ================================================================');
})();
