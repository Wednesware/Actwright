import * as Blockly from 'blockly/core';
import type { PythonBlock, PythonWorkspace } from './blocks.ts';

type Arg = Record<string, unknown>;
const v = (name: string): Arg => ({ type: 'input_value', name });
const body = (name = 'BODY'): Arg => ({ type: 'input_statement', name });
const text = (name: string, value = ''): Arg => ({ type: 'field_input', name, text: value });
const choice = (name: string, values: string[]): Arg => ({ type: 'field_dropdown', name, options: values.map(value => [value, value]) });
const checkbox = (name: string): Arg => ({ type: 'field_checkbox', name, checked: false });
type Row = [string, string, Arg[]];
interface Spec { name: string; category: string; expression?: boolean; rows: Row[] }
const specs: Spec[] = [];
function define(name: string, category: string, expression: boolean, ...rows: Row[]) { specs.push({ name, category, expression, rows }); }
define('print', 'Messages', false, ['Show a message: %1', 'print (%1)', [v('VALUE')]]);
define('input', 'Messages', true, ['Ask for text: %1', 'input (%1)', [v('PROMPT')]]);
define('value', 'Values', true, ['Value: %1', 'Value: %1', [text('CODE', 'game')]]);
define('output', 'Messages', false, ['Send output %1 with arguments %2', 'emit (%1, %2)', [text('NAME', 'result'), v('ARGS')]]);
define('text', 'Values', true, ['Text: %1', 'str %1', [text('TEXT', 'hello')]]);
define('number', 'Values', true, ['Number: %1', '%1', [text('NUM', '0')]]);
define('boolean', 'Values', true, ['True or false: %1', '%1', [choice('VALUE', ['True', 'False'])]]);
define('none', 'Values', true, ['No value', 'None', []]);
define('name', 'Variables', true, ['Value named %1', '%1', [text('NAME', 'value')]]);
define('assign', 'Variables', false, ['Set %1 to %2', '%1 = %2', [v('TARGET'), v('VALUE')]]);
define('annotated', 'Variables', false, ['Set %1 with type %2 to %3', '%1 : %2 = %3', [v('TARGET'), v('TYPE'), v('VALUE')]]);
define('augassign', 'Variables', false, ['Change %1 using %2 and %3', '%1 %2 = %3', [v('TARGET'), choice('OP', ['+', '-', '*', '/', '//', '%', '**', '&', '|', '^', '<<', '>>', '@']), v('VALUE')]]);
define('scope', 'Variables', false, ['Use %1 variable(s): %2', '%1 %2', [choice('KIND', ['global', 'nonlocal']), text('NAMES', 'value')]]);
define('delete', 'Variables', false, ['Remove %1', 'del %1', [v('VALUE')]]);
define('binary', 'Operators', true, ['Combine %1 %2 %3', '(%1 %2 %3)', [v('LEFT'), choice('OP', ['+', '-', '*', '/', '//', '%', '**', '@', 'and', 'or', '==', '!=', '<', '<=', '>', '>=', 'in', 'not in', 'is', 'is not', '&', '|', '^', '<<', '>>']), v('RIGHT')]]);
define('unary', 'Operators', true, ['Apply %1 to %2', '(%1 %2)', [choice('OP', ['not', '-', '+', '~']), v('VALUE')]]);
define('conditional', 'Operators', true, ['Choose %1 when %2 otherwise %3', '(%1 if %2 else %3)', [v('THEN'), v('CONDITION'), v('ELSE')]]);
define('if', 'Control flow', false, ['If %1', 'if %1 :', [v('CONDITION')]], ['Then %1', '%1', [body()]], ['Otherwise %1', 'else : %1', [body('ELSE')]]);
define('while', 'Control flow', false, ['Repeat while %1', 'while %1 :', [v('CONDITION')]], ['Do %1', '%1', [body()]], ['When the loop finishes %1', 'else : %1', [body('ELSE')]]);
define('for', 'Control flow', false, ['For each %1 in %2 (async %3)', 'for %1 in %2 : (async %3)', [v('TARGET'), v('ITERABLE'), checkbox('ASYNC')]], ['Do %1', '%1', [body()]], ['When the loop finishes %1', 'else : %1', [body('ELSE')]]);
define('repeat', 'Control flow', false, ['Repeat %1 times', 'for _ in range(%1) :', [{ type: 'field_number', name: 'COUNT', value: 3, min: 0, precision: 1 }]], ['Do %1', '%1', [body()]]);
define('flow', 'Control flow', false, ['Loop action: %1', '%1', [choice('OP', ['break', 'continue', 'pass'])]]);
define('return', 'Functions & Classes', false, ['Return a result: %1', 'return %1', [v('VALUE')]]);
define('function', 'Functions & Classes', false, ['Define action %1 with inputs %2 (async %3)', 'def %1 (%2) : (async %3)', [text('NAME', 'action'), text('PARAMS'), checkbox('ASYNC')]], ['Result type (optional) %1', '-> %1', [text('RETURNS')]], ['Do %1', '%1', [body()]]);
define('class', 'Functions & Classes', false, ['Define class %1 based on %2', 'class %1 (%2) :', [text('NAME', 'MyComponent'), text('BASES')]], ['Members %1', '%1', [body()]]);
define('decorator', 'Functions & Classes', false, ['Decorate with %1', '@ %1', [v('VALUE')]], ['Definition %1', '%1', [body()]]);
define('call', 'Functions & Classes', true, ['Run action %1 with %2', '%1 (%2)', [v('FUNCTION'), v('ARGS')]]);
define('expression', 'Functions & Classes', false, ['Do %1', '%1', [v('VALUE')]]);
define('attribute', 'Functions & Classes', true, ['Property %2 of %1', '%1 . %2', [v('OBJECT'), text('NAME', 'name')]]);
define('keyword', 'Functions & Classes', true, ['Named argument %1 with value %2', '%1 = %2', [text('NAME', 'name'), v('VALUE')]]);
define('unpack', 'Functions & Classes', true, ['Unpack %1 from %2', '%1 %2', [choice('OP', ['*', '**']), v('VALUE')]]);
define('lambda', 'Functions & Classes', true, ['Small action with inputs %1 gives %2', 'lambda %1 : %2', [text('PARAMS', 'value'), v('VALUE')]]);
define('await', 'Functions & Classes', true, ['Wait for %1', 'await %1', [v('VALUE')]]);
define('yield', 'Functions & Classes', true, ['Produce %1 (from collection %2)', 'yield %1 (from %2)', [v('VALUE'), checkbox('FROM')]]);
define('index', 'Collections', true, ['Item %2 from %1', '%1 [%2]', [v('OBJECT'), v('KEY')]]);
define('slice', 'Collections', true, ['Range from %1 to %2 stepping %3', '%1 : %2 : %3', [v('START'), v('STOP'), v('STEP')]]);
define('pair', 'Collections', true, ['Key %1 has value %2', '%1 : %2', [v('KEY'), v('VALUE')]]);
define('comprehension', 'Collections', true, ['Build a %1 using %2', '%1 comprehension: %2', [choice('KIND', ['list', 'set', 'dict', 'generator']), v('VALUE')]], ['For each %1 in %2 where %3', 'for %1 in %2 if %3', [v('TARGET'), v('ITERABLE'), v('CONDITION')]]);
define('require', 'Modules', true, ['Load publication %1 release %2 (optional)', 'require (%1, %2)', [v('PUB'), v('REL')]]);
define('import', 'Modules', false, ['Load using %1 from module %2 names %3', '%1 %2 import %3', [choice('KIND', ['import', 'from']), text('MODULE', 'silicon'), text('NAMES', 'silicon')]]);
define('try', 'Errors', false, ['Try these actions %1', 'try : %1', [body()]], ['Handle errors %1', '%1', [body('HANDLERS')]], ['On success %1', 'else : %1', [body('ELSE')]], ['Always %1', 'finally : %1', [body('FINALLY')]]);
define('except', 'Errors', false, ['Catch error type %1 named %2', 'except %1 as %2 :', [text('TYPE', 'Exception'), text('NAME', 'error')]], ['Do %1', '%1', [body()]]);
define('raise', 'Errors', false, ['Report error %1 caused by %2', 'raise %1 from %2', [v('VALUE'), v('CAUSE')]]);
define('assert', 'Errors', false, ['Require %1 or report %2', 'assert %1 , %2', [v('CONDITION'), v('MESSAGE')]]);
define('with', 'Errors', false, ['Use resources %1 (async %2)', 'with %1 : (async %2)', [v('ITEMS'), checkbox('ASYNC')]], ['Do %1', '%1', [body()]]);
define('withitem', 'Errors', true, ['Resource %1 named %2', '%1 as %2', [v('VALUE'), text('NAME', 'resource')]]);
define('comment', 'Messages', false, ['Note: %1', '# %1', [text('TEXT', 'A note for later')]]);

