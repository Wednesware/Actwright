# Browser Python on GitHub Pages

Production builds use Pyodide 0.28.3 instead of calling `/api`. Development keeps
the existing loopback companion unless `VITE_ACTWRIGHT_BROWSER_RUNTIME=1` is set.
`ACTWRIGHT_BASE` controls the site base, including worker and service worker URLs.
The custom domain uses `/`; repository-path hosting can use `/Actwright/`.

`prepare_browser_runtime.py` verifies Silicon against the same pinned Git blobs
as native execution, then packages those sources and the existing AST converter
into `python-runtime.json`. The deploy workflow fetches the verified checkout
before building. Generated bundles stay out of Git. Pyodide itself loads lazily
from its versioned jsDelivr URL; no package installer runs user-requested imports. A browser adapter exposes
Nitrogen’s `require("si")` / `require("silicon")` interface for the verified bundle;
other publications or explicit releases require the native companion.

Script checks use a dedicated worker and the existing non-executing analyzer.
Each Run creates another worker with fresh Python modules and game state.
Events retain the native client's snapshot/cursor interface. The page can stop
unresponsive Python by terminating its worker; cooperative games get up to 750ms
to execute stop callbacks. Restart discards the previous worker and its state.

Python's synchronous `input()` uses synchronous XHR inside the game worker. The
small `python-input-sw.js` service worker intercepts only that input URL and holds
the response while a per-run BroadcastChannel delivers the prompt to the page.
The page replies through the service worker. This avoids requiring shared memory
or HTTP isolation headers that GitHub Pages cannot configure. App resources are
not cached or rewritten by the service worker. Prompts expire after five minutes;
Stop cancels outstanding input requests. The worker channel is unique per run,
and input replies and commands reject stale run/prompt IDs in the client.

Browser games belong to their tab and stop on navigation/reload. Acts still use
the existing IndexedDB autosave. Native filesystem, subprocess, socket and optional
native framework integrations are not supplied by browser Python. Python code
has the worker's browser permissions, including network requests; a worker is not
an isolation boundary for hostile code sharing the editor's origin.

Run `npm run build` then `npm run test:static` to test the actual static artifact
with no companion. The test covers script analysis, Silicon startup, pause/resume,
restart, terminating an infinite startup loop, sequential console input, and
cancelling a pending prompt. It also asserts that no `/api` requests occur.


Startup-only Acts now stop once their synchronous callbacks and tracked tasks
finish. Update hooks and input/host components retain the loop. The worker sends
a completion message after final logs/status have flushed; the page then disposes
the worker and prompt channel. Warning events retain their own console level.
Standalone exports load Silicon through the real Nitrogen `require("si")`; in-app
runs continue to import the verified embedded module directly.
