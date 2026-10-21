# Actwright — Silicon-Aware Development Specification

## 1. Mission

Develop **Actwright**, a modern browser-based visual IDE for the Wednesware Silicon Python game framework.

Actwright allows users to create games, called **Acts**, by visually arranging Silicon components, configuring their relationships, connecting signals, writing scripts, testing games, and exporting Python projects.

It must support beginners and experienced developers equally.

### Core technologies

- React + TypeScript + Vite
- Rete.js v2 for component visualization and wiring
- Blockly for Level 1 and Level 2 scripting
- Monaco Editor for Level 3 Python scripting
- IndexedDB for automatic local persistence
- Python + FastAPI for optional runtime and analysis services
- Shared, versioned project model and scripting IR

Main deployment target: `actwright.wednesware.org`.

Actwright should be developed as an independent project, not embedded directly into the Silicon package.

### Source of truth

The Silicon implementation is available at:

https://github.com/Wednesware/Silicon

Read the following before implementation:

- `silicon/__init__.py`
- `silicon/syntax.py`
- `silicon/components.py`
- `silicon/integrations.py`
- `README.md`
- `TUTORIAL.md`
- `demo.py`
- `test.py`

Treat the current default-branch source code as authoritative. The examples and API descriptions below are based on the inspected repository but must be checked against the commit being integrated.

Do not implement fictional APIs.

---

## 2. Verified Silicon Architecture

Silicon is a Python 3.11+ component-based framework.

Its central types include:

- `Game`
- `Component`
- `State`
- `Entity`
- `Stage2D`
- `StageRenderer`
- `Session`
- `Event`
- `Slot`
- `Selection`
- `BoundComponent`

Its important decorators include:

- `@input`
- `@output`
- `@update`
- `@trigger`
- `@register`
- `@component`

These are not interchangeable. Their differences must be reflected in Actwright.

### 2.1 Games

A game can be created using:

```python
from silicon import Game

game = Game('MyGame', seed=7, tick_rate=60)
```

The Game implementation supports:

- `add(...)`
- `remove(...)`
- `connect(...)`
- `disconnect(...)`
- `start()`
- `pause()`
- `resume()`
- `stop()`
- `step(dt)`
- `snapshot()`
- `restore(data)`
- `save(path)`
- `load(path)`
- `batch()`

`Game.run()` should not be assumed to exist without verifying the current source. Use the actual supported lifecycle and stepping mechanisms.

### 2.2 Component insertion

Silicon supports conventional component registration:

```python
game.add(Stage2D(20, 12), id='stage')
game.add(InputMap(), id='keys')
game.add(GridMovement(), id='movement')
```

It also supports bracket-based component tree construction:

```python
game[Stage2D(5, 3)]
game[Stage2D][Entity('Player'):'player,hero']
```

The component hierarchy is important and cannot be replaced by a flat list of Rete nodes.

### 2.3 Selection syntax

Silicon provides live typed selections through `Selection`.

For example:

```python
game[Stage2D][Entity:'player']
game[Entity:'player']
```

The selection system supports ID selectors, typed paths, wildcards, optional lookups, numbered templates, and shortcut links.

Refer to `silicon/syntax.py` for exact semantics.

Actwright must preserve selector types, paths, and ID rules rather than treating selector expressions as arbitrary strings.

### 2.4 Component links

Silicon supports references to existing components elsewhere in the component tree:

```python
game[Entity:'player'] = game[Stage2D][Entity:'player']
```

This is a link to an existing component, not necessarily a new instance.

The visual editor must distinguish:

- Creating a component.
- Creating a nested component.
- Creating an alias/link to an existing component.
- Selecting an existing component.

A component may have one canonical location and additional links.

Prevent invalid cycles, following Silicon's actual rules.

### 2.5 Typed input/output connections

Silicon components declare slots using decorators:

```python
class Example(Component):
    @input
    def receive(self, value: int):
        pass

    @output
    def changed(self, value: int):
        pass
```

Connections use:

```python
game['source'].out.changed >> game['target'].ins.receive
```

For existing components:

```python
game['keys'].out.action >> game['movement'].ins.command
```

