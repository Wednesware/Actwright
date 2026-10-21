import type { ActProject } from './model.ts';
import type { Json, Member } from '../registry/types.ts';

export const validOutputName = (name: string): boolean => /^[A-Za-z][A-Za-z0-9_]*$/.test(name);
export function blockOutputNames(state: unknown, checkedNames: string[] = []): string[] {
  const found = new Set<string>();
  const roots = (state as { blocks?: { blocks?: unknown[] } } | null)?.blocks?.blocks ?? [];
  const stack = Array.isArray(roots) ? [...roots].reverse() : [];
  while (stack.length) {
    const item = stack.pop() as { type?: string; fields?: Record<string, unknown>; extraState?: { source?: string }; inputs?: Record<string, { block?: unknown; shadow?: unknown }>; next?: { block: unknown }; enabled?: boolean; disabledReasons?: string[] } | null;
    if (!item || typeof item !== 'object') continue;
    if (item.next?.block) stack.push(item.next.block);
    if (item.enabled === false || item.disabledReasons?.length) continue;
    const type = typeof item.type === 'string' ? item.type.replace(/^act_l[12]_/, 'act_') : '';
    if (type === 'act_output') {
      const name = item.fields?.['NAME']; if (typeof name === 'string' && validOutputName(name)) found.add(name);
    }
    // Opaque Python and compact expressions can contain checked emit() calls too.
    // Preserve their known sockets until the next AST check can rediscover them.
    const source = type === 'act_value' ? item.fields?.['CODE'] : ['act_python', 'act_raw_expression'].includes(type) ? item.extraState?.source : null;
    if (typeof source === 'string' && /\bemit\s*\(/.test(source)) for (const name of checkedNames) if (validOutputName(name)) found.add(name);
    stack.push(...Object.values(item.inputs ?? {}).filter(entry => entry && typeof entry === 'object').map(entry => entry.block ?? entry.shadow).reverse());
  }
  return [...found];
}
export function scriptOutputNames(project: ActProject, id: string): string[] {
  const script = project.scripts[id]; if (!script) return [];
  const source = script.draft?.source ?? script.synchronizedSource;
  const layout = (project.extensions['actwright.blockLayouts'] as Record<string, Json> | undefined)?.[id] as { source?: string; state?: unknown } | undefined;
  const entry = (project.extensions['actwright.scriptOutputs'] as Record<string, Json> | undefined)?.[id] as { source?: string; names?: unknown } | undefined;
  const recorded = Array.isArray(entry?.names) ? entry.names.filter((name): name is string => typeof name === 'string' && validOutputName(name)) : [];
  if (layout?.source === source) return [...new Set([...blockOutputNames(layout.state), ...(entry?.source === source ? recorded : [])])];
  // Keep the last checked sockets while an unfinished Python draft is being edited.
  return [...new Set(recorded)];
}
export function reconcileScriptOutputs(project: ActProject, id: string, source: string, names: string[]): void {
  const outputs = [...new Set(names.filter(validOutputName))];
  const records = (project.extensions['actwright.scriptOutputs'] ?? {}) as Record<string, Json>;
  records[id] = { source, names: outputs }; project.extensions['actwright.scriptOutputs'] = records;
  project.slotEdges = project.slotEdges.filter(edge => edge.sourceId !== id || outputs.includes(edge.output));
}
export function scriptOutputMember(name: string): Member {
  return { id: `script-output:${name}`, name, kind: 'output', parameters: [
    { name: 'args', kind: 'varPositional', annotation: null, default: { kind: 'missing' } },
    { name: 'kwargs', kind: 'varKeyword', annotation: null, default: { kind: 'missing' } },
  ], returns: null, decorators: ['output'], async: false, description: 'Arguments supplied by the script Output block.', line: 0 };
}
