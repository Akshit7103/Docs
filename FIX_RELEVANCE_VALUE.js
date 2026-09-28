/**
 * SHOW THE VERDICT ON RELEVANCE DECISION ROWS  -  run ONCE in Background Scripts.
 *
 * RUN WITH: Application = Global    (sp_widget refuses writes from a scoped app)
 *
 * Defect: every "Relevance Decision" row shows "-" in the AI Value column.
 * Cause:   the column renders ai_value. classification.decided does not populate ai_value - it
 *          records the verdict in ai_label ("relevant" / "irrelevant") and the reason inside the
 *          ai_attributes blob ({"label":"irrelevant","reason":"reply_forward"}). Both are stored;
 *          neither was being read for that column.
 * Fix:     when ai_value is empty, fall back to ai_label, and append the reason when present, so
 *          the row reads  irrelevant (reply_forward).
 *
 * Applies to any event with an empty ai_value, so it is not classification-specific - any future
 * event that records a label rather than a value will render too.
 *
 * Idempotent. ES5.
 */
(function () {
    var WIDGET_ID = 'nexaitest-audit';
    var log = [];
    function p(s) { log.push(s); }

    p('=================================================================');
    p('FIX RELEVANCE VALUE   running in: ' + gs.getCurrentScopeName());
    p('=================================================================');

    var here = gs.getCurrentScopeName();
    if (here !== 'global' && here !== 'rhino.global') {
        p('!! WRONG SCOPE - set the Application picker to Global and run again. Nothing changed.');
        gs.info('\n' + log.join('\n'));
        return;
    }

    var w = new GlideRecord('sp_widget');
    w.addQuery('id', WIDGET_ID);
    w.setLimit(1);
    w.query();
    if (!w.next()) {
        p('!! widget ' + WIDGET_ID + ' not found. Nothing changed.');
        gs.info('\n' + log.join('\n'));
        return;
    }

    var src = w.getValue('script') || '';
    var ANCHOR = "var aiValue = gr.getValue('ai_value'), confidence = '', confLevel = '';";

    if (src.indexOf('_labelFallback') > -1) {
        p('already patched, left as is');
        gs.info('\n' + log.join('\n'));
        return;
    }
    if (src.indexOf(ANCHOR) === -1) {
        p('!! anchor line not found in the widget script:');
        p('   ' + ANCHOR);
        p('   The widget may differ from the copy this patch was written against.');
        p('   Nothing changed - inspect the script by hand.');
        gs.info('\n' + log.join('\n'));
        return;
    }

    var PATCH = [
        ANCHOR,
        '',
        '        // _labelFallback: classification.decided records its verdict in ai_label and its',
        '        // reason inside ai_attributes - it never sets ai_value - so every Relevance Decision',
        '        // row rendered "-" in this column. Read the label, and append the reason when there',
        '        // is one, giving "irrelevant (reply_forward)".',
        '        if (!aiValue) {',
        '            var _labelFallback = gr.getValue(\'ai_label\') || \'\';',
        '            if (_labelFallback) {',
        '                var _rawAttrs = gr.getValue(\'ai_attributes\') || \'\';',
        '                var _reasonM = _rawAttrs.match(/"reason"\\s*:\\s*"([^"]+)"/);',
        '                aiValue = _labelFallback + (_reasonM ? \' (\' + _reasonM[1] + \')\' : \'\');',
        '            }',
        '        }'
    ].join('\n');

    src = src.replace(ANCHOR, PATCH);
    w.setValue('script', src);
    w.update();

    p('PATCHED ' + WIDGET_ID + '  ' + w.getUniqueValue());
    p('');
    p('Relevance Decision rows will now read, for example:');
    p('   AI VALUE : irrelevant (reply_forward)');
    p('   AI VALUE : relevant (rule_match)');
    p('');
    p('Hard-refresh the page:');
    p('   https://' + gs.getProperty('instance_name') + '.service-now.com/nexai?id=nexaitest_nfotc_audit');
    p('=================================================================');
    gs.info('\n' + log.join('\n'));
})();
