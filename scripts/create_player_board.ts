/** Generate a small editable Act and its runnable Python export. */
import { writeFileSync } from 'node:fs';
import { createProject } from '../frontend/src/core/project/model.ts';
import { addComponent } from '../frontend/src/core/project/commands.ts';
import { builtins } from '../frontend/src/core/registry/registry.ts';
import { validateProject } from '../frontend/src/core/validation/project.ts';
import { reconcileScriptOutputs } from '../frontend/src/core/project/script-outputs.ts';
import { acceptAnalysis } from '../frontend/src/core/ir/model.ts';
import { exportAct, importAct } from '../frontend/src/import-export/archive.ts';
import { addScript, rawProgram } from '../frontend/src/scripting/scripts.ts';
import { workspacePython, type PythonBlock, type PythonWorkspace } from '../frontend/src/scripting/blocks.ts';
import { exportPython } from '../frontend/src/scripting/python.ts';
import type { Json } from '../frontend/src/core/registry/types.ts';

const project = createProject('Player on a Board'), registry = builtins();
const board = addComponent(project, registry, 'silicon.Stage2D', { runtimeId: 'board', config: { width: 6, height: 4 } });
const player = addComponent(project, registry, 'silicon.Entity', { parentId: board, aliases: ['player'], config: { name: 'Player' } });
const renderer = addComponent(project, registry, 'silicon.StageRenderer', { runtimeId: 'renderer', config: { stage_id: 'board', empty: '.', border: true, clear: false, ansi: false } });
project.instances[board]!.name = 'Board'; project.instances[player]!.name = 'Player'; project.instances[renderer]!.name = 'Board printer';
project.instances[renderer]!.state['glyphs'] = { player: '@' };

const text = (value: string): PythonBlock => ({ type: 'act_text', fields: { TEXT: value } });
const number = (value: number): PythonBlock => ({ type: 'act_number', fields: { NUM: value } });
const printBoard: PythonBlock = { type: 'act_output', fields: { NAME: 'print_board' } };
const placePlayer: PythonBlock = { type: 'act_output', fields: { NAME: 'place_player' }, inputs: {
  ARGS: { block: { type: 'act_args', extraState: { items: 3 }, inputs: { ITEM0: { block: text('player') }, ITEM1: { block: number(2) }, ITEM2: { block: number(1) } } } },
}, next: { block: printBoard } };
const spawnPlayer: PythonBlock = { type: 'act_expression', inputs: { VALUE: { block: { type: 'act_call', inputs: {
  FUNCTION: { block: { type: 'act_attribute', fields: { NAME: 'spawn' }, inputs: { OBJECT: { block: { type: 'act_component', fields: { ID: player }, extraState: { componentId: player } } } } } },
} } } }, next: { block: placePlayer } };
const state: PythonWorkspace = { blocks: { languageVersion: 0, blocks: [spawnPlayer] } };
const source = workspacePython(state), scriptId = addScript(project, project.game.id, 'start', source);
project.scripts[scriptId]!.name = 'Place player and print board';
project.scripts[scriptId] = acceptAnalysis(project.scripts[scriptId]!, 1, source, rawProgram(source), []);
project.extensions['actwright.blockLayouts'] = { [scriptId]: { source, state: state as unknown as Json } };
project.extensions['actwright.scriptLevels'] = { [scriptId]: 1 };
reconcileScriptOutputs(project, scriptId, source, ['place_player', 'print_board']);
project.slotEdges.push(
  { id: crypto.randomUUID(), sourceId: scriptId, output: 'place_player', targetId: board, input: 'place', enabled: true },
  { id: crypto.randomUUID(), sourceId: scriptId, output: 'print_board', targetId: renderer, input: 'draw', enabled: true },
);
project.editor.nodes[board] = { x: 960, y: 60, collapsed: false };
project.editor.nodes[player] = { x: 130, y: -180, collapsed: false };
project.editor.nodes[renderer] = { x: 960, y: 510, collapsed: false };
project.editor.nodes[scriptId] = { x: 130, y: 250, collapsed: false };
const issues = validateProject(project, registry);
if (issues.length) throw new Error(JSON.stringify(issues));
const archive = await exportAct(project);
const restored = (await importAct(archive)).project;
writeFileSync('examples/player-on-a-board.act', archive);
writeFileSync('examples/player-on-a-board.py', exportPython(restored));
console.log('Created examples/player-on-a-board.act and examples/player-on-a-board.py');
