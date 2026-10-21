# Framework foundation integration contract

The user approved the architecture before implementation. This stage establishes
the data and compatibility layer; feature adapters must use it rather than
reimplementing Silicon semantics.

## Boundary behavior

`parseProject(unknown)` checks the v1 structural schema before accepting a project.
`validateProject` returns semantic diagnostics without altering the input. Missing
definitions/providers remain warnings with all source/extension data preserved.
Future runnable export must refuse unresolved definitions, drafts or required
plugins; preservation export remains possible. Schema versions other than v1 are
rejected. There is no invented legacy-format migration: future migrations must
retain original data and add explicit fixtures.

`ProjectHistory.transact` clones, applies, checks, and commits a change atomically.
Use it for graph/inspector writes. History revisions increase on undo and redo.
Position changes do not change the explicit construction/update order. Direct
command helpers operate on a transaction's working copy.

`resolveSelector` resolves each call against the current graph. Matching is exact
by component type; aliases deduplicate identities; numbered lookups use insertion
order; templates allocate the first unused number. Optional lookups return empty
results, while `.component` requests enforce exactly one result. No editor helper
executes Python for lookup.

Signal edges refer to slot member names, trigger rules to selectors and ordered
callables. Framework mode only blocks known framework incompatibility; additional
payload inference is a warning. Strict mode is explicit. Custom annotations,
parameterized generics and unresolved subclasses require local runtime checks.

## Source fidelity

Script documents retain the last valid IR and current Python draft independently.
Analysis results are accepted only for an exact draft revision/source match.
Opaque regions retain their source/context/reason. Phase 1 defines the IR; it does
not claim to parse arbitrary Python into it or generate executable Python from it.

Static component analysis handles explicit imports/aliases, direct and local
component subclasses, supported decorators, signatures, State scopes/defaults,
constructors and serialization declarations. It returns exact source even after
syntax errors. Dynamic bases/decorators and inherited definitions are not executed
or guessed. Inherited metadata requires registry resolution; serialization method
presence does not prove reconstructibility. Source analysis has a 2 MB input cap;
the later companion must additionally enforce subprocess time/memory limits.

## Next stage

Build the React/Vite shell and Rete adapter on these commands, then IndexedDB
autosave and validated .act archive IO. Keep semantic data independent of Rete
objects. Add graph interaction/browser tests before marking Phase 2 complete.
React/Rete dependencies are not installed in this foundation stage; network DNS
to the npm registry was unavailable in the implementation environment. TypeScript
6.0.3 was installed and verified from the existing package cache using the lockfile.
