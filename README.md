# Actwright

A local-first visual development environment for the Wednesware Silicon Python
game framework. The [approved architecture](ACTWRIGHT_ARCHITECTURE.md) and
[specification](ACTWRIGHT_INFO.md) describe the full application.

## Run the browser workspace

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:5173**. The component workspace includes the Rete graph,
searchable library and favorites, component tree, inspector, signals and triggers,
undo/redo, local Acts, IndexedDB autosave/recovery, and portable `.act` saves and runnable `.py` export.
The project menu provides an editable First Act example.

The introductory workspace tutorial offers **Skip tutorial** below the Stage2D
prompt. Skipping or finishing it is remembered in this browser across reloads and
new Acts. The question-mark **Start tutorial** button in the top bar replays it
without resetting your project; general workspace help remains in the footer.

Editing and saving need no Python backend or cloud account. Browser storage is
specific to an origin/device and can be cleared; download `.act` backups regularly.
Conflicting edits from another tab show a warning with recovery download and
save-as-new-Act actions instead of silently overwriting the saved project.

## Write scripts and run a game

Start the Python companion in another terminal:

```sh
npm run runtime
```

It uses Python's standard library and the verified Silicon checkout. It detects
`../si` in this workspace; otherwise it uses `SILICON_SOURCE` or
`/tmp/actwright-silicon`. The companion binds only to `127.0.0.1:8765`; Vite proxies
its API, so open the editor at **http://127.0.0.1:5173** as before. Restart an
already running Vite server after updating its configuration.

1. Click the large **+ Add Script** button in the library (or drag it onto the graph).
2. Name the Script and choose **Game → Game starts** in its creation dialog.
3. Click **Edit Script** on its graph card to open the **Scripts** tab. The initial Blockly block prints `hello`.
4. Press **Run** and read `hello` in the console.
5. Use Pause/Resume, Stop, or Restart in the top bar. Restart applies current edits
   to a fresh game. InputMap components accept commands through the console form.

Scripts can handle game start/pause/resume/stop and component triggers. Script nodes
connect to trigger sockets just like components. The **Scripts** tab provides a
focused list of script editors. Blockly and Monaco live only in this tab. Collapse
an editor to unload it; Save, Check, Delete and Expand stay available. Graph cards
keep their inputs, outputs, editable descriptions and **Edit Script** button. Save stores the script in
the current Act; **Save .act** downloads the entire editable project.

Drag the grip in a graph node’s bottom-right corner to resize it. The grip also
supports Arrow keys (10 pixels) and Shift + Arrow keys (40 pixels). Node sizes and
script descriptions are saved in `.act` files and support Undo/Redo. Socket centers
remain on the card edges as its size changes.

Controls have subtle hover feedback and soft synthesized click sounds. **Settings →
UI sounds** provides a mute checkbox, volume slider and **Test sound** button.
These preferences are saved on this device. Animations honor the operating system’s
reduced-motion preference.

Both block levels have the same categorized Python vocabulary: values, variables,
assignment, operators, conditions, loops, Functions & Classes, calls/attributes,
collections/slicing/comprehensions, imports, and exception/resource handling.
Level 1 describes actions ("Show a message:"); Level 2 uses Python notation
(`print (…)`). They share canonical block types and behavior. Level 3 is Monaco
Python with highlighting, completion, find/folding and syntax diagnostics.
Switching back to blocks uses the companion's non-executing AST converter.
Unsupported syntax stays in existing preserved-source blocks, which are never
listed in the Level 1 or 2 toolbox. Blockly follows the active light/dark theme.

The companion checks syntax without executing code; only Run executes the game.
The **Components** Blockly category includes **New instance of … with ID … in parent**
and **New singleton … in parent** in levels 1 and 2. Both return a reference you can
store in a variable, connect to another block, or use to access component methods.
Leave parent empty to use `game`. Connect an **Arguments** block for constructor
arguments, including named arguments. The same helpers are available in level 3:

```python
board = new_instance("silicon.Stage2D", "board", game, 6, 4)
player = new_instance("silicon.Entity", "player", board, name="Nova")
score = new_singleton("silicon.Score", player)
player.spawn()
board.ins.place("player", 2, 1)
```

IDs and singletons must be unique within their parent for that exact component type.
Creating an Entity leaves spawning and placement to your script.

`game` is the current game and `self` is the game-bound script owner. `parent`
is the triggering component’s game-bound canonical parent (or the owner’s parent
when the event provides none); for game callbacks it is `game`. `component` is
the triggering component, and `components` maps stable IDs to Python instances. Import any additional Python names explicitly. Restart `npm run runtime`
after updating the companion so new conversion capabilities are loaded.

**Values → Value** accepts a complete Python expression, such as
`self.person.name.upper()`, anywhere a value fits. It is available in both block
levels. **Components** lists `game`, `parent`, and every graph component with its
icon and type. Component reference blocks retain identity when display names or
tree aliases change.

**Messages → Send output** (Level 1) / **emit** (Level 2) creates a named signal
socket on the Script card. Connect it to a component input by dragging a wire or
using **Connect**. Its argument can be one value or an **Arguments** block with
several values, named arguments, or unpacking. In Python use, for example,
`emit("points", 5)` or `emit("place", "player", 2, y=4)`. Names must be constant
strings beginning with a letter and containing only letters, digits and
underscores. Python edits update sockets after **Check Python**; block edits update
them immediately. Renaming or removing an output removes its old signal wires;
Undo restores both. Graph cards keep their sockets while their editor is closed.

