import type { ActProject } from '../../core/project/model.ts';
import type { Json } from '../../core/registry/types.ts';
export interface NodeSize { width: number; height: number }
export function nodeSize(project: ActProject, id: string): NodeSize | null {
  const value = (project.extensions['actwright.nodeSizes'] as Record<string, Json> | undefined)?.[id];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { width, height } = value;
  return typeof width === 'number' && typeof height === 'number' && Number.isFinite(width) && Number.isFinite(height)
    ? { width: Math.max(270, Math.min(1000, width)), height: Math.max(120, Math.min(1800, height)) } : null;
}
export function saveNodeSize(project: ActProject, id: string, size: NodeSize): void {
  const sizes = (project.extensions['actwright.nodeSizes'] ?? {}) as Record<string, Json>;
  sizes[id] = { ...size }; project.extensions['actwright.nodeSizes'] = sizes;
}
export function scriptDescription(project: ActProject, id: string): string {
  const value = (project.extensions['actwright.scriptDescriptions'] as Record<string, Json> | undefined)?.[id];
  return typeof value === 'string' ? value : '';
}
export function setScriptDescription(project: ActProject, id: string, description: string): void {
  const descriptions = (project.extensions['actwright.scriptDescriptions'] ?? {}) as Record<string, Json>;
  descriptions[id] = description.slice(0, 2000); project.extensions['actwright.scriptDescriptions'] = descriptions;
}
