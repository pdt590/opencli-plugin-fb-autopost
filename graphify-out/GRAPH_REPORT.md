# Graph Report - opencli-plugin-fb-autopost  (2026-10-23)

## Corpus Check
- 51 files · ~22,449 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: (none) 4, .example 2)

## Summary
- 242 nodes · 554 edges · 15 communities (8 shown, 7 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 14 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- validate.js
- post-flow.js
- uninstall.sh script
- doctor.js
- package.json
- doctor.js
- Local Facebook group posting architecture
- Node 20 CI tests and whitespace checks
- package-local.js
- ref_node_fs
- Independent community extension attribution

## God Nodes (most connected - your core abstractions)
1. `captureScreenshot()` - 20 edges
2. `vitest` - 17 edges
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
- `runDoctor()` --calls--> `describeOpenCliResolution()`  [EXTRACTED]
  scripts/doctor.js → src/opencli-command.js
- `runDoctor()` --calls--> `resolveOpenCliCommand()`  [EXTRACTED]
  scripts/doctor.js → src/opencli-command.js

## Import Cycles
- None detected.

## Communities (15 total, 7 thin omitted)

### Community 0 - "validate.js"
Cohesion: 0.14
Nodes (20): postGroup(), __test__, postPerson(), postTabs(), @jackwener/opencli, verifyGroupPageLoaded(), isPersonalProfileUrl(), verifyPersonalProfileLoaded() (+12 more)

### Community 1 - "post-flow.js"
Cohesion: 0.13
Nodes (29): captureScreenshot(), assertSafePage(), classifySecurityState(), readPageSecurityState(), SECURITY_PATTERNS, ACTIVE_DIALOG_HELPERS, captionVerified(), clickPostButton() (+21 more)

### Community 4 - "doctor.js"
Cohesion: 0.09
Nodes (28): install.sh script, command, result, root, patchOpencli(), createGroups(), createSettings(), DEFAULT_GROUP_ALIAS (+20 more)

### Community 5 - "package.json"
Cohesion: 0.10
Nodes (20): author, description, devDependencies, @jackwener/opencli, vitest, engines, node, keywords (+12 more)

### Community 6 - "doctor.js"
Cohesion: 0.13
Nodes (19): checkArtifactsWritable(), checkBrowserBridge(), checkConfig(), checkFacebookLogin(), checkNodeVersion(), checkPackageDependencies(), checkPluginVisible(), facebookSessionNextStep() (+11 more)

### Community 7 - "Local Facebook group posting architecture"
Cohesion: 0.11
Nodes (14): Redacted reproducible bug reports, Non-secret setup support intake, Local readiness and manual browser recovery, Local Facebook group posting architecture, Hermes messaging control layer, OpenCLI plugin and Browser Bridge, Credential and live-post security boundaries, Clone image posts (+6 more)

### Community 10 - "package-local.js"
Cohesion: 0.20
Nodes (11): DEFAULT_OUT_DIR, formatPackageResult(), PACKAGE_NAME, packageEntries(), packageLocal(), parseArgs(), readValue(), REPO_ROOT (+3 more)

### Community 11 - "ref_node_fs"
Cohesion: 0.17
Nodes (17): vitest, completeFacebookAlbum(), fetchMedia(), isVideoUrl(), parseSource(), postClone(), readDocument(), readInstagram() (+9 more)

## Knowledge Gaps
- **7 isolated node(s):** `Independent community extension attribution`, `OpenCLI Apache 2.0 and Hermes MIT notices`, `Hermes messaging control layer`, `OpenCLI plugin and Browser Bridge`, `Redacted reproducible bug reports` (+2 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 86 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vitest` connect `ref_node_fs` to `validate.js`, `post-flow.js`, `post-group.test.js`, `doctor.js`, `package.json`, `doctor.js`, `package-local.js`?**
  _High betweenness centrality (0.141) - this node is a cross-community bridge._
- **What connects `Independent community extension attribution`, `OpenCLI Apache 2.0 and Hermes MIT notices`, `Hermes messaging control layer` to the rest of the system?**
  _7 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `validate.js` be split into smaller, more focused modules?**
  _Cohesion score 0.1411764705882353 - nodes in this community are weakly interconnected._
- **Why does `@jackwener/opencli` connect `validate.js` to `post-flow.js`, `ref_node_fs`, `package.json`?**
  _High betweenness centrality (0.084) - this node is a cross-community bridge._
- **Should `post-flow.js` be split into smaller, more focused modules?**
  _Cohesion score 0.1294871794871795 - nodes in this community are weakly interconnected._
- **Should `doctor.js` be split into smaller, more focused modules?**
  _Cohesion score 0.09191583610188261 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.09523809523809523 - nodes in this community are weakly interconnected._