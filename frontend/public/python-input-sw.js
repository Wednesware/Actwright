/* Only the worker's input bridge is intercepted; app files use normal caching. */
const pending = new Map();
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname !== new URL('python-input', self.registration.scope).pathname) return;
  event.respondWith(new Promise(resolve => {
    const channel = url.searchParams.get('channel');
    const requestId = url.searchParams.get('requestId');
    const key = `${channel}/${requestId}`;
    const broadcast = new BroadcastChannel(channel);
    const finish = text => {
      clearTimeout(timer);
      pending.delete(key);
      broadcast.close();
      resolve(new Response(JSON.stringify({ text }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }));
    };
    const timer = setTimeout(() => finish(null), 300_000);
    pending.set(key, finish);
    broadcast.postMessage({ kind: 'input_request', requestId, prompt: url.searchParams.get('prompt') ?? '' });
  }));
});
self.addEventListener('message', event => {
  const { channel, requestId, text, cancel } = event.data ?? {};
  if (cancel) {
    for (const [key, finish] of pending) if (key.startsWith(`${channel}/`)) finish(null);
  } else if (typeof text === 'string' && text.length <= 2000 && !/[\r\n]/.test(text)) {
    pending.get(`${channel}/${requestId}`)?.(text);
  }
});
