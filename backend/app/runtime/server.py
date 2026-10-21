"""Loopback-only companion. Run: python3 -m backend.app.runtime.server."""
import argparse
from collections import deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import secrets
import signal
import subprocess
import sys
import tempfile
import threading
from urllib.parse import parse_qs, urlsplit

from backend.app.analysis.scripts import analyze_script

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'scripts'))
from generate_metadata import verified_sources, REVISION


class Runtime:
    def __init__(self, source):
        self.source = Path(source).resolve()
        self.lock = threading.RLock()
        self.operation = threading.Lock()
        self.events = deque(maxlen=1000)
        self.sequence = 0
        self.process = None
        self.directory = None
        self.run_id = None
        self.status = 'stopped'
        self.pending_input = None
        self.token = secrets.token_urlsafe(32)

    def event(self, data):
        with self.lock:
            self.sequence += 1
            self.events.append({**data, 'sequence': self.sequence, 'runId': self.run_id})
            if data.get('kind') == 'status': self.status = data['status']
            if data.get('kind') == 'input_request': self.pending_input = {'requestId': data['requestId'], 'prompt': data.get('prompt', '')}
            if data.get('kind') == 'input_resolved' and self.pending_input and self.pending_input['requestId'] == data.get('requestId'): self.pending_input = None
            if data.get('kind') == 'status' and self.status in ('stopped', 'error'): self.pending_input = None

    def snapshot(self, after=0):
        with self.lock:
            return {'status': self.status, 'runId': self.run_id, 'sequence': self.sequence,
                    'pendingInput': self.pending_input,
                    'events': [event for event in self.events if event['sequence'] > after]}

    def stop(self):
        with self.operation:
            self._stop()

    def _stop(self):
        process = self.process
        if process is not None:
            if process.poll() is None:
                try:
                    process.stdin.write('{"action":"stop"}\n'); process.stdin.flush()
                    process.wait(timeout=0.75)
                except (OSError, subprocess.TimeoutExpired): pass
            # Clean up descendants even if the parent already exited normally.
            try: os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError: pass
            process.wait(timeout=3)
            for stream in (process.stdin, process.stdout, process.stderr):
                if stream: stream.close()
            self.process = None
        if self.directory:
            self.directory.cleanup(); self.directory = None
        if self.status not in ('stopped', 'error'): self.event({'kind': 'status', 'status': 'stopped'})

    def start(self, source):
        compile(source, 'act.py', 'exec')
        verified_sources(self.source)
        with self.operation:
            self._stop()
            self.directory = tempfile.TemporaryDirectory(prefix='actwright-run-')
            path = Path(self.directory.name) / 'act.py'
            path.write_text(source, encoding='utf-8')
            with self.lock:
                self.run_id = secrets.token_hex(12)
                self.pending_input = None
                self.events.clear()
                self.event({'kind': 'status', 'status': 'starting'})
            env = {**os.environ, 'PYTHONPATH': os.pathsep.join([str(self.source), str(ROOT)]), 'PYTHONUNBUFFERED': '1', 'PYTHONIOENCODING': 'utf-8'}
            process = subprocess.Popen([sys.executable, '-u', '-m', 'backend.app.runtime.worker', str(path)],
                                       cwd=self.directory.name, env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                       stderr=subprocess.PIPE, text=True, encoding='utf-8', errors='replace', start_new_session=True)
            self.process = process
            run_id = self.run_id
            threading.Thread(target=self._read, args=(process, run_id), daemon=True).start()
            threading.Thread(target=self._errors, args=(process, run_id), daemon=True).start()
            return self.snapshot()

    def _read(self, process, run_id):
        try:
            for line in process.stdout:
                try:
                    event = json.loads(line)
                    if not isinstance(event, dict) or event.get('kind') not in ('status', 'log', 'input_request', 'input_resolved'): continue
                except ValueError: event = {'kind': 'log', 'level': 'info', 'message': line[:4000].rstrip()}
                with self.lock:
                    if run_id == self.run_id: self.event(event)
            process.wait()
            with self.lock:
                if run_id == self.run_id and self.status not in ('stopped', 'error'):
                    if process.returncode: self.event({'kind': 'log', 'level': 'error', 'message': f'Python process exited ({process.returncode}).'})
                    self.event({'kind': 'status', 'status': 'error' if process.returncode else 'stopped'})
        except (OSError, ValueError): pass

    def _errors(self, process, run_id):
        try:
            for line in process.stderr:
                with self.lock:
                    if run_id == self.run_id: self.event({'kind': 'log', 'level': 'error', 'message': line[:4000].rstrip()})
        except (OSError, ValueError): pass

    def command(self, action, data):
        with self.operation:
            if data.get('runId') != self.run_id: raise ValueError('This run has been replaced. Press Run to start a new session.')
            if action == 'stop': self._stop(); return self.snapshot()
            if action not in ('pause', 'resume', 'input', 'input_reply'): raise ValueError('Unknown runtime action')
            if not self.process or self.process.poll() is not None: raise ValueError('No game is running')
            if action == 'input_reply':
                with self.lock:
                    if not self.pending_input or data.get('requestId') != self.pending_input['requestId']: raise ValueError('This input prompt has been replaced or answered.')
                    if not isinstance(data.get('text'), str) or len(data['text']) > 2000 or any(c in data['text'] for c in '\r\n'): raise ValueError('Enter one line of at most 2000 characters.')
                    self.process.stdin.write(json.dumps({'action': action, 'requestId': data['requestId'], 'text': data['text']}) + '\n'); self.process.stdin.flush()
                    self.pending_input = None
                return self.snapshot()
            if self.pending_input: raise ValueError('Answer the terminal prompt before sending other game commands, or stop the game.')
            payload = {'action': action}
            if action == 'input':
                if not isinstance(data.get('componentId'), str) or not isinstance(data.get('text'), str) or len(data['text']) > 2000:
                    raise ValueError('Invalid input payload')
                payload.update(componentId=data['componentId'], text=data['text'])
            self.process.stdin.write(json.dumps(payload) + '\n'); self.process.stdin.flush()
            return self.snapshot()


