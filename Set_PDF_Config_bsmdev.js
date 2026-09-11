/**
 * PDF config for bsmdev — run in Scripts - Background, Application = "NexAI OTC BSM" (the x_nose_nfotc_bsm
 * scope), "Execute in sandbox?" UNCHECKED. Creates pdf.model (= bsmdev's OWN Chinou model, so the document
 * call asks for a model Nomura's Chinou actually serves) + pdf.max_tokens. Idempotent.
 */
(function () {
    var model = gs.getProperty('chinou.model.id', 'anthropic-4.5-sonnet[Bedrock]');   // bsmdev's Chinou model
    function upsert(key, value, type, group, label) {
        var g = new GlideRecord('x_nose_nfotc_bsm_config');
        g.addQuery('key', key); g.query();
        if (g.next()) {
            g.setValue('value', value); g.update();
            gs.info('[PDF-CFG] updated ' + key + ' = ' + value);
        } else {
            g.initialize();
            g.setValue('key', key); g.setValue('value', value); g.setValue('type', type);
            g.setValue('config_group', group); g.setValue('label', label);
            var id = g.insert();
            gs.info('[PDF-CFG] inserted ' + key + ' = ' + value + (id ? ' (' + id + ')' : '  *** INSERT FAILED ***'));
        }
    }
    upsert('pdf.model', model, 'string', 'extraction', 'PDF extraction model (Chinou document call)');
    upsert('pdf.max_tokens', '8192', 'number', 'extraction', 'PDF extraction max output tokens');

    // read back through the app's own reader to confirm
    var chk = new x_nose_nfotc_bsm.NfotcConfig().getString('pdf.model', '', 'MISSING');
    gs.info('[PDF-CFG] verify: pdf.model reads back as "' + chk + '"  (bsmdev Chinou model = ' + model + ')');
})();
