import type { ActProject } from '../core/project/model.ts';
import { siliconMetadata } from '../core/registry/registry.ts';
export interface ComponentReference { id: string; name: string; type: string; icon: string }
const svg = (path: string, color: string) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`);
export const box = svg('<path d="M12 3 3 8v9l9 5 9-5V8Z M3 8l9 5 9-5 M12 13v9 M7.5 5.5l9 5"/>', '#a89aff');
export const gameIcon = svg('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><path d="M6 10v7h8M10 6h7v8"/>', '#7dccb4');
export const parentIcon = svg('<path d="M12 21V3M5 10l7-7 7 7"/>', '#b6a1e7');
const typeNames = new Map(siliconMetadata.definitions.map(definition => [definition.id, definition.name]));
export function componentReferences(project: ActProject, ownerId: string): ComponentReference[] {
  const parentId = project.locations.find(location => location.kind === 'canonical' && location.componentId === ownerId)?.parentId ?? project.game.id;
  const parent = project.instances[parentId];
  const typeName = (id: string) => project.definitions[id]?.name ?? typeNames.get(id) ?? id;
  return [
    { id: '$game', name: `game · ${project.name}`, type: 'Game', icon: gameIcon },
    { id: '$parent', name: 'parent', type: parent ? typeName(parent.typeId) : 'Game', icon: parentIcon },
    ...project.game.order.map(id => ({ id, name: project.instances[id]!.name, type: typeName(project.instances[id]!.typeId), icon: box })),
  ];
}

export function componentTypes(): { id: string; name: string }[] {
  return siliconMetadata.definitions.filter(definition => definition.kind === 'component').map(({ id, name }) => ({ id, name }));
}
