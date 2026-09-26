/**
 * Is the AI Search RAG framework available on THIS instance, and on what terms?
 *
 * Three separate questions, because they fail independently and the third is the one that decides
 * whether we can use it at all:
 *
 *   1. Are the plugins active? The RAG framework rides in with Generative AI Controller or a Now Assist
 *      application. The BSM build deliberately has NO Now Assist, so its presence here cannot be
 *      assumed from what eval has.
 *   2. Do the configuration tables exist, and is anything already indexed?
 *   3. WHICH EMBEDDING MODEL would our content go through? The instance default on eval is the Now LLM
 *      Service (E5) - ServiceNow's own hosted model. Sending settlement mail text through it is exactly
 *      what the Chinou-only policy exists to prevent, so the provider list is the governance answer,
 *      not a footnote.
 *
 * READ-ONLY. Nothing is written, nothing is indexed, no content leaves the instance.
 *
 * Run: Background Scripts, Application "Global" (these are platform tables).
 */
(function () {
    function line() { gs.info('------------------------------------------------------------------'); }
    function has(t) {
        try { var g = new GlideRecord(t); return g.isValid(); } catch (e) { return false; }
    }
    function count(t, q1, v1) {
        try {
            var a = new GlideAggregate(t);
            if (q1) { a.addQuery(q1, v1); }
            a.addAggregate('COUNT');
            a.query();
            return a.next() ? parseInt(a.getAggregate('COUNT'), 10) : 0;
        } catch (e) { return -1; }
    }

    var scope = '?';
    try { scope = '' + gs.getCurrentScopeName(); } catch (e) { scope = '?'; }
    gs.info('instance : ' + gs.getProperty('instance_name', '?'));
    gs.info('scope    : ' + scope);
    if (scope !== 'rhino.global' && scope !== 'global') {
        gs.warn('Run this with Application = "Global" - these are platform tables and a scoped run may');
        gs.warn('be blocked from reading them. Continuing anyway; blank results may just be access.');
    }

    // ---------------------------------------------------------------- 1. plugins
    line();
    gs.info('1. PLUGINS');
    var WANT = ['AI Search', 'AI Search Index Sources', 'AI Search Semantic Controller',
                'AI Search Enabler', 'External Content for AI Search', 'AI Search Assist'];
    var seen = {}, anyPlugin = false;
    try {
        var p = new GlideRecord('sys_plugins');
        p.addQuery('name', 'STARTSWITH', 'AI Search');
        p.query();
        while (p.next()) {
            anyPlugin = true;
            seen['' + p.getValue('name')] = ('' + p.getValue('active'));
        }
    } catch (e1) {
        gs.error('   cannot read sys_plugins from here - run in Global.');
    }
    if (!anyPlugin) {
        gs.error('   NO "AI Search" plugins found. The RAG framework is NOT on this instance.');
    }
    for (var w = 0; w < WANT.length; w++) {
        var st = seen[WANT[w]];
        if (st === undefined) { gs.warn('   MISSING  ' + WANT[w]); }
        else if (st === 'true' || st === '1') { gs.info('   active   ' + WANT[w]); }
        else { gs.warn('   INACTIVE ' + WANT[w]); }
    }
    // what pulled it in
    var genai = false;
    try {
        var q = new GlideRecord('sys_plugins');
        q.addQuery('name', 'CONTAINS', 'Generative AI');
        q.query();
        while (q.next()) {
            genai = true;
            gs.info('   ' + (('' + q.getValue('active')) === 'true' ? 'active  ' : 'INACTIVE') +
                ' ' + q.getValue('name'));
        }
    } catch (e2) { /* reported above */ }
    if (!genai) { gs.warn('   no "Generative AI" plugin found - that is what normally brings RAG in.'); }

    // ---------------------------------------------------------------- 2. tables and what is indexed
    line();
    gs.info('2. CONFIGURATION TABLES AND EXISTING INDEXES');
    var TBL = ['ais_datasource', 'ais_semantic_index_configuration', 'ais_semantic_search_configuration',
               'ais_search_profile', 'ais_search_source', 'ais_semantic_embedding_model',
               'ais_semantic_snippetization_configuration', 'ais_rag_search_event'];
    var missing = 0;
    for (var t = 0; t < TBL.length; t++) {
        if (has(TBL[t])) { gs.info('   present  ' + TBL[t] + '   rows=' + count(TBL[t])); }
        else { missing++; gs.error('   MISSING  ' + TBL[t]); }
    }
    if (missing) {
        gs.error('   ' + missing + ' core table(s) absent - the framework is not installed here.');
    }
    if (has('ais_datasource')) {
        gs.info('');
        gs.info('   indexed sources currently defined:');
        var d = new GlideRecord('ais_datasource');
        d.orderBy('name');
        d.setLimit(40);
        d.query();
        var n = 0;
        while (d.next()) {
            n++;
            gs.info('      ' + (('' + d.getValue('active')) === 'true' ? 'on ' : 'off') +
                '  ' + ('' + d.getValue('name')).substring(0, 44) +
                '   table=' + ('' + (d.getValue('table') || '-')));
        }
        if (!n) { gs.info('      none'); }
    }

    // ---------------------------------------------------------------- 3. the embedding question
    line();
    gs.info('3. WHICH EMBEDDING MODEL WOULD OUR CONTENT GO THROUGH?');
    if (!has('ais_semantic_embedding_model')) {
        gs.error('   embedding model table absent - nothing to report.');
    } else {
        var m = new GlideRecord('ais_semantic_embedding_model');
        m.orderBy('name');
        m.query();
        while (m.next()) {
            gs.info('   ' + (('' + m.getValue('active')) === 'true' ? 'ACTIVE  ' : 'inactive') +
                '  ' + ('' + m.getValue('name')).substring(0, 52) +
                '   model_id=' + ('' + m.getValue('model_id')));
        }
    }
    if (has('ais_provider_to_default_embedding_model')) {
        gs.info('');
        gs.info('   providers, and which is the INSTANCE DEFAULT:');
        var pr = new GlideRecord('ais_provider_to_default_embedding_model');
        pr.query();
        while (pr.next()) {
            var isDef = ('' + pr.getValue('instance_default_provider')) === 'true';
            gs.info('      ' + (isDef ? '>> DEFAULT ' : '           ') +
                ('' + pr.getValue('provider')) +
                '   threshold=' + ('' + pr.getValue('instance_level_default_document_match_threshold')));
        }
    }

    line();
    gs.info('HOW TO READ THIS');
    gs.info('  No AI Search plugins, or core tables missing  -> RAG is not available here. Anything');
    gs.info('  built on eval could not be deployed, so stop before designing around it.');
    gs.info('');
    gs.info('  Present, with the default provider showing as Now LLM Service -> technically usable,');
    gs.info('  but indexing settlement mail would send that text to ServiceNow hosted embeddings.');
    gs.info('  That is a governance decision, not an engineering one, and it is the same argument');
    gs.info('  that put generation on Chinou in the first place.');
    gs.info('');
    gs.info('  Note Claude itself does not produce embeddings - ServiceNow own "AWS Claude" provider');
    gs.info('  pairs with Voyage for exactly that reason. So "RAG on Chinou" needs Chinou to expose a');
    gs.info('  separate embeddings endpoint. Worth asking before any further design.');
})();
