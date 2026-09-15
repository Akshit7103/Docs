// ============================================================================
// bsmdev - onboard MORE people onto /nfotcbsm exactly the way the superuser was set up (generalised
// bsmdev_make_me_superuser.js). Scripts - Background, Application = the BSM app (x_nose_nfotc_bsm), sandbox unchecked.
// Idempotent and APPEND-ONLY: never removes a role, a demo_users entry or an existing wizard assignment.
//   'superuser' = analyst + manager roles + demo_users (manager-level view, Manager/Analyst toggle, appears in the
//                 "Assign analysts" picker) + assigned to the work-driver(s).
//   'analyst'   = analyst role + assigned to the work-driver(s). NOT added to demo_users (anyone in demo_users gets
//                 manager-level view regardless of roles - it is a demo allow-list).
// Identify each person by Nomura email OR user_name (User ID).
// ============================================================================
(function () {
  var USERS = [
    { email: 'gopinath.adhikary@nomura.com',     user_name: 'adhikarg', level: 'superuser' },   // Gopinath Adhikary
    { email: 'vishnu.wala@nomura.com',           user_name: 'walavisv', level: 'superuser' },   // Vishnu Wala
    { email: 'paramjeetsingh.nigam@nomura.com',  user_name: 'nigamp',   level: 'superuser' }    // Paramjeet Singh Nigam
    // level: 'superuser' = same as you (analyst + manager + toggle + assigned) | 'analyst' = board access only
  ];
  var ASSIGN_TO = 'published';   // every published wizard, or one wizard's exact name
  var DEMO_PROP = 'x_nose_nfotc_bsm.demo_users';
  var ROLE_ANALYST = 'x_nose_nfotc_bsm.analyst', ROLE_MANAGER = 'x_nose_nfotc_bsm.manager';

  function findUser(s) {
    var u;
    if (s.email) { u = new GlideRecord('sys_user'); u.addQuery('email', s.email); u.setLimit(1); u.query(); if (u.next()) { return u; } }
    if (s.user_name) { u = new GlideRecord('sys_user'); u.addQuery('user_name', s.user_name); u.setLimit(1); u.query(); if (u.next()) { return u; } }
    return null;
  }
  function grantRole(uid, roleName) {
    var rr = new GlideRecord('sys_user_role');
    if (!rr.get('name', roleName)) { return 'role not found: ' + roleName; }
    var chk = new GlideRecord('sys_user_has_role'); chk.addQuery('user', uid); chk.addQuery('role', rr.getUniqueValue()); chk.query();
    if (chk.hasNext()) { return 'already has ' + roleName; }
    var ins = new GlideRecord('sys_user_has_role'); ins.initialize(); ins.setValue('user', uid); ins.setValue('role', rr.getUniqueValue());
    return ins.insert() ? 'granted ' + roleName : 'FAILED ' + roleName + ' (add it on the user record > Roles)';
  }
  function addToDemoUsers(uname) {
    var arr = ('' + (gs.getProperty(DEMO_PROP, '') || '')).split(',').map(function (x) { return x.trim(); }).filter(function (x) { return x; });
    if (arr.indexOf(uname) !== -1) { return 'already in demo_users'; }
    arr.push(uname); gs.setProperty(DEMO_PROP, arr.join(','));
    return 'added to demo_users -> ' + arr.join(',');
  }
  function assignToWizards(uid, disp) {
    var w = new GlideRecord('x_nose_nfotc_bsm_wizard');
    if (ASSIGN_TO === 'published') { w.addQuery('status', 'published'); } else { w.addQuery('name', ASSIGN_TO); }
    w.query();
    var out = [];
    while (w.next()) {
      var list = []; try { list = JSON.parse(w.getValue('assigned_users') || '[]'); } catch (e) { list = []; }
      if (!(list instanceof Array)) { list = []; }
      var has = false; for (var i = 0; i < list.length; i++) { if (list[i] && list[i].id === uid) { has = true; break; } }
      if (!has) { list.push({ id: uid, name: disp }); w.setValue('assigned_users', JSON.stringify(list)); w.setValue('assigned_count', list.length); w.update(); }
      out.push('"' + w.getValue('name') + '"' + (has ? ' (already)' : ' (assigned)'));
    }
    return out.length ? out.join(', ') : 'no wizard matched';
  }

  if (!USERS.length) { gs.info('[ONBOARD] USERS is empty - fill it in first.'); return; }
  for (var n = 0; n < USERS.length; n++) {
    var spec = USERS[n], u = findUser(spec);
    if (!u) { gs.info('[ONBOARD] NOT FOUND: ' + JSON.stringify(spec)); continue; }
    var uid = u.getUniqueValue(), uname = u.getValue('user_name'), disp = u.getValue('name') || u.getValue('email') || uname;
    var lvl = ('' + (spec.level || 'analyst')).toLowerCase();
    gs.info('[ONBOARD] ' + disp + ' (' + uname + ') as ' + lvl.toUpperCase());
    gs.info('   role   : ' + grantRole(uid, ROLE_ANALYST));
    if (lvl === 'superuser') {
      gs.info('   role   : ' + grantRole(uid, ROLE_MANAGER));
      gs.info('   toggle : ' + addToDemoUsers(uname));
    }
    gs.info('   wizard : ' + assignToWizards(uid, disp));
  }
  gs.info('[ONBOARD] done. Each person should log out and in once, then open /nfotcbsm.');
})();