Represent this directly in Rete.

Use Python annotations and Silicon's actual connection validation rules. Do not impose stricter compatibility rules unless clearly justified and configurable.

Silicon's current validation checks certain output-return and single-input annotations, rather than performing unrestricted structural type inference.

### 2.6 Triggers

Silicon also supports `@trigger`.

For example:

```python
game.start >> [
    game[Entity:'player'].spawn,
    lambda game: print('Started!')
]
```

Unlike normal typed slots, triggers connect to callable actions.

Trigger methods are synchronous in the current implementation.

They can target other triggers or callbacks.

Actwright should have a separate trigger-connection representation.

Do not automatically convert every trigger into an ordinary input/output slot.

### 2.7 State

Silicon provides:

```python
health = State(100, scope='game')
```

Supported scopes include:

- `game`
- `shared`

Game-scoped state is tied to the active game context.

Shared state belongs to the component and can be shared across attached games.

Actwright's custom component builder must expose this distinction.

Do not assume all mutable state is per-game.

### 2.8 Updates and execution

Silicon provides `@update(rate=...)` and game stepping.

For example, `Timer`, `Velocity`, `Gravity`, and `Collision2D` perform update work during game steps.

Components update in insertion order.

The order can affect simulation behavior, especially physics.

Actwright must preserve component insertion/update order independently of visual node positions.

### 2.9 Runtime persistence

Silicon uses:

```python
game.snapshot()
game.save('save.json')
Game.load('save.json')
```

Its snapshot contains runtime information including components, configurations, state, slot connections, component tree information, timing, and RNG state.

Important: Silicon's trigger rules are not saved in the current snapshot implementation.

**Actwright's `.act` file must be distinct from Silicon's runtime snapshots.**

Actwright stores source-level authoring information; Silicon snapshots store running game state.

---

## 3. Application Structure

Actwright has five primary interface areas.

### Top toolbar

Contains:

- Actwright branding.
- Current Act name.
- Project menu.
- Autosave state.
- Undo/redo.
- Run/pause/stop/restart.
- Level 1/2/3 selector.
- Preview toggle.
- Export.
- Settings.
- Tutorial/help.

### Left component library

Searchable categories containing built-in Silicon components, imported components, custom components, and plugin packs.

Components can be dragged into the workspace.

### Main Rete workspace

The central component editing canvas.

Rete is responsible for displaying and editing relationships, not for owning the canonical project data.

### Inspector

Shows component metadata, properties, children, IDs, attachments, state, methods, triggers, and slots.

### Debug console

Displays logs, runtime errors, lifecycle events, signal activity, and validation problems.

Panels should be resizable, dockable, and collapsible.

---

## 4. Visual Component Graph

Silicon uses several relationships that must remain distinguishable.

### Relationship A — Hierarchy

Represents parent-child component relationships.

Example:

```python
game[Stage2D][Entity:'player']
```

Provide:

- Parent/child navigation.
- Component tree explorer.
- Reparenting where valid.
- Nested component inspection.
- Stable visual identities.

A component tree sidebar may complement the Rete graph.

### Relationship B — Typed signals

Represents:

```python
component.out.event >> other.ins.action
```

Use Rete sockets with meaningful types, names, and directions.

### Relationship C — Triggers

Represents:

```python
game.start >> component.some_trigger
```

Use visually distinguishable trigger connectors or a separate trigger-connection mode.

Trigger targets can include arbitrary Python callables, which may require script-backed callback nodes.

### Relationship D — Component links

Represents references to existing components in another tree location.

A link must not create an independent copy.

### Rendering design

Prefer a single graph canvas with optional connection-type visibility filters.

Component nodes should show:

- Name.
- Instance ID.
- Component type.
- Icon.
- Input/output sockets.
- Trigger connectors where appropriate.
- Script preview.
- Edit button.
- Warnings.
- Collapsible properties.

Allow node grouping, duplication, copy/paste, zoom, pan, minimap, context menus, and automatic arrangement.

Do not use node position to determine Silicon execution order.

---

## 5. Built-In Silicon Component Registry

Create a component metadata registry derived from the actual Silicon implementation.

Provide built-in entries for supported components.

