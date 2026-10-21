import type { ComponentDefinition, Json } from '../registry/types.ts';
import type { Selector } from '../graph/selectors.ts';
import type { ScriptDocument } from '../ir/model.ts';

export const SILICON_REVISION = '9a8db8bd5187011e20f16ad1d0964aeb251ff1eb';
export interface ComponentInstance {
  id: string;
  typeId: string;
  name: string;
  config: Record<string, Json>;
  state: Record<string, Json>;
  scripts: string[];
  construction: { kind: 'tree' } | { kind: 'add'; runtimeId: string };
}
export interface TreeLocation {
  id: string;
  parentId: string;
  componentId: string;
  kind: 'canonical' | 'link';
  aliases: string[];
  singleton: boolean;
}
export interface SlotEdge { id: string; sourceId: string; output: string; targetId: string; input: string; enabled: boolean }
export interface TriggerEndpoint { selector: Selector; member: string }
export interface TriggerRule {
  id: string;
  source: { kind: 'game'; member: 'start' | 'pause' | 'resume' | 'stop' } | ({ kind: 'component' } & TriggerEndpoint);
  targets: (({ kind: 'trigger' } & TriggerEndpoint) | { kind: 'script'; scriptId: string })[];
}
export interface ActProject {
  format: 'actwright';
  schemaVersion: 1;
  id: string;
  revision: number;
  name: string;
  createdAt: string;
  updatedAt: string;
  siliconRevision: string;
  game: { id: string; name: string; seed: number | null; tickRate: number; order: string[]; validation: 'framework' | 'strict' };
  definitions: Record<string, ComponentDefinition>;
  instances: Record<string, ComponentInstance>;
  locations: TreeLocation[];
  slotEdges: SlotEdge[];
  triggerRules: TriggerRule[];
  scripts: Record<string, ScriptDocument>;
  sourceModules: Record<string, { id: string; path: string; source: string; encoding: string }>;
  assets: Record<string, { id: string; path: string; mediaType: string; size: number; sha256: string }>;
  plugins: { id: string; version: string; required: boolean }[];
  extensions: Record<string, Json>;
  editor: { nodes: Record<string, { x: number; y: number; collapsed: boolean }>; viewport: { x: number; y: number; zoom: number } };
}

export function createProject(name = 'Untitled Act'): ActProject {
  const timestamp = new Date().toISOString();
  return { format: 'actwright', schemaVersion: 1, id: crypto.randomUUID(), revision: 0,
    name, createdAt: timestamp, updatedAt: timestamp, siliconRevision: SILICON_REVISION,
    game: { id: crypto.randomUUID(), name, seed: 7, tickRate: 60, order: [], validation: 'framework' },
    definitions: {}, instances: {}, locations: [], slotEdges: [], triggerRules: [], scripts: {}, sourceModules: {}, assets: {},
    plugins: [], extensions: {}, editor: { nodes: {}, viewport: { x: 0, y: 0, zoom: 1 } } };
}
