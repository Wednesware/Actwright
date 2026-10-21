Script UI update: script graph cards are now compact connection cards with editable
descriptions and an Edit Script button. Blockly and Monaco are available only in
the Scripts tab. Graph nodes support pointer and keyboard resizing; dimensions
and descriptions persist in project extensions. Settings stores mute and volume
for synthesized UI sounds, and hover transitions respect reduced motion.

# Scripting and local execution

Scripts are real Rete nodes, created from the library's Script button or by
dragging that button onto the graph. Each graph card exposes trigger and signal
sockets on its edges, an editable description and an Edit Script button. This
button opens and selects the corresponding editor in the Scripts tab. Editors
offer Save/Check/Delete/Collapse controls; collapsing unmounts Blockly or Monaco
while preserving source, layout, level and node identity in `.act` files. Trigger
connections can also target scripts through the accessible connection dialog.

Both Blockly levels share a broad canonical vocabulary for statements and
expressions. Level 1 describes behavior, Level 2 uses Python notation. Categories
include messages, values, variables, operators, control flow, functions/classes,
collections, modules and errors/resources. Palette contents are identical across
levels. Raw source is never offered in either toolbox. Existing unsupported source
can still be displayed as preserved blocks and edited in Monaco at Level 3.
Themes cover the workspace, toolbox and flyout in dark and light mode.

The companion converts supported AST forms into canonical Blockly layouts without
executing imports or callbacks. Unknown statements (including enclosing nested
suites where necessary), inline comments and unsupported expressions retain source.
Conversion tests compare original and regenerated Python ASTs, and separately
check comments, numeric spelling and multiline literals. Blockly layouts are
namespaced extensions tied to source. Level switching changes labels only, and
saved level/expansion state persists across reloads. Editors are isolated from the graph, so Blockly interactions do not drag or zoom graph nodes.

Every edit creates a pending Python draft. Checking uses AST/compile only, returns
a preserved suite program and a supported Blockly layout and synchronizes only the matching draft revision/source.
Invalid or stale responses cannot replace the last valid program. Saved `.act`
files retain both drafts and checked source. Run/export validate pending drafts
and reject unresolved errors, unavailable definitions, unsupported script roles,
source modules and assets rather than losing them.

One TypeScript exporter builds both downloadable `.py` and runtime source. It
constructs components in explicit order, distinguishes game.add from typed tree
insertion, preserves links/aliases/state, wires enabled signals, and emits ordered
live trigger selectors and script callbacks before starting. Callback bodies are
compiled from their original AST, preserving comments/source and whitespace inside
multiline string literals. Tracebacks identify script IDs and original body lines.
`build_game()` creates a fresh game; the standalone asyncio main uses Silicon's
real run/step lifecycle. Exported code depends on the pinned external Silicon
installation and standard Python only.

`npm run runtime` runs a standard-library HTTP companion on loopback port 8765.
Vite dev/preview proxy /api. Host and Origin checks, a required non-simple client
header, a per-companion random mutation token, and no CORS keep unrelated websites
from invoking Python through this endpoint. Analysis never imports user code.
Run explicitly launches a separate worker with a verified pinned Silicon checkout.
It executes trusted local code with user permissions, not an adversarial sandbox.

The worker executes callbacks and advances real Silicon on an asyncio loop.
Pause/resume/stop use framework operations. InputMap commands use real typed
inputs. Stdout/stderr and status events are streamed as bounded JSON records and
polled into the editor console. One companion runs one game at a time. Stop first
requests a graceful shutdown, then kills the process group if needed, including
infinite startup code and spawned descendants. Restart reconstructs all state and
wiring; edits never hot-patch the active game. Opening another Act stops the run.
The browser may close while a command finishes; disconnects don't create server
tracebacks. Reopening the browser can reconnect to a still-running companion.

Verification includes source-generation fixtures executed against hash-verified
Silicon, lifecycle/restart, real aliases/links/signals/live selectors, exact
multiline strings, static analysis non-execution, invalid drafts/archive recovery,
worker ticks/input/errors and terminating hung code. Browser workflows cover
hello, pause/resume/restart, .act save/reopen vs .py export, syntax diagnostics and
Python/opaque-block round trips. Rendered grid previews, dedicated Silicon API block families, a custom-class
builder and additional imported script roles are future extensions.

Browser verification covers graph-to-Scripts editing, trigger wires, collapsed editor
unmounting and controls, saved identity/level, dark/light Blockly backgrounds,
stable tab widths with one active underline, unclipped socket wrappers, identical
syntax palettes and Python-to-block conversion. Test servers can use
ACTWRIGHT_PORT and ACTWRIGHT_RUNTIME_PORT to avoid interrupting existing servers.