def handler(runtime):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_): pass
        def reply(self, status, data):
            body = json.dumps(data, ensure_ascii=True).encode('utf-8')
            try:
                self.send_response(status)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Cache-Control', 'no-store')
                self.send_header('X-Content-Type-Options', 'nosniff')
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            except (BrokenPipeError, ConnectionResetError):
                pass  # The browser may navigate or close while a command finishes.

        def allowed(self):
            host = self.headers.get('Host', '').split(':')[0]
            origin = self.headers.get('Origin')
            if host not in ('127.0.0.1', 'localhost') or origin not in (None, 'http://127.0.0.1:5173', 'http://localhost:5173', 'http://127.0.0.1:4173', 'http://localhost:4173', f"http://127.0.0.1:{os.environ.get('ACTWRIGHT_PORT', '5173')}", f"http://localhost:{os.environ.get('ACTWRIGHT_PORT', '5173')}"):
                self.reply(403, {'error': 'Only the local Actwright workspace can access this companion.'}); return False
            # A non-simple header plus no CORS prevents cross-origin forms/fetch from executing Python.
            if self.headers.get('X-Actwright-Client') != 'workspace':
                self.reply(403, {'error': 'Missing workspace header'}); return False
            return True
        def do_GET(self):
            if not self.allowed(): return
            parsed = urlsplit(self.path)
            if parsed.path != '/api/runtime': self.reply(404, {'error': 'Not found'}); return
            try:
                after = int(parse_qs(parsed.query).get('after', ['0'])[0])
                self.reply(200, {**runtime.snapshot(after), 'token': runtime.token, 'siliconRevision': REVISION})
            except ValueError: self.reply(400, {'error': 'Invalid event cursor'})
        def do_POST(self):
            if not self.allowed(): return
            if self.headers.get('X-Actwright-Token') != runtime.token:
                self.reply(403, {'error': 'Reconnect to the local runtime.'}); return
            try:
                length = int(self.headers.get('Content-Length', '0'))
                if length <= 0 or length > 1_000_000: raise ValueError('Request must be between 1 byte and 1 MB')
                if self.headers.get_content_type() != 'application/json': raise ValueError('JSON required')
                data = json.loads(self.rfile.read(length))
                if not isinstance(data, dict): raise ValueError('JSON object required')
                path = urlsplit(self.path).path
                if path == '/api/analyze-script':
                    self.reply(200, analyze_script(data.get('source')))
                elif path == '/api/runtime/run':
                    source = data.get('source')
                    if not isinstance(source, str) or len(source.encode('utf-8')) > 512_000: raise ValueError('Python export exceeds 512 KB')
                    self.reply(200, runtime.start(source))
                elif path.startswith('/api/runtime/'):
                    self.reply(200, runtime.command(path.rsplit('/', 1)[1], data))
                else: self.reply(404, {'error': 'Not found'})
            except (ValueError, SyntaxError, OSError, BrokenPipeError) as exc:
                self.reply(400, {'error': str(exc)})
    return Handler


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    default = os.environ.get('SILICON_SOURCE') or (str(ROOT.parent / 'si') if (ROOT.parent / 'si' / 'silicon').exists() else '/tmp/actwright-silicon')
    parser.add_argument('--silicon-source', default=default)
    parser.add_argument('--port', type=int, default=int(os.environ.get('ACTWRIGHT_RUNTIME_PORT', '8765')))
    args = parser.parse_args()
    try: verified_sources(Path(args.silicon_source))
    except (OSError, ValueError) as exc: parser.exit(1, f'{exc}\nSet SILICON_SOURCE to the pinned checkout; see README.md.\n')
    runtime = Runtime(args.silicon_source)
    server = ThreadingHTTPServer(('127.0.0.1', args.port), handler(runtime))
    print(f'Actwright Python runtime: http://127.0.0.1:{args.port}', flush=True)
    def terminate(*_): raise KeyboardInterrupt
    signal.signal(signal.SIGTERM, terminate)
    try: server.serve_forever()
    except KeyboardInterrupt: pass
    finally: runtime.stop(); server.server_close()


if __name__ == '__main__': main()
