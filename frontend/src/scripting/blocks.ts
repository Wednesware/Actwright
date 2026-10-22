/** Canonical Blockly state and Python generation, independent of the rendering library. */
export interface PythonBlock {
  type: string; id?: string; fields?: Record<string, string | number | boolean>;
  inputs?: Record<string, { block?: PythonBlock; shadow?: PythonBlock }>;
  next?: { block: PythonBlock }; extraState?: { source?: string; items?: number; componentId?: string };
  disabledReasons?: string[]; enabled?: boolean;
}
export interface PythonWorkspace { blocks?: { languageVersion: number; blocks: PythonBlock[] } }
export interface BlockLayout { source: string; state: PythonWorkspace }
const input = (block: PythonBlock, name: string) => block.inputs?.[name]?.block ?? block.inputs?.[name]?.shadow;
const field = (block: PythonBlock, name: string, fallback = '') => String(block.fields?.[name] ?? fallback);
const checked = (block: PythonBlock, name: string): boolean => field(block, name).toLowerCase() === 'true';
const kind = (block: PythonBlock) => block.type.replace(/^act_l[12]_/, 'act_');
const value = (block: PythonBlock, name: string, fallback = 'None'): string => { const child = input(block, name); return child ? expression(child) : fallback; };
function items(block: PythonBlock): string[] { return Array.from({ length: Number(block.extraState?.items ?? block.fields?.['COUNT'] ?? 2) }, (_, i) => value(block, `ITEM${i}`)); }
/** Keep arbitrary-size integers as text; never round them through JavaScript Number. */
export function numericLiteral(raw: string, type: 'int' | 'float'): string {
  raw = raw.trim();
  const valid = type === 'int'
    ? /^[+-]?(?:0(?:_?0)*|[1-9](?:_?[0-9])*|0[xX][0-9a-fA-F](?:_?[0-9a-fA-F])*|0[oO][0-7](?:_?[0-7])*|0[bB][01](?:_?[01])*)$/.test(raw)
    : /^[+-]?(?:(?:[0-9](?:_?[0-9])*)(?:\.(?:[0-9](?:_?[0-9])*)?)?|\.[0-9](?:_?[0-9])*)(?:[eE][+-]?[0-9](?:_?[0-9])*)?$/.test(raw);
  if (!valid) throw new Error(type === 'int' ? 'Enter a whole integer in the int block.' : 'Enter a decimal number in the float block.');
  return type === 'float' && !/[.eE]/.test(raw) ? `${raw}.0` : raw;
}
export function expression(block: PythonBlock): string {
  switch (kind(block)) {
    case 'act_new_instance': return `new_instance(${JSON.stringify(field(block, 'TYPE', 'silicon.Entity'))}, ${value(block, 'ID', JSON.stringify('entity0'))}, ${value(block, 'PARENT', 'game')}${input(block, 'ARGS') ? ', ' + value(block, 'ARGS') : ''})`;
    case 'act_new_singleton': return `new_singleton(${JSON.stringify(field(block, 'TYPE', 'silicon.Entity'))}, ${value(block, 'PARENT', 'game')}${input(block, 'ARGS') ? ', ' + value(block, 'ARGS') : ''})`;
    case 'act_input': return `input(${value(block, 'PROMPT', JSON.stringify('Enter text: '))})`;
    case 'act_value': return `(${field(block, 'CODE', 'game') || 'None'})`;
    case 'act_component': { const id = field(block, 'ID', block.extraState?.componentId ?? '$game'); return id === '$game' ? 'game' : id === '$parent' ? 'parent' : `game[components[${JSON.stringify(id)}]]`; }
    case 'act_text': return JSON.stringify(field(block, 'TEXT'));
    case 'act_int': return numericLiteral(field(block, 'NUM', '0'), 'int');
    case 'act_float': return numericLiteral(field(block, 'NUM', '0.0'), 'float');
    case 'act_number': return field(block, 'NUM', '0');
    case 'act_boolean': return field(block, 'VALUE', 'True');
    case 'act_none': return 'None';
    case 'act_name': return field(block, 'NAME', 'value');
    case 'act_binary': {
      let result = `${value(block, 'LEFT')} ${field(block, 'OP', '+')} ${value(block, 'RIGHT')}`;
      for (let i = 2; i < Math.min(20, Number(block.extraState?.items ?? block.fields?.['COUNT'] ?? 2)); i++) result += ` ${field(block, `OP${i}`, '+')} ${value(block, `ITEM${i}`)}`;
      return `(${result})`;
    }
    case 'act_unary': return `(${field(block, 'OP', 'not')} ${value(block, 'VALUE')})`;
    case 'act_attribute': {
      let result = `${value(block, 'OBJECT', 'game')}.${field(block, 'NAME', 'name')}`;
      for (let i = 2; i < Math.min(20, Number(block.extraState?.items ?? block.fields?.['COUNT'] ?? 2)); i++) result += `.${field(block, `NAME${i}`, 'name')}`;
      return result;
    }
    case 'act_index': return `${value(block, 'OBJECT', 'items')}[${value(block, 'KEY', '0')}]`;
    case 'act_slice': return `${input(block, 'START') ? value(block, 'START') : ''}:${input(block, 'STOP') ? value(block, 'STOP') : ''}${input(block, 'STEP') ? ':' + value(block, 'STEP') : ''}`;
    case 'act_require_dynamic':
    case 'act_require': return `require(${input(block, 'PUB') ? value(block, 'PUB') : JSON.stringify(field(block, 'PUB', 'si'))}${input(block, 'REL') ? ', ' + value(block, 'REL') : field(block, 'REL') ? ', ' + JSON.stringify(field(block, 'REL')) : ''})`;
    case 'act_call': return `${value(block, 'FUNCTION', 'print')}(${value(block, 'ARGS', '')})`;
    case 'act_args': return items(block).join(', ');
    case 'act_keyword': return `${field(block, 'NAME', 'name')}=${value(block, 'VALUE')}`;
    case 'act_unpack': return `${field(block, 'OP', '*')}${value(block, 'VALUE', 'items')}`;
    case 'act_pair': return `${value(block, 'KEY')}: ${value(block, 'VALUE')}`;
    case 'act_collection': {
      let values = items(block); const type = field(block, 'KIND', 'list');
      if (type === 'dict') values = values.map((code, index) => { const child = input(block, `ITEM${index}`); return child && ['act_pair', 'act_unpack', 'act_raw_expression'].includes(kind(child)) ? code : code + ': None'; });
      if (type === 'list') return `[${values.join(', ')}]`;
      if (type === 'tuple') return `(${values.join(', ')}${values.length === 1 ? ',' : ''})`;
      if (type === 'set' && !values.length) return 'set()';
      return `{${values.join(', ')}}`;
    }
    case 'act_comprehension': {
      const type = field(block, 'KIND', 'list'), brackets = type === 'list' ? ['[', ']'] : type === 'generator' ? ['(', ')'] : ['{', '}'];
      return `${brackets[0]}${value(block, 'VALUE')} for ${value(block, 'TARGET', 'item')} in ${value(block, 'ITERABLE', 'items')}${input(block, 'CONDITION') ? ` if ${value(block, 'CONDITION')}` : ''}${brackets[1]}`;
    }
    case 'act_conditional': return `(${value(block, 'THEN')} if ${value(block, 'CONDITION', 'True')} else ${value(block, 'ELSE')})`;
    case 'act_lambda': return `(lambda ${field(block, 'PARAMS', 'value')}: ${value(block, 'VALUE')})`;
    case 'act_await': return `await ${value(block, 'VALUE')}`;
    case 'act_yield': return `yield${checked(block, 'FROM') ? ' from' : ''}${input(block, 'VALUE') ? ' ' + value(block, 'VALUE') : ''}`;
    case 'act_withitem': return `${value(block, 'VALUE')}${field(block, 'NAME') ? ' as ' + field(block, 'NAME') : ''}`;
    case 'act_raw_expression': return block.extraState?.source ?? 'None';
    default: throw new Error(`Unknown expression block: ${block.type}`);
  }
}
export function statements(first: PythonBlock | undefined, indent = ''): string[] {
  const lines: string[] = [];
  const suite = (block: PythonBlock, name: string) => { const body = statements(input(block, name), indent + '    '); return body.length ? body : [indent + '    pass']; };
  for (let block = first; block; block = block.next?.block) {
    if (block.enabled === false || block.disabledReasons?.length) continue;
    const emit = (code: string) => lines.push(indent + code);
    switch (kind(block)) {
      case 'act_output': emit(`emit(${JSON.stringify(field(block, 'NAME', 'result'))}${input(block, 'ARGS') ? ', ' + value(block, 'ARGS') : ''})`); break;
      case 'act_warning': emit(`warning(${value(block, 'VALUE', JSON.stringify('Warning'))})`); break;
      case 'act_print': emit(`print(${input(block, 'VALUE') ? value(block, 'VALUE') : JSON.stringify(field(block, 'TEXT', 'hello'))})`); break;
      case 'act_expression': emit(value(block, 'VALUE')); break;
      case 'act_assign': emit(`${value(block, 'TARGET', 'value')} = ${value(block, 'VALUE', '0')}`); break;
      case 'act_annotated': emit(`${value(block, 'TARGET', 'value')}: ${value(block, 'TYPE', 'int')}${input(block, 'VALUE') ? ' = ' + value(block, 'VALUE') : ''}`); break;
      case 'act_augassign': emit(`${value(block, 'TARGET', 'value')} ${field(block, 'OP', '+')}= ${value(block, 'VALUE', '1')}`); break;
      case 'act_if':
        emit(`if ${value(block, 'CONDITION', field(block, 'CONDITION', 'True'))}:`); lines.push(...suite(block, 'BODY'));
        if (input(block, 'ELSE')) { emit('else:'); lines.push(...suite(block, 'ELSE')); } break;
      case 'act_while':
        emit(`while ${value(block, 'CONDITION', 'True')}:`); lines.push(...suite(block, 'BODY'));
        if (input(block, 'ELSE')) { emit('else:'); lines.push(...suite(block, 'ELSE')); } break;
      case 'act_for':
        emit(`${checked(block, 'ASYNC') ? 'async ' : ''}for ${value(block, 'TARGET', 'item')} in ${value(block, 'ITERABLE', 'items')}:`); lines.push(...suite(block, 'BODY'));
        if (input(block, 'ELSE')) { emit('else:'); lines.push(...suite(block, 'ELSE')); } break;
      case 'act_repeat': emit(`for _ in range(${field(block, 'COUNT', '3')}):`); lines.push(...suite(block, 'BODY')); break;
      case 'act_match':
        emit(`match ${value(block, 'VALUE')}:`);
        if (input(block, 'CASES')) lines.push(...statements(input(block, 'CASES'), indent + '    '));
        else { emit('    case _:'); emit('        pass'); }
        break;
      case 'act_case': emit(`case ${field(block, 'PATTERN', '_')}${input(block, 'GUARD') ? ' if ' + value(block, 'GUARD') : ''}:`); lines.push(...suite(block, 'BODY')); break;
      case 'act_return': emit(`return${input(block, 'VALUE') ? ' ' + value(block, 'VALUE') : ''}`); break;
      case 'act_flow': emit(field(block, 'OP', 'pass')); break;
      case 'act_function': emit(`${checked(block, 'ASYNC') ? 'async ' : ''}def ${field(block, 'NAME', 'action')}(${field(block, 'PARAMS')})${field(block, 'RETURNS') ? ' -> ' + field(block, 'RETURNS') : ''}:`); lines.push(...suite(block, 'BODY')); break;
      case 'act_class': emit(`class ${field(block, 'NAME', 'MyComponent')}${field(block, 'BASES') ? '(' + field(block, 'BASES') + ')' : ''}:`); lines.push(...suite(block, 'BODY')); break;
      case 'act_decorator': emit(`@${value(block, 'VALUE', 'staticmethod')}`); lines.push(...statements(input(block, 'BODY'), indent)); break;
      case 'act_import_module': emit(`import ${field(block, 'MODULE', 'math')}`); break;
      case 'act_import_from': emit(`from ${field(block, 'MODULE', 'math')} import ${field(block, 'NAMES', 'sqrt')}`); break;
      case 'act_import_module_as': emit(`import ${field(block, 'MODULE', 'math')} as ${field(block, 'ALIAS', 'maths')}`); break;
      case 'act_import_from_as': emit(`from ${field(block, 'MODULE', 'math')} import ${field(block, 'NAMES', 'sqrt')} as ${field(block, 'ALIAS', 'root')}`); break;
      case 'act_import': emit(`${field(block, 'KIND', 'import') === 'from' ? 'from ' + field(block, 'MODULE', 'silicon') + ' import' : 'import'} ${field(block, 'NAMES', 'silicon')}`); break;
      case 'act_try':
        emit('try:'); lines.push(...suite(block, 'BODY')); lines.push(...statements(input(block, 'HANDLERS'), indent));
        if (input(block, 'ELSE')) { emit('else:'); lines.push(...suite(block, 'ELSE')); }
        if (input(block, 'FINALLY')) { emit('finally:'); lines.push(...suite(block, 'FINALLY')); } break;
      case 'act_except': emit(`except${field(block, 'TYPE') ? ' ' + field(block, 'TYPE') : ''}${field(block, 'NAME') ? ' as ' + field(block, 'NAME') : ''}:`); lines.push(...suite(block, 'BODY')); break;
      case 'act_raise': emit(`raise${input(block, 'VALUE') ? ' ' + value(block, 'VALUE') : ''}${input(block, 'CAUSE') ? ' from ' + value(block, 'CAUSE') : ''}`); break;
      case 'act_with': emit(`${checked(block, 'ASYNC') ? 'async ' : ''}with ${value(block, 'ITEMS', 'open("file.txt") as file')}:`); lines.push(...suite(block, 'BODY')); break;
      case 'act_assert': emit(`assert ${value(block, 'CONDITION', 'True')}${input(block, 'MESSAGE') ? ', ' + value(block, 'MESSAGE') : ''}`); break;
      case 'act_delete': emit(`del ${value(block, 'VALUE', 'value')}`); break;
      case 'act_scope': emit(`${field(block, 'KIND', 'global')} ${field(block, 'NAMES', 'value')}`); break;
      case 'act_comment': emit(`# ${field(block, 'TEXT')}`); break;
      case 'act_python': lines.push(...(block.extraState?.source ?? '').split('\n').map(line => indent + line)); break;
      default: emit(expression(block));
    }
  }
  return lines;
}
export function workspacePython(state: PythonWorkspace): string {
  const blocks = state.blocks?.blocks ?? [];
  function needsNitrogen(block: PythonBlock | undefined): boolean {
    if (!block) return false;
    if (block.enabled === false || block.disabledReasons?.length) return needsNitrogen(block.next?.block);
    if (['act_require', 'act_require_dynamic'].includes(kind(block))) return true;
    return needsNitrogen(block.next?.block) || Object.values(block.inputs ?? {}).some(entry => needsNitrogen(entry.block ?? entry.shadow));
  }
  const imported = blocks.some(first => {
    for (let block: PythonBlock | undefined = first; block; block = block.next?.block) {
      if (block.enabled === false || block.disabledReasons?.length) continue;
      if (kind(block) === 'act_import_from' && field(block, 'MODULE') === 'nitrogen' && ['require', '*'].includes(field(block, 'NAMES').trim())) return true;
      if (kind(block) === 'act_import_from_as' && field(block, 'MODULE') === 'nitrogen' && field(block, 'NAMES') === 'require' && field(block, 'ALIAS') === 'require') return true;
      if (kind(block) === 'act_import' && field(block, 'KIND') === 'from' && field(block, 'MODULE') === 'nitrogen'
        && field(block, 'NAMES').split(',').some(name => ['require', 'require as require', '*'].includes(name.trim()))) return true;
    }
    return false;
  });
  const lines = blocks.flatMap(block => statements(block));
  if (!imported && blocks.some(needsNitrogen)) lines.unshift('from nitrogen import require');
  return lines.join('\n');
}

/** Visual state is optional; preserve authoritative Python when a layout is too deep. */
export function boundedLayout(source: string, state: PythonWorkspace): PythonWorkspace {
  const pending: [unknown, number][] = [[state, 0]];
  let count = 0;
  while (pending.length) {
    const [value, depth] = pending.pop()!;
    if (++count > 20_000 || depth > 450) return { blocks: { languageVersion: 0, blocks: [{ type: 'act_python', extraState: { source } }] } };
    if (value && typeof value === 'object') for (const child of Object.values(value)) pending.push([child, depth + 1]);
  }
  return state;
}
