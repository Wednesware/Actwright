"""Cooperative Silicon loop for Pyodide; the worker can always be terminated."""
import asyncio
import builtins
import json
import sys
import time
import traceback

from js import actwright_event, actwright_input

game = None
commands = []


def emit(kind, **data):
    actwright_event(json.dumps({'kind': kind, **data}))


def console_input(prompt=''):
    sys.stdout.flush()
    value = actwright_input(str(prompt))
    if value is None:
        raise EOFError('Console input was cancelled.')
    return str(value)


builtins.input = console_input


def command(payload):
    commands.append(json.loads(payload))


async def run(source):
    global game
    try:
        namespace = {'__name__': 'actwright_game'}
        exec(compile(source, 'act.py', 'exec'), namespace)
        game = namespace['build_game']()
        game.start()
        emit('status', status='running' if game.running else 'stopped')
        previous = time.monotonic()
        while game.running:
            while commands:
                payload = commands.pop(0)
                action = payload['action']
                if action == 'pause': game.pause()
                elif action == 'resume': game.resume()
                elif action == 'stop': game.stop()
                elif action == 'input':
                    component = game.actwright_components[payload['componentId']]
                    game[component].ins.feed(payload['text'])
                emit('status', status='stopped' if not game.running else 'paused' if game.paused else 'running')
            now = time.monotonic()
            game.step(min(now - previous, 0.25))
            previous = now
            await asyncio.sleep(1 / max(1, min(float(game.tick_rate), 240)))
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
