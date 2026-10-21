"""Conservative Python AST -> canonical Blockly layouts. No code execution.

Unsupported syntax and inline comments keep exact source instead of being guessed.
An unsupported nested statement keeps its enclosing top-level suite opaque so
indentation inside multiline literals is never rewritten.
"""
import ast
import io
import tokenize
import uuid

OPS = {ast.Add: '+', ast.Sub: '-', ast.Mult: '*', ast.Div: '/', ast.FloorDiv: '//', ast.Mod: '%', ast.Pow: '**', ast.MatMult: '@',
       ast.BitAnd: '&', ast.BitOr: '|', ast.BitXor: '^', ast.LShift: '<<', ast.RShift: '>>', ast.And: 'and', ast.Or: 'or',
       ast.Eq: '==', ast.NotEq: '!=', ast.Lt: '<', ast.LtE: '<=', ast.Gt: '>', ast.GtE: '>=', ast.In: 'in', ast.NotIn: 'not in', ast.Is: 'is', ast.IsNot: 'is not',
       ast.Not: 'not', ast.USub: '-', ast.UAdd: '+', ast.Invert: '~'}


def block(kind, fields=None, inputs=None, extra=None):
    result = {'type': f'act_{kind}', 'id': str(uuid.uuid4())}
    if fields: result['fields'] = fields
    if inputs: result['inputs'] = {name: {'block': value} for name, value in inputs.items() if value is not None}
    if extra is not None: result['extraState'] = extra
    return result


def chain(items):
    items = [item for item in items if item is not None]
    for previous, following in zip(items, items[1:]): previous['next'] = {'block': following}
    return items[0] if items else None


class Unsupported(Exception): pass


