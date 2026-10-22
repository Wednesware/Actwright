import { boundedLayout } from '../scripting/blocks.ts';
import { defaultSound, readSound, type SoundPreferences } from '../feedback/preferences.ts';
import { createProject, type ActProject } from '../core/project/model.ts';
import { ProjectHistory, addComponent, removeComponent } from '../core/project/commands.ts';
import { builtins } from '../core/registry/registry.ts';
import { validateProject, type Diagnostic } from '../core/validation/project.ts';
import { ProjectRepository, SaveConflict } from '../persistence/repository.ts';
import { exportAct, importAct } from '../import-export/archive.ts';
import sample from '../../../examples/first-act.project.json' with { type: 'json' };
import { parseProject } from '../core/validation/project.ts';
import type { Json } from '../core/registry/types.ts';
import { initialTutorial, readTutorial, type TutorialProgress } from '../tutorial/progress.ts';
import { analyzeScript } from '../runtime/client.ts';
import { acceptAnalysis } from '../core/ir/model.ts';
import { reconcileScriptOutputs } from '../core/project/script-outputs.ts';
import { removeScript } from '../scripting/scripts.ts';
import { exportPython } from '../scripting/python.ts';

export const registry = builtins();
export interface WorkspaceState {
  project: ActProject | null;
  selected: string[];
  ready: boolean;
  busy: boolean;
  saveStatus: 'saved' | 'pending' | 'saving' | 'error';
  saveError: string | null;
  projects: { id: string; name: string; updatedAt: string }[];
  diagnostics: Diagnostic[];
  logs: { id: string; message: string; level: 'info' | 'warning' | 'error'; time: string }[];
  theme: 'dark' | 'light';
  accent: string;
  sound: SoundPreferences;
  canUndo: boolean;
  canRedo: boolean;
  tutorial: TutorialProgress;
}
export class Workspace {
  readonly repository: ProjectRepository;
  #history: ProjectHistory | null = null;
  #listeners = new Set<() => void>();
  #diskRevision: number | null = null;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #queue: Promise<void> = Promise.resolve();
  #assets = new Map<string, Uint8Array>();
  #channel: BroadcastChannel | null = null;
  #state: WorkspaceState = { project: null, selected: [], ready: false, busy: false, saveStatus: 'saved', saveError: null,
    projects: [], diagnostics: [], logs: [], sound: { ...defaultSound }, theme: 'dark', accent: '#a89aff', canUndo: false, canRedo: false, tutorial: initialTutorial() };
  constructor(repository = new ProjectRepository()) { this.repository = repository; }
  getSnapshot = (): WorkspaceState => this.#state;
  subscribe = (listener: () => void): (() => void) => { this.#listeners.add(listener); return () => { this.#listeners.delete(listener); }; };
  #set(update: Partial<WorkspaceState>): void { this.#state = { ...this.#state, ...update }; this.#listeners.forEach(listener => listener()); }
  log = (message: string, level: 'info' | 'warning' | 'error' = 'info'): void => {
    this.#set({ logs: [...this.#state.logs.slice(-99), { id: crypto.randomUUID(), message, level, time: new Date().toLocaleTimeString() }] });
  };
  async initialize(): Promise<void> {
    try {
      await this.repository.open();
      const theme = (await this.repository.settings.get('theme'))?.value;
      const sound = readSound((await this.repository.settings.get('uiSound'))?.value);
      const accent = (await this.repository.settings.get('accent'))?.value;
      const tutorial = readTutorial((await this.repository.settings.get('tutorial'))?.value);
      this.#set({ tutorial, sound, theme: theme === 'light' ? 'light' : 'dark', ...(accent && /^#[0-9a-f]{6}$/i.test(accent) ? { accent } : {}) });
      const recent = (await this.repository.settings.get('recent'))?.value;
      const saved = recent ? await this.repository.load(recent) : null;
      if (saved) {
        this.#diskRevision = saved.diskRevision;
        if (saved.recovered) saved.project.revision = saved.diskRevision + 1;
        this.#activate(saved.project);
        if (saved.recovered) this.log('Recovered an earlier intact revision. Your latest stored data is retained.', 'error');
      } else this.#activate(createProject());
      await this.refreshProjects();
      this.#set({ ready: true });
      if (!saved || saved.recovered) await this.flush();
      this.log('Workspace ready. All edits are stored in this browser.');
      if (typeof BroadcastChannel !== 'undefined') {
        this.#channel = new BroadcastChannel('actwright-projects');
        this.#channel.onmessage = event => {
          void this.refreshProjects().catch(error => this.log(String(error), 'error'));
          if (event.data?.type === 'tutorial') void this.repository.settings.get('tutorial').then(row => this.#set({ tutorial: readTutorial(row?.value) })).catch(error => this.log(String(error), 'error'));
        };
      }
    } catch (error) {
      // Continue editing/exporting in memory when browser storage is unavailable.
      if (!this.#state.project) this.#activate(createProject());
      this.#set({ ready: true, saveStatus: 'error', saveError: String(error) });
      this.log(`Browser storage unavailable: ${String(error)}. Download your Act to preserve it.`, 'error');
    }
  }
  #activate(project: ActProject): void {
    this.#history = new ProjectHistory(project, registry);
    this.#set({ project: this.#history.project, selected: [], diagnostics: validateProject(project, registry), canUndo: false, canRedo: false, saveError: null });
  }
  #changed(project: ActProject): void {
    this.#set({ project, diagnostics: validateProject(project, registry), canUndo: this.#history?.canUndo ?? false,
      canRedo: this.#history?.canRedo ?? false, saveStatus: 'pending', selected: this.#state.selected.filter(id => id === project.game.id || !!project.instances[id] || !!project.scripts[id]) });
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => { void this.flush().catch(() => {}); }, 500);
  }
  commit = (change: (project: ActProject) => void): boolean => {
    if (!this.#history || this.#state.busy) return false;
    try { this.#changed(this.#history.transact(change)); return true; }
    catch (error) { this.log(String(error), 'error'); return false; }
  };
  undo = (): void => { if (this.#history && !this.#state.busy && this.#history.canUndo) this.#changed(this.#history.undo()); };
  redo = (): void => { if (this.#history && !this.#state.busy && this.#history.canRedo) this.#changed(this.#history.redo()); };
  select = (id: string, accumulate = false): void => {
    this.#set({ selected: accumulate ? this.#state.selected.includes(id) ? this.#state.selected.filter(key => key !== id) : [...this.#state.selected, id] : [id] });
  };
  clearSelection = (): void => { this.#set({ selected: [] }); };
  add(typeId: string, parentId: string, aliases: string[], config: Record<string, Json>, position?: { x: number; y: number }): boolean {
    let created = '';
    const result = this.commit(project => {
      created = addComponent(project, registry, typeId, { parentId, aliases, ...(config ? { config } : {}) });
      if (position) project.editor.nodes[created] = { ...position, collapsed: false };
    });
    if (result) {
      this.select(created); this.log(`Added ${registry.require(typeId).name}.`);
      if (typeId === 'silicon.Stage2D' && this.#state.tutorial.status === 'active' && this.#state.tutorial.step === 0) void this.setTutorial({ version: 1, status: 'active', step: 1 });
    }
    return result;
  }
  removeSelected = (): void => {
    const ids = this.#state.selected.filter(id => id !== this.#state.project?.game.id);
    if (ids.length && this.commit(project => ids.forEach(id => { if (project.scripts[id]) removeScript(project, id); else removeComponent(project, id); }))) this.log(`Deleted ${ids.length} component${ids.length === 1 ? '' : 's'}.`);
  };
  async refreshProjects(): Promise<void> { this.#set({ projects: await this.repository.list() }); }
  async flush(): Promise<void> {
    clearTimeout(this.#timer);
    const project = this.#state.project;
    if (!project) return;
    const operation = this.#queue.catch(() => {}).then(async () => {
      if (this.#diskRevision === project.revision && this.#state.saveStatus === 'saved') return;
      this.#set({ saveStatus: 'saving' });
      await this.repository.save(project, this.#diskRevision, this.#assets);
      this.#diskRevision = project.revision;
      this.#assets.clear();
      await this.repository.settings.put({ key: 'recent', value: project.id });
      this.#channel?.postMessage({ id: project.id, revision: project.revision });
      if (this.#state.project?.id === project.id && this.#state.project.revision === project.revision) this.#set({ saveStatus: 'saved', saveError: null });
      await this.refreshProjects();
    });
    this.#queue = operation;
    try { await operation; }
    catch (error) { this.#set({ saveStatus: 'error', saveError: error instanceof SaveConflict ? error.message : String(error) }); this.log(String(error), 'error'); throw error; }
  }
  async #switch(action: () => Promise<void>): Promise<void> {
    if (this.#state.busy) return;
    this.#set({ busy: true });
    try { await this.flush(); await action(); }
    catch (error) { this.log(String(error), 'error'); }
    finally { this.#set({ busy: false }); }
  }
  async create(name: string, example = false): Promise<void> {
    await this.#switch(async () => {
      const project = example ? structuredClone(parseProject(sample)) : createProject(name);
      project.id = crypto.randomUUID(); project.name = name; project.game.name = name; project.revision = 0;
      project.createdAt = project.updatedAt = new Date().toISOString();
      if (example) Object.keys(project.instances).forEach((id, index) => { project.editor.nodes[id] = { x: 100 + (index % 3) * 340, y: 120 + Math.floor(index / 3) * 330, collapsed: false }; });
      this.#diskRevision = null; this.#activate(project); await this.flush();
      this.log(example ? 'Opened the First Act example.' : `Created ${name}.`);
    });
  }
  async open(id: string): Promise<void> {
    if (id === this.#state.project?.id) return;
    await this.#switch(async () => {
      const saved = await this.repository.load(id);
      if (!saved) throw new Error('This Act no longer exists.');
      this.#diskRevision = saved.diskRevision;
      if (saved.recovered) saved.project.revision = saved.diskRevision + 1;
      this.#activate(saved.project);
      this.#set({ saveStatus: 'saved' });
      if (saved.recovered) await this.flush();
      await this.repository.settings.put({ key: 'recent', value: id });
      this.log(saved.recovered ? 'Recovered an earlier revision.' : `Opened ${saved.project.name}.`);
    });
  }
  async duplicate(): Promise<void> {
    await this.#switch(async () => {
      const original = this.#state.project;
      if (!original) return;
      const project = structuredClone(original);
      project.id = crypto.randomUUID(); project.revision = 0; project.name += ' copy'; project.game.name = project.name;
      project.createdAt = project.updatedAt = new Date().toISOString();
      this.#diskRevision = null; this.#activate(project); await this.flush();
    });
  }
  async keepRecoveryCopy(): Promise<void> {
    if (this.#state.busy || !this.#state.project) return;
    clearTimeout(this.#timer); this.#set({ busy: true });
    try {
      await this.#queue.catch(() => {});
      const project = structuredClone(this.#state.project);
      project.id = crypto.randomUUID(); project.revision = 0; project.name += ' recovered'; project.game.name = project.name;
      project.createdAt = project.updatedAt = new Date().toISOString();
      this.#diskRevision = null; this.#activate(project); await this.flush();
      this.log('Saved your edits as a new local Act. The other tab’s version is unchanged.');
    } catch (error) { this.log(String(error), 'error'); }
    finally { this.#set({ busy: false }); }
  }
  async delete(id: string): Promise<void> {
    await this.#switch(async () => {
      await this.repository.remove(id);
      if (this.#state.project?.id === id) { this.#diskRevision = null; this.#activate(createProject()); await this.flush(); }
      await this.refreshProjects();
    });
  }
  async download(): Promise<void> {
    const project = this.#state.project;
    if (!project) return;
    try {
      const assets = Object.keys(project.assets).length ? await this.repository.assetBytes(project) : new Map<string, Uint8Array>();
      for (const [hash, bytes] of this.#assets) assets.set(hash, bytes);
      const bytes = await exportAct(project, assets);
      const url = URL.createObjectURL(new Blob([new Uint8Array(bytes).buffer], { type: 'application/zip' }));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${project.name.replace(/[^a-z0-9_-]/gi, '_') || 'Untitled'}.act`; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      this.log('Saved an editable .act file.');
    } catch (error) { this.log(`Save failed: ${String(error)}`, 'error'); }
  }
  async checkScript(id: string): Promise<boolean> {
    const project = this.#state.project, script = project?.scripts[id];
    if (!project || !script) return false;
    const existing = (project.extensions['actwright.blockLayouts'] as Record<string, Json> | undefined)?.[id];
    if (!script.draft && existing && typeof existing === 'object' && !Array.isArray(existing) && existing['source'] === script.synchronizedSource) return true;
    const source = script.draft?.source ?? script.synchronizedSource, revision = script.draft?.revision ?? null;
    const result = await analyzeScript(source);
    if (this.#state.project?.id !== project.id) return false;
    const current = this.#state.project.scripts[id];
    if (!current || (revision === null ? current.draft !== null || current.synchronizedSource !== source : current.draft?.revision !== revision || current.draft.source !== source)) return false;
    const saved = this.commit(p => {
      if (revision !== null) p.scripts[id] = acceptAnalysis(p.scripts[id]!, revision, source, result.program, result.diagnostics);
      else if (!result.program) p.scripts[id]!.draft = { source, revision: 1, status: 'invalid', diagnostics: result.diagnostics };
      if (result.program && result.outputs) reconcileScriptOutputs(p, id, source, result.outputs);
      if (result.program && result.blocks) {
        const layouts = (p.extensions['actwright.blockLayouts'] ?? {}) as Record<string, Json>;
        if (!layouts[id] || (layouts[id] as Record<string, Json>)['source'] !== source) layouts[id] = { source, state: boundedLayout(source, result.blocks) as unknown as Json };
        p.extensions['actwright.blockLayouts'] = layouts;
      } });
    if (!saved) throw new Error('Could not save the checked script. See the console for the Act validation error.');
    return result.program !== null;
  }
  async pythonSource(embeddedRuntime = false): Promise<string> {
    const id = this.#state.project?.id;
    if (!id) throw new Error('No Act is open.');
    for (const script of Object.values(this.#state.project!.scripts)) {
      if (script.draft && !await this.checkScript(script.id)) throw new Error(`Fix the Python draft in “${script.name}” before running/exporting.`);
    }
    if (this.#state.project?.id !== id) throw new Error('The open Act changed. Try again.');
    return exportPython(this.#state.project, { embeddedRuntime });
  }
  async downloadPython(): Promise<void> {
    try {
      const source = await this.pythonSource(), project = this.#state.project!;
      const url = URL.createObjectURL(new Blob([source], { type: 'text/x-python;charset=utf-8' }));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${project.name.replace(/[^a-z0-9_-]/gi, '_') || 'Untitled'}.py`; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      this.log('Exported runnable Python. Editable project data stays in your .act save.');
    } catch (error) { this.log(`Python export failed: ${String(error)}`, 'error'); }
  }
  async import(file: File): Promise<void> {
    await this.#switch(async () => {
      if (file.size > 32 * 1024 * 1024) throw new Error('Act archive exceeds 32 MB');
      const loaded = await importAct(new Uint8Array(await file.arrayBuffer()));
      const project = loaded.project;
      // Import is always a new local Act, preserving internal graph/script IDs.
      project.id = crypto.randomUUID(); project.revision = 0; project.createdAt = project.updatedAt = new Date().toISOString();
      this.#assets = loaded.assets; this.#diskRevision = null; this.#activate(project); await this.flush();
      this.log(`Imported ${file.name}. Internal identities and source were preserved.`);
    });
  }
  async soundPreferences(value: SoundPreferences): Promise<void> {
    const sound = readSound(value); this.#set({ sound });
    try { await this.repository.settings.put({ key: 'uiSound', value: JSON.stringify(sound) }); }
    catch (error) { this.log(`Sound settings could not be saved: ${String(error)}`, 'error'); }
  }
  async appearance(theme: 'dark' | 'light', accent: string): Promise<void> {
    this.#set({ theme, accent });
    try { await this.repository.settings.bulkPut([{ key: 'theme', value: theme }, { key: 'accent', value: accent }]); }
    catch (error) { this.log(`Settings could not be saved: ${String(error)}`, 'error'); }
  }
  async setTutorial(tutorial: TutorialProgress): Promise<void> {
    try {
      await this.repository.settings.put({ key: 'tutorial', value: JSON.stringify(tutorial) });
      this.#channel?.postMessage({ type: 'tutorial' });
    } catch (error) { this.log(`Tutorial preference could not be saved: ${String(error)}`, 'error'); }
    this.#set({ tutorial });
  }
  async finishTutorial(): Promise<void> {
    await this.flush();
    await this.setTutorial({ version: 1, status: 'completed', step: 2 });
  }
  async dispose(): Promise<void> {
    clearTimeout(this.#timer);
    this.#channel?.close(); this.#channel = null;
    await this.#queue.catch(() => {});
    this.repository.close(); this.#listeners.clear();
  }
}
export const workspace = new Workspace();
