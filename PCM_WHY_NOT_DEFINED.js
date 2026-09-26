/**
 * Why does "new PcmClient()" say not defined when the record exists, is Global, active and public?
 *
 * A Script Include is evaluated lazily, the first time its name is referenced. If that evaluation
 * throws - a syntax error, a truncated paste, a leftover template around the pasted code - the symbol
 * simply never comes into existence and the only message you get is "not defined". The error that
 * actually caused it is not shown anywhere.
 *
 * So this reads the stored script back, checks it is the file that was meant to go in, and then
 * evaluates it directly to make the real error surface with its line number.
 *
 * Run: Background Scripts, Application "Global". Reads only.
 */
(function () {
    function line() { gs.info('------------------------------------------------------------------'); }

    var g = new GlideRecord('sys_script_include');
    g.addQuery('name', 'PcmClient');
    g.query();
    if (!g.next()) { gs.error('No Script Include named PcmClient at all.'); return; }

    var body = '' + (g.getValue('script') || '');
    gs.info('sys_id        : ' + g.getUniqueValue());
    gs.info('name          : ' + g.getValue('name'));
    gs.info('api_name      : ' + g.getValue('api_name'));
    gs.info('scope         : ' + g.sys_scope.scope);
    gs.info('active        : ' + g.getValue('active'));
    gs.info('access        : ' + g.getValue('access'));
    gs.info('client_callable: ' + g.getValue('client_callable'));
    gs.info('script length : ' + body.length + ' chars   (the file is 12520)');

    line();
    gs.info('1. IS IT THE RIGHT CONTENT');
    var marks = [
        'var PcmClient = Class.create();',
        'PcmClient.prototype = {',
        '_normalise: function',
        'amount_signed',
        'setMIDServer',
        "type: 'PcmClient'"
    ];
    var missing = [];
    for (var i = 0; i < marks.length; i++) {
        if (body.indexOf(marks[i]) === -1) { missing.push(marks[i]); }
    }
    if (!missing.length) { gs.info('   all 6 markers present'); }
    else { gs.error('   MISSING: ' + missing.join('  |  ')); }

    // leftover template around the paste is the usual cause
    var creates = body.split('Class.create').length - 1;
    gs.info('   occurrences of Class.create : ' + creates + (creates > 1 ?
        '   <-- more than one. The form template was probably left in around the paste.' : ''));
    var extendsObj = body.split('Object.extendsObject').length - 1;
    if (extendsObj) {
        gs.error('   contains Object.extendsObject x' + extendsObj +
                 '   <-- that is the form template, not our file.');
    }

    var nonAscii = 0, firstBad = -1;
    for (var c = 0; c < body.length; c++) {
        if (body.charCodeAt(c) > 126) { nonAscii++; if (firstBad < 0) { firstBad = c; } }
    }
    gs.info('   non-ASCII characters : ' + nonAscii +
        (nonAscii ? ('   first at offset ' + firstBad + ': "' +
            body.substring(Math.max(0, firstBad - 30), firstBad + 30) + '"') : ''));

    gs.info('');
    gs.info('   first 90 chars: ' + body.substring(0, 90).replace(/\n/g, ' \\n '));
    gs.info('   last  90 chars: ' + body.substring(Math.max(0, body.length - 90)).replace(/\n/g, ' \\n '));

    line();
    gs.info('2. EVALUATE IT AND SEE THE REAL ERROR');
    try {
        eval(body);
        gs.info('   the script body evaluates cleanly.');
        try {
            var p = new PcmClient();
            gs.info('   and instantiates: endpoint = ' + p.endpoint);
            gs.info('');
            gs.info('   So the CODE is fine and the platform just has not picked it up yet.');
            gs.info('   Fix: open the record, add a space, save. That republishes it. If it still');
            gs.info('   fails, flush the cache with cache.do in the address bar.');
        } catch (e2) {
            gs.error('   evaluates but will not construct: ' + (e2.message || e2));
        }
    } catch (e) {
        gs.error('   THE REAL ERROR: ' + (e.message || e));
        if (e.lineNumber) { gs.error('   at line ' + e.lineNumber + ' of the Script Include'); }
        gs.error('');
        gs.error('   That is what the platform hit and swallowed. Almost always a truncated paste or');
        gs.error('   the form template left wrapped around the pasted code. Clear the Script field');
        gs.error('   completely, then paste the whole file again.');
    }
})();