### Core and game flow

- `Game`
- `Entity`
- `Timer`
- `TurnManager`
- `Effect`

### Grid-based games

- `Stage2D`
- `StageRenderer`
- `InputMap`
- `GridMovement`

### Continuous movement and physics

- `Transform2D`
- `Velocity`
- `Gravity`
- `Collision2D`
- `Lifetime`

### Gameplay systems

- `Health`
- `Inventory`
- `Score`

### Integrations

Where installed and supported:

- `App`
- `Multiplayer`
- `SoundEffects`
- `SoundPlayer`
- `ShellInput`
- `CommandOptions`

Discover and include other verified components present in Silicon.

### Component metadata

Each registry entry should contain:

- Stable component type identifier.
- Import path.
- Constructor parameters.
- Constructor defaults.
- Input slot definitions.
- Output slot definitions.
- Triggers.
- Update methods.
- State declarations and scopes.
- Configuration serialization details.
- Optional dependencies.
- Documentation.
- Visual category.

Generate metadata from static source analysis and/or explicitly maintained schemas.

Do not require unsafe execution of arbitrary user files.

Built-in metadata may be generated in a trusted development process and shipped as JSON.

---

## 6. Component Builder

Actwright must allow visually creating custom Silicon components.

A user clicks **Build Component** and enters an editor.

### Custom component properties

- Python class name.
- Display name.
- Description.
- Icon.
- Category.
- Initialization arguments.
- Configuration.
- Inputs.
- Outputs.
- Triggers.
- State variables.
- Update methods.
- Lifecycle hooks.
- Custom methods.

### Generate real Silicon classes

For example:

```python
from silicon import Component, State, input, output

class PlayerStats(Component):
    health = State(100, scope='game')

    @input
    def damage(self, amount: int):
        self.health -= amount
        self.out.changed(self.health)

    @output
    def changed(self, health: int):
        pass
```

This example must be treated as a class implementation, not merely metadata.

### Lifecycle hooks

Support Silicon hooks such as:

- `on_attach(game)`
- `on_detach(game)`
- `on_start(game)`
- `on_pause(game)`
- `on_resume(game)`
- `on_stop(game)`

Expose only verified hooks.

### Constructor handling

Silicon supports standard `__init__` initialization and the `__component__` configuration pattern.

The component builder must understand both.

Support `to_config()` and `from_config()` for serializable component configuration.

Warn when a custom component cannot be safely reconstructed from saved configuration.

### Methods and scripts

Custom component methods should be edited through Actwright's three-level script editor.

Input methods must generate `@input`.

Output declarations must generate `@output`.

Trigger methods must generate `@trigger`.

Scheduled update methods must use `@update`.

Ordinary methods must remain ordinary methods.

Do not conflate these types.

---

## 7. Three-Level Scripting

All three scripting levels are available at all times.

Every component can have associated method bodies and behavior definitions.

### Level 1 — Beginner-friendly blocks

Blockly should provide readable, natural-language instructions.

Examples:

- When the game starts...
- Spawn the player entity.
- Place player on stage at X, Y.
- Move player to X, Y.
- Wait for a timer.
- When the timer finishes...
- When the player takes damage...
- Add one point to the score.
- Execute Python code.

Each block must generate legitimate Silicon API operations.

For example, placing a player on a Stage2D generates:

```python
game['stage'].ins.place('player', 2, 3)
```

Spawning an Entity is a separate operation:

```python
game[Entity:'player'].spawn()
```

Do not treat them as identical.

Level 1 must be capable of displaying opaque Python blocks without losing code.

### Level 2 — Python-oriented blocks

Use Blockly with more direct API syntax.

Support:

- Attribute access.
- Function/method calls.
- Component selection.
- Variable references.
- Typed arguments.
- Python conditions.
- Loops.
- Callbacks.
- State access.
- Input/output invocation.
- Trigger wiring.
- Component creation.
- Component linking.
- Raw Python.

Examples:

```python
game['stage'].ins.place('player', 2, 3)
game[Stage2D][Entity:'player']
game['keys'].out.action >> game['movement'].ins.command
```

