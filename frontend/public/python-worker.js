/* A fresh worker owns each game; analysis has a separate, non-executing worker. */
const indexURL = 'https://cdn.jsdelivr.net/pyodide/v0.28.3/full/';
let python;
let ready;
let channel;
const send = event => self.postMessage({ event });
self.actwright_event = value => send(JSON.parse(value));
self.actwright_input = prompt => {
  const requestId = crypto.randomUUID();
  // Synchronous XHR is confined to this worker. The service worker holds its
  // response while the page stays responsive and collects the console reply.
  const request = new XMLHttpRequest();
  const url = new URL('python-input', self.location.href);
  url.search = new URLSearchParams({ channel, requestId, prompt: prompt.slice(0, 4000) });
  request.open('GET', url, false);
  request.send();
  if (request.status !== 200) throw new Error('Console input connection lost. Restart the game.');
  const { text } = JSON.parse(request.responseText);
  if (text !== null) {
    send({ kind: 'input_resolved', requestId });
    send({ kind: 'log', level: 'info', message: (prompt + text).slice(0, 4000) });
  }
  return text;
};
async function initialize(base) {
  importScripts(`${indexURL}pyodide.js`);
  python = await loadPyodide({ indexURL });
  const response = await fetch(new URL('python-runtime.json', base));
  if (!response.ok) throw new Error('Browser Python sources could not be loaded. Reload and try again.');
  const bundle = await response.json();
  for (const [path, source] of Object.entries(bundle.sources)) {
    const full = `/home/pyodide/${path}`;
    python.FS.mkdirTree(full.slice(0, full.lastIndexOf('/')));
    python.FS.writeFile(full, source);
  }
  python.setStdout({ batched: message => send({ kind: 'log', level: 'info', message: message.slice(0, 4000) }) });
  python.setStderr({ batched: message => send({ kind: 'log', level: 'error', message: message.slice(0, 4000) }) });
  python.runPython('from actwright_analysis.scripts import analyze_script\nimport json');
}
self.onmessage = async ({ data }) => {
  try {
    if (data.action === 'init') {
      channel = data.channel;
      ready = initialize(data.base);
      await ready;
      self.postMessage({ id: data.id, result: null });
      return;
    }
    await ready;
    if (data.action === 'analyze') {
      python.globals.set('actwright_source', data.source);
      const result = JSON.parse(python.runPython('json.dumps(analyze_script(actwright_source))'));
      self.postMessage({ id: data.id, result });
    } else if (data.action === 'run') {
      python.globals.set('actwright_source', data.source);
      await python.runPythonAsync('from actwright_browser import run\nawait run(actwright_source)');
    } else {
      python.globals.set('actwright_command', JSON.stringify(data));
      python.runPython('from actwright_browser import command\ncommand(actwright_command)');
    }
  } catch (error) {
    if (data.id) self.postMessage({ id: data.id, error: String(error) });
    else {
      send({ kind: 'log', level: 'error', message: String(error) });
      send({ kind: 'status', status: 'error' });
    }
  }
};
