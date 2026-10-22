# Graph Report - opencli-plugin-fb-autopost  (2026-10-22)

## Corpus Check
- 85 files · ~50,652 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 5 file(s) not represented in the graph (top: (none) 3, .example 2)

## Summary
- 520 nodes · 1360 edges · 14 communities (13 shown, 1 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 25 edges (avg confidence: 0.88)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- whatsapp-business.test.js
- Facebook Browser Automation
- draft-store.js
- Posting Job Validation
- Local Readiness Diagnostics
- Package Metadata
- message-router.js
- Operator Guides and Pilots
- server.js
- worker-client.js
- Hermes Skill Installation
- media-download.js
- Personal Facebook Posts from Telegram or WhatsApp

## God Nodes (most connected - your core abstractions)
1. `updateDraft()` - 25 edges
2. `routeNormalizedActionAsync()` - 23 edges
3. `Local Facebook group posting architecture` - 21 edges
4. `buildTextMessage()` - 20 edges
5. `captureScreenshot()` - 19 edges
6. `vitest` - 18 edges
7. `runPost()` - 18 edges
8. `parseGroupUrl()` - 16 edges
9. `runDoctor()` - 15 edges
10. `runSetup()` - 15 edges

## Surprising Connections (you probably didn't know these)
- `Exactly one conversation draft and exact POST confirmation` --semantically_similar_to--> `Dry-run gated POST and CANCEL`  [INFERRED] [semantically similar]
  hermes/skills/social-media/facebook-group-post/SKILL.md → docs/whatsapp-business-api.md
- `personPost()` --indirect_call--> `resolvePersonInputs()`  [INFERRED]
  person-post.js → src/validate.js
- `Node 20 CI tests and whitespace checks` --conceptually_related_to--> `Pilot-gated v0.1.0 release checklist`  [INFERRED]
  .github/workflows/test.yml → docs/release-checklist.md
- `groupPost()` --indirect_call--> `verifyGroupPageLoaded()`  [INFERRED]
  group-post.js → src/composer.js
- `groupPost()` --calls--> `resolveInputs()`  [EXTRACTED]
  group-post.js → src/validate.js

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Onboarding pilot and release acceptance progression** — docs_first_run_checklist_onboarding, docs_pilot_checklist_pilot, docs_release_checklist_release_gate [EXTRACTED 1.00]
- **Messaging controls local worker and browser execution** — readme_hermes, docs_local_worker_job_contract, readme_opencli [EXTRACTED 1.00]

## Communities (14 total, 1 thin omitted)

### Community 0 - "whatsapp-business.test.js"
Cohesion: 0.09
Nodes (48): updateDraft(), addGroup(), approveGroup(), createGroupStore(), findGroup(), GroupStoreError, listGroups(), normalizeAlias() (+40 more)

### Community 1 - "Facebook Browser Automation"
Cohesion: 0.09
Nodes (38): groupPost(), __test__, personPost(), @jackwener/opencli, artifactPath(), captureScreenshot(), ensureArtifactDir(), timestampForPath() (+30 more)

### Community 2 - "draft-store.js"
Cohesion: 0.19
Nodes (19): COLLECTING_STATUSES, createDraft(), createDraftStore(), DRAFT_STATUSES, DRAFTS_FILE, DraftStoreError, ensureDraftStore(), findActiveCollectingDraft() (+11 more)

### Community 3 - "Posting Job Validation"
Cohesion: 0.08
Nodes (38): vitest, buildOpenCliArgs(), buildRejectedResult(), buildWorkerResult(), JobValidationError, normalizeJob(), normalizeMode(), readJobValue() (+30 more)

### Community 4 - "Local Readiness Diagnostics"
Cohesion: 0.07
Nodes (38): checkArtifactsWritable(), checkBrowserBridge(), checkConfig(), checkFacebookLogin(), checkNodeVersion(), checkPackageDependencies(), checkPluginVisible(), facebookSessionNextStep() (+30 more)

### Community 5 - "Package Metadata"
Cohesion: 0.07
Nodes (29): author, bugs, url, description, devDependencies, @jackwener/opencli, vitest, engines (+21 more)

### Community 6 - "message-router.js"
Cohesion: 0.09
Nodes (55): findActiveDraft(), createWebhookEventStore(), DEFAULT_MAX_PROCESSED_MESSAGES, hasProcessedMessage(), PROCESSED_MESSAGES_FILE, readProcessedMessages(), recordProcessedMessage(), writeProcessedMessages() (+47 more)

### Community 7 - "Operator Guides and Pilots"
Cohesion: 0.05
Nodes (40): Redacted reproducible bug reports, Non-secret setup support intake, Node 20 CI tests and whitespace checks, First-run installation and CANCEL verification, Hermes WhatsApp QR-paired control wrapper, Human-paced Facebook composer reconnaissance, Single-job local posting worker contract, Daily chat draft review POST CANCEL flow (+32 more)

### Community 8 - "server.js"
Cohesion: 0.11
Nodes (28): DEFAULT_GRAPH_API_VERSION, MESSAGING_PRODUCT, readResponseBody(), sendWhatsAppMessage(), WhatsAppSendError, createWebhookServer(), DEFAULT_HOST, DEFAULT_PORT (+20 more)

### Community 9 - "worker-client.js"
Cohesion: 0.23
Nodes (13): extractLeadingJson(), parseOpenCliRow(), DEFAULT_SETTINGS, buildDryRunJob(), buildLiveJob(), dryRunJobPath(), liveJobPath(), parseWorkerResult() (+5 more)

### Community 10 - "Hermes Skill Installation"
Cohesion: 0.08
Nodes (28): install.sh script, formatInstallResult(), HERMES_ENV_RELATIVE_PATH, installHermesSkill(), parseArgs(), quoteEnvValue(), readValue(), REPO_ROOT (+20 more)

### Community 11 - "media-download.js"
Cohesion: 0.26
Nodes (14): ALLOWED_IMAGE_EXTENSIONS, MAX_IMAGES, assertImageCount(), buildMediaMetadataUrl(), downloadMediaBinary(), downloadWhatsAppImage(), extensionForMedia(), extensionFromUrl() (+6 more)

### Community 12 - "Personal Facebook Posts from Telegram or WhatsApp"
Cohesion: 0.20
Nodes (7): Telegram: Prepare and Confirm a Personal Post, WhatsApp: Text-Only Personal Draft and Cancellation, Examples, Intake and Routing, Personal Facebook Posts from Telegram or WhatsApp, POST and CANCEL, Prepare a Dry-Run

## Knowledge Gaps
- **10 isolated node(s):** `Hermes Facebook Group Post skill`, `Atomic JSON draft store and approved groups`, `Authenticated WhatsApp media download to local paths`, `WhatsApp Cloud API`, `Ten-image draft limit` (+5 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 144 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vitest` connect `Posting Job Validation` to `whatsapp-business.test.js`, `Facebook Browser Automation`, `draft-store.js`, `Local Readiness Diagnostics`, `Package Metadata`, `Hermes Skill Installation`?**
  _High betweenness centrality (0.110) - this node is a cross-community bridge._
- **What connects `Hermes Facebook Group Post skill`, `Atomic JSON draft store and approved groups`, `Authenticated WhatsApp media download to local paths` to the rest of the system?**
  _10 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `whatsapp-business.test.js` be split into smaller, more focused modules?**
  _Cohesion score 0.09216589861751152 - nodes in this community are weakly interconnected._
- **Why does `@jackwener/opencli` connect `Facebook Browser Automation` to `Posting Job Validation`, `Package Metadata`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **Should `Facebook Browser Automation` be split into smaller, more focused modules?**
  _Cohesion score 0.08653353814644137 - nodes in this community are weakly interconnected._
- **Should `Posting Job Validation` be split into smaller, more focused modules?**
  _Cohesion score 0.07589285714285714 - nodes in this community are weakly interconnected._
- **Should `Local Readiness Diagnostics` be split into smaller, more focused modules?**
  _Cohesion score 0.07372549019607844 - nodes in this community are weakly interconnected._