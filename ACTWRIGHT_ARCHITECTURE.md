# Actwright — refined architecture and implementation plan

Design baseline: the updated ACTWRIGHT_INFO.md, sections 1–22.
Status: architecture approved by the user. Foundations, the browser component workspace, and an initial scripting/execution workflow are implemented. Scripts now provide three Blockly/Monaco views for lifecycle and component-trigger callbacks, local Python execution, and `.py` export; `.act` remains the editable save format. The companion currently uses Python's standard-library HTTP server behind Vite's same-origin proxy, without requiring a Python web-framework dependency. The class builder, richer block families and rendered previews remain future extensions. See README.md and docs/phase-3.md for supported capabilities and validation.

## 1. Silicon compatibility report

Rechecked the GitHub default branch and retrieved all eight requested implementation/documentation/example files. Its current commit remains `9a8db8bd5187011e20f16ad1d0964aeb251ff1eb`. Findings below are source inspection results, not executed compatibility tests.

| Area | Verified behavior | Integration decision and source |
| --- | --- | --- |
| Game | `Game(name='Game', seed=None, *, tick_rate=60)`; components live in an insertion-ordered registry. | Game is a special project root, not a Component subclass. [Game](https://github.com/Wednesware/Silicon/blob/9a8db8bd5187011e20f16ad1d0964aeb251ff1eb/silicon/__init__.py#L270). |
| Construction | `game.add(..., id=...)` creates flat registry IDs; bracket insertion creates a canonical tree location and a generated flat registry ID. | Store construction mode and distinguish internal UUIDs, flat registry IDs, and tree aliases. [Insertion](https://github.com/Wednesware/Silicon/blob/9a8db8bd5187011e20f16ad1d0964aeb251ff1eb/silicon/__init__.py#L312). |
| Selectors | Exact type matching, singleton selection, aliases, wildcard patterns, optional lookups, numbered selectors, live paths. | Structured selector model; cardinality-aware reference builder. A type-only lookup selects singleton entries, not every instance of that type. [Selection](https://github.com/Wednesware/Silicon/blob/9a8db8bd5187011e20f16ad1d0964aeb251ff1eb/silicon/syntax.py#L54). |
| Links | Assignment links one existing component in the same game; cycles are rejected. Deleting a selected link removes the underlying object. | Represent canonical locations and links independently. Distinguish editor-only unlink from destructive component deletion. [Link/delete](https://github.com/Wednesware/Silicon/blob/9a8db8bd5187011e20f16ad1d0964aeb251ff1eb/silicon/syntax.py#L119). |
| Slots | Decorated inputs/outputs, `.ins`/`.out`, game binding, positional and keyword payloads. | Signal edges connect declared members; no implicit argument adapters. [Slots](https://github.com/Wednesware/Silicon/blob/9a8db8bd5187011e20f16ad1d0964aeb251ff1eb/silicon/__init__.py#L108). |
| Type checks | Connection-time validation compares an annotated output return with a single input parameter. Runtime checks annotated values and argument binding; it is not complete structural typing. | Framework-compatible validation by default; extra signature diagnostics are warnings. Optional strict authoring checks are clearly labeled and configurable. [Validation](https://github.com/Wednesware/Silicon/blob/9a8db8bd5187011e20f16ad1d0964aeb251ff1eb/silicon/__init__.py#L428), [annotation rules](https://github.com/Wednesware/Silicon/blob/9a8db8bd5187011e20f16ad1d0964aeb251ff1eb/silicon/__init__.py#L634). |
| Triggers | Synchronous callable dispatch; ordered targets; named game/component/parent/ancestor context; lifecycle methods are triggers. | Separate trigger rules and callback scripts. Never translate all triggers into slots. [TriggerCall](https://github.com/Wednesware/Silicon/blob/9a8db8bd5187011e20f16ad1d0964aeb251ff1eb/silicon/syntax.py#L209). |
| State and hooks | State scopes are shared and game; shared is the default. Six lifecycle hooks exist. Components can use `__component__` or normal constructors with configuration serialization. | Builder defaults explicitly to game scope, supports both initialization strategies, and emits verified decorators/hooks. [State](https://github.com/Wednesware/Silicon/blob/9a8db8bd5187011e20f16ad1d0964aeb251ff1eb/silicon/__init__.py#L80), [Component](https://github.com/Wednesware/Silicon/blob/9a8db8bd5187011e20f16ad1d0964aeb251ff1eb/silicon/__init__.py#L140). |
| Execution | `step(dt)` advances running, unpaused games. Updates follow insertion order. **Async `Game.run(fps=None)` exists** at line 541. Component initialization selects only one decorated update method. | Supervisor owns a controlled step loop; one update method in visual builder, diagnose ambiguous imported updates. [Stepping and run](https://github.com/Wednesware/Silicon/blob/9a8db8bd5187011e20f16ad1d0964aeb251ff1eb/silicon/__init__.py#L511). |
| Saving | Snapshot preserves state, tree, slot connections, timing and RNG, but omits trigger rules. Restore clears trigger rules and may invoke start before returning. | Authoring archives stay distinct; reconnect triggers before startup in any future runtime-save adapter. [Snapshot/restore](https://github.com/Wednesware/Silicon/blob/9a8db8bd5187011e20f16ad1d0964aeb251ff1eb/silicon/__init__.py#L550). |
| Entities/grid | Entity is a component container with spawn state; Stage2D stores string keys mapped to coordinates. Spawn does not place a grid object. | Model optional key-to-Entity associations explicitly; provide separate spawn/place blocks. [Stage2D/Entity](https://github.com/Wednesware/Silicon/blob/9a8db8bd5187011e20f16ad1d0964aeb251ff1eb/silicon/__init__.py#L741). |
| Preview | StageRenderer has `frame(game)` and text output; native App blocks on Sulfur. | Real grid state and terminal preview first; optional browser/desktop adapters expose capability status. [Renderer](https://github.com/Wednesware/Silicon/blob/9a8db8bd5187011e20f16ad1d0964aeb251ff1eb/silicon/__init__.py#L815), [App](https://github.com/Wednesware/Silicon/blob/9a8db8bd5187011e20f16ad1d0964aeb251ff1eb/silicon/integrations.py#L24). |
| Session | Constructor and restart create and start a fresh game. Actions serialize access; watch subscriptions return cleanup functions. | Factory wires all startup triggers before returning. Resolve components again after replacement. [Session](https://github.com/Wednesware/Silicon/blob/9a8db8bd5187011e20f16ad1d0964aeb251ff1eb/silicon/__init__.py#L1068). |

Additional inspected references: [gameplay implementations](https://github.com/Wednesware/Silicon/blob/9a8db8bd5187011e20f16ad1d0964aeb251ff1eb/silicon/components.py), [demo](https://github.com/Wednesware/Silicon/blob/9a8db8bd5187011e20f16ad1d0964aeb251ff1eb/demo.py), [compact example](https://github.com/Wednesware/Silicon/blob/9a8db8bd5187011e20f16ad1d0964aeb251ff1eb/test.py), [tutorial](https://github.com/Wednesware/Silicon/blob/9a8db8bd5187011e20f16ad1d0964aeb251ff1eb/TUTORIAL.md), [README](https://github.com/Wednesware/Silicon/blob/9a8db8bd5187011e20f16ad1d0964aeb251ff1eb/README.md).

## 2. Application architecture

Use a local-first React/TypeScript/Vite frontend and optional Python/FastAPI companion. The project core owns authored data. Rete, Blockly and Monaco are adapters over the same project and script documents. Runtime observations are separate, revision-tagged data.

Commands validate and apply atomic project transactions, record undo/redo, then schedule persistence. Rete never becomes the database. Blockly layouts never become a second program format. Source generation consumes the project plus its canonical IR and source regions. A Python draft is preserved separately until synchronization succeeds.

Modules: project/schema/commands; graph adapter; component registry; IR/conversion/generation; editor hosts; static analysis; runtime transport; persistence/archive IO; plugin registration; tutorial; accessible UI shell. They communicate through typed interfaces. Only adapters depend on Rete/Blockly/Monaco/FastAPI.

## 3. Main application layout

```text
Brand | Act/project menu | save | undo/redo | runtime controls | level | export/help
--------------------------------------------------------------------------------
Library / tree      |                 Rete canvas                 | Inspector
search/categories   | components, sockets, triggers, links        | configuration
favorites/import    | relationship filters and minimap            | members/state
--------------------------------------------------------------------------------
Docked script editor: component/method navigation | levels | diagnostics
--------------------------------------------------------------------------------
Console / validation / runtime events                  | Grid / terminal preview
```

The script editor opens on demand, defaults to docked, and also supports draggable/resizable floating and maximized modes. Reuse one Blockly workspace for the active script. Lazy-load Monaco and its local workers. Persist editor positions and cursor state independently of behavior. Flush drafts before switching owners; dispose subscriptions and observers on teardown.

Use custom Rete nodes, visible type labels, category accents, separate relationship styles, visibility filters, selection, copy/paste, duplicate, collapse, context menu, arrange and minimap. Layout changes never affect execution order. Tree reparenting is an authored change applied when rebuilding a run; no unsupported live runtime reparent operation is implied.

Panels resize, collapse and move between supported docks; compact screens use drawers/tabs. CSS variables provide light/dark/accent themes, accessible focus states and reduced motion. Graph shortcuts defer to focused text inputs, Monaco and Blockly. Command palette searches components, scripts and commands.

## 4. Component metadata contract

Every registry definition has:

| Field group | Data |
| --- | --- |
| Identity | Namespaced stable type ID, definition version, provider/plugin ID, display name, Python class/export name, module/import path, registration name, base definition IDs. |
| Provenance | Silicon revision compatibility, source path/range, metadata confidence, analysis warnings, source-module reference for imported definitions. |
| Presentation | Description, category, icon, documentation, tags. |
| Construction | `__component__` or `__init__` strategy; ordered parameters with kind, annotations, literal/default-source values; configuration fields. |
| Members | Separate inputs, outputs, triggers, ordinary methods, properties, lifecycle hooks and update metadata, each with a stable member ID and signature. |
| State | Name/member ID, annotation, default value or opaque expression, scope, JSON-serialization status. |
| Serialization | to_config/from_config presence and provenance, registration version, reconstructibility status and warnings. |
| Runtime | Optional dependencies, preview capabilities, verified configuration references, insertion constraints and suggested recipes. |

Type descriptors include primitives, None, Any, unknown annotation text, component references, unions, collections and callable signatures. Keep parameter annotations distinct from return annotations. Unknown is a visible analysis result, not an invented type. Confidence can be verified/static/ambiguous; registry registration does not execute imported definitions.

Registry API: register/unregister provider definitions, lookup by stable ID, search, validate definition/instance, query members, resolve recipe suggestions and report missing providers. All IDs are unique; base cycles and invalid identifiers are rejected. Default validation mirrors Silicon; optional strict mode adds authoring restrictions. No silent numeric conversions or dependency insertion.

Initial catalog includes all requested types plus verified FrontEnd, Traits, Effects, CharacterSelection, Randomizer, StateMachine and GameControl. Game is a root descriptor. Session/Event/Slot/Selection/BoundComponent are reference/API metadata, not draggable Component subclasses. Optional App/Multiplayer/audio/shell entries remain browsable with installation/capability labels.

Ship reviewed JSON metadata derived by static analysis of the pinned source. Built-in extraction handles inheritance, register/decorator aliases, constructor patterns and defaults; corrections record their evidence. Runtime capability discovery can inspect the trusted installed framework, never arbitrary imported files.

The custom builder emits real classes, State fields, configuration reconstruction, input/output/trigger/method bodies, six verified hooks, and at most one scheduled update method. Raw Python remains available for unsupported patterns. Output declarations generate signature stubs; they do not incorrectly become ordinary return-value signals.

## 5. Project and graph schema

Version 1 uses JSON Schema, strict TypeScript discriminated unions and matching Python request models. All instance/member/script/expression/relationship IDs are stable UUIDs or namespaced IDs. Collections use ID maps plus explicit order arrays.

| Record | Principal fields |
| --- | --- |
| ActProject | format, schemaVersion, id, revision, name, timestamps, Silicon target revision, game, definitions, instances, locations, slotEdges, triggerRules, scripts, sourceModules, assets, plugins, execution, editor, extensions. |
| GameDefinition | root ID, name, seed, tickRate, ordered component IDs, startup script, validation policy. |
| ComponentInstance | ID, definition ID, display name, constructor arguments, authored State overrides, method/script references, construction mode and optional explicit flat registry ID. |
| TreeLocation | ID, parent root/instance ID, target instance ID, canonical/link kind, aliases, singleton flag, sibling order, creation template metadata. |
| Selector | ID, context root, ordered typed path segments, each with singleton or token selectors; exact/glob/numbered tokens, optional flag, expected cardinality and result kind. Creation templates are distinct from lookup tokens. |
| SlotEdge | ID, source instance/output member, target instance/input member, enabled state. |
| TriggerRule | ID, game/selector source, trigger member, ordered callable/trigger targets and script references, context bindings. |
| ScriptDocument | ID, owner and role, signature, IR version, last valid IR, synchronized source, current draft source/revision, parse status, exact source regions and editor hints. |
| SourceModule | ID, path, original bytes/text, encoding, hash, static declarations, source ranges, confidence and warnings. |
| Asset | ID, normalized relative path, media type, byte length, SHA-256 and external byte-store key. |
| PluginRequirement | provider ID/version range, required features, compatible Actwright/Silicon versions. |
| ExtensionRecord | provider/version and preserved opaque JSON or asset reference. |
| EditorState | node positions/collapse, groups, viewports, relationship filters, layout, active script/level and selection. |

Invariants: one canonical location per component, same-game links, no cycles through canonical or linked edges, unique aliases per parent/exact type, correct singleton rules, valid members/references, explicit insertion order, and JSON-compatible portable values. No graph position determines order. Copy/paste remaps references and generates new identities; links explicitly reuse an existing identity.

Normal deletion removes descendants/links and incident edges transactionally with undo. Unlink removes only the authoring location and rebuilds the next game without that shortcut; it does not generate Silicon's destructive `del selector` for a live object.

## 6. Shared scripting IR and conversion

IR v1 separates expressions, statements and definitions. Every node has ID, kind, optional source-region ID, diagnostics and extension metadata.

| Family | Node kinds |
| --- | --- |
| Expressions | Literal, Variable, Unary, Binary, Attribute, Call with ordered positional/keyword arguments, ComponentSelector, collection literals, RawExpression. |
| Statements | Assignment, ExpressionStatement, If, For, While, Return, Comment, SignalConnect, TriggerConnect, ComponentCreate, ComponentLink, RawStatement/Suite. |
| Definitions | Function, Method, Parameter, Decorator, Class, StateDeclaration, lifecycle/update/signal/trigger handlers. |
| Preservation | RawModule, source region records, unknown plugin nodes retaining provider payload. |

References use symbol/member/definition IDs. Attribute and call nodes retain Python evaluation order; selectors retain type/path/optional/multi-selection semantics. Python classes and decorators are first-class IR, with opaque fallback for unsupported definitions.

Conversion strategy:

1. Level 1 and Level 2 project the same IR into Blockly using friendly or Python-oriented labels. Blockly JSON stores layout/cache only. Edits produce IR transactions retaining stable IDs.
2. Monaco changes autosave exact draft text independently. Last valid IR remains intact during syntax errors or incomplete edits. Switching levels shows a synchronization notice and the preserved draft; never overwrites it with generated code.
3. Python analysis uses ast for semantic detection and LibCST for source-preserving transformations, in a non-executing analysis process. Parse responses carry source revision/hash so stale responses cannot replace newer work.
4. Successful parse decomposes only supported structures. Unsupported or ambiguous code becomes opaque source regions. Prefer preserving a complete suite/module when extracting smaller spans could change indentation, scope, decorators, imports or evaluation order.
5. Opaque Level 2 blocks say Python Code; Level 1 says Execute Python code. Both edit the same retained source and disclose why decomposition is unavailable. Generation inserts source in its valid context, never automatically wraps it in exec().
6. Without a companion, structured Blockly generation and Python editing remain available. Changed Python can be retained as an unsynchronized draft/opaque source, with no false claim of AST validation. The user can explicitly adopt a complete opaque document without losing the previous valid revision.
7. Mixed structured/source edits use CST-owned ranges; conflicts offer explicit keep-draft or regenerate choices with recoverable originals. Python runnable export requires resolving invalid drafts; .act preservation export remains available.

Level 1 operations map to actual inputs/triggers. Timed behavior uses Timer and callbacks/update logic rather than blocking sleep in the simulation loop. Component Reference Builder chooses context, typed path/IDs, cardinality, result kind, member and arguments; preview distinguishes selectors, raw component objects and string grid keys.

## 7. Python import and export

Import stores original bytes first. The static analyzer resolves supported import aliases, subclasses and @component functions, decorators, State, signatures, lifecycle/update hooks, initialization and serialization methods. Literal-safe defaults may be decoded; computed expressions remain source references. No import, eval, decorator invocation or annotation evaluation executes uploaded code. Preview lets the user select definitions and see ambiguities. Offline import preserves a module and defers verified detection. Invalid Python remains recoverable.

Generation is deterministic with source maps from Python ranges to project/script/IR IDs. Emit imports, definitions, a create_game() factory, authored construction order, links, slot edges, ordered trigger rules, and guarded entrypoint. The factory returns a fully wired unstarted game; Session owns startup. The standalone runner uses verified stepping or async Game.run where appropriate.

Root components with explicit IDs use game.add. Nested/type-singleton nodes use bracket syntax. For bracket-created objects retain their object variables and resolve flat IDs by identity from public game.components. Config references such as stage_id/transform_id/velocity_id use flat IDs, not tree aliases. Reviewed recipes configure these before startup; imported attach-time dependencies that cannot be resolved safely produce an explicit limitation. Parent-first construction and requested update order must be compatible or generation reports a conflict.

Single .py exports support definitions/modules only when consolidation preserves semantics and resource behavior. Otherwise explain why ZIP is needed. ZIP includes entrypoint, generated/custom/imported modules, assets, source runtime support when needed, dependency metadata and README. Wednesware installation instructions reference Nitrogen or a pinned source checkout; do not fabricate a Silicon pip package. Exported projects require no editor server.

## 8. Local persistence and .act format

Use IndexedDB via Dexie: projects, revision recovery records, source/assets, settings and tutorial progress. Debounce around 500 ms; flush before owner/project switching. Atomically commit revision and referenced blobs. Show saved only after commit. Report quota/permission failures with a portable download path. Detect concurrent-tab revisions through BroadcastChannel/revision checks and preserve conflicting copies. Do not depend on unload handlers for recovery.

`.act` v1 is a portable ZIP containing manifest.json, project.json, sources/, assets/ and editor/. The manifest declares format/schema, required features, file sizes and payload digests. Canonical semantic content is stored once; editor caches can be rebuilt. Validate version, references, normalized paths, duplicate entries, expanded size/entry count and compression limits. Hashes detect corruption, not trust. Missing plugin content remains intact in placeholders. Unsupported newer versions are preserved/downloadable and never silently migrated or overwritten.

Sequential migrations operate on copies and retain the original recovery revision. Runtime snapshots are a separate format and optional future workflow. Define a StorageRepository interface for future cloud sync; local editing requires no account.

## 9. Runtime adapter and previews

Optional local companion: Python 3.12+, FastAPI, authenticated WebSocket, supervisor and isolated-per-run child process. Core Silicon requires 3.11+, while optional Wednesware integrations need newer Python. The initial connected production UI is served by the companion on loopback; Vite proxies it in development. Hosted static editing works independently; direct HTTPS-to-local pairing requires browser-specific testing before it is advertised.

Protocol: capabilities/version/metadata digest; static analyze/validate endpoints; create/status/delete session; sequence-numbered start/pause/resume/stop/restart/step/input commands; streamed logs, errors, frames, grid snapshots, state summaries and termination events. Every event includes session/project revision, sequence and timestamp; stale events are ignored. Logs/frames use bounded queues with truncation notices.

Worker wraps a fully wired factory with Session, drives monotonic stepping through serialized transactions and resolves current-game objects after replacement. The supervisor can terminate a hung process group. Pause uses Silicon pause; explicit single-step temporarily resumes, steps once and pauses inside one transaction, clearly documented because game.step alone does nothing while paused.

Grid preview reads actual game[stage].state.cells plus stage dimensions, with explicit glyph metadata. Terminal preview reads StageRenderer.frame(game) and stdout/stderr. Input dispatch exposes registered actions, not unrestricted remote method calls. Tracebacks use generator source maps. Signal/trigger activity is instrumented by the adapter around supported generated paths, with coverage disclosed for opaque imported behavior.

Fluorine embedding requires a tested live callback bridge and isolated preview origin; static generated HTML alone cannot run Python callbacks. Native Sulfur windows are local external outputs. Carbon audio plays on the local host unless a separate browser audio adapter is implemented.

Runtime snapshot loading is optional. If added, normalize running/paused flags on a copied snapshot, restore stopped, rebuild trigger rules, then explicitly restore lifecycle state. This avoids losing startup events inside Game.load. Treat resuming state versus replaying startup side effects as an explicit policy with tests.

Companion security: loopback default, per-launch credentials, exact Host/Origin checks, authenticated WebSockets, validated archive paths and no permissive CORS. Imported Python runs only after explicit trusted Run. Child processes permit termination but are not a sandbox: code has local-user privileges. Hosted arbitrary execution stays disabled pending a separate isolation service.

## 10. Plugin interfaces

PluginManifest: ID/version, Actwright/IR/project/Silicon compatibility, component packs, blocks/categories, schemas, metadata providers, generators, IO extensions and optional themes.

RegistrationContext exposes registerComponent, registerBlock, registerMetadataProvider, registerGenerator, registerImporter, registerExporter and registerTheme with typed contracts and disposal. Block registrations declare signatures, presentation, IR mapping and validation/generation rules. All go through shared core validation; optional stricter checks use the project's chosen policy.

Initial executable plugins are trusted local/bundled registrations. Opening an Act never downloads or executes a plugin. Missing providers yield preserved placeholders and block only operations requiring their semantics. Unknown source/IR data survives subsequent .act saves.

## 11. Interactive tutorial implementation

Use a real grid sample with Stage2D, nested Entity and link, InputMap/GridMovement, Entity spawn trigger and startup placement. All tasks operate on canonical project commands and real editors.

| Lesson | Completion predicate |
| --- | --- |
| 1 Create Act | Project exists with authored name. |
| 2 Components | Stage2D and Entity instances exist. |
| 3 Tree/selectors | Entity is nested and a valid selector/reference was built; link identity is retained. |
| 4 Signals | InputMap.action is wired to GridMovement.command. |
| 5 Triggers | Game.start targets Entity.spawn. |
| 6 Friendly blocks | User adds valid placement/movement behavior through Level 1. |
| 7 API blocks | Same script is opened/edited in Level 2 without losing IDs. |
| 8 Python | Equivalent source is inspected; draft synchronization state is explained. |
| 9 Run | Real session starts and actual grid/console output arrives. Offline lesson stays resumable with setup instructions. |
| 10 Save/export | IndexedDB revision commits and .act/Python export is invoked successfully. |

Declarative steps have stable IDs, spotlight targets, hints, action predicates, prerequisites and progress. Persist chapter progress, allow skip/back/replay, support focus management and reduced motion. Tutorial reset uses a separate sample copy, preserving user Acts.

## 12. Repository and dependencies

```text
frontend/src/
  app/                    shell, commands, settings
  core/{project,graph,ir,registry,validation}/
  editors/{rete,blockly,monaco}/
  components/             accessible shared controls and builders
  import-export/ persistence/ plugins/ preview/ tutorial/ styles/
backend/app/
  api/ analysis/ silicon/ execution/ sessions/
backend/tests/
schemas/ examples/ docs/ tests/e2e/
README.md
```

Frontend dependencies: React, strict TypeScript, Vite, Zustand, Rete v2 with area/React/connection/minimap/arrange/context-menu integrations, Blockly with Thrasos/custom theme, monaco-editor, Dexie, Ajv, fflate and Lucide. Backend: FastAPI/Uvicorn/Pydantic, standard ast, LibCST and pinned Silicon compatibility target. Testing: Vitest, Testing Library, Playwright and pytest. Resolve exact compatible versions into lockfiles during foundation work; no dependency installation is part of this design deliverable.

## 13. Milestones and verification gates

| Phase | Working deliverable | Gate |
| --- | --- | --- |
| 1 Framework | Metadata snapshot, selector model, project/IR schemas and compatibility fixtures. | Execute trusted fixtures for selectors, identity, signals/triggers, State scopes, construction/update order and serialization against pinned Silicon. |
| 2 Core IDE | Shell, tree, Rete, library, inspector, projects and .act/IndexedDB. | Create/recover/rename/duplicate; graph edits/history; valid and corrupt archives; migration and storage failure tests. |
| 3 Builder | Real custom class, members, State, configuration and hooks. | Generated classes instantiate, reconstruct and dispatch correctly in Silicon. |
| 4 Scripting | Shared IR, two Blockly views, Monaco, reference builder and static conversion. | Round trips for every supported family; opaque/comment fidelity; invalid draft retention; repeated owner/level switching without lost edits. |
| 5 Runtime | Companion, real grid/text previews and console/lifecycle controls. | Run/pause/resume/step/restart/stop, startup trigger order, current-game references, traceback attribution and hung worker termination. |
| 6 IO | Static Python review and valid .py/.zip exports with assets. | Side-effecting import fixture proves analysis never executes it; clean prepared Python environment launches ZIP; export/reimport preserves editable data. |
| 7 Polish | Tutorial, plugins, palette, shortcuts, accessibility and responsive performance. | All 24 specification workflows pass in browser plus companion integration; missing-plugin preservation and keyboard/reduced-motion checks. |

Round-trip suites cover Python→IR→Python, all level transitions, selectors, call argument order, slot edges, ordered trigger targets, custom classes/decorators/hooks, source comments, unsupported suites and Unicode/encoding. Structured programs compare semantic IR and actual trusted fixture behavior; opaque programs compare exact source bytes.

Additional gates: malformed imports, runtime registry ID mapping, singleton/alias/cycle rules, stricter validation opt-in, State shared/game isolation, startup regeneration, .act schema migration and unknown features. Measure representative 100/500/1,000-node graphs and large scripts, bounded console traffic and repeated editor switching. Establish performance budgets from measured baseline hardware; no performance claims before measurement. Production build, strict type checks, core tests, backend tests and browser smoke tests run in CI.

## 14. Known limits and decisions requiring approval

1. Architecture approval was granted before implementation, satisfying ACTWRIGHT_INFO.md section 22. Subsequent milestones proceed under that approval.
2. Recommend grid and terminal preview for the first complete runtime workflow; add Fluorine/Sulfur only behind verified capability adapters.
3. Recommend framework-compatible connection validation by default, with warnings and optional strict authoring mode.
4. Python edits remain exact drafts offline; verified parsing/decomposition requires the companion. Visual levels retain last valid IR and clearly show pending source synchronization.
5. Multiple update methods, ambiguous imports/constructors and dynamic selectors may remain opaque or require explicit user resolution; do not guess semantics.
6. No public hosted Python execution or cloud account requirement. Companion-served UI is the first supported local execution connection.
7. No license file is visible in the inspected Silicon tree. Confirm redistribution terms before bundling Silicon; external installation instructions avoid assuming permission to redistribute it.
8. README references absent web_game.py/tests, and tutorial links to absent LEGACY_TUTORIAL.md. Compatibility fixtures must use the inspected implementation and available examples.
9. Initial authoring UI targets one game per Act while retaining State scope semantics and extensible IDs. Multi-game shared-object authoring is a later extension.
10. Upgrade the pinned Silicon revision only with reviewed metadata and passing compatibility fixtures; never silently follow main at runtime.
