import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../../frontend/src/core/project/model.ts';
import { builtins, siliconMetadata } from '../../frontend/src/core/registry/registry.ts';
import { parseProject, validateProject } from '../../frontend/src/core/validation/project.ts';
import { addComponent, linkComponent, removeComponent, ProjectHistory } from '../../frontend/src/core/project/commands.ts';
import { allocateAliases, parseMatch, formatMatch, resolveSelector } from '../../frontend/src/core/graph/selectors.ts';
import { validateConnection } from '../../frontend/src/core/validation/connections.ts';
import { updatePythonDraft, acceptAnalysis } from '../../frontend/src/core/ir/model.ts';
import type { ScriptDocument } from '../../frontend/src/core/ir/model.ts';

function fixture() {
  const registry = builtins();
  const project = createProject('Workshop');
  const stage = addComponent(project, registry, 'silicon.Stage2D', { aliases: [], config: { width: 5, height: 3 } });
  const player = addComponent(project, registry, 'silicon.Entity', { parentId: stage, aliases: ['player', 'hero'] });
  return { registry, project, stage, player };
}
test('metadata catalog separates game root, decorators, state scopes and real APIs', () => {
  const registry = builtins();
  assert.ok(registry.list().length >= 28);
  assert.equal(registry.get('silicon.Game'), undefined);
  assert.equal(registry.require('silicon.Entity').state[0]?.scope.kind, 'literal');
  assert.equal(registry.require('silicon.Entity').members.find(m => m.name === 'spawn')?.kind, 'trigger');
  assert.equal(registry.require('silicon.Stage2D').members.find(m => m.name === 'place')?.kind, 'input');
  assert.equal(siliconMetadata.revision.length, 40);
  assert.throws(() => registry.register(registry.require('silicon.Entity')), /Duplicate/);
  const copy = registry.require('silicon.Entity'); copy.name = 'Changed';
  assert.equal(registry.require('silicon.Entity').name, 'Entity');
});
test('project serialization retains canonical identity, links, order, and unknown extensions', () => {
  const { project, registry, player } = fixture();
  linkComponent(project, player, project.game.id, ['player']);
  project.plugins.push({ id: 'missing-pack', version: '1', required: true });
  project.extensions['missing-pack'] = { unknown: ['retain', 42] };
  const restored = parseProject(JSON.parse(JSON.stringify(project)));
  assert.deepEqual(restored, project);
  assert.equal(restored.locations.filter(e => e.componentId === player).length, 2);
  assert.equal(validateProject(restored, registry).filter(e => e.severity === 'error').length, 0);
  assert.ok(validateProject(restored, registry).some(e => e.code === 'plugin.missing'));
});
test('boundary rejects wrong versions, invalid shapes, nonfinite values and malformed IR', () => {
  const project = createProject();
  assert.throws(() => parseProject({ ...project, schemaVersion: 2 }), /version/);
  assert.throws(() => parseProject({ ...project, revision: -1 }));
  assert.throws(() => parseProject({ ...project, game: { ...project.game, tickRate: NaN } }));
  assert.throws(() => parseProject({ ...project, extra: 'not a valid extension' }));
  assert.throws(() => parseProject({ ...project, scripts: { invalid: {} } }));
});
test('selectors preserve live exact-type, singleton, alias, wildcard and optional rules', () => {
  const { registry, project, player } = fixture();
  const selector = { id: 'selector', root: project.game.id, result: 'selection' as const,
    path: [{ typeId: 'silicon.Stage2D', match: parseMatch(null) }, { typeId: 'silicon.Entity', match: parseMatch('player,hero') }] };
  assert.deepEqual(resolveSelector(project, selector), [player]);
  selector.path[1]!.match = parseMatch('enemy*');
  assert.throws(() => resolveSelector(project, selector));
  const enemy = addComponent(project, registry, 'silicon.Entity', { parentId: Object.values(project.instances).find(i => i.typeId === 'silicon.Stage2D')!.id, aliases: ['enemy0'] });
  assert.deepEqual(resolveSelector(project, selector), [enemy]);
  selector.path[1]!.match = parseMatch('absent?');
  assert.deepEqual(resolveSelector(project, selector), []);
  assert.equal(formatMatch(parseMatch('player,enemy*,enemy#-1?')), 'player,enemy*,enemy#-1?');
  const named = addComponent(project, registry, 'silicon.Stage2D', { aliases: ['named'], config: { width: 4, height: 4 } });
  assert.notDeepEqual(resolveSelector(project, { ...selector, path: [selector.path[0]!] }), [named]);
});
test('numbered selectors follow insertion order; creation chooses first unused number', () => {
  assert.deepEqual(allocateAliases(['enemy#', 'enemy#'], ['enemy0', 'enemy2']), ['enemy1', 'enemy3']);
  assert.throws(() => allocateAliases(['bad*'], []));
  const { project, registry, stage } = fixture();
  const first = addComponent(project, registry, 'silicon.Entity', { parentId: stage, aliases: ['enemy9'] });
  const last = addComponent(project, registry, 'silicon.Entity', { parentId: stage, aliases: ['enemy2'] });
  const selector = { id: 'n', root: stage, result: 'selection' as const, path: [{ typeId: 'silicon.Entity', match: parseMatch('enemy#') }] };
  assert.deepEqual(resolveSelector(project, selector), [last]);
  selector.path[0]!.match = parseMatch('enemy#-1');
  assert.deepEqual(resolveSelector(project, selector), [first]);
});
test('transactions reject cycles and alias collisions atomically; undo revisions remain monotonic', () => {
  const { registry, project, stage, player } = fixture();
  const history = new ProjectHistory(project, registry);
  assert.throws(() => history.transact(p => linkComponent(p, stage, player, ['cycle'])), /cycle/);
  assert.deepEqual(history.project, project);
  assert.throws(() => history.transact(p => addComponent(p, registry, 'silicon.Entity', { parentId: stage, aliases: ['player'] })), /Duplicate/);
  const changed = history.transact(p => { p.instances[player]!.name = 'Hero'; });
  assert.equal(changed.revision, 1);
  assert.equal(history.undo().instances[player]?.name, 'Entity');
  assert.equal(history.redo().revision, 3);
  assert.equal(history.project.instances[player]?.name, 'Hero');
});
test('component deletion removes canonical descendants and links without deleting unrelated instances', () => {
  const { project, registry, stage, player } = fixture();
  linkComponent(project, player, project.game.id, ['shortcut']);
  const input = addComponent(project, registry, 'silicon.InputMap', { runtimeId: 'keys' });
  removeComponent(project, stage);
  assert.deepEqual(Object.keys(project.instances), [input]);
  assert.equal(project.locations.length, 1);
  assert.deepEqual(validateProject(project, registry), []);
});
test('framework default warns about payload inference; strict mode is opt-in', () => {
  const registry = builtins();
  const output = registry.require('silicon.InputMap').members.find(m => m.name === 'action')!;
  const input = registry.require('silicon.GridMovement').members.find(m => m.name === 'command')!;
  assert.deepEqual(validateConnection(output, input), { allowed: true, warnings: [] });
  const different = { ...input, parameters: input.parameters.map(p => ({ ...p, annotation: 'int' })) };
  assert.equal(validateConnection(output, different).allowed, true);
  assert.equal(validateConnection(output, different, 'strict').allowed, false);
  assert.equal(validateConnection({ ...output, returns: 'str' }, different).allowed, false);
  assert.equal(validateConnection(input, output).allowed, false);
});
test('Python drafts retain last valid IR; late analysis cannot replace newer edits', () => {
  const script: ScriptDocument = { id: 's', ownerId: 'game', name: 'startup', role: 'startup', parameters: [],
    program: { version: 1, body: [], regions: {} }, synchronizedSource: '# previous\n', draft: null };
  const first = updatePythonDraft(script, 'if :\n');
  const invalid = acceptAnalysis(first, 1, 'if :\n', null, ['Syntax error']);
  assert.deepEqual(invalid.program, script.program);
  assert.equal(invalid.draft?.source, 'if :\n');
  const newer = updatePythonDraft(invalid, '# unsupported\nmatch value:\n    case _: pass\n');
  assert.equal(acceptAnalysis(newer, 1, 'if :\n', script.program, []), newer);
  const program = { version: 1 as const, body: [{ id: 'raw', kind: 'raw' as const, regionId: 'region' }],
    regions: { region: { id: 'region', context: 'module' as const, reason: 'Preserved', source: newer.draft!.source } } };
  const synced = acceptAnalysis(newer, 2, newer.draft!.source, program, []);
  assert.equal(synced.draft, null);
  assert.equal(synced.program.regions['region']?.source, newer.draft!.source);
});
test('large projects validate without recursive hierarchy walks or position-based ordering', () => {
  const registry = builtins(), project = createProject('Large');
  for (let index = 0; index < 1000; index++) addComponent(project, registry, 'silicon.Score', { aliases: [`score${index}`] });
  const order = [...project.game.order];
  Object.values(project.editor.nodes).forEach((node, index) => { node.x = 1000 - index; });
  assert.deepEqual(project.game.order, order);
  assert.deepEqual(validateProject(project, registry), []);
});
test('deleting a trigger target prunes its edge while preserving other ordered targets', () => {
  const { registry, project, player, stage } = fixture();
  const other = addComponent(project, registry, 'silicon.Entity', { parentId: stage, aliases: ['other'] });
  project.triggerRules.push({ id: crypto.randomUUID(), source: { kind: 'game', member: 'start' },
    targets: [player, other].map(id => ({ kind: 'trigger', selector: { id: crypto.randomUUID(), root: id, path: [], result: 'selection' }, member: 'spawn' })) });
  const history = new ProjectHistory(project, registry);
  const deleted = history.transact(p => removeComponent(p, player));
  assert.equal(deleted.triggerRules[0]?.targets.length, 1);
  const retained = deleted.triggerRules[0]!.targets[0]!;
  assert.equal(retained.kind === 'trigger' && retained.selector.root, other);
  assert.equal(history.undo().triggerRules[0]?.targets.length, 2);
});
test('semantic validation is pure and rejects malformed identities and missing constructor args', () => {
  const { project, registry, stage } = fixture();
  const before = JSON.stringify(project);
  validateProject(project, registry);
  assert.equal(JSON.stringify(project), before);
  delete project.instances[stage]!.config['width'];
  assert.ok(validateProject(project, registry).some(d => d.code === 'constructor.required'));
  assert.throws(() => resolveSelector(project, { id: 's', root: 'constructor', path: [], result: 'selection' }), /Unknown/);
  const polluted = parseProject(JSON.parse(JSON.stringify({ ...project, instances: { ['__proto__']: project.instances[stage] } })));
  assert.ok(validateProject(polluted, registry).some(d => d.code === 'identity.reserved'));
});
test('registry rejects invalid names and inheritance cycles without partial registration', () => {
  const registry = builtins();
  const original = registry.require('silicon.Entity');
  assert.throws(() => registry.register({ ...original, id: 'custom.invalid', name: 'class' }), /Python/);
  const a = { ...original, id: 'custom.A', name: 'A', module: 'custom', bases: ['B'] };
  const b = { ...original, id: 'custom.B', name: 'B', module: 'custom', bases: ['A'] };
  registry.register(a);
  assert.throws(() => registry.register(b), /cycle/);
  assert.equal(registry.get('custom.B'), undefined);
});
