import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../../frontend/src/core/project/model.ts';
import { addScript, removeScript, rawProgram } from '../../frontend/src/scripting/scripts.ts';
import { exportPython, pythonLiteral } from '../../frontend/src/scripting/python.ts';
import { acceptAnalysis, updatePythonDraft } from '../../frontend/src/core/ir/model.ts';
import { validateProject } from '../../frontend/src/core/validation/project.ts';
import { builtins } from '../../frontend/src/core/registry/registry.ts';
import { addComponent, removeComponent } from '../../frontend/src/core/project/commands.ts';
import { exportAct, importAct } from '../../frontend/src/import-export/archive.ts';

function checked(project: ReturnType<typeof createProject>, id: string) {
  const script = project.scripts[id]!, draft = script.draft!;
  project.scripts[id] = acceptAnalysis(script, draft.revision, draft.source, rawProgram(draft.source), []);
}
test('scripts preserve checked IR and pending/invalid Python through .act save and reload', async () => {
  const project = createProject('Hello');
  const id = addScript(project, project.game.id, 'start');
  assert.equal(validateProject(project, builtins()).filter(d => d.severity === 'error').length, 0);
  assert.throws(() => exportPython(project), /Check Python/);
  checked(project, id);
  const before = structuredClone(project.scripts[id]!.program);
  const draft = updatePythonDraft(project.scripts[id]!, 'print(');
  project.scripts[id] = acceptAnalysis(draft, draft.draft!.revision, 'print(', null, ['Line 1: unclosed parenthesis']);
  const loaded = await importAct(await exportAct(project));
  assert.deepEqual(loaded.project.scripts[id]!.program, before);
  assert.equal(loaded.project.scripts[id]!.draft!.source, 'print(');
  assert.throws(() => exportPython(loaded.project), /Check Python/);
  removeScript(loaded.project, id);
  assert.deepEqual(loaded.project.triggerRules, []);
});
test('Python export quotes JSON values correctly and rejects unsupported data without losing .act data', () => {
  assert.equal(pythonLiteral({ enabled: true, value: null, items: [false, 'hello\nworld'] }), '{"enabled": True, "value": None, "items": [False, "hello\\nworld"]}');
  const project = createProject('Hello\n"world"');
  assert.match(exportPython(project), /def build_game\(\)/);
  project.sourceModules['source'] = { id: 'source', path: 'module.py', source: 'print(1)', encoding: 'utf-8' };
  assert.throws(() => exportPython(project), /additional source modules/);
});
test('deleting a scripted component removes its callbacks while preserving other scripts', () => {
  const project = createProject(), registry = builtins();
  const entity = addComponent(project, registry, 'silicon.Entity', { aliases: ['player'], config: { name: 'Player' } });
  const first = addScript(project, entity, 'spawn'), second = addScript(project, project.game.id, 'start');
  removeComponent(project, entity);
  assert.equal(project.scripts[first], undefined);
  assert.ok(project.scripts[second]);
  assert.equal(project.triggerRules.length, 1);
  assert.equal(validateProject(project, registry).filter(d => d.severity === 'error').length, 0);
});
test('Python export uses lifecycle wiring, literal source bodies and a standalone entry point', () => {
  const project = createProject('Hello');
  const id = addScript(project, project.game.id, 'start'); checked(project, id);
  const source = exportPython(project);
  assert.match(source, /game.start >> \[_script_0\]/);
  assert.ok(source.includes(JSON.stringify('print("hello")')));
  assert.match(source, /await game.run\(\)/);
});

test('block generator handles serialized booleans and numeric spelling without changing Python semantics', async () => {
  const { workspacePython } = await import('../../frontend/src/scripting/blocks.ts');
  const expression = { type: 'act_expression', inputs: { VALUE: { block: { type: 'act_await', inputs: { VALUE: { block: { type: 'act_name', fields: { NAME: 'request' } } } } } } } };
  const source = workspacePython({ blocks: { languageVersion: 0, blocks: [{ type: 'act_function', fields: { NAME: 'load', PARAMS: '', ASYNC: true }, inputs: { BODY: { block: expression } } }] } });
  assert.match(source, /async def load\(\):\n    await request/);
  assert.equal(workspacePython({ blocks: { languageVersion: 0, blocks: [{ type: 'act_number', fields: { NUM: '1.0' } }] } }), '1.0');
  assert.equal(workspacePython({ blocks: { languageVersion: 0, blocks: [{ type: 'act_collection', fields: { KIND: 'dict' }, extraState: { items: 1 } }] } }), '{None: None}');
});

