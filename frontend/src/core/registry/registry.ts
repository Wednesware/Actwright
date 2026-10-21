import snapshot from './silicon.json' with { type: 'json' };
import schema from '../../../../schemas/metadata.v1.schema.json' with { type: 'json' };
import { checkShape } from '../validation/schema.ts';
import type { ComponentDefinition } from './types.ts';

export function parseMetadata(value: unknown): { definitions: ComponentDefinition[]; revision: string } {
  const errors = checkShape(value, schema);
  if (errors.length) throw new Error(`Invalid component metadata: ${errors[0]?.path} ${errors[0]?.message}`);
  return value as { definitions: ComponentDefinition[]; revision: string };
}
export class ComponentRegistry {
  #definitions = new Map<string, ComponentDefinition>();
  register(definition: ComponentDefinition): void {
    const errors = checkShape(definition, { $ref: '#/$defs/Definition', $defs: schema.$defs });
    if (errors.length) throw new Error(`Invalid component definition: ${errors[0]?.path}`);
    if (this.#definitions.has(definition.id)) throw new Error(`Duplicate component type: ${definition.id}`);
    if (!isPythonIdentifier(definition.name)) throw new Error('Invalid Python class name');
    if (definition.members.some(m => !isPythonIdentifier(m.name))) throw new Error('Invalid Python member name');
    const ids = [...definition.members, ...definition.state].map(member => member.id);
    if (new Set(ids).size !== ids.length) throw new Error('Duplicate member ID');
    this.#definitions.set(definition.id, structuredClone(definition));
    // Resolve known bases by qualified ID or same-module class name. Unknown
    // external bases remain a static-analysis limitation, never executed here.
    const active = new Set<string>(), done = new Set<string>();
    const visit = (id: string): void => {
      if (active.has(id)) throw new Error('Component inheritance cycle');
      if (done.has(id)) return;
      active.add(id);
      const current = this.#definitions.get(id);
      for (const base of current?.bases ?? []) {
        const resolved = this.#definitions.get(base) ?? [...this.#definitions.values()].find(d => d.module === current?.module && d.name === base);
        if (resolved) visit(resolved.id);
      }
      active.delete(id); done.add(id);
    };
    try { visit(definition.id); } catch (error) { this.#definitions.delete(definition.id); throw error; }
  }
  get(id: string): ComponentDefinition | undefined {
    const value = this.#definitions.get(id);
    return value ? structuredClone(value) : undefined;
  }
  require(id: string): ComponentDefinition {
    const value = this.get(id);
    if (!value) throw new Error(`Missing component definition: ${id}`);
    return value;
  }
  list(query = ''): ComponentDefinition[] {
    const text = query.toLowerCase();
    return [...this.#definitions.values()].filter(d => `${d.name} ${d.description} ${d.category}`.toLowerCase().includes(text)).map(d => structuredClone(d));
  }
  unregisterProvider(provider: string): void {
    for (const [id, definition] of this.#definitions) if (definition.provider === provider) this.#definitions.delete(id);
  }
}
const pythonKeywords = new Set('False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield'.split(' '));
export function isPythonIdentifier(value: string): boolean { return /^[A-Za-z_]\w*$/.test(value) && !pythonKeywords.has(value); }
export const siliconMetadata = parseMetadata(snapshot);
export function builtins(): ComponentRegistry {
  const registry = new ComponentRegistry();
  for (const definition of siliconMetadata.definitions) registry.register(definition);
  return registry;
}
