"""Execute one exported Act in a disposable process; stdout is a JSON event stream."""
import asyncio
import builtins
import json
import queue
import runpy
import sys
import threading
import time
import traceback
import uuid
import warnings

_protocol = sys.stdout
_lock = threading.Lock()


def emit(kind, **data):
    with _lock:
        _protocol.write(json.dumps({'kind': kind, **data}, ensure_ascii=True) + '\n')
        _protocol.flush()


class Output:
    encoding = 'utf-8'
    def __init__(self, level):
        self.level, self.pending = level, ''
    def write(self, message):
        self.pending += str(message)
        while '\n' in self.pending or len(self.pending) >= 4000:
            if '\n' in self.pending:
                line, self.pending = self.pending.split('\n', 1)
            else:
                line, self.pending = self.pending[:4000], self.pending[4000:]
            emit('log', level=self.level, message=line[:4000])
        return len(message)
    def flush(self):
        if self.pending:
            emit('log', level=self.level, message=self.pending[:4000])
            self.pending = ''
    def isatty(self): return False


class InputCancelled(BaseException):
    pass


class ConsoleInput:
    def __init__(self):
        self.lock = threading.Lock()
        self.pending = None
        self.closed = False

    def ask(self, prompt=''):
        prompt = str(prompt)
        response = queue.Queue(maxsize=1)
        request_id = uuid.uuid4().hex
        with self.lock:
            if self.closed: raise InputCancelled()
            if self.pending: raise RuntimeError('Only one terminal input prompt can be active at a time.')
            self.pending = (request_id, response)
        sys.stdout.flush()
        emit('input_request', requestId=request_id, prompt=prompt[:4000])
        value = response.get()
        with self.lock:
            if self.pending and self.pending[0] == request_id: self.pending = None
        if isinstance(value, InputCancelled): raise value
        emit('input_resolved', requestId=request_id)
        emit('log', level='info', message=(prompt + value)[:4000])
        return value

    def reply(self, command):
        with self.lock:
            if self.pending and command.get('requestId') == self.pending[0] and isinstance(command.get('text'), str):
                try: self.pending[1].put_nowait(command['text'])
                except queue.Full: pass

    def close(self):
        with self.lock:
            self.closed = True
            if self.pending:
                try: self.pending[1].put_nowait(InputCancelled())
                except queue.Full: pass


def read_commands(commands, console_input, stream):
    for line in stream:
        try:
            command = json.loads(line)
            if not isinstance(command, dict): continue
            if command.get('action') == 'input_reply': console_input.reply(command); continue
            if command.get('action') == 'stop': console_input.close()
            commands.put_nowait(command)
        except (ValueError, queue.Full): pass
    console_input.close()
    try: commands.put_nowait({'action': 'stop'})
    except queue.Full: pass


async def run(path):
    warnings.showwarning = lambda message, *_args, **_kwargs: emit('log', level='warning', message=str(message))
    commands = queue.Queue(maxsize=100)
    console_input = ConsoleInput()
    builtins.input = console_input.ask
    threading.Thread(target=read_commands, args=(commands, console_input, sys.stdin), daemon=True).start()
    game = None
    try:
        namespace = runpy.run_path(path, run_name='actwright_game')
        game = namespace['build_game']()
        game.start()
        emit('status', status='running' if game.running else 'stopped')
        previous = time.monotonic()
        while game.running:
            for _ in range(100):
                try: command = commands.get_nowait()
                except queue.Empty: break
                action = command.get('action')
                if action == 'pause': game.pause()
                elif action == 'resume': game.resume()
                elif action == 'stop': game.stop()
                elif action == 'input':
                    component = game.actwright_components[command['componentId']]
                    game[component].ins.feed(command['text'])
                emit('status', status='stopped' if not game.running else 'paused' if game.paused else 'running')
            now = time.monotonic()
            game.step(min(now - previous, 0.25))
            previous = now
            await asyncio.sleep(1 / max(1, min(float(game.tick_rate), 240)))
        emit('status', status='stopped')
    except InputCancelled:
        emit('status', status='stopped')
    except BaseException:
        traceback.print_exc()
        emit('status', status='error')
    finally:
        if game is not None:
            try: game.stop()
            except BaseException: traceback.print_exc()
        sys.stdout.flush()
        sys.stderr.flush()


if __name__ == '__main__':
    sys.stdout, sys.stderr = Output('info'), Output('error')
    asyncio.run(run(sys.argv[1]))
