import { writeFileSync } from 'node:fs';
import { createProject } from '../frontend/src/core/project/model.ts';
import { addComponent, linkComponent } from '../frontend/src/core/project/commands.ts';
import { builtins } from '../frontend/src/core/registry/registry.ts';
import { parseMatch } from '../frontend/src/core/graph/selectors.ts';
import { parseProject, validateProject } from '../frontend/src/core/validation/project.ts';

const registry = builtins();
const project = createProject('First Act');
const stage = addComponent(project, registry, 'silicon.Stage2D', { runtimeId: 'stage', config: { width: 8, height: 6 } });
const player = addComponent(project, registry, 'silicon.Entity', { parentId: stage, aliases: ['player', 'hero'] });
linkComponent(project, player, project.game.id, ['player']);
const keys = addComponent(project, registry, 'silicon.InputMap', { runtimeId: 'keys' });
const movement = addComponent(project, registry, 'silicon.GridMovement', { runtimeId: 'movement', config: { entity: 'player', stage_id: 'stage' } });
project.slotEdges.push({ id: crypto.randomUUID(), sourceId: keys, output: 'action', targetId: movement, input: 'command', enabled: true });
project.triggerRules.push({ id: crypto.randomUUID(), source: { kind: 'game', member: 'start' },
  targets: [{ kind: 'trigger', selector: { id: crypto.randomUUID(), root: project.game.id,
    path: [{ typeId: 'silicon.Entity', match: parseMatch('player') }], result: 'selection' }, member: 'spawn' }] });
const errors = validateProject(parseProject(project), registry).filter(d => d.severity === 'error');
if (errors.length) throw new Error(JSON.stringify(errors));
writeFileSync('examples/first-act.project.json', JSON.stringify(project, null, 2) + '\n');