Level 2 should reflect actual Python constructs rather than inventing a separate Silicon DSL.

### Level 3 — Python source code

Use Monaco Editor.

Features:

- Syntax highlighting.
- Code folding.
- Autocomplete.
- Python diagnostics.
- Find/replace.
- Error highlighting.
- Formatting integration.
- Component-aware suggestions.
- Source navigation.

Advanced users must be able to edit actual Python.

Preserve all three levels as different representations of the same project.

---

## 8. Component Reference Builder

Provide an interactive **Build Component Reference** interface.

The user can navigate Silicon's component tree without memorizing selectors.

### Example workflow

1. Select the current game.
2. Choose a component class, e.g. `Stage2D`.
3. Choose a child component class, e.g. `Entity`.
4. Choose an ID, e.g. `player`.
5. Select an available member or method.
6. Insert the resulting expression.

Output example:

```python
game[Stage2D][Entity:'player']
```

### Supported selector capabilities

Reflect `silicon/syntax.py`, including:

- Component type.
- Nested paths.
- ID selectors.
- Multiple IDs.
- Wildcard matching.
- Optional lookups.
- Numbered ID templates.
- Linked components.

Validate singleton versus multi-component selections.

Do not assume every selector resolves to one component.

Provide a clear distinction between creating, selecting, and linking.

---

## 9. Shared Project Model and Script IR

This is a critical part of the implementation.

### Canonical project model

Store:

- Act metadata.
- Game configuration.
- Components.
- Component types.
- Canonical component tree.
- Linked component references.
- Slot connections.
- Trigger connections.
- Scripts.
- Custom classes.
- Assets.
- Plugin requirements.
- Execution configuration.
- Visual editor state.

Every component, relationship, script, and expression should have stable internal IDs.

### Script IR

Create an intermediate representation supporting:

- Python literals.
- Expressions.
- Variables.
- Assignments.
- Operators.
- Function calls.
- Attribute access.
- Conditions.
- Loops.
- Functions.
- Method definitions.
- Decorators.
- Class definitions.
- Component selectors.
- Signal connections.
- Trigger connections.
- Comments.
- Opaque Python source sections.

Store semantic structures separately from visual Blockly layouts.

### Synchronization

Level 1 ↔ IR ↔ Level 2

Level 3 Python ↔ IR

Both the graph and scripts derive from the canonical project model.

The Python backend may provide parsing services to the frontend.

### Unsupported Python

Unsupported Python must never be silently discarded.

Level 2 representation:

`Python Code` block containing original source.

Level 1 representation:

`Execute Python code` block with editable source.

Raw-code blocks are source-preservation containers, not calls to Python `exec()` by default.

### Source fidelity

Use a Python concrete syntax tree library such as LibCST where useful for preserving comments and formatting.

For unsupported constructs, preserve exact source spans.

Prevent data loss when switching editing levels.

### Invalid intermediate edits

Python may temporarily contain syntax errors while being edited.

Keep the last valid IR and the current unsaved Python text separately.

Do not overwrite invalid Python automatically.

When switching levels, notify the user if the latest source has not been synchronized and preserve the draft.

### Testing

Include round-trip tests for:

- Python → IR → Python.
- Level 1 → Level 2 → Level 1.
- Level 2 → Python → Level 2.
- Component references.
- Typed slot connections.
- Trigger connections.
- Custom classes.
- Opaque Python regions.
- Comments and formatting where supported.

---

## 10. Script Editor Window

Scripts must open in a separate editor, not directly inside Rete nodes.

### Editor modes

- Docked (default).
- Floating, resizable and draggable.
- Maximized/full workspace.

The editor should show:

- Current component.
- Current method or script.
- Level selector.
- Blockly workspace or Monaco.
- Toolbox.
- Diagnostics.
- Save status.
- Script navigation.

Allow changing the selected component while the editor remains open.

Automatically preserve previous edits.

### Performance

Only initialize a Blockly workspace when required.

Reuse the workspace when switching scripts where feasible.

Properly dispose of listeners and resources.

Do not create Blockly instances for every Rete node.

Rete nodes should contain only a compact script summary or preview.

---

## 11. Game Execution and Preview