class Converter:
    def __init__(self, source):
        self.source, self.lines = source, source.splitlines()
        self.inline_comments = set()
        self.nitrogen_require = False
        for token in tokenize.generate_tokens(io.StringIO(source).readline):
            if token.type == tokenize.COMMENT and self.lines[token.start[0] - 1][:token.start[1]].strip(): self.inline_comments.add(token.start[0])

    def text(self, node): return ast.get_source_segment(self.source, node) or ast.unparse(node)
    def args(self, values):
        return block('args', {'COUNT': len(values)}, {f'ITEM{i}': item for i, item in enumerate(values)}, {'items': len(values)})
    def expr(self, node):
        if node is None: return None
        if isinstance(node, ast.Constant):
            if node.value is None: return block('none')
            if type(node.value) is bool: return block('boolean', {'VALUE': str(node.value)})
            if type(node.value) in (int, float): return block('number', {'NUM': self.text(node)})
            if isinstance(node.value, str) and '\n' not in node.value and '\r' not in node.value: return block('text', {'TEXT': node.value})
        elif isinstance(node, ast.Name): return block('name', {'NAME': node.id})
        elif isinstance(node, ast.BinOp): return block('binary', {'OP': OPS[type(node.op)]}, {'LEFT': self.expr(node.left), 'RIGHT': self.expr(node.right)})
        elif isinstance(node, ast.BoolOp):
            value = self.expr(node.values[0])
            for item in node.values[1:]: value = block('binary', {'OP': OPS[type(node.op)]}, {'LEFT': value, 'RIGHT': self.expr(item)})
            return value
        elif isinstance(node, ast.Compare) and len(node.ops) == 1: return block('binary', {'OP': OPS[type(node.ops[0])]}, {'LEFT': self.expr(node.left), 'RIGHT': self.expr(node.comparators[0])})
        elif isinstance(node, ast.UnaryOp): return block('unary', {'OP': OPS[type(node.op)]}, {'VALUE': self.expr(node.operand)})
        elif isinstance(node, ast.Attribute): return block('attribute', {'NAME': node.attr}, {'OBJECT': self.expr(node.value)})
        elif isinstance(node, ast.Subscript): return block('index', inputs={'OBJECT': self.expr(node.value), 'KEY': self.expr(node.slice)})
        elif isinstance(node, ast.Slice): return block('slice', inputs={'START': self.expr(node.lower), 'STOP': self.expr(node.upper), 'STEP': self.expr(node.step)})
        elif isinstance(node, ast.Call):
            if isinstance(node.func, ast.Name) and node.func.id in ('new_instance', 'new_singleton'):
                required = 3 if node.func.id == 'new_instance' else 2
                if len(node.args) >= required and isinstance(node.args[0], ast.Constant) and isinstance(node.args[0].value, str) and node.args[0].value.startswith('silicon.') and not any(isinstance(value, ast.Starred) for value in node.args[:required]):
                    args = [self.expr(item) for item in node.args[required:]]
                    args.extend(block('keyword', {'NAME': item.arg}, {'VALUE': self.expr(item.value)}) if item.arg else block('unpack', {'OP': '**'}, {'VALUE': self.expr(item.value)}) for item in node.keywords)
                    if len(args) <= 20:
                        inputs = {'PARENT': self.expr(node.args[required - 1])}
                        if required == 3: inputs['ID'] = self.expr(node.args[1])
                        if args: inputs['ARGS'] = self.args(args)
                        return block(node.func.id, {'TYPE': node.args[0].value}, inputs)
            if isinstance(node.func, ast.Name) and node.func.id == 'input' and len(node.args) == 1 and not node.keywords and not isinstance(node.args[0], ast.Starred):
                return block('input', inputs={'PROMPT': self.expr(node.args[0])})
            if self.nitrogen_require and isinstance(node.func, ast.Name) and node.func.id == 'require' and 1 <= len(node.args) <= 2 and not node.keywords and not any(isinstance(value, ast.Starred) for value in node.args):
                return block('require', inputs={'PUB': self.expr(node.args[0]), 'REL': self.expr(node.args[1]) if len(node.args) == 2 else None})
            args = [self.expr(item) for item in node.args]
            args.extend(block('keyword', {'NAME': item.arg}, {'VALUE': self.expr(item.value)}) if item.arg else block('unpack', {'OP': '**'}, {'VALUE': self.expr(item.value)}) for item in node.keywords)
            if len(args) <= 20: return block('call', inputs={'FUNCTION': self.expr(node.func), 'ARGS': self.args(args)})
        elif isinstance(node, (ast.List, ast.Tuple, ast.Set)) and len(node.elts) <= 20:
            return block('collection', {'KIND': {ast.List: 'list', ast.Tuple: 'tuple', ast.Set: 'set'}[type(node)], 'COUNT': len(node.elts)},
                         {f'ITEM{i}': self.expr(item) for i, item in enumerate(node.elts)}, {'items': len(node.elts)})
        elif isinstance(node, ast.Dict) and len(node.keys) <= 20:
            values = [block('pair', inputs={'KEY': self.expr(key), 'VALUE': self.expr(value)}) if key else block('unpack', {'OP': '**'}, {'VALUE': self.expr(value)}) for key, value in zip(node.keys, node.values)]
            return block('collection', {'KIND': 'dict', 'COUNT': len(values)}, {f'ITEM{i}': value for i, value in enumerate(values)}, {'items': len(values)})
        elif isinstance(node, ast.Starred): return block('unpack', {'OP': '*'}, {'VALUE': self.expr(node.value)})
        elif isinstance(node, ast.IfExp): return block('conditional', inputs={'THEN': self.expr(node.body), 'CONDITION': self.expr(node.test), 'ELSE': self.expr(node.orelse)})
        elif isinstance(node, ast.Lambda): return block('lambda', {'PARAMS': ast.unparse(node.args)}, {'VALUE': self.expr(node.body)})
        elif isinstance(node, ast.Await): return block('await', inputs={'VALUE': self.expr(node.value)})
        elif isinstance(node, (ast.Yield, ast.YieldFrom)): return block('yield', {'FROM': 'TRUE' if isinstance(node, ast.YieldFrom) else 'FALSE'}, {'VALUE': self.expr(node.value)})
        elif isinstance(node, (ast.ListComp, ast.SetComp, ast.DictComp, ast.GeneratorExp)) and len(node.generators) == 1 and not node.generators[0].is_async:
            generator = node.generators[0]
            if len(generator.ifs) <= 1:
                kind = {ast.ListComp: 'list', ast.SetComp: 'set', ast.DictComp: 'dict', ast.GeneratorExp: 'generator'}[type(node)]
                value = block('pair', inputs={'KEY': self.expr(node.key), 'VALUE': self.expr(node.value)}) if isinstance(node, ast.DictComp) else self.expr(node.elt)
                return block('comprehension', {'KIND': kind}, {'VALUE': value, 'TARGET': self.expr(generator.target), 'ITERABLE': self.expr(generator.iter), 'CONDITION': self.expr(generator.ifs[0]) if generator.ifs else None})
        return block('raw_expression', extra={'source': self.text(node)})

    def suite(self, nodes, start=None, end=None, indent=0):
        result, previous = [], start
        for node in nodes:
            beginning = min([node.lineno, *[d.lineno for d in getattr(node, 'decorator_list', [])]])
            if previous is not None:
                result.extend(self.comments(previous, beginning - 1, indent))
            result.append(self.stmt(node))
            previous = node.end_lineno
        if previous is not None and end is not None: result.extend(self.comments(previous, end, indent))
        return chain(result)
    def comments(self, start, end, indent):
        return [block('comment', {'TEXT': line.strip()[1:].lstrip()}) for line in self.lines[start:end] if line.startswith(' ' * indent + '#')]

    def stmt(self, node):
        try:
            start = min([node.lineno, *[d.lineno for d in getattr(node, 'decorator_list', [])]])
            if any(line in self.inline_comments for line in range(start, node.end_lineno + 1)) or getattr(node, 'type_comment', None): raise Unsupported()
            result = self.statement(node)
            for decorator in reversed(getattr(node, 'decorator_list', [])): result = block('decorator', inputs={'VALUE': self.expr(decorator), 'BODY': result})
            return result
        except Unsupported:
            if node.col_offset: raise
            start = min([node.lineno, *[d.lineno for d in getattr(node, 'decorator_list', [])]]) - 1
            return block('python', extra={'source': '\n'.join(self.lines[start:node.end_lineno])})

    def nested(self, node, name='body', end=None):
        nodes = getattr(node, name)
        if not nodes: return None
        beginning = nodes[0].lineno - 1
        for index in range(nodes[0].lineno - 2, node.lineno - 2, -1):
            line = self.lines[index].strip()
            if line and not line.startswith('#'):
                beginning = index + 1
                break
        ending = nodes[-1].end_lineno
        while ending < len(self.lines):
            line = self.lines[ending]
            if not line.strip(): ending += 1; continue
            if line.startswith(' ' * nodes[0].col_offset + '#'): ending += 1; continue
            break
        return self.suite(nodes, beginning, ending, nodes[0].col_offset)

    def statement(self, node):
        if isinstance(node, ast.Expr):
            if isinstance(node.value, ast.Call) and isinstance(node.value.func, ast.Name) and node.value.func.id == 'emit' and node.value.args and isinstance(node.value.args[0], ast.Constant) and isinstance(node.value.args[0].value, str):
                values = [self.expr(item) for item in node.value.args[1:]]
                values.extend(block('keyword', {'NAME': item.arg}, {'VALUE': self.expr(item.value)}) if item.arg else block('unpack', {'OP': '**'}, {'VALUE': self.expr(item.value)}) for item in node.value.keywords)
                if len(values) <= 20: return block('output', {'NAME': node.value.args[0].value}, {'ARGS': self.args(values) if values else None})
            if isinstance(node.value, ast.Call) and isinstance(node.value.func, ast.Name) and node.value.func.id == 'print' and len(node.value.args) == 1 and not node.value.keywords:
                return block('print', inputs={'VALUE': self.expr(node.value.args[0])})
            return block('expression', inputs={'VALUE': self.expr(node.value)})
        if isinstance(node, ast.Assign) and len(node.targets) == 1: return block('assign', inputs={'TARGET': self.expr(node.targets[0]), 'VALUE': self.expr(node.value)})
        if isinstance(node, ast.AnnAssign): return block('annotated', inputs={'TARGET': self.expr(node.target), 'TYPE': self.expr(node.annotation), 'VALUE': self.expr(node.value)})
        if isinstance(node, ast.AugAssign): return block('augassign', {'OP': OPS[type(node.op)]}, {'TARGET': self.expr(node.target), 'VALUE': self.expr(node.value)})
        if isinstance(node, (ast.If, ast.While)):
            return block('if' if isinstance(node, ast.If) else 'while', inputs={'CONDITION': self.expr(node.test), 'BODY': self.nested(node), 'ELSE': self.nested(node, 'orelse')})
        if isinstance(node, (ast.For, ast.AsyncFor)):
            return block('for', {'ASYNC': 'TRUE' if isinstance(node, ast.AsyncFor) else 'FALSE'}, {'TARGET': self.expr(node.target), 'ITERABLE': self.expr(node.iter), 'BODY': self.nested(node), 'ELSE': self.nested(node, 'orelse')})
        if isinstance(node, ast.Return): return block('return', inputs={'VALUE': self.expr(node.value)})
        if isinstance(node, (ast.Break, ast.Continue, ast.Pass)): return block('flow', {'OP': type(node).__name__.lower()})
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and not getattr(node, 'type_params', []):
            return block('function', {'NAME': node.name, 'PARAMS': ast.unparse(node.args), 'RETURNS': ast.unparse(node.returns) if node.returns else '', 'ASYNC': 'TRUE' if isinstance(node, ast.AsyncFunctionDef) else 'FALSE'}, {'BODY': self.nested(node, end=node.end_lineno)})
        if isinstance(node, ast.ClassDef) and not getattr(node, 'type_params', []):
            bases = [ast.unparse(value) for value in node.bases] + [f'{value.arg}={ast.unparse(value.value)}' if value.arg else '**' + ast.unparse(value.value) for value in node.keywords]
            return block('class', {'NAME': node.name, 'BASES': ', '.join(bases)}, {'BODY': self.nested(node, end=node.end_lineno)})
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            names = ', '.join(item.name + (' as ' + item.asname if item.asname else '') for item in node.names)
            return block('import', {'KIND': 'from' if isinstance(node, ast.ImportFrom) else 'import', 'MODULE': '.' * node.level + (node.module or '') if isinstance(node, ast.ImportFrom) else '', 'NAMES': names})
        if isinstance(node, ast.Try):
            handlers = [block('except', {'TYPE': ast.unparse(item.type) if item.type else '', 'NAME': item.name or ''}, {'BODY': self.nested(item)}) for item in node.handlers]
            return block('try', inputs={'BODY': self.nested(node), 'HANDLERS': chain(handlers), 'ELSE': self.nested(node, 'orelse'), 'FINALLY': self.nested(node, 'finalbody')})
        if isinstance(node, ast.Raise): return block('raise', inputs={'VALUE': self.expr(node.exc), 'CAUSE': self.expr(node.cause)})
        if isinstance(node, ast.Assert): return block('assert', inputs={'CONDITION': self.expr(node.test), 'MESSAGE': self.expr(node.msg)})
        if isinstance(node, (ast.With, ast.AsyncWith)):
            values = [block('withitem', {'NAME': ast.unparse(item.optional_vars) if item.optional_vars else ''}, {'VALUE': self.expr(item.context_expr)}) for item in node.items]
            return block('with', {'ASYNC': 'TRUE' if isinstance(node, ast.AsyncWith) else 'FALSE'}, {'ITEMS': self.args(values), 'BODY': self.nested(node)})
        if isinstance(node, ast.Delete): return block('delete', inputs={'VALUE': self.args([self.expr(value) for value in node.targets])})
        if isinstance(node, (ast.Global, ast.Nonlocal)): return block('scope', {'KIND': type(node).__name__.lower(), 'NAMES': ', '.join(node.names)})
        raise Unsupported()


def source_blocks(source):
    converter = Converter(source)
    tree = ast.parse(source or 'pass', type_comments=True)
    bindings = [node for node in ast.walk(tree) if isinstance(node, ast.ImportFrom) and any(alias.name == 'require' and alias.asname in (None, 'require') for alias in node.names)]
    shadowed = any(isinstance(node, ast.Name) and isinstance(node.ctx, ast.Store) and node.id == 'require'
                   or isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)) and node.name == 'require'
                   or isinstance(node, ast.arg) and node.arg == 'require' for node in ast.walk(tree))
    converter.nitrogen_require = len(bindings) == 1 and bindings[0] in tree.body and bindings[0].module == 'nitrogen' and not bindings[0].level and not shadowed
    first = converter.suite(tree.body, 0, len(converter.lines), 0)
    return {'blocks': {'languageVersion': 0, 'blocks': [first] if first else []}}
