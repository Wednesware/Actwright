import shape from '../../../../schemas/project.v1.schema.json' with { type: 'json' };
import { checkShape, isRecord } from './schema.ts';
import type { ActProject } from '../project/model.ts';
import { SILICON_REVISION } from '../project/model.ts';
import type { ComponentRegistry } from '../registry/registry.ts';
import { resolveSelector } from '../graph/selectors.ts';
import { scriptOutputNames, scriptOutputMember } from '../project/script-outputs.ts';
import { validateConnection } from './connections.ts';

export interface Diagnostic { code: string; severity: 'error' | 'warning'; message: string; subjectId: string }
export function parseProject(value: unknown): ActProject {
  const errors = checkShape(value, shape);
  if (errors.length) throw new Error(`Invalid Act: ${errors.slice(0, 5).map(e => `${e.path}: ${e.message}`).join('; ')}`);
  return value as ActProject;
}
export function validateProject(project: ActProject, registry: ComponentRegistry): Diagnostic[] {
  const issues: Diagnostic[] = [];
  const issue = (code: string, subjectId: string, message: string, severity: 'error' | 'warning' = 'error') => issues.push({ code, subjectId, message, severity });
  if (project.siliconRevision !== SILICON_REVISION) issue('silicon.revision', project.id, 'Project targets a different Silicon revision', 'warning');
  const definition = (id: string) => project.definitions[id] ?? registry.get(id);
  // Reject prototype-sensitive IDs at the boundary instead of indexing inherited
  // properties on ordinary JSON maps. User config/property names remain allowed.
  const reserved = new Set(['__proto__', 'prototype', 'constructor', 'toString', 'valueOf', 'hasOwnProperty']);
  const mapKeys = [project.instances, project.definitions, project.scripts, project.sourceModules, project.assets];
  if (mapKeys.some(map => Object.keys(map).some(key => reserved.has(key)))) {
    issue('identity.reserved', project.id, 'Reserved map ID'); return issues;
  }
  project = { ...project, instances: Object.assign(Object.create(null), project.instances),
    definitions: Object.assign(Object.create(null), project.definitions), scripts: Object.assign(Object.create(null), project.scripts),
    sourceModules: Object.assign(Object.create(null), project.sourceModules), assets: Object.assign(Object.create(null), project.assets) };
  const allIds = new Set([project.id, project.game.id]);
  function unique(id: string): void {
    if (!id || allIds.has(id)) issue('identity.duplicate', id, 'Empty or duplicate stable ID');
    allIds.add(id);
  }
  for (const [key, instance] of Object.entries(project.instances)) {
    unique(instance.id);
    if (key !== instance.id) issue('identity.key', key, 'Instance map key differs from ID');
    if (!definition(instance.typeId)) issue('definition.missing', key, `Missing definition ${instance.typeId}; data preserved`, 'warning');
    const def = definition(instance.typeId);
    for (const parameter of def?.constructor.parameters ?? []) {
      if (!parameter.kind.startsWith('var') && parameter.default.kind === 'missing' && !Object.hasOwn(instance.config, parameter.name)) issue('constructor.required', key, `Missing required constructor argument: ${parameter.name}`);
    }
    for (const scriptId of instance.scripts) if (!project.scripts[scriptId]) issue('script.missing', key, `Missing script ${scriptId}`);
  }
  const order = project.game.order;
  if (new Set(order).size !== order.length || order.length !== Object.keys(project.instances).length || order.some(id => !project.instances[id])) issue('order.invalid', project.game.id, 'Execution order must include every instance exactly once');
  const canonical = new Map<string, number>();
  const aliasSets = new Map<string, Set<string>>();
  const singletons = new Set<string>();
  const adjacency = new Map<string, string[]>();
  for (const entry of project.locations) {
    unique(entry.id);
    const instance = project.instances[entry.componentId];
    if (!instance) issue('location.target', entry.id, 'Location references a missing component');
    if (entry.parentId !== project.game.id && !project.instances[entry.parentId]) issue('location.parent', entry.id, 'Parent does not exist');
    if (entry.kind === 'canonical') {
      canonical.set(entry.componentId, (canonical.get(entry.componentId) ?? 0) + 1);
      if (entry.parentId !== project.game.id && order.indexOf(entry.parentId) >= order.indexOf(entry.componentId)) issue('order.parent', entry.id, 'Parent must be constructed before child');
      if (instance?.construction.kind === 'add' && (entry.parentId !== project.game.id || entry.singleton || entry.aliases.length !== 1 || entry.aliases[0] !== instance.construction.runtimeId)) issue('construction.add', entry.id, 'game.add requires a root location with its runtime ID');
    }
    const group = JSON.stringify([entry.parentId, instance?.typeId]);
    const aliases = aliasSets.get(group) ?? new Set<string>();
    if (entry.singleton) {
      if (entry.aliases.length || singletons.has(group)) issue('location.singleton', entry.id, 'Singleton must be unique for its parent/type and have no aliases');
      singletons.add(group);
    } else if (!entry.aliases.length) issue('location.alias', entry.id, 'Named location requires an alias');
    for (const alias of entry.aliases) {
      if (aliases.has(alias) || !alias || /[,*#]/.test(alias) || alias.endsWith('?')) issue('location.alias', entry.id, `Invalid or duplicate alias ${alias}`);
      aliases.add(alias);
    }
    aliasSets.set(group, aliases);
    adjacency.set(entry.parentId, [...(adjacency.get(entry.parentId) ?? []), entry.componentId]);
  }
  for (const id of Object.keys(project.instances)) if (canonical.get(id) !== 1) issue('location.canonical', id, 'Each instance requires exactly one canonical location');
  // Iterative DFS avoids stack overflow for large authored hierarchies.
  const done = new Set<string>();
  for (const root of adjacency.keys()) {
    const active = new Set<string>();
    const stack: [string, boolean][] = [[root, false]];
    while (stack.length) {
      const [id, leaving] = stack.pop()!;
      if (leaving) { active.delete(id); done.add(id); continue; }
      if (active.has(id)) { issue('location.cycle', id, 'Hierarchy/link cycle'); break; }
      if (done.has(id)) continue;
      active.add(id); stack.push([id, true]);
      for (const child of adjacency.get(id) ?? []) stack.push([child, false]);
    }
  }
  const runtimeIds = Object.values(project.instances).flatMap(i => i.construction.kind === 'add' ? [i.construction.runtimeId] : []);
  if (new Set(runtimeIds).size !== runtimeIds.length) issue('runtime.id', project.game.id, 'Duplicate flat runtime ID');
  for (const edge of project.slotEdges) {
    unique(edge.id);
    const source = project.instances[edge.sourceId], target = project.instances[edge.targetId];
    const script = project.scripts[edge.sourceId], callback = project.scripts[edge.targetId];
    const gameSource = edge.sourceId === project.game.id;
    if ((!source && !script && !gameSource) || (!target && !callback)) { issue('connection.target', edge.id, 'Connection references missing endpoint'); continue; }
    const output = script ? scriptOutputNames(project, script.id).includes(edge.output) ? scriptOutputMember(edge.output) : undefined
      : gameSource ? ['start', 'pause', 'resume', 'stop'].includes(edge.output) ? scriptOutputMember(edge.output) : undefined
      : definition(source!.typeId)?.members.find(m => m.name === edge.output && ['output', 'trigger'].includes(m.kind));
    const input = callback ? edge.input === 'run' ? scriptOutputMember('run') : undefined
      : definition(target!.typeId)?.members.find(m => m.name === edge.input && ['input', 'trigger'].includes(m.kind));
    if ((!script && !gameSource && !definition(source!.typeId)) || (!callback && !definition(target!.typeId))) continue;
    if (!input || !output) { issue('connection.member', edge.id, 'Connection references missing input/output'); continue; }
    // Trigger and script callbacks use Silicon's callable connection protocol.
    if (callback || gameSource || output.kind === 'trigger' || input.kind === 'trigger') continue;
    const result = validateConnection(output, input, project.game.validation);
    for (const message of result.warnings) issue('connection.type', edge.id, message, result.allowed ? 'warning' : 'error');
  }
  const validateEndpoint = (endpoint: { selector: Parameters<typeof resolveSelector>[1]; member: string }, id: string) => {
    try {
      for (const targetId of resolveSelector(project, endpoint.selector)) {
        const instance = project.instances[targetId];
        const def = instance && definition(instance.typeId);
        if (def && !def.members.some(m => m.name === endpoint.member && m.kind === 'trigger')) issue('trigger.member', id, 'Expected a trigger member');
      }
    } catch (error) { issue('selector.invalid', id, String(error)); }
  };
  for (const rule of project.triggerRules) {
    unique(rule.id);
    if (rule.source.kind === 'component') validateEndpoint(rule.source, rule.id);
    for (const target of rule.targets) {
      if (target.kind === 'trigger') validateEndpoint(target, rule.id);
      else if (!project.scripts[target.scriptId]) issue('trigger.script', rule.id, 'Missing callback script');
    }
  }
  for (const [id, script] of Object.entries(project.scripts)) {
    unique(script.id);
    if (id !== script.id || script.ownerId !== project.game.id && !project.instances[script.ownerId]) issue('script.owner', id, 'Invalid script identity/owner');
    if (script.draft) issue('script.draft', id, 'Python draft has not been synchronized; preserved independently', 'warning');
    const stack: unknown[] = [...script.program.body];
    while (stack.length) {
      const node = stack.pop();
      if (Array.isArray(node)) { stack.push(...node); continue; }
      if (!isRecord(node)) continue;
      if (typeof node['id'] === 'string') unique(node['id']);
      if (typeof node['regionId'] === 'string' && !script.program.regions[node['regionId']]) issue('source.region', id, 'Missing opaque source region');
      stack.push(...Object.values(node).filter(v => typeof v === 'object' && v !== null));
    }
  }
  for (const plugin of project.plugins) if (plugin.required && !registry.list().some(d => d.provider === plugin.id) && !Object.values(project.definitions).some(d => d.provider === plugin.id)) issue('plugin.missing', plugin.id, 'Required provider unavailable; opaque content preserved', 'warning');
  return issues;
}