Actwright requires a built-in game preview and console.

Because Silicon is a Python framework, execution needs a Python runtime.

### Backend responsibilities

Create a minimal backend for:

- Validating generated Python.
- Launching game sessions.
- Stopping processes.
- Capturing stdout/stderr.
- Delivering runtime errors.
- Inspecting game state.
- Stepping games.
- Providing preview data.

Use FastAPI and WebSockets where appropriate.

### Runtime lifecycle

Support:

- Start.
- Pause.
- Resume.
- Stop.
- Restart.
- Step.

Map these actions to Silicon's real lifecycle API.

### Session integration

Silicon provides `Session(factory, save_path)`.

Use it where appropriate for synchronized UI actions and lifecycle management.

The implementation supports:

```python
session.send(component, input_name, *args)
session.state(component)
session.watch(callback)
session.restart()
```

`@Session.action` provides serialized synchronous actions.

Avoid retaining stale component references across game replacements.

### Preview modes

Support different game output types.

**Grid preview**

Render `Stage2D` cells in a browser view.

Read the actual Stage2D state rather than relying exclusively on terminal escape sequences.

**Terminal preview**

Support `StageRenderer` output and text-based games.

**Browser/frontend preview**

Support Fluorine-based output where a compatible integration exists.

**Desktop integration**

Silicon's `App` is based on optional Sulfur/Fluorine desktop functionality.

A hosted browser IDE cannot assume it can directly open a desktop window.

Provide appropriate local execution or export instructions.

### Safety

Do not execute arbitrary uploaded Python in a shared web-server process.

For local development, use an explicitly trusted local backend.

Public hosted execution requires isolation and resource restrictions.

Never execute Python merely to preview component metadata.

---

## 12. Saving and Project Format

### Local-first storage

Use IndexedDB.

Support:

- Automatic debounced saves.
- Multiple Acts.
- Rename.
- Duplicate.
- Delete.
- Recovery.
- Save status.
- Recent projects.
- Version migrations.

The browser editor must remain operational without the Python backend.

### `.act` format

Define a versioned archive format.

Suggested internal structure:

```text
my-game.act
├── manifest.json
├── project.json
├── graph.json
├── components/
├── scripts/
├── assets/
└── editor/
```

The archive must preserve editable Actwright content.

Do not confuse the `.act` project with Silicon's runtime `Game.save()` format.

### Runtime saves

Optionally allow generating or importing compatible Silicon runtime save data.

Treat runtime data separately from source projects.

### Cloud synchronization

Design interfaces for future optional cloud synchronization.

Do not require login for local editing.

Avoid making cloud infrastructure a prerequisite for the initial release.

---

## 13. Export

Support the following formats.

### `.act`

Editable project containing the complete Actwright model.

### `.py`

Export executable Python source using valid Silicon APIs.

When possible, allow a single-file export.

For projects that require multiple modules/assets, disclose any limitations rather than producing invalid single-file output.

### `.zip`

Export a complete Python source project containing:

- Entrypoint.
- Generated component modules.
- Script modules.
- Assets.
- Dependency declarations.
- README.
- Supporting configuration.

### Code generation rules

Preserve:

- Component creation.
- Tree insertion order.
- Component links.
- Named IDs.
- Signals.
- Triggers.
- Scripts.
- State declarations.
- Update methods.
- Configuration.
- Required imports.

Trigger rules need to be regenerated on project startup because Silicon snapshots do not preserve those rules.

---

## 14. Importing Python Components

Allow drag-and-drop `.py` imports.

Provide an Import button as an alternative.

### Static detection

Parse Python code and detect:

- `Component` subclasses.
- `@component` functions.
- `@input`.
- `@output`.
- `@trigger`.
- `@update`.
- `State(...)`.
- `__component__`.
- `__init__`.
- `to_config()`.
- `from_config()`.
- Lifecycle hooks.
- `@register`.

Resolve import aliases where practical.

### Import preview

Show:

- Detected component names.
- Inputs.
- Outputs.
- Triggers.
- State variables.
- Methods.
- Constructor parameters.
- Unsupported or ambiguous metadata.

Allow users to select what to import.

### Preservation

