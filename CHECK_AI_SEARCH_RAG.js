[0:00:00.195] Script completed in scope global: script
Script execution history and recovery available here
*** Script: instance : nomurabsmdev
*** Script: scope    : rhino.global
*** Script: ------------------------------------------------------------------
*** Script: 1. PLUGINS
*** Script:    active   AI Search
*** Script:    MISSING  AI Search Index Sources
*** Script:    MISSING  AI Search Semantic Controller
*** Script:    active   AI Search Enabler
*** Script:    MISSING  External Content for AI Search
*** Script:    active   AI Search Assist
*** Script:    no "Generative AI" plugin found - that is what normally brings RAG in.
*** Script: ------------------------------------------------------------------
*** Script: 2. CONFIGURATION TABLES AND EXISTING INDEXES
*** Script:    present  ais_datasource   rows=16
*** Script:    MISSING  ais_semantic_index_configuration: no thrown error
*** Script:    MISSING  ais_semantic_search_configuration: no thrown error
*** Script:    present  ais_search_profile   rows=16
*** Script:    present  ais_search_source   rows=25
*** Script:    MISSING  ais_semantic_embedding_model: no thrown error
*** Script:    MISSING  ais_semantic_snippetization_configuration: no thrown error
*** Script:    present  ais_rag_search_event   rows=0
*** Script:    4 core table(s) absent - the framework is not installed here.: no thrown error
*** Script: 
*** Script:    indexed sources currently defined:
*** Script:       off  ACE Content Block Index   table=-
*** Script:       off  Action   table=-
*** Script:       off  Activity Definitions   table=-
*** Script:       off  Catalog Item Table   table=-
*** Script:       off  CMN Skill   table=-
*** Script:       off  Collab Chat Attachment   table=-
*** Script:       off  Collab Chat Message Table   table=-
*** Script:       off  Collab Chat Table   table=-
*** Script:       off  Diagnostic Content Source   table=-
*** Script:       off  Embedded Help Content   table=-
*** Script:       off  Flow   table=-
*** Script:       off  Industry Title with Skills   table=-
*** Script:       off  Knowledge Table   table=-
*** Script:       off  Outages   table=-
*** Script:       off  Role level   table=-
*** Script:       off  User table   table=-
*** Script: ------------------------------------------------------------------
*** Script: 3. WHICH EMBEDDING MODEL WOULD OUR CONTENT GO THROUGH?
*** Script:    embedding model table absent - nothing to report.: no thrown error
*** Script: ------------------------------------------------------------------
*** Script: HOW TO READ THIS
*** Script:   No AI Search plugins, or core tables missing  -> RAG is not available here. Anything
*** Script:   built on eval could not be deployed, so stop before designing around it.
*** Script: 
*** Script:   Present, with the default provider showing as Now LLM Service -> technically usable,
*** Script:   but indexing settlement mail would send that text to ServiceNow hosted embeddings.
*** Script:   That is a governance decision, not an engineering one, and it is the same argument
*** Script:   that put generation on Chinou in the first place.
*** Script: 
*** Script:   Note Claude itself does not produce embeddings - ServiceNow own "AWS Claude" provider
*** Script:   pairs with Voyage for exactly that reason. So "RAG on Chinou" needs Chinou to expose a
*** Script:   separate embeddings endpoint. Worth asking before any further design.
