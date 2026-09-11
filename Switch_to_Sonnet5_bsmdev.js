/**
 * Switch bsmdev's NFOTC extraction to Sonnet 5 (confirmed served: status 200 / "SONNETS OK").
 *
 * WHERE: Scripts - Background   |   Application = Global   |   "Execute in sandbox?" UNCHECKED
 * WHAT:  sets the default model (text body + Excel) AND the PDF document model to Sonnet 5.
 *        Matches the eval instance (where 94.5% extraction accuracy was measured).
 *
 * To do PDF ONLY (leave text/Excel on 4.5), delete the chinou.model.id line below before running.
 */
(function () {
    var S5 = 'anthropic-5-sonnet[Bedrock]';

    // 1) DEFAULT model for text-body + Excel extraction (GenericFieldExtractor -> invoke() with no override)
    gs.setProperty('chinou.model.id', S5);
    gs.info('[S5-SET] chinou.model.id -> ' + gs.getProperty('chinou.model.id', '(unset)'));

    // 2) PDF document model (NfotcConfig row pdf.model)
    var g = new GlideRecord('x_nose_nfotc_bsm_config');
    g.addQuery('key', 'pdf.model'); g.query();
    if (g.next()) {
        g.setValue('value', S5); g.update();
        gs.info('[S5-SET] pdf.model -> ' + S5);
    } else {
        gs.info('[S5-SET] pdf.model row not found — run Set_PDF_Config_bsmdev.js first, then re-run this.');
    }

    gs.info('[S5-SET] done. Text/Excel + PDF now request Sonnet 5. Re-sync a mail to confirm status=200.');
})();