export const blockCategories = ['Messages', 'Values', 'Variables', 'Operators', 'Control flow', 'Functions & Classes', 'Collections', 'Modules', 'Errors'];
export const blockNames = [...specs.map(spec => spec.name), 'collection', 'args'];
const palette = [260, 210, 330, 190, 160, 290, 230, 80, 25];
const typeName = (name: string, level: 1 | 2) => `act_l${level}_${name}`;
type DynamicBlock = Blockly.Block & { itemCount: number; pythonSource?: string; updateItems: (count: number) => void };

export function registerBlocks(): void {
  for (const level of [1, 2] as const) {
    for (const spec of specs) {
      const type = typeName(spec.name, level); if (Blockly.Blocks[type]) continue;
      const definition: Record<string, unknown> = { type, colour: palette[blockCategories.indexOf(spec.category)], inputsInline: true };
      spec.rows.forEach((row, index) => { definition[`message${index}`] = row[level - 1]; definition[`args${index}`] = row[2]; });
      if (spec.name === 'value') definition['tooltip'] = 'A Python expression, such as parent.name.upper(). It has access to game, parent, self and components.';
      if (spec.name === 'output') definition['tooltip'] = 'Creates a named output socket on this Script. Connect it to a component input; use an Arguments block to send several arguments.';
      if (spec.name === 'require') definition['tooltip'] = 'Nitrogen require(pub, rel=None): load a publication or submodule; leave release empty for the latest release. Requires the Python wwn package.';
      if (spec.expression) definition['output'] = null; else { definition['previousStatement'] = null; definition['nextStatement'] = null; }
      Blockly.defineBlocksWithJsonArray([definition]);
    }
    for (const name of ['collection', 'args']) {
      Blockly.Blocks[typeName(name, level)] = {
        init(this: DynamicBlock) {
          this.itemCount = 0;
          const header = this.appendDummyInput('HEADER');
          if (name === 'collection') header.appendField(new Blockly.FieldDropdown([['List', 'list'], ['Tuple', 'tuple'], ['Set', 'set'], ['Dictionary', 'dict']]), 'KIND');
          else header.appendField(level === 1 ? 'Arguments' : 'args');
          header.appendField(level === 1 ? 'with items:' : 'items:').appendField(new Blockly.FieldNumber(2, 0, 20, 1, count => { this.updateItems(Number(count)); return Number(count); }), 'COUNT');
          this.setOutput(true); this.setColour(230); this.setInputsInline(false); this.updateItems(2);
        },
        updateItems(this: DynamicBlock, count: number) {
          if (!Number.isInteger(count) || count < 0 || count > 20) return;
          for (let i = this.itemCount; i < count; i++) this.appendValueInput(`ITEM${i}`).appendField(level === 1 ? `Item ${i + 1}` : `${i + 1}:`);
          for (let i = this.itemCount - 1; i >= count; i--) this.removeInput(`ITEM${i}`);
          this.itemCount = count;
        },
        saveExtraState(this: DynamicBlock) { return { items: this.itemCount }; },
        loadExtraState(this: DynamicBlock, state: { items: number }) { this.updateItems(state.items); this.setFieldValue(state.items, 'COUNT'); },
      };
    }
    for (const name of ['python', 'raw_expression']) Blockly.Blocks[typeName(name, level)] = {
      init(this: DynamicBlock) {
        this.appendDummyInput().appendField('Preserved source · edit in Level 3');
        if (name === 'raw_expression') this.setOutput(true); else { this.setPreviousStatement(true); this.setNextStatement(true); }
        this.setColour(210); this.pythonSource = '';
      },
      saveExtraState(this: DynamicBlock) { return { source: this.pythonSource }; },
      loadExtraState(this: DynamicBlock, state: { source: string }) { this.pythonSource = state.source; },
    };
  }
}

