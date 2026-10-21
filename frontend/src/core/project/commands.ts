import type { ActProject, ComponentInstance, TreeLocation } from './model.ts';
import type { ComponentRegistry } from '../registry/registry.ts';
import type { Json } from '../registry/types.ts';
import { allocateAliases } from '../graph/selectors.ts';
import { resolveSelector } from '../graph/selectors.ts';
import { parseProject, validateProject } from '../validation/project.ts';

export function addComponent(project: ActProject, registry: ComponentRegistry, typeId: string,
  options: { parentId?: string; aliases?: string[]; config?: Record<string, Json>; runtimeId?: string } = {}): string {
  const definition = registry.require(typeId);
  const id = crypto.randomUUID();
  const config: Record<string, Json> = {};
  for (const param of definition.constructor.parameters) if (param.default.kind === 'literal') config[param.name] = structuredClone(param.default.value);
  Object.assign(config, options.config ?? {});
  const parentId = options.parentId ?? project.game.id;
  const used = project.locations.filter(e => e.parentId === parentId && project.instances[e.componentId]?.typeId === typeId).flatMap(e => e.aliases);
  const aliases = allocateAliases(options.runtimeId ? [options.runtimeId] : options.aliases ?? [`${definition.name.toLowerCase()}#`], used);
  const instance: ComponentInstance = { id, typeId, name: definition.name, config, state: {}, scripts: [],
    construction: options.runtimeId ? { kind: 'add', runtimeId: options.runtimeId } : { kind: 'tree' } };
  project.instances[id] = instance;
  project.game.order.push(id);
  project.locations.push({ id: crypto.randomUUID(), parentId, componentId: id, kind: 'canonical', aliases, singleton: !aliases.length });
  project.editor.nodes[id] = { x: 100 + Object.keys(project.instances).length * 30, y: 100, collapsed: false };
  return id;
}
export function linkComponent(project: ActProject, componentId: string, parentId: string, aliases: string[]): void {
  const typeId = project.instances[componentId]?.typeId;
  if (!typeId) throw new Error('Cannot link a missing component');
  const used = project.locations.filter(e => e.parentId === parentId && project.instances[e.componentId]?.typeId === typeId).flatMap(e => e.aliases);
  const entry: TreeLocation = { id: crypto.randomUUID(), parentId, componentId, kind: 'link', aliases: allocateAliases(aliases, used), singleton: !aliases.length };
  project.locations.push(entry);
}
/** Unlinking can invalidate live trigger selectors that used that shortcut. */
export function unlinkComponent(project: ActProject, locationId: string): void {
  const entry = project.locations.find(location => location.id === locationId);
  if (!entry || entry.kind !== 'link') throw new Error('Choose a shortcut link to unlink.');
  project.locations = project.locations.filter(location => location.id !== locationId);
  const resolves = (endpoint: { selector: Parameters<typeof resolveSelector>[1] }) => {
    try { resolveSelector(project, endpoint.selector); return true; } catch { return false; }
  };
  project.triggerRules = project.triggerRules.filter(rule => rule.source.kind === 'game' || resolves(rule.source));
  for (const rule of project.triggerRules) rule.targets = rule.targets.filter(target => target.kind === 'script' || resolves(target));
  project.triggerRules = project.triggerRules.filter(rule => rule.targets.length > 0);
}
export function removeComponent(project: ActProject, id: string): void {
  const removed = new Set([id]);
  let size: number;
  do {
    size = removed.size;
    for (const entry of project.locations) if (entry.kind === 'canonical' && removed.has(entry.parentId)) removed.add(entry.componentId);
  } while (removed.size !== size);
  const endpointRemoved = (endpoint: { selector: Parameters<typeof resolveSelector>[1] }): boolean => {
    if (removed.has(endpoint.selector.root)) return true;
    try { const ids = resolveSelector(project, endpoint.selector); return ids.length > 0 && ids.every(target => removed.has(target)); }
    catch { return false; } // Keep pre-existing invalid selectors for diagnosis.
  };
  project.triggerRules = project.triggerRules.filter(rule => rule.source.kind === 'game' || !endpointRemoved(rule.source));
  for (const rule of project.triggerRules) rule.targets = rule.targets.filter(target => target.kind === 'script' || !endpointRemoved(target));
  project.triggerRules = project.triggerRules.filter(rule => rule.targets.length > 0);
  for (const target of removed) { delete project.instances[target]; delete project.editor.nodes[target]; const sizes = project.extensions['actwright.nodeSizes'] as Record<string, Json> | undefined; if (sizes) delete sizes[target]; }
  project.locations = project.locations.filter(e => !removed.has(e.componentId) && !removed.has(e.parentId));
  project.game.order = project.game.order.filter(target => !removed.has(target));
  project.slotEdges = project.slotEdges.filter(e => !removed.has(e.sourceId) && !removed.has(e.targetId));
  for (const [scriptId, script] of Object.entries(project.scripts)) if (removed.has(script.ownerId)) {
    delete project.scripts[scriptId]; delete project.editor.nodes[scriptId];
    for (const key of ['actwright.blockLayouts', 'actwright.scriptLevels', 'actwright.scriptOutputs', 'actwright.scriptDescriptions', 'actwright.nodeSizes']) {
      const entries = project.extensions[key] as Record<string, Json> | undefined; if (entries) delete entries[scriptId];
    }
    project.slotEdges = project.slotEdges.filter(edge => edge.sourceId !== scriptId && edge.targetId !== scriptId);
  }
  // Remove callbacks owned by deleted components, without removing other targets.
  project.triggerRules = project.triggerRules.filter(rule => {
    const endpoints = [...(rule.source.kind === 'component' ? [rule.source] : []), ...rule.targets.filter(t => t.kind === 'trigger')];
    rule.targets = rule.targets.filter(t => t.kind !== 'script' || !!project.scripts[t.scriptId]);
    return !endpoints.some(e => removed.has(e.selector.root)) && rule.targets.length > 0;
  });
}

/** All writes become validated, atomic transactions; adapters never mutate state. */
export class ProjectHistory {
  #current: ActProject;
  #past: ActProject[] = [];
  #future: ActProject[] = [];
  #registry: ComponentRegistry;
  constructor(project: ActProject, registry: ComponentRegistry) {
    this.#registry = registry;
    this.#current = structuredClone(parseProject(project));
  }
  get project(): ActProject { return structuredClone(this.#current); }
  get canUndo(): boolean { return this.#past.length > 0; }
  get canRedo(): boolean { return this.#future.length > 0; }
  transact(change: (project: ActProject) => void): ActProject {
    const next = this.project;
    change(next);
    parseProject(next);
    const errors = validateProject(next, this.#registry).filter(i => i.severity === 'error');
    if (errors.length) throw new Error(errors.map(i => i.message).join('; '));
    this.#past.push(this.project);
    if (this.#past.length > 100) this.#past.shift();
    next.revision = this.#current.revision + 1; next.updatedAt = new Date().toISOString();
    this.#current = next; this.#future = [];
    return this.project;
  }
  #restore(next: ActProject): ActProject {
    this.#current = { ...structuredClone(next), revision: this.#current.revision + 1, updatedAt: new Date().toISOString() };
    return this.project;
  }
  undo(): ActProject { const previous = this.#past.pop(); if (previous) { this.#future.push(this.project); return this.#restore(previous); } return this.project; }
  redo(): ActProject { const next = this.#future.pop(); if (next) { this.#past.push(this.project); return this.#restore(next); } return this.project; }
}
