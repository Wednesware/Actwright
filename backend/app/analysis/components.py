"""Extract conservative Silicon metadata using AST only; never import user code."""
from __future__ import annotations

import ast
import math

HOOKS = {'on_attach', 'on_detach', 'on_start', 'on_pause', 'on_resume', 'on_stop'}
DECORATORS = {'input', 'output', 'trigger', 'update'}
COMPONENT_BASES = {'Component', 'Entity', 'Effect', 'Timer', 'TurnManager', 'Stage2D', 'StageRenderer', 'FrontEnd',
                   'Traits', 'Effects', 'CharacterSelection', 'Randomizer', 'StateMachine', 'GameControl', 'InputMap',
                   'GridMovement', 'Transform2D', 'Velocity', 'Gravity', 'Collision2D', 'Health', 'Inventory', 'Score',
                   'Lifetime', 'CommandOptions', 'App', 'SoundEffects', 'SoundPlayer', 'ShellInput', 'Multiplayer'}


def portable(value):
    if value is None or type(value) in (str, bool, int):
        return True
    if type(value) is float:
        return math.isfinite(value)
    if isinstance(value, list):
        return all(portable(v) for v in value)
    if isinstance(value, dict):
        return all(isinstance(k, str) and portable(v) for k, v in value.items())
    return False


def expression(node):
    if node is None:
        return {'kind': 'missing'}
    try:
        value = ast.literal_eval(node)
        # Python literals such as sets/bytes/complex are not portable JSON.
        if not portable(value):
            raise ValueError('Non-JSON Python semantics require an expression')
        return {'kind': 'literal', 'value': value}
    except (ValueError, TypeError, SyntaxError, OverflowError):
        return {'kind': 'source', 'source': ast.unparse(node)}


def annotation(node):
    return ast.unparse(node) if node is not None else None


def parameters(arguments, *, method=True):
    result = []
    positional = [*arguments.posonlyargs, *arguments.args]
    defaults = [None] * (len(positional) - len(arguments.defaults)) + list(arguments.defaults)
    for index, (arg, default) in enumerate(zip(positional, defaults)):
        if method and arg.arg in ('self', 'cls') and index == 0:
            continue
        result.append({'name': arg.arg, 'annotation': annotation(arg.annotation),
                       'kind': 'positionalOnly' if index < len(arguments.posonlyargs) else 'positionalOrKeyword',
                       'default': expression(default)})
    if arguments.vararg:
        result.append({'name': arguments.vararg.arg, 'annotation': annotation(arguments.vararg.annotation),
                       'kind': 'varPositional', 'default': expression(None)})
    for arg, default in zip(arguments.kwonlyargs, arguments.kw_defaults):
        result.append({'name': arg.arg, 'annotation': annotation(arg.annotation),
                       'kind': 'keywordOnly', 'default': expression(default)})
    if arguments.kwarg:
        result.append({'name': arguments.kwarg.arg, 'annotation': annotation(arguments.kwarg.annotation),
                       'kind': 'varKeyword', 'default': expression(None)})
    return result


