# Browser component workspace

The React/Vite workspace renders the canonical project with Rete v2. Graph
mutations go through validated project transactions. Node position changes stay
separate from the explicit construction/update order. Signals and triggers use
different sockets, styles and model records; hierarchy and links have separate
visibility filters. The inspector and tree operate on the same identities.

The library supports searching, favorites, click-to-add and drag-to-add. A
constructor dialog collects JSON-compatible arguments and chooses parent/IDs.
Inspect configuration, reparent, edit aliases, add/unlink shortcuts, change game
settings/order, and remove connections through the inspector. The Connect dialog
is an accessible alternative to socket dragging. Right-click graph nodes/edges
for local context actions. Graph controls fit, zoom and arrange nodes; minimap,
selection and drag are provided by Rete integrations.

Undo/redo uses one project history, including inspector and graph changes. Basic
copy/paste duplicates component configuration and canonical descendants, with
fresh identities and internal signal edges. Scripted copies and component trigger
rule copies require whole-Act duplication until the scripting stage; the editor
reports that limitation instead of changing script semantics.

IndexedDB saves are debounced, atomic and compare the expected stored revision.
Twenty recovery revisions are retained. On a corrupt latest row, an intact older
project is loaded and committed as a new revision while original revision records
remain available. Save failures are visible; export remains independent of a save.
Cross-tab conflicts offer an explicit recovery copy. Multiple projects can be
created, opened, renamed, duplicated or deleted with confirmation.

`.act` v1 is a ZIP with `manifest.json`, `project.json`, optional `sources/` and
`assets/`. The manifest records project ID, format version, payload sizes and
SHA-256 hashes. All authored editor state, opaque scripts, drafts and plugin
content live in project.json. Source files repeat the canonical text as a
cross-checked portable artifact. Assets must have matching bytes/hash/length.
Import checks paths, duplicate entries, version, integrity and expansion limits
before accepting data. Import always makes a new local Act ID while retaining
internal component/script identities. Archive digests check corruption, not trust.

The archive currently caps compressed input at 32 MB, expanded data at 128 MB,
entries at 2,048 and per-entry compression ratio at 500. Only ordinary single-disk
ZIPs with stored/deflate entries are supported; ZIP64/encrypted archives are
rejected. The format exporter emits files without explicit directory entries.

Dark/light themes, accent color and library favorites persist in IndexedDB.
Library, inspector and console can collapse; the side panels and console have
native resize handles. At compact widths, side panels become drawers. Help
documents the actual editing features and marks unimplemented stages clearly.

The three-step workspace introduction covers adding/reusing Stage2D, opening its
inspector, and saving/backing up an Act. Skip and completion are global browser
preferences in IndexedDB, independent of project data and undo history. They
suppress future automatic prompts across projects. The top-bar question-mark
button explicitly restarts the introduction; existing stages can be reused.
Tutorial preference changes propagate to other open tabs. If browser storage is
unavailable, a console error reports that the preference could not be persisted.

Validation includes IndexedDB recovery/CAS tests, archive round trips and
malformed archive cases, strict TypeScript checks, production builds and six
Playwright browser workflows. All six browser workflows were verified on
2026-10-20: five passed initially, and the connection workflow passed a targeted
rerun after its dropdowns received explicit text-only labels and accessible-name
assertions. Browser runs were performed from the user's terminal because the
agent sandbox cannot listen on a port or launch Chromium. Python compatibility
checks require the separately downloaded pinned Silicon checkout and otherwise
skip explicitly.