test('Nitrogen require blocks generate publication/release calls and import require only when needed', async () => {
  const { workspacePython } = await import('../../frontend/src/scripting/blocks.ts');
  const publication = { type: 'act_text', fields: { TEXT: 'magnesium.color' } };
  const release = { type: 'act_text', fields: { TEXT: '26.5' } };
  const require = { type: 'act_require', inputs: { PUB: { block: publication } } };
  assert.equal(workspacePython({ blocks: { languageVersion: 0, blocks: [require] } }), 'from nitrogen import require\nrequire("magnesium.color")');
  assert.equal(workspacePython({ blocks: { languageVersion: 0, blocks: [{ ...require, enabled: false }] } }), '');
  const explicit = { type: 'act_import', fields: { KIND: 'from', MODULE: 'nitrogen', NAMES: 'require' }, next: { block: { ...require, inputs: { ...require.inputs, REL: { block: release } } } } };
  assert.equal(workspacePython({ blocks: { languageVersion: 0, blocks: [explicit] } }), 'from nitrogen import require\nrequire("magnesium.color", "26.5")');
});

test('Value and component blocks generate compact expressions with stable identities', async () => {
  const { workspacePython } = await import('../../frontend/src/scripting/blocks.ts');
  const { componentReferences } = await import('../../frontend/src/scripting/referenceData.ts');
  const project = createProject();
  const id = addComponent(project, builtins(), 'silicon.Score');
  const generate = (block: object) => workspacePython({ blocks: { languageVersion: 0, blocks: [block] } });
  assert.equal(generate({ type: 'act_value', fields: { CODE: 'Class.person.name.upper()' } }), '(Class.person.name.upper())');
  assert.equal(generate({ type: 'act_component', fields: { ID: id } }), `game[components[${JSON.stringify(id)}]]`);
  assert.equal(generate({ type: 'act_component', fields: { ID: '$game' } }), 'game');
  assert.equal(generate({ type: 'act_component', fields: { ID: '$parent' } }), 'parent');
  const before = componentReferences(project, id);
  project.instances[id]!.name = 'Renamed';
  const after = componentReferences(project, id);
  assert.equal(after.at(-1)!.id, before.at(-1)!.id);
  assert.equal(after.at(-1)!.type, 'Score');
  assert.match(after.at(-1)!.icon, /^data:image\/svg/);
});

test('script outputs preserve signals in archives, prune removed ports, and clean up with their owner', async () => {
  const { blockOutputNames, scriptOutputNames, reconcileScriptOutputs } = await import('../../frontend/src/core/project/script-outputs.ts');
  const project = createProject(), registry = builtins();
  const owner = addComponent(project, registry, 'silicon.Entity', { config: { name: 'Player' } });
  const score = addComponent(project, registry, 'silicon.Score');
  const id = addScript(project, owner, 'spawn', 'emit("points", 3)'); checked(project, id);
  reconcileScriptOutputs(project, id, project.scripts[id]!.synchronizedSource, ['points', 'points']);
  project.slotEdges.push({ id: crypto.randomUUID(), sourceId: id, output: 'points', targetId: score, input: 'add', enabled: true });
  assert.equal(validateProject(project, registry).filter(d => d.severity === 'error').length, 0);
  const loaded = (await importAct(await exportAct(project))).project;
  assert.deepEqual(scriptOutputNames(loaded, id), ['points']);
  assert.equal(loaded.slotEdges[0]!.sourceId, id);
  assert.ok(exportPython(loaded).includes('script_outputs['));
  reconcileScriptOutputs(loaded, id, 'emit("renamed", 3)', ['renamed']);
  assert.equal(loaded.slotEdges.length, 0);
  assert.deepEqual(blockOutputNames({ blocks: { blocks: [{ type: 'act_l2_output', fields: { NAME: 'points' }, next: { block: { type: 'act_output', fields: { NAME: 'off' }, enabled: false } } }] } }), ['points']);
  removeComponent(project, owner);
  assert.equal(project.slotEdges.length, 0);
  assert.equal(scriptOutputNames(project, id).length, 0);
  assert.equal(validateProject(project, registry).filter(d => d.severity === 'error').length, 0);
});

test('unlinking prunes only unresolved trigger endpoints and leaves component identity intact', async () => {
  const { linkComponent, unlinkComponent, ProjectHistory } = await import('../../frontend/src/core/project/commands.ts');
  const project = createProject(), registry = builtins();
  const stage = addComponent(project, registry, 'silicon.Stage2D', { config: { width: 8, height: 8 } });
  const entity = addComponent(project, registry, 'silicon.Entity', { parentId: stage, config: { name: 'Player' } });
  linkComponent(project, entity, project.game.id, ['shortcut']);
  const selector = { id: crypto.randomUUID(), root: project.game.id, path: [{ typeId: 'silicon.Entity', match: { kind: 'ids' as const, optional: false, tokens: [{ kind: 'exact' as const, value: 'shortcut' }] } }], result: 'selection' as const };
  const id = addScript(project, project.game.id, 'start');
  project.triggerRules[0]!.targets.unshift({ kind: 'trigger', selector, member: 'spawn' });
  const history = new ProjectHistory(project, registry);
  const result = history.transact(p => unlinkComponent(p, p.locations.find(location => location.kind === 'link')!.id));
  assert.deepEqual(result.triggerRules[0]!.targets, [{ kind: 'script', scriptId: id }]);
  assert.ok(result.instances[entity]);
  assert.equal(result.game.order.length, 2);
  assert.equal(history.undo().triggerRules[0]!.targets.length, 2);
});

