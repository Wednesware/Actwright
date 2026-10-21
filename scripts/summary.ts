import type { ComponentDefinition } from '../frontend/src/core/registry/types.ts';
export function analyzeMetadataSummary(definitions: ComponentDefinition[]): string {
  return definitions.map(definition => {
    const members = definition.members.filter(m => ['input', 'output', 'trigger', 'update'].includes(m.kind)).map(m => `${m.kind} ${m.name}`).join(', ');
    return `${definition.id} [${definition.category}]\n  ${members || 'No declared slots/triggers'}\n`;
  }).join('\n');
}