Click a signal, trigger, or shortcut link to select it, then use **Delete connection**
or press **Delete/Backspace**. Hovering highlights its wider, zoom-independent hit
area; right-click → **Remove relationship** also works. **Escape** clears selection.
Canonical hierarchy connections offer **Edit parent** in the Inspector.
Removing a shortcut also removes trigger endpoints whose selectors depended on
it; the component itself is preserved. Undo restores the relationships.

**Messages → Ask for text** calls Python’s standard `input(prompt)`. During Run,
Actwright shows the prompt and a **Submit** field in its Console, including during
game startup. The game waits for the reply; Stop and Restart remain available.
Prompts survive a browser reload. Exported `.py` files read from the normal terminal.

Import [`examples/interactive-player-board.act`](examples/interactive-player-board.act)
and press Run to try it: the initial board prints, then asks for a new entity ID
and name. The example creates and spawns that entity at the player’s position and
prints the board again using the new name’s initial. Invalid or reserved IDs and
blank names are requested again. Entities created this way belong to the running
game; restarting begins with the saved project’s initial entities.

Edits are saved automatically, including invalid and offline Python drafts. Run
and Python export check pending drafts and refuse invalid code. A game keeps using
the code it started with until restarted. Opening another Act stops the previous
run. Execution uses local Python with your user permissions; run Acts you trust.

**Save .act** downloads the complete editable project, scripts/drafts, graph,
block layouts and assets. **Export .py** downloads runnable Silicon Python; it
uses the same generator as Run. Run a downloaded export using the pinned Silicon
checkout on your Python path, for example:

```sh
PYTHONPATH=../si python3 My_Act.py
```

Press Ctrl+C to end the standalone game loop. The export defines `build_game()`
for reuse and regenerates ordered trigger connections on every fresh game.
Additional source modules, binary assets and unsupported imported script roles
are retained in `.act`; single-file Python export reports these unsupported cases
instead of silently dropping them. A dedicated custom class builder, rendered grid previews, source import UI and
full game-building lessons remain later work. Python forms without a supported
block representation, such as match/case, retain their original source.

```sh
npm run build
npm run preview
```

## Development

Requires Node 22.18+ (native TypeScript stripping) and Python 3.12+.

```sh
npm ci
npm run typecheck
npm test
npm run test:python
npx playwright install chromium
npm run test:browser
node scripts/inspect.ts catalog
node scripts/inspect.ts catalog movement
node scripts/inspect.ts check examples/first-act.project.json
```

The TypeScript tests use Node's built-in test runner. Test isolation is disabled
so native TypeScript tests run directly and report each assertion group. Python
analysis uses only the standard library and never executes imported source.

Browser tests start or reuse Vite at port 5173 and the Python companion at port 8765 (a verified Silicon checkout is required). They use isolated
browser contexts and write screenshots/traces/JSON results under `test-results/`.
An existing compatible Chromium binary can be selected with `ACTWRIGHT_CHROMIUM`.

## Verified Silicon checkout

Silicon is not vendored or bundled. To execute framework compatibility tests and
regenerate metadata, download the exact pinned files to a development directory:

```sh
python3 scripts/fetch_silicon.py /tmp/actwright-silicon
SILICON_SOURCE=/tmp/actwright-silicon npm run test:python
SILICON_SOURCE=/tmp/actwright-silicon npm run check:metadata
```

Alternatively set `SILICON_SOURCE` to a matching existing checkout. Every source
file is verified against its pinned Git blob hash **before the test suite imports
the framework**. Compatibility tests skip explicitly when no checkout is present;
static analysis/core tests remain available. A mismatch fails, rather than testing
an unverified framework version. Fetching requires network access.

```sh
SILICON_SOURCE=/tmp/actwright-silicon npm run metadata
npm run schemas
```

Review generated changes when upgrading Silicon. Metadata records path, line,
revision and confidence, and preserves computed defaults as source expressions.
Additional signature inference warns by default; strict validation is opt-in.

## Files

- `frontend/src/core/`: project, graph, IR, registry and validation modules.
- `frontend/src/app/`, `editors/rete/`, `components/`: browser workspace and graph.
- `frontend/src/persistence/`, `import-export/`: IndexedDB and archive IO.
- `backend/app/analysis/`: non-executing AST component detection.
- `schemas/`: versioned project and metadata JSON Schemas.
- `examples/first-act.project.json`: nested Entity, link, real signal and trigger.
- `tests/core/`, `tests/browser/`, `backend/tests/`: core, browser and framework checks.
- `docs/phase-1.md`: compatibility limits and next-stage integration contract.

The **Modules** toolbox includes Nitrogen's `require(pub, rel=None)` in both block
levels. It returns a publication/module value and accepts an optional release;
leaving release empty uses Nitrogen's default latest release. Generated Python
adds `from nitrogen import require` when needed. Install Nitrogen in the runtime's
Python environment with `python3 -m pip install wwn` if it is not already present.
The block follows the [Nitrogen API](https://github.com/Wednesware/Nitrogen/blob/9b0188f6be8b2b1a3fc9e25e71ceef8ed957b6e2/README.md).