Keep the original source where conversion is incomplete.

If no components are detected, offer importing the source as a plain Python module.

Never run the imported file as part of static analysis.

---

## 15. Plugin System

Create an extensible registration API supporting:

- Custom component packs.
- Additional Blockly blocks.
- Component schemas.
- Code generators.
- Custom importers/exporters.
- Optional themes.

Plugins should declare compatible Actwright and Silicon versions.

Support missing-plugin placeholders while preserving project data.

Do not load arbitrary untrusted executable plugins without a security model.

---

## 16. Tutorial and Onboarding

Actwright must include a polished interactive tutorial.

### First-launch experience

Provide:

- Create Act.
- Open Act.
- Import Act.
- Interactive Tutorial.
- Explore Examples.

### Tutorial structure

**Lesson 1 — Your first Act**

Create a game and explain the workspace.

**Lesson 2 — Components**

Add `Stage2D` and `Entity`.

**Lesson 3 — The component tree**

Demonstrate nested components and selectors.

**Lesson 4 — Signals**

Connect a real output slot to a compatible input slot.

**Lesson 5 — Triggers**

Connect `game.start` to a component trigger.

Explain how triggers differ from signals.

**Lesson 6 — Scripting**

Create beginner-friendly behavior using Level 1.

**Lesson 7 — Advanced blocks**

View the same logic in Level 2.

**Lesson 8 — Python**

Switch to Level 3 and inspect the generated Silicon code.

**Lesson 9 — Run the Act**

Launch the preview and inspect the console.

**Lesson 10 — Save and export**

Autosave, download `.act`, and export Python.

### Tutorial UX

Include:

- Spotlight highlights.
- Small, interactive tasks.
- Tooltips.
- Progress indicator.
- Skip and replay.
- Helpful hints.
- Example projects.
- Reduced-motion support.

Tutorial progress should be saved in browser storage.

Tutorial steps must interact with real application features rather than fake demo controls.

---

## 17. Visual Style

Actwright should look modern, polished, and approachable.

Use:

- Dark and light themes.
- Custom accent colors.
- Rounded UI elements.
- Subtle transparency where practical.
- Smooth restrained animations.
- Consistent typography.
- Modern icons.
- High-quality dialogs.
- Clear selected/hover/focus states.
- Responsive panels.
- Accessible contrast.

### Rete

Custom-designed component nodes, sockets, and connections.

Visually distinguish hierarchy, slot signals, triggers, and references.

### Blockly

Customize Blockly heavily.

Start with Thrasos and a custom theme.

Customize the toolbox, block appearance, dropdowns, typography, spacing, and backgrounds.

Level 1 should appear friendly and understandable.

Level 2 should appear denser and more code-oriented.

### Monaco

Match Monaco's theme to the application.

Support developer-friendly code navigation and readable syntax highlighting.

---

## 18. Suggested Project Structure

```text
actwright/
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   ├── core/
│   │   │   ├── project/
│   │   │   ├── graph/
│   │   │   ├── ir/
│   │   │   ├── registry/
│   │   │   └── validation/
│   │   ├── editors/
│   │   │   ├── rete/
│   │   │   ├── blockly/
│   │   │   │   ├── level1/
│   │   │   │   └── level2/
│   │   │   └── monaco/
│   │   ├── components/
│   │   ├── import-export/
│   │   ├── persistence/
│   │   ├── plugins/
│   │   ├── preview/
│   │   ├── tutorial/
│   │   └── styles/
│   └── package.json
├── backend/
│   ├── app/
│   │   ├── api/
│   │   ├── silicon/
│   │   ├── analysis/
│   │   ├── execution/
│   │   └── sessions/
│   └── tests/
├── schemas/
├── examples/
├── docs/
└── README.md
```

The final layout may be adjusted for maintainability.

---

## 19. Implementation Phases

### Phase 1 — Framework integration

Study Silicon and create accurate component metadata.

Implement:

- Component registry.
- Selector representations.
- Project schema.
- Import metadata.
- Connection and type model.

### Phase 2 — Core IDE

Implement:

