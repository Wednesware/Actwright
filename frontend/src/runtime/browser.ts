import type { RuntimeEvent, RuntimeSnapshot } from './client.ts';

const base = new URL(import.meta.env?.BASE_URL ?? '/', typeof location === 'undefined' ? 'http://localhost/' : location.href);
let state: RuntimeSnapshot = { status: 'stopped', runId: null, sequence: 0, events: [], pendingInput: null };
let game: Worker | null = null;
let gameChannel: BroadcastChannel | null = null;
let channel = '';
let analysis: Promise<Worker> | null = null;
let bridge: Promise<void> | null = null;

function event(data: Omit<RuntimeEvent, 'sequence' | 'runId'> & { requestId?: string; prompt?: string }) {
  const entry = { ...data, sequence: ++state.sequence, runId: state.runId };
  state.events.push(entry);
  state.events = state.events.slice(-1000);
  if (data.kind === 'status' && data.status) {
    state.status = data.status;
    if (data.status === 'stopped' || data.status === 'error') state.pendingInput = null;
  }
  if (data.kind === 'input_request' && data.requestId) state.pendingInput = { requestId: data.requestId, prompt: data.prompt ?? '' };
  if (data.kind === 'input_resolved' && state.pendingInput?.requestId === data.requestId) state.pendingInput = null;
}

export function browserStatus(after = 0): RuntimeSnapshot {
  return { ...state, events: state.events.filter(entry => entry.sequence > after) };
}

async function inputBridge() {
  if (!bridge) bridge = (async () => {
    if (!('serviceWorker' in navigator)) throw new Error('This browser does not support the Python console. Use a current browser over HTTPS.');
    await navigator.serviceWorker.register(new URL('python-input-sw.js', base), { scope: base.pathname });
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => { navigator.serviceWorker.removeEventListener('controllerchange', changed); reject(new Error('Reload the page to enable the Python console.')); }, 10_000);
      const changed = () => { clearTimeout(timeout); resolve(); };
      navigator.serviceWorker.addEventListener('controllerchange', changed, { once: true });
      if (navigator.serviceWorker.controller) changed();
    });
  })().catch(error => { bridge = null; throw error; });
  return bridge;
}

function rpc<T>(worker: Worker, action: string, data: Record<string, unknown> = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const cleanup = () => { clearTimeout(timeout); worker.removeEventListener('message', receive); worker.removeEventListener('error', failed); };
    const receive = ({ data: reply }: MessageEvent) => {
      if (reply.id !== id) return;
      cleanup();
      if (reply.error) reject(new Error(reply.error)); else resolve(reply.result as T);
    };
    const failed = () => { cleanup(); reject(new Error('Browser Python failed to load. Check your connection and try again.')); };
    const timeout = setTimeout(() => { cleanup(); reject(new Error('Browser Python took too long to respond. Check your connection and try again.')); }, 120_000);
    worker.addEventListener('message', receive);
    worker.addEventListener('error', failed);
    worker.postMessage({ ...data, action, id });
  });
}

export async function browserAnalyze<T>(source: string): Promise<T> {
  if (!analysis) analysis = (async () => {
    const worker = new Worker(new URL('python-worker.js', base));
    try { await rpc(worker, 'init', { base: base.href }); return worker; }
    catch (error) { worker.terminate(); throw error; }
  })().catch(error => { analysis = null; throw error; });
  const worker = await analysis;
  try { return await rpc<T>(worker, 'analyze', { source }); }
  catch (error) { worker.terminate(); analysis = null; throw error; }
}

function disposeGame() {
  game?.terminate(); game = null;
  navigator.serviceWorker?.controller?.postMessage({ channel, cancel: true });
  gameChannel?.close(); gameChannel = null;
}

export async function browserRun(source: string): Promise<RuntimeSnapshot> {
  if (new TextEncoder().encode(source).length > 512_000) throw new Error('Python export exceeds 512 KB');
  disposeGame();
  state = { status: 'starting', runId: crypto.randomUUID(), sequence: state.sequence, events: [], pendingInput: null };
  event({ kind: 'status', status: 'starting' });
  event({ kind: 'log', level: 'info', message: 'Loading browser Python… The first run downloads the runtime; later runs use the browser cache.' });
  const runId = state.runId;
  try {
    await inputBridge();
    if (state.runId !== runId || state.status !== 'starting') return browserStatus();
    channel = crypto.randomUUID();
    gameChannel = new BroadcastChannel(channel);
    gameChannel.onmessage = ({ data }) => { if (state.runId === runId) event(data); };
    const worker = new Worker(new URL('python-worker.js', base));
    game = worker;
    worker.addEventListener('message', ({ data }) => { if (game !== worker) return; if (data.event) event(data.event); if (data.finished) disposeGame(); });
    worker.addEventListener('error', () => { if (game === worker) { event({ kind: 'log', level: 'error', message: 'Browser Python failed. Check your connection and restart the game.' }); event({ kind: 'status', status: 'error' }); } });
    await rpc(worker, 'init', { base: base.href, channel });
    if (game === worker) worker.postMessage({ action: 'run', source });
  } catch (error) {
    if (state.runId === runId) { disposeGame(); event({ kind: 'status', status: 'error' }); }
    throw error;
  }
  return browserStatus();
}

export async function browserCommand(action: string, runId: string, data: Record<string, string>): Promise<RuntimeSnapshot> {
  if (runId !== state.runId) throw new Error('This run has been replaced. Press Run to start a new session.');
  if (action === 'stop') {
    const worker = game;
    if (worker && !state.pendingInput && (state.status === 'running' || state.status === 'paused')) {
      // Give normal stop callbacks a chance; terminate blocked Python after 750ms.
      await new Promise<void>(resolve => {
        const done = () => { clearTimeout(timeout); worker.removeEventListener('message', receive); resolve(); };
        const receive = ({ data: reply }: MessageEvent) => { if (reply.event?.kind === 'status' && ['stopped', 'error'].includes(reply.event.status)) done(); };
        const timeout = setTimeout(done, 750);
        worker.addEventListener('message', receive);
        worker.postMessage({ action: 'stop' });
      });
    }
    if (state.runId === runId) { disposeGame(); event({ kind: 'status', status: 'stopped' }); }
    return browserStatus();
  }
  if (!game || state.status === 'error' || state.status === 'stopped') throw new Error('No game is running');
  if (action === 'input_reply') {
    if (!state.pendingInput || data.requestId !== state.pendingInput.requestId) throw new Error('This input prompt has been replaced or answered.');
    if (typeof data.text !== 'string' || data.text.length > 2000 || /[\r\n]/.test(data.text)) throw new Error('Enter one line of at most 2000 characters.');
    navigator.serviceWorker.controller?.postMessage({ channel, requestId: data.requestId, text: data.text });
    state.pendingInput = null;
  } else {
    if (state.pendingInput) throw new Error('Answer the terminal prompt before sending other game commands, or stop the game.');
    game.postMessage({ ...data, action });
  }
  return browserStatus();
}

if (typeof window !== 'undefined') window.addEventListener('pagehide', disposeGame);
