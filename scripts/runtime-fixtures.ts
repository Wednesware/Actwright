/** Integration fixtures are generated through the production exporter, then executed by Python tests. */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createProject, type ActProject } from '../frontend/src/core/project/model.ts';
import { addScript, rawProgram } from '../frontend/src/scripting/scripts.ts';
import { acceptAnalysis } from '../frontend/src/core/ir/model.ts';
import { exportPython } from '../frontend/src/scripting/python.ts';
import { parseProject } from '../frontend/src/core/validation/project.ts';
import { addComponent } from '../frontend/src/core/project/commands.ts';
import { builtins } from '../frontend/src/core/registry/registry.ts';
import sample from '../examples/first-act.project.json' with { type: 'json' };
const destination = process.argv[2]!;
function script(project: ActProject, event: string, source: string) {
  const id = addScript(project, project.game.id, event, source), current = project.scripts[id]!;
  project.scripts[id] = acceptAnalysis(current, 1, source, rawProgram(source), []);
}
const lifecycle = createProject('Hello');
for (const event of ['start', 'pause', 'resume', 'stop']) script(lifecycle, event, `print(${JSON.stringify(event)})`);
writeFileSync(join(destination, 'lifecycle.py'), exportPython(lifecycle, { embeddedRuntime: true }));
const graph = parseProject(structuredClone(sample));
script(graph, 'start', 'print("hello")');
writeFileSync(join(destination, 'graph.py'), exportPython(graph, { embeddedRuntime: true }));
const numbered = createProject();
addComponent(numbered, builtins(), 'silicon.Entity', { aliases: ['enemy0'], config: { name: 'First' } });
numbered.triggerRules.push({ id: crypto.randomUUID(), source: { kind: 'game', member: 'start' }, targets: [{ kind: 'trigger', member: 'spawn', selector: {
  id: crypto.randomUUID(), root: numbered.game.id, result: 'selection', path: [{ typeId: 'silicon.Entity', match: { kind: 'ids', optional: false, tokens: [{ kind: 'numbered', prefix: 'enemy', offset: 0 }] } }],
} }] });
writeFileSync(join(destination, 'numbered.py'), exportPython(numbered, { embeddedRuntime: true }));
const literal = createProject('Multiline');
script(literal, 'start', 'message = """hello\nworld"""\nprint(repr(message))\n# source comment retained\n');
writeFileSync(join(destination, 'literal.py'), exportPython(literal, { embeddedRuntime: true }));
const outputs = createProject('Script outputs');
const score = addComponent(outputs, builtins(), 'silicon.Score', { aliases: ['score'] });
const stage = addComponent(outputs, builtins(), 'silicon.Stage2D', { aliases: ['stage'], config: { width: 8, height: 8 } });
const player = addComponent(outputs, builtins(), 'silicon.Entity', { parentId: stage, aliases: ['player'], config: { name: 'Player' } });
const emitId = addScript(outputs, outputs.game.id, 'start', `assert parent is game\nemit("points", 3)\nemit("place", "player", 2, y=4)\nprint(game[components[${JSON.stringify(score)}]].value)`);
const spawnId = addScript(outputs, player, 'spawn', `assert parent.component is components[${JSON.stringify(stage)}]\nassert self.component is components[${JSON.stringify(player)}]\nprint("bound parent")`);
for (const id of [emitId, spawnId]) {
  const current = outputs.scripts[id]!;
  outputs.scripts[id] = acceptAnalysis(current, 1, current.draft!.source, rawProgram(current.draft!.source), []);
}
const { reconcileScriptOutputs } = await import('../frontend/src/core/project/script-outputs.ts');
reconcileScriptOutputs(outputs, emitId, outputs.scripts[emitId]!.synchronizedSource, ['points', 'place']);
outputs.slotEdges.push({ id: crypto.randomUUID(), sourceId: emitId, output: 'points', targetId: score, input: 'add', enabled: true }, { id: crypto.randomUUID(), sourceId: emitId, output: 'place', targetId: stage, input: 'place', enabled: true });
outputs.triggerRules.push({ id: crypto.randomUUID(), source: { kind: 'game', member: 'start' }, targets: [{ kind: 'trigger', member: 'spawn', selector: { id: crypto.randomUUID(), root: player, path: [], result: 'selection' } }] });
writeFileSync(join(destination, 'outputs.py'), exportPython(outputs, { embeddedRuntime: true }));

const creation = createProject('Creation helpers');
script(creation, 'start', `board = new_instance("silicon.Stage2D", "board", game, 6, 4)
player = new_instance("silicon.Entity", "player", board, name="Nova")
assert player.name == "Nova"
assert not player.spawned
player.spawn()
board.ins.place("player", 2, 1)
score = new_singleton("silicon.Score", player)
score.ins.add(5)
assert score.value == 5
try:
    new_singleton("silicon.Score", player)
except KeyError:
    pass
else:
    raise AssertionError("Duplicate singleton replaced existing component")
try:
    new_instance("silicon.Entity", "player", board)
except KeyError:
    pass
else:
    raise AssertionError("Duplicate ID replaced existing component")
assert parent is game
print("created", player.name, score.value)
`);
writeFileSync(join(destination, 'creation.py'), exportPython(creation, { embeddedRuntime: true }));

const warned = createProject('Warnings');
script(warned, 'start', 'warning("Careful")');
writeFileSync(join(destination, 'warning.py'), exportPython(warned, { embeddedRuntime: true }));
writeFileSync(join(destination, 'nitrogen.py'), exportPython(warned));
