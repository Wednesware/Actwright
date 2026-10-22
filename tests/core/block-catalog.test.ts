import { test } from 'node:test';
import assert from 'node:assert/strict';
import Blockly from 'blockly/core';
import { registerBlocks, toolbox, translateWorkspace } from '../../frontend/src/scripting/blockCatalog.ts';
import { expression, workspacePython, type PythonWorkspace } from '../../frontend/src/scripting/blocks.ts';

registerBlocks();
registerBlocks(); // Registration is safe when more than one editor initializes.

test('catalogue exposes distinct numeric and import forms, with common function blocks first', () => {
  for (const level of [1, 2] as const) {
    const catalogue = toolbox(level).contents;
    const entries = (name: string) => catalogue.find(category => category.name === name)?.contents?.map(block => block.type) ?? [];
    assert.ok(!entries('Values').includes(`act_l${level}_value`));
    assert.ok(!entries('Values').includes(`act_l${level}_number`));
    assert.ok(entries('Values').includes(`act_l${level}_int`));
    assert.ok(entries('Values').includes(`act_l${level}_float`));
    assert.ok(entries('Messages').includes(`act_l${level}_warning`));
    assert.ok(!entries('Messages').includes(`act_l${level}_output`));
    assert.deepEqual(entries('Functions & Classes').slice(0, 4), ['attribute', 'call', 'expression', 'args'].map(name => `act_l${level}_${name}`));
    assert.deepEqual(entries('Modules').slice(1), ['import_from', 'import_module', 'import_from_as', 'import_module_as'].map(name => `act_l${level}_${name}`));
  }
});

test('count-controlled operators and attributes survive Blockly serialization and level switches', () => {
  for (const level of [1, 2] as const) {
    const workspace = new Blockly.Workspace();
    try {
      const binary = workspace.newBlock(`act_l${level}_binary`);
      binary.setFieldValue(4, 'COUNT');
      assert.ok(binary.getInput('ITEM3'));
      binary.setFieldValue('*', 'OP2');
      binary.setFieldValue('-', 'OP3');
      for (const [input, value] of [['LEFT', '1'], ['RIGHT', '2'], ['ITEM2', '3'], ['ITEM3', '4']]) {
        const number = workspace.newBlock(`act_l${level}_int`);
        number.setFieldValue(value!, 'NUM');
        binary.getInput(input!)!.connection!.connect(number.outputConnection!);
      }
      const attribute = workspace.newBlock(`act_l${level}_attribute`);
      attribute.setFieldValue(4, 'COUNT');
      attribute.setFieldValue('person', 'NAME'); attribute.setFieldValue('name', 'NAME2'); attribute.setFieldValue('upper', 'NAME3');
      const saved = translateWorkspace(Blockly.serialization.workspaces.save(workspace) as PythonWorkspace);
      const generated = workspacePython(saved);
      assert.ok(generated.includes('(1 + 2 * 3 - 4)'));
      assert.ok(generated.includes('game.person.name.upper'));
      workspace.clear();
      Blockly.serialization.workspaces.load(translateWorkspace(saved, level === 1 ? 2 : 1), workspace);
      assert.equal(workspacePython(translateWorkspace(Blockly.serialization.workspaces.save(workspace) as PythonWorkspace)), generated);
    } finally { workspace.dispose(); }
  }
});

test('numeric fields reject the wrong type without rounding large integer values', () => {
  assert.equal(expression({ type: 'act_int', fields: { NUM: '123456789012345678901234567890' } }), '123456789012345678901234567890');
  assert.throws(() => expression({ type: 'act_int', fields: { NUM: '1.5' } }), /whole integer/);
  assert.throws(() => expression({ type: 'act_int', fields: { NUM: '01' } }), /whole integer/);
  assert.throws(() => expression({ type: 'act_float', fields: { NUM: 'True' } }), /decimal/);
  assert.equal(expression({ type: 'act_float', fields: { NUM: '1' } }), '1.0');
  assert.equal(expression({ type: 'act_float', fields: { NUM: '1.' } }), '1.');
  const workspace = new Blockly.Workspace();
  try {
    const integer = workspace.newBlock('act_l1_int'); integer.setFieldValue('2.5', 'NUM');
    assert.equal(integer.getFieldValue('NUM'), '0');
    integer.setFieldValue('123456789012345678901234567890', 'NUM');
    assert.equal(integer.getFieldValue('NUM'), '123456789012345678901234567890');
    const require = workspace.newBlock('act_l1_require');
    assert.equal(require.getInput('PUB'), null);
    assert.equal(require.getFieldValue('PUB'), 'si');
  } finally { workspace.dispose(); }
});

test('legacy require blocks retain literal or dynamic arguments when reopened', () => {
  const literal: PythonWorkspace = { blocks: { languageVersion: 0, blocks: [{ type: 'act_require', inputs: { PUB: { block: { type: 'act_text', fields: { TEXT: 'mg.color' } } } } }] } };
  const migrated = translateWorkspace(literal, 2);
  assert.equal(migrated.blocks!.blocks[0]!.fields!['PUB'], 'mg.color');
  assert.equal(workspacePython(migrated), workspacePython(literal));
  const dynamic: PythonWorkspace = { blocks: { languageVersion: 0, blocks: [{ type: 'act_require', inputs: { PUB: { block: { type: 'act_name', fields: { NAME: 'publication' } } } } }] } };
  assert.equal(expression(translateWorkspace(dynamic, 1).blocks!.blocks[0]!), 'require(publication)');
  assert.equal(workspacePython(translateWorkspace(dynamic, 1)), workspacePython(dynamic));
});
