"""Validate callback bodies without importing or executing their contents."""
import ast
import re
import inspect
import types
import tokenize
import uuid

from .blocks import source_blocks


def analyze_script(source):
    if not isinstance(source, str) or len(source.encode('utf-8')) > 256_000:
        return {'program': None, 'diagnostics': ['Script exceeds the 256 KB limit.']}
    try:
        # A body may contain return, but not await/yield outside a declared function.
        tree = ast.parse(source or 'pass', filename='script.py')
        outputs = list(dict.fromkeys(node.args[0].value for node in ast.walk(tree) if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == 'emit' and node.args and isinstance(node.args[0], ast.Constant) and isinstance(node.args[0].value, str)))
        if any(not re.fullmatch(r'[A-Za-z][A-Za-z0-9_]*', name) for name in outputs):
            raise ValueError('Output names must begin with a letter and contain only letters, numbers and underscores.')
        function = ast.FunctionDef(name='_handler', args=ast.arguments(posonlyargs=[], args=[], kwonlyargs=[], kw_defaults=[], defaults=[]),
                                   body=tree.body, decorator_list=[])
        wrapped = ast.fix_missing_locations(ast.Module(body=[function], type_ignores=[]))
        compiled = compile(wrapped, 'script.py', 'exec')
        callback = next(value for value in compiled.co_consts if isinstance(value, types.CodeType))
        if callback.co_flags & (inspect.CO_GENERATOR | inspect.CO_ASYNC_GENERATOR):
            raise ValueError('Event handlers must run synchronously; generators are not supported.')
    except SyntaxError as exc:
        return {'program': None, 'diagnostics': [f'Line {exc.lineno or 1}: {exc.msg}'], 'line': exc.lineno or 1, 'column': exc.offset or 1}
    except (ValueError, RecursionError, TypeError) as exc:
        return {'program': None, 'diagnostics': [str(exc)]}
    try: layout = source_blocks(source)
    except (ValueError, RecursionError, KeyError, TypeError, tokenize.TokenError): layout = None
    region = str(uuid.uuid4())
    return {'program': {'version': 1, 'body': [{'kind': 'raw', 'id': str(uuid.uuid4()), 'regionId': region}],
                        'regions': {region: {'id': region, 'source': source, 'reason': 'Python callback body', 'context': 'suite'}}}, 'diagnostics': [], 'blocks': layout, 'outputs': outputs}
