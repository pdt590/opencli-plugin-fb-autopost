# Graph Report - opencli-plugin-fb-autopost  (2026-10-23)

## Corpus Check
- 49 files · ~22,036 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: (none) 4, .example 2)

## Summary
- 236 nodes · 539 edges · 16 communities (9 shown, 7 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 13 edges (avg confidence: 0.89)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- validate.js
- post-flow.js
- uninstall.sh script
- vitest
- doctor.js
- package.json
- install.sh script
- Local Facebook group posting architecture
- Node 20 CI tests and whitespace checks
- package-local.js
- ref_node_fs
- ref_node_fs
- Independent community extension attribution

## God Nodes (most connected - your core abstractions)
1. `captureScreenshot()` - 20 edges
2. `vitest` - 16 edges
3. `runDoctor()` - 15 edges
4. `runSetup()` - 15 edges
5. `@jackwener/opencli` - 13 edges
6. `postClone()` - 12 edges
7. `runPost()` - 12 edges
8. `preparePost()` - 12 edges
9. `evaluateWithArgs()` - 11 edges
10. `resolveInputs()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `postGroup()` --indirect_call--> `verifyGroupPageLoaded()`  [INFERRED]
  post-group.js → src/composer.js
- `postPerson()` --indirect_call--> `verifyPersonalProfileLoaded()`  [INFERRED]
  post-person.js → src/personal-profile.js
- `postPerson()` --indirect_call--> `resolvePersonInputs()`  [INFERRED]
  post-person.js → src/validate.js
- `validateGroups()` --calls--> `parseGroupUrl()`  [EXTRACTED]
  scripts/doctor.js → src/validate.js
- `runSetup()` --calls--> `ensureArtifactDir()`  [EXTRACTED]
  scripts/setup.js → src/artifacts.js

## Import Cycles
- None detected.

## Communities (16 total, 7 thin omitted)

### Community 0 - "validate.js"
Cohesion: 0.14
Nodes (20): postGroup(), __test__, postPerson(), postTabs(), @jackwener/opencli, verifyGroupPageLoaded(), isPersonalProfileUrl(), verifyPersonalProfileLoaded() (+12 more)

### Community 1 - "post-flow.js"
Cohesion: 0.14
Nodes (24): captureScreenshot(), ACTIVE_DIALOG_HELPERS, captionVerified(), clickPostButton(), COMPOSER_TRIGGER_LABELS, delay(), evaluateWithArgs(), findEnabledPostButton() (+16 more)

### Community 3 - "vitest"
Cohesion: 0.18
Nodes (6): vitest, assertSafePage(), classifySecurityState(), readPageSecurityState(), SECURITY_PATTERNS, POST_OUTCOME_SCRIPT

### Community 4 - "doctor.js"
Cohesion: 0.07
Nodes (38): checkArtifactsWritable(), checkBrowserBridge(), checkConfig(), checkFacebookLogin(), checkNodeVersion(), checkPackageDependencies(), checkPluginVisible(), facebookSessionNextStep() (+30 more)

### Community 5 - "package.json"
Cohesion: 0.10
Nodes (20): author, description, devDependencies, @jackwener/opencli, vitest, engines, node, keywords (+12 more)

### Community 7 - "Local Facebook group posting architecture"
Cohesion: 0.11
Nodes (14): Redacted reproducible bug reports, Non-secret setup support intake, Local readiness and manual browser recovery, Local Facebook group posting architecture, Hermes messaging control layer, OpenCLI plugin and Browser Bridge, Credential and live-post security boundaries, Clone image posts (+6 more)

### Community 10 - "package-local.js"
Cohesion: 0.20
Nodes (11): DEFAULT_OUT_DIR, formatPackageResult(), PACKAGE_NAME, packageEntries(), packageLocal(), parseArgs(), readValue(), REPO_ROOT (+3 more)

### Community 11 - "ref_node_fs"
Cohesion: 0.21
Nodes (15): completeFacebookAlbum(), fetchMedia(), isVideoUrl(), parseSource(), postClone(), readDocument(), readInstagram(), savePost() (+7 more)

### Community 13 - "ref_node_fs"
Cohesion: 0.38
Nodes (4): patchOpencli(), artifactPath(), ensureArtifactDir(), timestampForPath()

## Knowledge Gaps
- **7 isolated node(s):** `Independent community extension attribution`, `OpenCLI Apache 2.0 and Hermes MIT notices`, `Hermes messaging control layer`, `OpenCLI plugin and Browser Bridge`, `Redacted reproducible bug reports` (+2 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 85 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vitest` connect `vitest` to `validate.js`, `post-flow.js`, `doctor.js`, `package.json`, `package-local.js`, `ref_node_fs`, `ref_node_fs`?**
  _High betweenness centrality (0.136) - this node is a cross-community bridge._
- **What connects `Independent community extension attribution`, `OpenCLI Apache 2.0 and Hermes MIT notices`, `Hermes messaging control layer` to the rest of the system?**
  _7 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `validate.js` be split into smaller, more focused modules?**
  _Cohesion score 0.1411764705882353 - nodes in this community are weakly interconnected._
- **Why does `@jackwener/opencli` connect `validate.js` to `vitest`, `post-flow.js`, `ref_node_fs`, `package.json`?**
  _High betweenness centrality (0.086) - this node is a cross-community bridge._
- **Should `post-flow.js` be split into smaller, more focused modules?**
  _Cohesion score 0.13963963963963963 - nodes in this community are weakly interconnected._
- **Should `doctor.js` be split into smaller, more focused modules?**
  _Cohesion score 0.07164404223227752 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.09523809523809523 - nodes in this community are weakly interconnected._