/** Layouts use canonical types so switching levels changes words, never behavior. */
export function translateWorkspace(state: PythonWorkspace, level?: 1 | 2): PythonWorkspace {
  const clone = structuredClone(state);
  function translate(block: PythonBlock): void {
    const name = block.type.replace(/^act_(l[12]_)?/, '');
    block.type = level ? typeName(name, level) : `act_${name}`;
    if (name === 'print' && block.fields?.['TEXT'] !== undefined && !block.inputs?.['VALUE']) {
      block.inputs = { ...block.inputs, VALUE: { block: { type: level ? typeName('text', level) : 'act_text', fields: { TEXT: String(block.fields['TEXT']) } } } }; delete block.fields['TEXT'];
    }
    if (name === 'if' && block.fields?.['CONDITION'] !== undefined && !block.inputs?.['CONDITION']) {
      block.inputs = { ...block.inputs, CONDITION: { block: { type: 'act_raw_expression', extraState: { source: String(block.fields['CONDITION']) } } } }; delete block.fields['CONDITION'];
    }
    for (const entry of Object.values(block.inputs ?? {})) { if (entry.block) translate(entry.block); if (entry.shadow) translate(entry.shadow); }
    if (block.next) translate(block.next.block);
  }
  clone.blocks?.blocks.forEach(translate); return clone;
}
export function toolbox(level: 1 | 2) {
  const block = (name: string) => ({ kind: 'block', type: typeName(name, level), ...(name === 'input' ? { inputs: { PROMPT: { shadow: { type: typeName('text', level), fields: { TEXT: 'Enter text: ' } } } } } : name === 'require' ? { inputs: { PUB: { shadow: { type: typeName('text', level), fields: { TEXT: 'magnesium' } } } } } : {}) });
  return { kind: 'categoryToolbox', contents: [...blockCategories.map((name, index) => ({ kind: 'category', name, colour: String(palette[index]), contents: [
    ...specs.filter(spec => spec.category === name).map(spec => block(spec.name)),
    ...(name === 'Collections' ? [block('collection')] : []), ...(name === 'Functions & Classes' ? [block('args')] : []),
  ] })), { kind: 'category', id: 'actwright-components', name: 'Components', colour: '260', custom: 'ACTWRIGHT_COMPONENTS' }] };
}
