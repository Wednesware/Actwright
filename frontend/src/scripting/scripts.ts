import type { ActProject } from '../core/project/model.ts';
import { builtins } from '../core/registry/registry.ts';
import type { Program, ScriptDocument } from '../core/ir/model.ts';

export function rawProgram(source: string): Program {
  const regionId = crypto.randomUUID();
  return { version: 1, body: [{ id: crypto.randomUUID(), kind: 'raw', regionId }],
    regions: { [regionId]: { id: regionId, source, reason: 'Python source', context: 'suite' } } };
}
export function addScript(project: ActProject, ownerId: string, event: string, source = 'print("hello")'): string {
  const id = crypto.randomUUID();
  const instance = project.instances[ownerId];
  const definition = instance && (project.definitions[instance.typeId] ?? builtins().get(instance.typeId));
  const parameters = definition?.members.find(member => member.name === event && member.kind === 'trigger')?.parameters ?? [];
  project.scripts[id] = { id, ownerId, role: 'handler', name: event, parameters, program: rawProgram(source), synchronizedSource: source,
    draft: { source, revision: 1, status: 'pending', diagnostics: [] } };
  if (ownerId !== project.game.id) project.instances[ownerId]!.scripts.push(id);
  project.triggerRules.push({ id: crypto.randomUUID(), source: ownerId === project.game.id
    ? { kind: 'game', member: event as 'start' | 'pause' | 'resume' | 'stop' }
    : { kind: 'component', selector: { id: crypto.randomUUID(), root: ownerId, path: [], result: 'selection' }, member: event },
    targets: [{ kind: 'script', scriptId: id }] });
  return id;
}
export function removeScript(project: ActProject, id: string): void {
  delete project.scripts[id]; delete project.editor.nodes[id];
  for (const key of ['actwright.blockLayouts', 'actwright.scriptLevels', 'actwright.scriptOutputs', 'actwright.scriptDescriptions', 'actwright.nodeSizes']) {
    const values = project.extensions[key]; if (values && typeof values === 'object' && !Array.isArray(values)) delete values[id];
  }
  project.slotEdges = project.slotEdges.filter(edge => edge.sourceId !== id && edge.targetId !== id);
  for (const instance of Object.values(project.instances)) instance.scripts = instance.scripts.filter(key => key !== id);
  for (const rule of project.triggerRules) rule.targets = rule.targets.filter(target => target.kind !== 'script' || target.scriptId !== id);
  project.triggerRules = project.triggerRules.filter(rule => rule.targets.length > 0);
}
export function scriptSource(script: ScriptDocument): string { return script.draft?.source ?? script.synchronizedSource; }