- React application shell.
- Rete graph.
- Component tree.
- Component library.
- Inspector.
- IndexedDB autosave.
- Basic `.act` persistence.

### Phase 3 — Component builder

Implement:

- Custom class creation.
- Input/output editing.
- Trigger editing.
- State editing.
- Method creation.
- Configuration editing.
- Lifecycle hooks.

### Phase 4 — Scripting

Implement:

- Shared IR.
- Level 1 Blockly.
- Level 2 Blockly.
- Monaco.
- Python parsing.
- Code generation.
- Source preservation.
- Component reference builder.
- Conversion tests.

### Phase 5 — Execution

Implement:

- Python backend.
- Silicon runtime adapter.
- Run/pause/stop.
- Preview.
- Console.
- Diagnostics.
- Session integration.

### Phase 6 — Import/export

Implement:

- Python component import.
- `.act` import/export.
- `.py` export.
- `.zip` export.
- Asset packaging.

### Phase 7 — Polish

Implement:

- Interactive tutorial.
- Plugin registration.
- Command palette.
- Keyboard shortcuts.
- Accessibility improvements.
- Large-project optimization.
- Responsive layout refinements.

---

## 20. Acceptance Tests

The implementation must demonstrate that a user can:

1. Create an Act.
2. Add a `Stage2D`.
3. Add a nested `Entity`.
4. Link the same Entity elsewhere in the tree.
5. Add an `InputMap` and `GridMovement`.
6. Connect `InputMap.out.action` to `GridMovement.ins.command`.
7. Create a valid trigger connection.
8. Construct a selector visually.
9. Create a custom `Component` subclass.
10. Define an `@input` method.
11. Define an `@output` method.
12. Define an `@trigger` method.
13. Define `State(..., scope='game')`.
14. Write behavior in Level 1.
15. Convert to Level 2.
16. Edit the equivalent Python in Level 3.
17. Preserve unsupported Python on returning to Level 1.
18. Autosave and recover the project.
19. Export and reimport `.act` without data loss.
20. Generate valid Silicon source.
21. Execute a working Act in a supported preview environment.
22. Import an existing Silicon component from `.py`.
23. Export a functional `.zip` project.
24. Complete the interactive tutorial.

Additional tests must cover:

- Component link identity.
- Selector resolution.
- Invalid connections.
- Trigger regeneration.
- Game versus shared state.
- Component insertion order.
- Missing plugin dependencies.
- Invalid Python drafts.
- Save migration.
- Repeated editor switching.
- Large graphs and script performance.

---

## 21. Important Non-Goals and Constraints

Do not:

- Replace Silicon's runtime with a custom JavaScript game engine.
- Assume all components operate on entities.
- Treat `Entity.spawn()` as equivalent to Stage2D placement.
- Treat triggers and typed slots as identical.
- Assume visual graph position defines execution order.
- Treat `.act` files as Silicon runtime snapshots.
- Invent methods that do not exist.
- Execute arbitrary imported Python during analysis.
- Promise that arbitrary Python can be converted into visual blocks.
- Initialize a separate Blockly workspace for every Rete node.
- Require cloud accounts for basic editing.
- Use fake sample data to conceal missing functionality.

Where an API is unavailable, explicitly identify the limitation and propose an adapter instead of silently inventing behavior.

---

## 22. Instructions for Codex

**First, verify the Silicon repository at its current commit.**

Read the implementation files and create an accurate API compatibility report.

Then prepare:

1. Final Actwright architecture.
2. Main application layout.
3. Complete component metadata model.
4. Project and graph schema.
5. Shared scripting IR design.
6. Level 1/2/3 conversion strategy.
7. Python import and export architecture.
8. Silicon runtime integration design.
9. Plugin registration interfaces.
10. Interactive tutorial implementation.
11. Repository structure.
12. Development milestones.
13. Automated testing plan.
14. Known limitations and unresolved compatibility issues.

For the first response, **do not begin implementation**.

Return the refined architecture and actionable implementation plan, with code references to Silicon.

After architecture approval, implement the system incrementally, ensuring that each completed stage is functional.

Actwright's primary goal is to make the real capabilities of Silicon accessible through a polished visual game-development environment without losing the expressive power of Python.