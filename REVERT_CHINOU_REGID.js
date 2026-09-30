/**
 * REVERT the Chinou registration ID to its previous value.
 *
 * RUN WITH: Application = Global
 *
 * Puts `chinou.reg.id` back to AIUC00337 - the value it held before the diagnostic change.
 *
 * NOTE: this does NOT fix anything. The account svcnewsd was refused against BOTH AIUC00336 and
 * AIUC00337, so the block is on the account, not on the ID. This simply restores the instance to
 * exactly the state it was in before, so nothing is left changed while the AI CoE is asked which
 * ID is correct.
 *
 * Pure ASCII. ES5.
 */
(function () {

    var PROP = 'chinou.reg.id';
    var WANT = 'AIUC00337';

    var out = [];
    function p(s) { out.push(s); }

    p('=================================================================');
    p('REVERT ' + PROP + ' -> ' + WANT);
    p('=================================================================');

    var here = '' + gs.getCurrentScopeName();
    if (here !== 'global' && here !== 'rhino.global') {
        p('!! WRONG SCOPE. Current = "' + here + '", needs Global. Nothing changed.');
        gs.info('\n' + out.join('\n'));
        return;
    }

    var gr = new GlideRecord('sys_properties');
    gr.addQuery('name', PROP);
    gr.setLimit(1);
    gr.query();

    if (!gr.next()) {
        p('!! property ' + PROP + ' does not exist. Nothing changed.');
        gs.info('\n' + out.join('\n'));
        return;
    }

    var before = '' + (gr.getValue('value') || '');
    p('');
    p('before : ' + before);

    if (before === WANT) {
        p('after  : ' + WANT + '   (already set - nothing changed)');
    } else {
        gr.setValue('value', WANT);
        gr.update();
        var check = new GlideRecord('sys_properties');
        check.addQuery('name', PROP);
        check.setLimit(1);
        check.query();
        var now = check.next() ? ('' + (check.getValue('value') || '')) : '(gone)';
        p('after  : ' + now + (now === WANT ? '   REVERTED' : '   !! UPDATE DID NOT STICK'));
    }

    p('');
    p('Reminder: neither AIUC00336 nor AIUC00337 is accepted for svcnewsd, so Chinou is still down.');
    p('This only restores the pre-diagnostic state. Ask the AI CoE which ID the account is');
    p('authorized for before changing it again.');
    p('=================================================================');
    gs.info('\n' + out.join('\n'));
})();
