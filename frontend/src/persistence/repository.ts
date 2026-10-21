import Dexie, { type EntityTable } from 'dexie';
import type { ActProject } from '../core/project/model.ts';
import { parseProject } from '../core/validation/project.ts';

interface SavedProject { id: string; name: string; revision: number; updatedAt: string; project: ActProject }
interface SavedRevision { key: string; projectId: string; revision: number; project: ActProject }
interface AssetRow { hash: string; bytes: Uint8Array }
interface SettingRow { key: string; value: string }
export class SaveConflict extends Error {
  constructor() { super('This Act changed in another tab. Download a recovery copy or save your edits as a new Act.'); }
}
export class ProjectRepository extends Dexie {
  projects!: EntityTable<SavedProject, 'id'>;
  revisions!: EntityTable<SavedRevision, 'key'>;
  assets!: EntityTable<AssetRow, 'hash'>;
  settings!: EntityTable<SettingRow, 'key'>;
  constructor(name = 'actwright') {
    super(name);
    this.version(1).stores({ projects: 'id,updatedAt', revisions: 'key,projectId,[projectId+revision]', assets: 'hash', settings: 'key' });
  }
  async list(): Promise<Omit<SavedProject, 'project'>[]> {
    return (await this.projects.orderBy('updatedAt').reverse().toArray()).map(({ id, name, revision, updatedAt }) => ({ id, name, revision, updatedAt }));
  }
  async load(id: string): Promise<{ project: ActProject; recovered: boolean; diskRevision: number } | null> {
    const current = await this.projects.get(id);
    if (!current) return null;
    try { return { project: parseProject(current.project), recovered: false, diskRevision: current.revision }; }
    catch {
      const previous = await this.revisions.where('[projectId+revision]').between([id, Dexie.minKey], [id, Dexie.maxKey]).reverse().toArray();
      for (const saved of previous) {
        try { return { project: parseProject(saved.project), recovered: true, diskRevision: current.revision }; } catch { /* Try older intact revision. */ }
      }
      throw new Error('No readable revision was found. Existing data has been retained.');
    }
  }
  async save(project: ActProject, expectedRevision: number | null, assets: Map<string, Uint8Array> = new Map()): Promise<void> {
    const valid = structuredClone(parseProject(project));
    await this.transaction('rw', [this.projects, this.revisions, this.assets], async () => {
      const current = await this.projects.get(valid.id);
      if ((current?.revision ?? null) !== expectedRevision) throw new SaveConflict();
      if (current && (valid.revision < current.revision || valid.revision === current.revision && JSON.stringify(current.project) !== JSON.stringify(valid))) throw new SaveConflict();
      for (const asset of Object.values(valid.assets)) {
        const bytes = assets.get(asset.sha256);
        if (bytes) await this.assets.put({ hash: asset.sha256, bytes });
        else if (!await this.assets.get(asset.sha256)) throw new Error(`Missing asset: ${asset.path}`);
      }
      await this.projects.put({ id: valid.id, name: valid.name, revision: valid.revision, updatedAt: valid.updatedAt, project: valid });
      await this.revisions.put({ key: `${valid.id}:${valid.revision}`, projectId: valid.id, revision: valid.revision, project: valid });
      const revisions = await this.revisions.where('[projectId+revision]').between([valid.id, Dexie.minKey], [valid.id, Dexie.maxKey]).reverse().toArray();
      await this.revisions.bulkDelete(revisions.slice(20).map(row => row.key));
    });
  }
  async remove(id: string): Promise<void> {
    await this.transaction('rw', [this.projects, this.revisions, this.settings], async () => {
      await this.projects.delete(id);
      await this.revisions.where('projectId').equals(id).delete();
      if ((await this.settings.get('recent'))?.value === id) await this.settings.delete('recent');
    });
  }
  async assetBytes(project: ActProject): Promise<Map<string, Uint8Array>> {
    const result = new Map<string, Uint8Array>();
    for (const asset of Object.values(project.assets)) {
      const row = await this.assets.get(asset.sha256);
      if (!row) throw new Error(`Missing asset bytes: ${asset.path}`);
      result.set(asset.sha256, row.bytes);
    }
    return result;
  }
}
