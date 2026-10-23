# Graph Report - opencli-plugin-fb-autopost  (2026-10-23)

## Corpus Check
- 49 files · ~23,849 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 5 file(s) not represented in the graph (top: (none) 3, .example 2)

## Summary
- 273 nodes · 625 edges · 11 communities (8 shown, 3 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 13 edges (avg confidence: 0.89)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- validate.js
- post-flow.js
- posting-worker.js
- doctor.js
- package.json
- install.sh
- Local Facebook group posting architecture
- Node 20 CI tests and whitespace checks
- package-local.js
- person-post.test.js

## God Nodes (most connected - your core abstractions)
1. `captureScreenshot()` - 20 edges
2. `vitest` - 16 edges
3. `runDoctor()` - 15 edges
4. `runSetup()` - 15 edges
5. `runWorker()` - 15 edges
6. `preparePost()` - 12 edges
7. `@jackwener/opencli` - 11 edges
8. `evaluateWithArgs()` - 11 edges
9. `normalizeJob()` - 11 edges
10. `runPost()` - 11 edges

## Surprising Connections (you probably didn't know these)
- `personPost()` --indirect_call--> `resolvePersonInputs()`  [INFERRED]
  person-post.js → src/validate.js
- `groupPost()` --indirect_call--> `verifyGroupPageLoaded()`  [INFERRED]
  group-post.js → src/composer.js
- `groupPost()` --calls--> `resolveInputs()`  [EXTRACTED]
  group-post.js → src/validate.js
- `personPost()` --indirect_call--> `verifyPersonalProfileLoaded()`  [INFERRED]
  person-post.js → src/personal-profile.js
- `personPost()` --calls--> `runPost()`  [EXTRACTED]
  person-post.js → src/post-flow.js

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Messaging controls local worker and browser execution** — readme_hermes, docs_local_worker_job_contract, readme_opencli [EXTRACTED 1.00]

## Communities (11 total, 3 thin omitted)

### Community 0 - "validate.js"
Cohesion: 0.22
Nodes (12): postTabs(), normalizeInvocation(), ALLOWED_IMAGE_EXTENSIONS, coerceBoolean(), MAX_IMAGES, parseGroupUrl(), readArg(), resolveCaption() (+4 more)

### Community 1 - "post-flow.js"
Cohesion: 0.13
Nodes (28): groupPost(), __test__, captureScreenshot(), ACTIVE_DIALOG_HELPERS, captionVerified(), clickPostButton(), COMPOSER_TRIGGER_LABELS, delay() (+20 more)

### Community 3 - "posting-worker.js"
Cohesion: 0.08
Nodes (35): chooseProfile(), buildOpenCliArgs(), buildRejectedResult(), buildWorkerResult(), extractLeadingJson(), JobValidationError, normalizeJob(), normalizeMode() (+27 more)

### Community 4 - "doctor.js"
Cohesion: 0.07
Nodes (41): checkArtifactsWritable(), checkBrowserBridge(), checkConfig(), checkFacebookLogin(), checkNodeVersion(), checkPackageDependencies(), checkPluginVisible(), facebookSessionNextStep() (+33 more)

### Community 5 - "package.json"
Cohesion: 0.07
Nodes (27): author, bugs, url, description, devDependencies, @jackwener/opencli, vitest, engines (+19 more)

### Community 7 - "Local Facebook group posting architecture"
Cohesion: 0.07
Nodes (23): Redacted reproducible bug reports, Non-secret setup support intake, Single-job local posting worker contract, Local readiness and manual browser recovery, Independent community extension attribution, Local Facebook group posting architecture, Hermes messaging control layer, OpenCLI plugin and Browser Bridge (+15 more)

### Community 10 - "package-local.js"
Cohesion: 0.22
Nodes (11): DEFAULT_OUT_DIR, formatPackageResult(), PACKAGE_NAME, packageEntries(), packageLocal(), parseArgs(), readValue(), REPO_ROOT (+3 more)

### Community 11 - "person-post.test.js"
Cohesion: 0.13
Nodes (10): personPost(), @jackwener/opencli, vitest, assertSafePage(), classifySecurityState(), readPageSecurityState(), SECURITY_PATTERNS, POST_OUTCOME_SCRIPT (+2 more)

## Knowledge Gaps
- **5 isolated node(s):** `Hermes messaging control layer`, `OpenCLI plugin and Browser Bridge`, `Redacted reproducible bug reports`, `Non-secret setup support intake`, `Node 20 CI tests and whitespace checks`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 100 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vitest` connect `person-post.test.js` to `validate.js`, `post-flow.js`, `posting-worker.js`, `doctor.js`, `package.json`, `package-local.js`?**
  _High betweenness centrality (0.154) - this node is a cross-community bridge._
- **What connects `Hermes messaging control layer`, `OpenCLI plugin and Browser Bridge`, `Redacted reproducible bug reports` to the rest of the system?**
  _5 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `post-flow.js` be split into smaller, more focused modules?**
  _Cohesion score 0.1254355400696864 - nodes in this community are weakly interconnected._
- **Why does `@jackwener/opencli` connect `person-post.test.js` to `validate.js`, `post-flow.js`, `package.json`?**
  _High betweenness centrality (0.072) - this node is a cross-community bridge._
- **Should `posting-worker.js` be split into smaller, more focused modules?**
  _Cohesion score 0.08295625942684766 - nodes in this community are weakly interconnected._
- **Should `doctor.js` be split into smaller, more focused modules?**
  _Cohesion score 0.06779661016949153 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.07142857142857142 - nodes in this community are weakly interconnected._