def analyze_source(source: str, *, module='imported', path='imported.py', revision=None):
    """Return metadata with confidence/warnings, or syntax diagnostics and exact source.

    Attribute chains are resolved only from explicit Silicon imports. Dynamic bases,
    decorator effects, inherited members and computed defaults are not executed.
    """
    result = {'source': source, 'definitions': [], 'diagnostics': []}
    if len(source.encode('utf-8')) > 2_000_000:
        result['diagnostics'].append({'severity': 'error', 'code': 'python.limit', 'message': 'Source exceeds 2 MB static analysis limit'})
        return result
    try:
        tree = ast.parse(source, filename=path)
    except SyntaxError as exc:
        result['diagnostics'].append({'severity': 'error', 'code': 'python.syntax',
                                      'message': exc.msg, 'line': exc.lineno, 'column': exc.offset})
        return result
    except (RecursionError, ValueError) as exc:
        result['diagnostics'].append({'severity': 'error', 'code': 'python.parse', 'message': str(exc)})
        return result

    aliases = {}
    for node in tree.body:
        if isinstance(node, ast.ImportFrom) and (node.module == 'silicon' or (module.startswith('silicon') and node.level)):
            for alias in node.names:
                aliases[alias.asname or alias.name] = alias.name
        elif isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name == 'silicon':
                    aliases[alias.asname or 'silicon'] = '$silicon'

    # Framework's own declarations/decorators are defined in the core module.
    if module == 'silicon':
        aliases.update({name: name for name in ['Component', 'State', 'register', 'component', *DECORATORS]})

    def resolve(node):
        if isinstance(node, ast.Call):
            return resolve(node.func)
        if isinstance(node, ast.Name):
            return aliases.get(node.id)
        if isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name) and aliases.get(node.value.id) == '$silicon':
            return node.attr
        return None

    classes = {n.name: n for n in tree.body if isinstance(n, ast.ClassDef)}
    component_names = set()
    while True:
        added = {name for name, node in classes.items() if any(
            resolve(base) in COMPONENT_BASES or isinstance(base, ast.Name) and base.id in component_names
            for base in node.bases)} - component_names
        if not added:
            break
        component_names.update(added)

    for node in tree.body:
        functional = isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and any(
            resolve(d) == 'component' for d in node.decorator_list)
        if not functional and not (isinstance(node, ast.ClassDef) and node.name in component_names):
            continue
        type_id = f'{module}.{node.name}'
        version = 1
        for decorator in node.decorator_list:
            if resolve(decorator) == 'register' and isinstance(decorator, ast.Call):
                if decorator.args and isinstance(decorator.args[0], ast.Constant) and isinstance(decorator.args[0].value, str):
                    type_id = decorator.args[0].value
                for keyword in decorator.keywords:
                    if keyword.arg == 'version' and isinstance(keyword.value, ast.Constant) and type(keyword.value.value) is int:
                        version = keyword.value.value
        definition = {'id': type_id, 'version': version, 'provider': 'silicon' if module.startswith('silicon') else 'imported',
                      'name': node.name, 'module': module, 'kind': 'function' if functional else 'component',
                      'description': ast.get_docstring(node) or '', 'bases': [], 'members': [], 'state': [],
                      'constructor': {'strategy': 'inherited', 'parameters': []},
                      'serialization': {'toConfig': False, 'fromConfig': False, 'status': 'unknown'},
                      'provenance': {'path': path, 'line': node.lineno, 'endLine': node.end_lineno, 'revision': revision},
                      'confidence': 'static', 'warnings': [], 'category': 'Custom', 'optionalDependencies': []}
        if functional:
            args = parameters(node.args, method=False)
            definition['constructor'] = {'strategy': 'function', 'parameters': []}
            # The adapter always exposes value/result; original parameter names can
            # affect the framework's annotation propagation, so do not infer types.
            for name, kind in [('value', 'input'), ('result', 'output')]:
                definition['members'].append({'id': f'{type_id}.{name}', 'name': name, 'kind': kind,
                                              'parameters': [{'name': 'value', 'annotation': None, 'kind': 'positionalOrKeyword', 'default': expression(None)}],
                                              'returns': None, 'decorators': [], 'async': isinstance(node, ast.AsyncFunctionDef),
                                              'description': '', 'line': node.lineno})
            if len(args) != 1 or args[0]['kind'] not in ('positionalOnly', 'positionalOrKeyword'):
                definition['warnings'].append('Silicon function components require exactly one ordinary parameter.')
            definition['warnings'].append('Function wrapper metadata is conservative; original function source is retained.')
        else:
            definition['bases'] = [ast.unparse(base) for base in node.bases]
            if any(resolve(base) in COMPONENT_BASES - {'Component'} for base in node.bases):
                definition['warnings'].append('Inherited Silicon members are not flattened; resolve from the built-in registry.')
            if any(resolve(decorator) != 'register' for decorator in node.decorator_list):
                definition['warnings'].append('Unresolved class decorators may change the component definition.')
            methods = {}
            for member in node.body:
                if isinstance(member, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    methods[member.name] = member
                    tags = {resolve(d) for d in member.decorator_list}
                    kind = next((tag for tag in ('input', 'output', 'trigger', 'update') if tag in tags),
                                'lifecycle' if member.name in HOOKS else 'property' if any(isinstance(d, ast.Name) and d.id == 'property' for d in member.decorator_list) else 'method')
                    data = {'id': f'{type_id}.{member.name}', 'name': member.name, 'kind': kind,
                            'parameters': parameters(member.args), 'returns': annotation(member.returns),
                            'decorators': [ast.unparse(d) for d in member.decorator_list],
                            'async': isinstance(member, ast.AsyncFunctionDef), 'description': ast.get_docstring(member) or '',
                            'line': member.lineno}
                    if kind == 'update':
                        decorator = next(d for d in member.decorator_list if resolve(d) == 'update')
                        rate = next((kw.value for kw in decorator.keywords if kw.arg == 'rate'), None) if isinstance(decorator, ast.Call) else None
                        if isinstance(decorator, ast.Call) and decorator.args:
                            rate = decorator.args[0]
                        data['rate'] = expression(rate) if rate is not None else {'kind': 'literal', 'value': 0}
                    definition['members'].append(data)
                elif isinstance(member, (ast.Assign, ast.AnnAssign)):
                    value = member.value
                    targets = member.targets if isinstance(member, ast.Assign) else [member.target]
                    if isinstance(value, ast.Call) and resolve(value) == 'State':
                        for target in targets:
                            if isinstance(target, ast.Name):
                                scope = next((expression(kw.value) for kw in value.keywords if kw.arg == 'scope'),
                                             expression(value.args[1]) if len(value.args) > 1 else {'kind': 'literal', 'value': 'shared'})
                                definition['state'].append({'id': f'{type_id}.{target.id}', 'name': target.id,
                                    'annotation': annotation(member.annotation) if isinstance(member, ast.AnnAssign) else None,
                                    'default': expression(value.args[0]) if value.args else next((expression(kw.value) for kw in value.keywords if kw.arg == 'default'), {'kind': 'missing'}), 'scope': scope})
            constructor = methods.get('__init__') or methods.get('__component__')
            if constructor:
                definition['constructor'] = {'strategy': constructor.name, 'parameters': parameters(constructor.args)}
            definition['serialization']['toConfig'] = 'to_config' in methods
            definition['serialization']['fromConfig'] = 'from_config' in methods
            definition['serialization']['status'] = 'declared' if 'to_config' in methods else 'basePattern' if '__component__' in methods else 'unknown'
            if len([m for m in definition['members'] if m['kind'] == 'update']) > 1:
                definition['warnings'].append('Silicon selects one update method; multiple declarations are ambiguous.')
            if any(isinstance(base, ast.Name) and base.id in component_names for base in node.bases):
                definition['warnings'].append('Local inherited metadata requires registry resolution; source retained.')
            if any(m['decorators'] and m['kind'] == 'method' and not all(d in ('classmethod', 'staticmethod') for d in m['decorators']) for m in definition['members']):
                definition['warnings'].append('Unresolved decorators may change member behavior.')
        result['definitions'].append(definition)
    return result