test('Ask for text blocks generate standard Python input calls', async () => {
  const { workspacePython } = await import('../../frontend/src/scripting/blocks.ts');
  assert.equal(workspacePython({ blocks: { languageVersion: 0, blocks: [{ type: 'act_input', inputs: { PROMPT: { block: { type: 'act_text', fields: { TEXT: 'Entity name: ' } } } } }] } }), 'input("Entity name: ")');
});

test('long Blockly chains validate by JSON depth and retain source when visual state exceeds limits', async () => {
  const { boundedLayout, workspacePython } = await import('../../frontend/src/scripting/blocks.ts');
  const { parseProject } = await import('../../frontend/src/core/validation/project.ts');
  const chain = (length: number) => {
    let block: import('../../frontend/src/scripting/blocks.ts').PythonBlock = { type: 'act_print' };
    for (let i = 1; i < length; i++) block = { type: 'act_print', next: { block } };
    return { blocks: { languageVersion: 0, blocks: [block] } };
  };
  const project = createProject();
  const id = addScript(project, project.game.id, 'start'); checked(project, id);
  const state = chain(100), source = workspacePython(state);
  project.extensions['actwright.blockLayouts'] = { [id]: { source, state } };
  assert.deepEqual(parseProject(project).extensions, project.extensions);
  const fallback = boundedLayout(source, chain(300));
  assert.equal(fallback.blocks!.blocks[0]!.type, 'act_python');
  assert.equal(workspacePython(fallback), source);
  const loaded = await importAct(await exportAct(project));
  assert.deepEqual(loaded.project.extensions, project.extensions);
});

test('component creation blocks use runtime helpers with parent, ID and constructor arguments in both levels', async () => {
  const { expression } = await import('../../frontend/src/scripting/blocks.ts');
  for (const level of [1, 2]) {
    assert.equal(expression({ type: `act_l${level}_new_instance`, fields: { TYPE: 'silicon.Entity' }, inputs: {
      ID: { block: { type: 'act_text', fields: { TEXT: 'player' } } },
      PARENT: { block: { type: 'act_component', fields: { ID: '$parent' } } },
      ARGS: { block: { type: 'act_keyword', fields: { NAME: 'name' }, inputs: { VALUE: { block: { type: 'act_text', fields: { TEXT: 'Nova' } } } } } },
    } }), 'new_instance("silicon.Entity", "player", parent, name="Nova")');
    assert.equal(expression({ type: `act_l${level}_new_singleton`, fields: { TYPE: 'silicon.Score' } }), 'new_singleton("silicon.Score", game)');
  }
});

test('unified connections execute lifecycle → script → script → component trigger', async () => {
  const { reconcileScriptOutputs } = await import('../../frontend/src/core/project/script-outputs.ts');
  const { spawnSync } = await import('node:child_process');
  const { existsSync } = await import('node:fs');
  const silicon = process.env['SILICON_SOURCE'] ?? '/tmp/actwright-silicon';
  if (!existsSync(`${silicon}/silicon/__init__.py`)) return;
  const project = createProject('Unified connections');
  const entity = addComponent(project, builtins(), 'silicon.Entity', { aliases: ['player'], config: { name: 'Player' } });
  const first = addScript(project, project.game.id, 'start', 'emit("next", 7)'); checked(project, first);
  const second = addScript(project, project.game.id, 'start', 'print("CHAIN", value)\nemit("spawn")'); checked(project, second);
  project.scripts[second]!.parameters = [{ name: 'value', kind: 'positionalOrKeyword', annotation: null, default: { kind: 'missing' } }];
  reconcileScriptOutputs(project, first, project.scripts[first]!.synchronizedSource, ['next']);
  reconcileScriptOutputs(project, second, project.scripts[second]!.synchronizedSource, ['spawn']);
  project.triggerRules = [];
  project.slotEdges.push(
    { id: 'start-wire', sourceId: project.game.id, output: 'start', targetId: first, input: 'run', enabled: true },
    { id: 'script-wire', sourceId: first, output: 'next', targetId: second, input: 'run', enabled: true },
    { id: 'trigger-wire', sourceId: second, output: 'spawn', targetId: entity, input: 'spawn', enabled: true },
  );
  assert.deepEqual(validateProject(project, builtins()).filter(d => d.severity === 'error'), []);
  const restored = (await importAct(await exportAct(project))).project;
  const result = spawnSync('python3', ['-c', `${exportPython(restored, { embeddedRuntime: true }).replace('if __name__ == "__main__":', 'if False:')}\ng = build_game()\ng.start()\nassert g[g.actwright_components[${pythonLiteral(entity)}]].state.spawned\ng.stop()\n`], { encoding: 'utf-8', env: { ...process.env, PYTHONPATH: silicon } });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /CHAIN 7/);
});
