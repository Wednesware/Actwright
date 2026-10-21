import { tmpdir } from 'node:os';
import { join } from 'node:path';
/** Extend the starter board with an input-driven runtime entity. */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { importAct, exportAct } from '../frontend/src/import-export/archive.ts';
import { addScript } from '../frontend/src/scripting/scripts.ts';
import { acceptAnalysis } from '../frontend/src/core/ir/model.ts';
import { reconcileScriptOutputs } from '../frontend/src/core/project/script-outputs.ts';
import { exportPython } from '../frontend/src/scripting/python.ts';
import { validateProject } from '../frontend/src/core/validation/project.ts';
import { builtins } from '../frontend/src/core/registry/registry.ts';
import type { Json } from '../frontend/src/core/registry/types.ts';

const project = (await importAct(readFileSync('examples/player-on-a-board.act'))).project;
project.id = crypto.randomUUID(); project.name = project.game.name = 'Interactive Player Board';
const source = `import re

print("Create a new entity on top of the player (@).")
entity_id = input("New entity ID: ").strip()
while not re.fullmatch(r"[A-Za-z][A-Za-z0-9_]*", entity_id) or entity_id == "player":
    print("Use a letter followed by letters, numbers or underscores; player is already taken.")
    entity_id = input("New entity ID: ").strip()
entity_name = input("New entity name: ").strip()
while not entity_name:
    print("Please enter a name.")
    entity_name = input("New entity name: ").strip()

new_entity = new_instance("silicon.Entity", entity_id, game["board"], entity_name)
new_entity.spawn()
game["board"].ins.place(entity_id, 2, 1)
game["renderer"].ins.set_glyph(entity_id, entity_name[0].upper())
print("Created entity ID:", entity_id, "| name:", new_entity.name)
emit("print_board")
`;
const directory = mkdtempSync(join(tmpdir(), 'actwright-interactive-example-'));
const path = join(directory, 'source.py');
writeFileSync(path, source);
const result = spawnSync('python3', ['-c', 'import json, sys; from pathlib import Path; from backend.app.analysis.scripts import analyze_script; print(json.dumps(analyze_script(Path(sys.argv[1]).read_text())))', path], { encoding: 'utf-8', timeout: 5000 });
rmSync(directory, { recursive: true, force: true });
if (result.status !== 0) throw new Error(result.stderr);
const analysis = JSON.parse(result.stdout);
if (!analysis.program || analysis.diagnostics.length) throw new Error(JSON.stringify(analysis.diagnostics));
const id = addScript(project, project.game.id, 'start', source);
project.scripts[id]!.name = 'Ask for an entity';
project.scripts[id] = acceptAnalysis(project.scripts[id]!, 1, source, analysis.program, []);
const layouts = project.extensions['actwright.blockLayouts'] as Record<string, Json>;
layouts[id] = { source, state: analysis.blocks };
const levels = project.extensions['actwright.scriptLevels'] as Record<string, Json>;
levels[id] = 1;
reconcileScriptOutputs(project, id, source, analysis.outputs);
const renderer = project.game.order.find(key => project.instances[key]!.typeId === 'silicon.StageRenderer')!;
project.slotEdges.push({ id: crypto.randomUUID(), sourceId: id, output: 'print_board', targetId: renderer, input: 'draw', enabled: true });
project.editor.nodes[id] = { x: 130, y: 940, collapsed: true };
const issues = validateProject(project, builtins());
if (issues.length) throw new Error(JSON.stringify(issues));
const archive = await exportAct(project);
writeFileSync('examples/interactive-player-board.act', archive);
writeFileSync('examples/interactive-player-board.py', exportPython((await importAct(archive)).project));
console.log('Created examples/interactive-player-board.act and examples/interactive-player-board.py');
