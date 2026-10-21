"""Generate the versioned boundary schemas; no third-party dependencies."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
string = {'type': 'string'}
number = {'type': 'number'}
integer = {'type': 'integer', 'minimum': 0}
boolean = {'type': 'boolean'}
null = {'type': 'null'}


def enum(*values): return {'enum': list(values)}
def array(items): return {'type': 'array', 'items': items}
def record(value): return {'type': 'object', 'additionalProperties': value}
def ref(name): return {'$ref': f'#/$defs/{name}'}
def union(*options): return {'anyOf': list(options)}
def obj(properties, optional=()):
    return {'type': 'object', 'properties': properties,
            'required': [k for k in properties if k not in optional], 'additionalProperties': False}


def generate():
    defs = {}
    defs['Json'] = union(null, boolean, number, string, array(ref('Json')), record(ref('Json')))
    defs['Value'] = union(obj({'kind': enum('missing')}), obj({'kind': enum('literal'), 'value': ref('Json')}), obj({'kind': enum('source'), 'source': string}))
    defs['Parameter'] = obj({'name': string, 'annotation': union(string, null), 'kind': enum('positionalOnly', 'positionalOrKeyword', 'keywordOnly', 'varPositional', 'varKeyword'), 'default': ref('Value')})
    defs['Member'] = obj({'id': string, 'name': string, 'kind': enum('input', 'output', 'trigger', 'method', 'update', 'property', 'lifecycle'),
                          'parameters': array(ref('Parameter')), 'returns': union(string, null), 'decorators': array(string), 'async': boolean,
                          'description': string, 'line': integer, 'rate': ref('Value')}, ['rate'])
    defs['Definition'] = obj({'id': string, 'version': integer, 'provider': string, 'name': string, 'module': string, 'kind': enum('component', 'function'),
        'description': string, 'bases': array(string), 'members': array(ref('Member')),
        'state': array(obj({'id': string, 'name': string, 'annotation': union(string, null), 'default': ref('Value'), 'scope': ref('Value')})),
        'constructor': obj({'strategy': enum('__init__', '__component__', 'inherited', 'function'), 'parameters': array(ref('Parameter'))}),
        'serialization': obj({'toConfig': boolean, 'fromConfig': boolean, 'status': enum('unknown', 'declared', 'basePattern')}),
        'provenance': obj({'path': string, 'line': integer, 'endLine': integer, 'revision': union(string, null)}),
        'confidence': enum('static'), 'warnings': array(string), 'category': string, 'optionalDependencies': array(string), 'lifecycleHooks': array(string)}, ['lifecycleHooks'])
    token = union(obj({'kind': enum('exact'), 'value': string}), obj({'kind': enum('glob'), 'pattern': string}), obj({'kind': enum('numbered'), 'prefix': string, 'offset': {'type': 'integer', 'maximum': 0}}))
    match = union(obj({'kind': enum('singleton')}), obj({'kind': enum('ids'), 'tokens': array(token), 'optional': boolean}))
    defs['Selector'] = obj({'id': string, 'root': string, 'path': array(obj({'typeId': string, 'match': match})), 'result': enum('selection', 'component')})

    def node(kind, fields):
        return obj({'id': string, 'sourceRegionId': string, 'kind': enum(*kind.split('|')), **fields}, ['sourceRegionId'])
    defs['Expression'] = union(
        node('literal', {'value': ref('Json')}), node('variable', {'name': string, 'symbolId': string}),
        node('unary', {'operator': string, 'operand': ref('Expression')}),
        node('binary', {'operator': string, 'left': ref('Expression'), 'right': ref('Expression')}),
        node('attribute', {'object': ref('Expression'), 'name': string, 'memberId': union(string, null)}),
        node('call', {'callee': ref('Expression'), 'args': array(ref('Expression')), 'keywords': array(obj({'name': string, 'value': ref('Expression')}))}),
        node('selector', {'selector': ref('Selector')}), node('collection', {'collection': enum('list', 'tuple', 'set'), 'items': array(ref('Expression'))}),
        node('rawExpression', {'regionId': string}))
    body = array(ref('Statement'))
    defs['Statement'] = union(node('expression', {'expression': ref('Expression')}),
        node('assignment', {'target': ref('Expression'), 'value': ref('Expression')}),
        node('if', {'condition': ref('Expression'), 'then': body, 'otherwise': body}),
        node('while', {'condition': ref('Expression'), 'body': body}),
        node('for', {'target': ref('Expression'), 'iterable': ref('Expression'), 'body': body}),
        node('return', {'value': union(ref('Expression'), null)}), node('comment', {'text': string}),
        node('function|method', {'name': string, 'parameters': array(ref('Parameter')), 'decorators': array(ref('Expression')), 'body': body, 'async': boolean}),
        node('class', {'name': string, 'bases': array(ref('Expression')), 'decorators': array(ref('Expression')), 'body': body}),
        node('state', {'name': string, 'value': ref('Expression'), 'scope': enum('game', 'shared')}),
        node('signalConnect|triggerConnect', {'source': ref('Expression'), 'targets': array(ref('Expression'))}),
        node('componentCreate', {'target': ref('Expression'), 'constructor': ref('Expression')}),
        node('componentLink', {'target': ref('Expression'), 'source': ref('Expression')}),
        node('raw', {'regionId': string}), node('extension', {'provider': string, 'version': integer, 'payload': ref('Json')}))
    defs['Program'] = obj({'version': enum(1), 'body': body, 'regions': record(obj({'id': string, 'source': string, 'reason': string, 'context': enum('expression', 'suite', 'module')}))})
    defs['Script'] = obj({'id': string, 'ownerId': string, 'role': enum('startup', 'input', 'output', 'trigger', 'method', 'update', 'lifecycle', 'handler', 'module'),
        'name': string, 'parameters': array(ref('Parameter')), 'program': ref('Program'), 'synchronizedSource': string,
        'draft': union(null, obj({'source': string, 'revision': integer, 'status': enum('pending', 'invalid'), 'diagnostics': array(string)}))})
    endpoint = {'selector': ref('Selector'), 'member': string}
    project = obj({'format': enum('actwright'), 'schemaVersion': enum(1), 'id': string, 'revision': integer, 'name': string,
        'createdAt': string, 'updatedAt': string, 'siliconRevision': string,
        'game': obj({'id': string, 'name': string, 'seed': union(number, null), 'tickRate': {'type': 'number', 'exclusiveMinimum': 0}, 'order': array(string), 'validation': enum('framework', 'strict')}),
        'definitions': record(ref('Definition')),
        'instances': record(obj({'id': string, 'typeId': string, 'name': string, 'config': record(ref('Json')), 'state': record(ref('Json')), 'scripts': array(string),
            'construction': union(obj({'kind': enum('tree')}), obj({'kind': enum('add'), 'runtimeId': string}))})),
        'locations': array(obj({'id': string, 'parentId': string, 'componentId': string, 'kind': enum('canonical', 'link'), 'aliases': array(string), 'singleton': boolean})),
        'slotEdges': array(obj({'id': string, 'sourceId': string, 'output': string, 'targetId': string, 'input': string, 'enabled': boolean})),
        'triggerRules': array(obj({'id': string, 'source': union(obj({'kind': enum('game'), 'member': enum('start', 'pause', 'resume', 'stop')}), obj({'kind': enum('component'), **endpoint})),
            'targets': array(union(obj({'kind': enum('trigger'), **endpoint}), obj({'kind': enum('script'), 'scriptId': string})))})),
        'scripts': record(ref('Script')),
        'sourceModules': record(obj({'id': string, 'path': string, 'source': string, 'encoding': string})),
        'assets': record(obj({'id': string, 'path': string, 'mediaType': string, 'size': integer, 'sha256': string})),
        'plugins': array(obj({'id': string, 'version': string, 'required': boolean})), 'extensions': record(ref('Json')),
        'editor': obj({'nodes': record(obj({'x': number, 'y': number, 'collapsed': boolean})), 'viewport': obj({'x': number, 'y': number, 'zoom': {'type': 'number', 'exclusiveMinimum': 0}})})})
    meta = obj({'schemaVersion': enum(1), 'provider': enum('silicon'), 'revision': string, 'sources': record(string),
                'root': obj({'name': enum('Game'), 'module': enum('silicon'), 'parameters': array(ref('Parameter')), 'triggers': array(string), 'asyncRun': boolean}), 'definitions': array(ref('Definition'))})
    for name, schema in [('project', project), ('metadata', meta)]:
        (ROOT / f'schemas/{name}.v1.schema.json').write_text(json.dumps({'$schema': 'https://json-schema.org/draft/2020-12/schema', '$id': f'https://actwright.wednesware.org/schemas/{name}.v1.json', **schema, '$defs': defs}, indent=2) + '\n')


if __name__ == '__main__':
    generate()
