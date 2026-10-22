import ast
import json
from pathlib import Path
import subprocess
import unittest

from backend.app.analysis.blocks import source_blocks

ROOT = Path(__file__).resolve().parents[2]


def generate(sources):
    layouts = [source_blocks(source) for source in sources]
    result = subprocess.run(['node', 'scripts/blocks-roundtrip.ts'], cwd=ROOT, input=json.dumps(layouts), capture_output=True, text=True, check=True, timeout=20)
    return json.loads(result.stdout)


class Normalize(ast.NodeTransformer):
    def visit_BoolOp(self, node):
        self.generic_visit(node)
        node.values = [value for child in node.values for value in (child.values if isinstance(child, ast.BoolOp) and type(child.op) is type(node.op) else [child])]
        return node


class PythonBlockTests(unittest.TestCase):
    def test_common_python_statements_and_expressions_roundtrip_through_production_generator(self):
        sources = [
            'import math\nfrom math import sqrt\nimport math as maths\nfrom math import sqrt as root',
            'a = 0xFF\nb = 123456789012345678901234567890\nc = 1.\nd = .25\ne = 1e-9\nf = 1_000.5',
            'flag = a < b <= c is not None\nvalue = a.b.c.d\nwarning("careful")',
            'match value:\n    case {"x": x} if x > 0:\n        print(x)\n    case [a, *rest]:\n        pass\n    case 1 | 2:\n        pass\n    case _:\n        print("other")',

            'player = new_instance("silicon.Entity", "player", game, name="Nova")\nscore = new_singleton("silicon.Score", player)\nboard = new_instance("silicon.Stage2D", "board", parent, 6, 4)', 
            'identifier = input("Entity ID: ").strip()\nname = input("Name: ")\nempty = input()',
            'emit("points", 3)\nemit("place", "player", 2, y=4)\nemit("result")',
            'from nitrogen import require\nColor = require("magnesium.color", "26.5").Color\nmodule = require("mg")',
            '''import math as maths
from collections import deque as queue
values = [1, 2, 3]
coords = (4,)
options = {"x": 1, **{"y": 2}}
unique = {1, 2}
empty = []
large = 123456789012345678901234567890
precise = 1.0
hexadecimal = 0xFF
calculated = (1 + 2) * 3 ** 2
flag = not False and True or None
sliced = values[1:3:2]
selected = values[0] if flag else 0
callback = lambda x, y=2: x + y
squares = [x * x for x in values if x > 1]
lookup = {x: x + 1 for x in values}
stream = (x for x in values)
print(callback(*values, named=True, **options))
del options["x"], values[0]
''',
            '''state = 0
def calculate(items, *args, enabled=True, **kwargs) -> int:
    total: int = 0
    for item in items:
        if item > 0:
            total += item
        else:
            continue
    else:
        total += 1
    while total < 10:
        total += 1
        if total == 9:
            break
    else:
        print("done")
    try:
        result = int(total)
    except (TypeError, ValueError) as error:
        raise RuntimeError("failed") from error
    else:
        assert result > 0, "positive"
    finally:
        print("finished")
    with open("example.txt") as reader:
        contents = reader.read()
    return result
class Counter(object):
    @staticmethod
    def label(value=1):
        return str(value)
async def fetch():
    async with connect() as channel:
        result = await channel.read()
    async for item in result:
        print(item)
def generator():
    yield 1
    yield from [2, 3]
def outer():
    count = 1
    def inner():
        nonlocal count
        count += 1
    global state
    state = count
''',
        ]
        for original, converted in zip(sources, generate(sources)):
            with self.subTest(source=original):
                first = Normalize().visit(ast.parse(original))
                second = Normalize().visit(ast.parse(converted))
                self.assertEqual(ast.dump(first), ast.dump(second), converted)

    def test_comments_multiline_literals_and_unsupported_suites_are_preserved(self):
        sources = [
            '# before\nif True:\n    # inside\n    print("yes")\n    # after body\nelse:\n    # otherwise\n    print("no")\n# end\n',
            'message = """hello\nworld"""\nprint(message)',
            'def action():\n    match value:\n        # first case\n        case 1:\n            print("one")\n        # fallback\n        case _:\n            pass\n',
            'print("hello")  # keep this inline comment\n',
        ]
        for original, converted in zip(sources, generate(sources)):
            with self.subTest(source=original):
                self.assertEqual(ast.dump(ast.parse(original)), ast.dump(ast.parse(converted)), converted)
                for line in original.splitlines():
                    if '#' in line: self.assertIn(line.strip(), converted)
        converted = source_blocks(sources[2])['blocks']['blocks'][0]
        self.assertEqual(converted['type'], 'act_function')
        self.assertEqual(converted['inputs']['BODY']['block']['type'], 'act_match')
