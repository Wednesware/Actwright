import { useUIFeedback, previewSound } from './feedback/useUIFeedback.ts';
import { TerminalPrompt } from './runtime/TerminalPrompt.tsx';
import * as React from 'react';
import { Box, ChevronDown, ChevronRight, Search, Plus, Download, Undo2, Redo2, Settings, CircleHelp, FolderOpen, Copy, Trash2,
  GitBranch, Link2, Workflow, Circle, Check, AlertTriangle, LoaderCircle, PanelLeftClose, PanelLeftOpen, Terminal, Sun, Moon, ArrowRight, Play, PanelRightClose, PanelRightOpen, Star, Pause, Square, RotateCcw, Code2 } from 'lucide-react';
import { workspace, registry } from './app/workspace.ts';
import { ComponentDialog } from './components/ComponentDialog.tsx';
import { ConnectionDialog } from './components/ConnectionDialog.tsx';
import { Inspector } from './components/Inspector.tsx';
import { Modal } from './components/Modal.tsx';
import type { Json } from './core/registry/types.ts';
import { addComponent } from './core/project/commands.ts';
import wordmark from './assets/actwright-wordmark.png';
import { ScriptDialog } from './scripting/ScriptDialog.tsx';
import { useRuntime } from './runtime/useRuntime.ts';

type Dialog = 'projects' | 'settings' | 'help' | 'connection' | 'new' | 'delete' | null;
const ScriptPanel = React.lazy(() => import('./scripting/ScriptPanel.tsx').then(module => ({ default: module.ScriptPanel })));
const Graph = React.lazy(() => import('./editors/rete/Graph.tsx').then(module => ({ default: module.Graph })));
function Logo() {
  // Frame the visible lettering while keeping the original transparent asset intact.
  return <svg className="brand-wordmark" viewBox="49 826 1902 409" role="img" aria-label="Actwright"><image href={wordmark} width="2000" height="2000"/></svg>;
}
export default function App() {
  const state = React.useSyncExternalStore(workspace.subscribe, workspace.getSnapshot);
  const [dialog, setDialog] = React.useState<Dialog>(null), [adding, setAdding] = React.useState<{ typeId: string; position?: { x: number; y: number } } | null>(null);
  const [query, setQuery] = React.useState(''), [tab, setTab] = React.useState<'library' | 'tree'>('library');
  const [leftOpen, setLeftOpen] = React.useState(true), [rightOpen, setRightOpen] = React.useState(true), [consoleOpen, setConsoleOpen] = React.useState(true);
  const [consoleTab, setConsoleTab] = React.useState<'output' | 'problems'>('output'), [logQuery, setLogQuery] = React.useState('');
  const [newName, setNewName] = React.useState('My first Act'), [projectToDelete, setProjectToDelete] = React.useState('');
  const [favorites, setFavorites] = React.useState<string[]>([]);
  const upload = React.useRef<HTMLInputElement>(null), search = React.useRef<HTMLInputElement>(null);
  const copied = React.useRef<{ projectId: string; ids: string[] } | null>(null);
  const project = state.project;
  useUIFeedback(state.sound);
  const runtime = useRuntime(project?.id);
  React.useEffect(() => { if (runtime.pendingInput) { setConsoleOpen(true); setConsoleTab('output'); } }, [runtime.pendingInput?.requestId]);
  const [addingScript, setAddingScript] = React.useState<{ position?: { x: number; y: number } } | null>(null);
  const [view, setView] = React.useState<'graph' | 'scripts'>('graph');
  const [runtimeInput, setRuntimeInput] = React.useState(''), [inputTarget, setInputTarget] = React.useState('');
  React.useEffect(() => { void workspace.initialize(); }, []);
  React.useEffect(() => {
    document.documentElement.dataset['theme'] = state.theme;
    document.documentElement.style.setProperty('--accent', state.accent);
    document.title = project ? `${project.name} · Actwright` : 'Actwright';
  }, [state.theme, state.accent, project?.name]);
  React.useEffect(() => { void workspace.repository.settings.get('favorites').then(row => { if (row) { const value: unknown = JSON.parse(row.value); if (Array.isArray(value) && value.every(id => typeof id === 'string')) setFavorites(value); } }).catch(() => {}); }, []);
  function favorite(id: string): void {
    const next = favorites.includes(id) ? favorites.filter(key => key !== id) : [...favorites, id];
    setFavorites(next); void workspace.repository.settings.put({ key: 'favorites', value: JSON.stringify(next) }).catch(error => workspace.log(String(error), 'error'));
  }
  const add = (typeId: string, position?: { x: number; y: number }) => { setAdding({ typeId, ...(position ? { position } : {}) }); };
  function duplicateSelection(ids = state.selected): void {
    if (!project) return;
    const selected = new Set(ids.filter(id => !!project.instances[id]));
    let previous: number;
    do { previous = selected.size; for (const entry of project.locations) if (entry.kind === 'canonical' && selected.has(entry.parentId)) selected.add(entry.componentId); } while (selected.size !== previous);
    const mapped = new Map<string, string>();
    const ok = workspace.commit(p => {
      for (const id of p.game.order.filter(key => selected.has(key))) {
        const original = project!.instances[id]!;
        if (original.scripts.length) throw new Error('Scripted component duplication is deferred until the scripting stage. Duplicate the whole Act to preserve its scripts.');
        const location = p.locations.find(entry => entry.kind === 'canonical' && entry.componentId === id)!;
        const config = structuredClone(original.config) as Record<string, Json>;
        const newId = addComponent(p, registry, original.typeId, { parentId: mapped.get(location.parentId) ?? location.parentId, aliases: [`${location.aliases[0] ?? original.name.toLowerCase()}_copy#`], config });
        p.instances[newId]!.name = `${original.name} copy`;
        p.instances[newId]!.state = structuredClone(original.state);
        const node = project!.editor.nodes[id] ?? { x: 100, y: 100, collapsed: false };
        p.editor.nodes[newId] = { ...node, x: node.x + 50, y: node.y + 50 }; mapped.set(id, newId);
      }
      for (const edge of project!.slotEdges) if (mapped.has(edge.sourceId) && mapped.has(edge.targetId)) p.slotEdges.push({ ...edge, id: crypto.randomUUID(), sourceId: mapped.get(edge.sourceId)!, targetId: mapped.get(edge.targetId)! });
      for (const rule of project!.triggerRules) if (rule.source.kind === 'component' && mapped.has(rule.source.selector.root)) throw new Error('Components with authored trigger rules currently require whole-Act duplication.');
    });
    if (ok) { workspace.clearSelection(); [...mapped.values()].forEach((id, index) => workspace.select(id, index > 0)); }
  }
  React.useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input,textarea,select,[contenteditable=true],dialog')) return;
      const ctrl = event.ctrlKey || event.metaKey;
      if (event.key === 'Escape') { setDialog(null); setAdding(null); workspace.clearSelection(); }
      if (ctrl && event.key.toLowerCase() === 's') { event.preventDefault(); void workspace.flush().catch(() => {}); }
      if (ctrl && event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) workspace.redo(); else workspace.undo(); }
      if (ctrl && event.key.toLowerCase() === 'f') { event.preventDefault(); setLeftOpen(true); setTab('library'); search.current?.focus(); }
      if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); workspace.removeSelected(); }
      if (ctrl && event.key.toLowerCase() === 'c' && project) { event.preventDefault(); copied.current = { projectId: project.id, ids: state.selected }; workspace.log('Copied the selected components.'); }
      if (ctrl && event.key.toLowerCase() === 'v' && copied.current && copied.current.projectId === project?.id) { event.preventDefault(); duplicateSelection(copied.current.ids); }
      if (ctrl && event.key.toLowerCase() === 'd') { event.preventDefault(); duplicateSelection(); }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [project, state.selected]);
  const catalog = registry.list(query), categories = [...new Set(catalog.map(definition => definition.category))];
  const problems = state.diagnostics.length;
  if (!state.ready || !project) return <main className="loading-screen"><h1><Logo/></h1><p>Opening your local workspace…</p><LoaderCircle className="spin"/></main>;
  function tree(parentId: string, depth = 0, visited = new Set<string>()): React.ReactNode {
    if (!project || depth > 30 || visited.has(parentId)) return null;
    const next = new Set(visited).add(parentId);
    return project.locations.filter(entry => entry.parentId === parentId).map(entry => <React.Fragment key={entry.id}>
      <button className={`tree-item ${state.selected.includes(entry.componentId) ? 'active' : ''}`} style={{ paddingLeft: 14 + depth * 16 }} onClick={event => workspace.select(entry.componentId, event.ctrlKey || event.metaKey)}>{entry.kind === 'link' ? <Link2 size={14}/> : <Box size={14}/>}<span>{project.instances[entry.componentId]?.name}<small>{entry.aliases.join(', ') || 'singleton'}</small></span>{entry.kind === 'link' && <span className="badge">link</span>}</button>
      {entry.kind === 'canonical' && tree(entry.componentId, depth + 1, next)}
    </React.Fragment>);
  }
  return <div className={`app-shell ${!leftOpen ? 'left-collapsed' : ''} ${!rightOpen ? 'right-collapsed' : ''}`} aria-busy={state.busy}>
    <header className="topbar"><a className="brand" href="#" onClick={event => event.preventDefault()}><Logo/></a><span className="toolbar-separator"/>
      <button className="project-switch" onClick={() => setDialog('projects')} disabled={state.busy}><FolderOpen size={15}/><span>{project.name}<small>LOCAL ACT</small></span><ChevronDown size={14}/></button>
      <span className={`save-indicator ${state.saveStatus}`} title={state.saveError ?? 'Automatic IndexedDB saving'} aria-live="polite">{state.saveStatus === 'saved' ? <Check size={13}/> : state.saveStatus === 'error' ? <AlertTriangle size={13}/> : <LoaderCircle size={13} className="spin"/>}<span>{state.saveStatus === 'saved' ? 'Saved locally' : state.saveStatus === 'error' ? 'Save failed' : 'Saving…'}</span></span>
      <div className="history-tools"><button className="icon-button" aria-label="Undo" title="Undo · Ctrl Z" disabled={!state.canUndo || state.busy} onClick={workspace.undo}><Undo2 size={17}/></button><button className="icon-button" aria-label="Redo" title="Redo · Ctrl Shift Z" disabled={!state.canRedo || state.busy} onClick={workspace.redo}><Redo2 size={17}/></button></div><div className="toolbar-spacer"/>
      <button className="button compact toolbar-connect" onClick={() => setDialog('connection')} disabled={(!project.game.order.length && !Object.keys(project.scripts).length) || state.busy}><GitBranch size={15}/>Connect</button>
      <div className="runtime-controls">{runtime.status === 'running' || runtime.status === 'paused' || runtime.status === 'starting' ? <>
        <button className="icon-button" aria-label={runtime.status === 'paused' ? 'Resume game' : 'Pause game'} disabled={runtime.busy || !!runtime.pendingInput || runtime.status === 'starting'} onClick={() => void runtime.command(runtime.status === 'paused' ? 'resume' : 'pause')}>{runtime.status === 'paused' ? <Play size={16}/> : <Pause size={16}/>}</button>
        <button className="icon-button" aria-label="Stop game" disabled={runtime.busy} onClick={() => void runtime.command('stop')}><Square size={15}/></button><button className="icon-button" aria-label="Restart game" disabled={runtime.busy} onClick={() => void runtime.run()}><RotateCcw size={16}/></button>
      </> : <button className="button compact" disabled={runtime.busy || state.busy} onClick={() => { setConsoleOpen(true); setConsoleTab('output'); void runtime.run(); }}>{runtime.busy ? <LoaderCircle size={14} className="spin"/> : <Play size={14}/>}Run</button>}</div>
      <button className="button compact primary" onClick={() => void workspace.download()}><Download size={15}/>Save .act</button><button className="button compact" onClick={() => void workspace.downloadPython()}><Code2 size={15}/>Export .py</button><button className="icon-button" aria-label="Settings" onClick={() => setDialog('settings')}><Settings size={18}/></button><button className="icon-button" aria-label="Start tutorial" title="Start tutorial" onClick={() => { setDialog(null); void workspace.setTutorial({ version: 1, status: 'active', step: 0 }); }}><CircleHelp size={18}/></button>
    </header>
    <nav className="workspace-tabs"><button className={`workspace-tab ${view === 'graph' ? 'active' : ''}`} aria-pressed={view === 'graph'} onClick={() => setView('graph')}><Workflow size={15}/>Component workspace</button><button className={`workspace-tab ${view === 'scripts' ? 'active' : ''}`} aria-pressed={view === 'scripts'} onClick={() => setView('scripts')}><Code2 size={15}/>Scripts</button><span className="workspace-stage">Silicon {project.siliconRevision.slice(0, 7)} <Circle size={6}/><span>Local-first editor</span></span><div className="toolbar-spacer"/><button className="icon-button" aria-label={leftOpen ? 'Hide library' : 'Show library'} onClick={() => setLeftOpen(!leftOpen)}>{leftOpen ? <PanelLeftClose size={16}/> : <PanelLeftOpen size={16}/>}</button><button className="icon-button" aria-label={rightOpen ? 'Hide inspector' : 'Show inspector'} onClick={() => setRightOpen(!rightOpen)}>{rightOpen ? <PanelRightClose size={16}/> : <PanelRightOpen size={16}/>}</button></nav>
    {state.saveError && <div className="save-error" role="alert"><AlertTriangle size={16}/><span>{state.saveError}</span><button className="text-button" onClick={() => void workspace.download()}>Download recovery copy</button><button className="text-button" onClick={() => void workspace.keepRecoveryCopy()}>Save edits as new Act</button><button className="text-button" onClick={() => void workspace.flush().catch(() => {})}>Retry save</button></div>}
    <div className="workbench">
      {leftOpen && <aside className="library"><div className="library-tabs"><button className={tab === 'library' ? 'active' : ''} onClick={() => setTab('library')}><Box size={14}/>Library</button><button className={tab === 'tree' ? 'active' : ''} onClick={() => setTab('tree')}><GitBranch size={14}/>Act tree<span>{project.game.order.length}</span></button></div>
        {tab === 'library' ? <><label className="search-field"><Search size={15}/><input ref={search} placeholder="Search components…" aria-label="Search components" value={query} onChange={event => setQuery(event.target.value)}/><kbd>⌘ F</kbd></label>
          <div className="library-content"><button className="button add-script-button" draggable onDragStart={event => { event.dataTransfer.setData('application/actwright-script', 'new'); event.dataTransfer.effectAllowed = 'copy'; }} onClick={() => setAddingScript({})}><Code2 size={18}/>Script</button><div className="section-label"><span>COMPONENTS</span><span>{catalog.length}</span></div>
            {favorites.length > 0 && !query && <details className="component-category" open><summary><ChevronDown size={13}/><Star size={13}/>Favorites<span>{favorites.length}</span></summary>{registry.list().filter(d => favorites.includes(d.id)).map(definition => <button key={definition.id} className="favorite-component" onClick={() => add(definition.id)}><Star size={13}/>{definition.name}<Plus size={13}/></button>)}</details>}
            {categories.map(category => <details className="component-category" key={category} open><summary><ChevronDown size={13}/>{category}<span>{catalog.filter(d => d.category === category).length}</span></summary>{catalog.filter(d => d.category === category).map(definition => <div className="library-card" key={definition.id} draggable onDragStart={event => { event.dataTransfer.setData('application/actwright-component', definition.id); event.dataTransfer.effectAllowed = 'copy'; }}>
              <button className="library-add" onClick={() => add(definition.id)} aria-label={`Add ${definition.name}`}><span className={`component-icon category-${category.toLowerCase()}`}><Box size={17}/></span><span><strong>{definition.name}</strong><small>{definition.optionalDependencies.length ? 'Optional integration' : definition.members.some(m => m.kind === 'update') ? 'Time-based component' : category === 'Grid' ? 'Grid component' : 'Silicon component'}</small></span><Plus size={13}/></button><button className={`favorite-button ${favorites.includes(definition.id) ? 'active' : ''}`} aria-label={`Favorite ${definition.name}`} onClick={() => favorite(definition.id)}><Star size={12}/></button>
            </div>)}</details>)}{!catalog.length && <p className="library-empty">No components match “{query}”.</p>}
          </div><div className="library-footer"><span className="silicon-dot"/><div><strong>Powered by Silicon</strong><small>Real Python. Visual possibilities.</small></div></div>
        </> : <><div className="tree-header"><span>COMPONENT HIERARCHY</span><button className="icon-button" title="Add component" onClick={() => { setTab('library'); search.current?.focus(); }}><Plus size={15}/></button></div><div className="tree-scroll"><button className={`tree-item game ${state.selected.includes(project.game.id) ? 'active' : ''}`} onClick={() => workspace.select(project.game.id)}><Workflow size={16}/><span>{project.name}<small>Game root</small></span></button>{tree(project.game.id)}</div><div className="tree-legend"><Link2 size={13}/><span>Links reference the same component.</span></div></>}
      </aside>}
      <div className="center-column"><React.Suspense fallback={<section className="graph-panel loading-graph"><LoaderCircle className="spin" size={22}/>Loading graph…</section>}>{view === 'graph' ? <Graph state={state} onAdd={add} onAddScript={position => setAddingScript(position ? { position } : {})} onInspectTutorial={() => setRightOpen(true)} onEditScript={id => { workspace.select(id); workspace.commit(p => { if (p.editor.nodes[id]) p.editor.nodes[id]!.collapsed = false; }); setView('scripts'); }}/> : <ScriptPanel key={project.id} state={state} onAdd={() => setAddingScript({})}/>}</React.Suspense>
        <section className={`console ${!consoleOpen ? 'collapsed' : ''}`} aria-label="Development console"><header className="console-heading"><button className={consoleTab === 'output' ? 'active' : ''} onClick={() => { setConsoleTab('output'); setConsoleOpen(true); }}><Terminal size={14}/>Console</button><button className={consoleTab === 'problems' ? 'active' : ''} onClick={() => { setConsoleTab('problems'); setConsoleOpen(true); }}>Problems<span className="badge">{problems}</span></button><span className="toolbar-spacer"/><span className="runtime-status"><Circle size={7}/>Python · {runtime.pendingInput ? 'waiting for input' : runtime.status}</span><button className="icon-button" aria-label={consoleOpen ? 'Collapse console' : 'Expand console'} onClick={() => setConsoleOpen(!consoleOpen)}>{consoleOpen ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}</button></header>
          {consoleOpen && <>{runtime.pendingInput && <TerminalPrompt prompt={runtime.pendingInput} busy={runtime.busy} onReply={text => void runtime.command('input_reply', { requestId: runtime.pendingInput!.requestId, text })}/>}
          {!runtime.pendingInput && (runtime.status === 'running' || runtime.status === 'paused') && project.game.order.some(id => project.instances[id]?.typeId === 'silicon.InputMap') && <form className="runtime-input" onSubmit={event => { event.preventDefault(); const target = inputTarget || project.game.order.find(id => project.instances[id]?.typeId === 'silicon.InputMap'); if (target) void runtime.command('input', { componentId: target, text: runtimeInput }); setRuntimeInput(''); }}><select aria-label="InputMap component" value={inputTarget || project.game.order.find(id => project.instances[id]?.typeId === 'silicon.InputMap')} onChange={event => setInputTarget(event.target.value)}>{project.game.order.filter(id => project.instances[id]?.typeId === 'silicon.InputMap').map(id => <option key={id} value={id}>{project.instances[id]?.name}</option>)}</select><input aria-label="Game input" placeholder="Send a key or command…" value={runtimeInput} onChange={event => setRuntimeInput(event.target.value)}/><button className="button compact" disabled={runtime.busy}>Send</button></form>}<label className="console-search"><Search size={13}/><input aria-label="Filter console" placeholder="Filter messages…" value={logQuery} onChange={event => setLogQuery(event.target.value)}/></label><div className="console-lines" role="log">{consoleTab === 'output' ? state.logs.filter(log => log.message.toLowerCase().includes(logQuery.toLowerCase())).map(log => <div key={log.id} className={`console-line ${log.level}`}><time>{log.time}</time><span>{log.level === 'error' ? 'ERROR' : 'INFO'}</span><p>{log.message}</p></div>) : problems ? state.diagnostics.filter(d => d.message.toLowerCase().includes(logQuery.toLowerCase())).map((d, index) => <div className={`console-line ${d.severity}`} key={index}><span>{d.severity.toUpperCase()}</span><p>{d.message}</p></div>) : <div className="console-success"><Check size={14}/>No project validation problems.</div>}</div></>}
        </section>
      </div>
      {rightOpen && <Inspector state={state}/>}
    </div>
    <footer className="statusbar"><span><span className="silicon-dot"/>Local workspace</span><span>{project.game.order.length} components</span><span>{project.slotEdges.length} signals</span><span>{project.triggerRules.length} trigger rules</span><span className="toolbar-spacer"/><span>IndexedDB autosave</span><button onClick={() => setDialog('help')}><CircleHelp size={12}/>Workspace help</button></footer>
    <input ref={upload} type="file" accept=".act" hidden onChange={event => { const file = event.target.files?.[0]; if (file) { setDialog(null); void workspace.import(file); } event.target.value = ''; }}/>
    {addingScript && <ScriptDialog state={state} {...addingScript} onClose={() => setAddingScript(null)}/>}
    {adding && <ComponentDialog {...adding} project={project} onClose={() => setAdding(null)}/>}
    {dialog === 'connection' && <ConnectionDialog project={project} selected={state.selected} onClose={() => setDialog(null)}/>}
    {dialog === 'projects' && <Modal title="Your Acts" onClose={() => setDialog(null)} wide><p className="muted">Stored in this browser. Download .act files to back up or move your work.</p><div className="project-actions"><button className="button primary" onClick={() => setDialog('new')}><Plus size={16}/>Create Act</button><button className="button" onClick={() => upload.current?.click()}><FolderOpen size={16}/>Import .act</button><button className="button" onClick={() => { setDialog(null); void workspace.create('First Act', true); }}><Workflow size={16}/>Explore example</button></div><div className="project-list">{state.projects.map(saved => <div key={saved.id} className={`project-row ${saved.id === project.id ? 'current' : ''}`}><span className="component-icon"><FolderOpen size={20}/></span><button className="project-open" onClick={() => { setDialog(null); void workspace.open(saved.id); }}><strong>{saved.name}{saved.id === project.id && <span className="badge">open</span>}</strong><small>Edited {new Date(saved.updatedAt).toLocaleString()}</small></button><button className="icon-button" aria-label={`Delete Act ${saved.name}`} onClick={() => { setProjectToDelete(saved.id); setDialog('delete'); }}><Trash2 size={15}/></button></div>)}</div><div className="modal-actions"><button className="button" onClick={() => { setDialog(null); void workspace.duplicate(); }}><Copy size={15}/>Duplicate current Act</button><button className="button" onClick={() => setDialog(null)}>Done</button></div></Modal>}
    {dialog === 'new' && <Modal title="A new Act starts here." onClose={() => setDialog(null)}><p className="muted">Bring an idea to life with Silicon components.</p><form onSubmit={event => { event.preventDefault(); if (newName.trim()) { setDialog(null); void workspace.create(newName.trim()); } }}><label className="field"><span>Act name</span><input autoFocus value={newName} onChange={event => setNewName(event.target.value)} required/></label><div className="modal-actions"><button type="button" className="button" onClick={() => setDialog(null)}>Cancel</button><button className="button primary">Create Act<ArrowRight size={15}/></button></div></form></Modal>}
    {dialog === 'delete' && <Modal title="Delete this local Act?" onClose={() => setDialog('projects')}><p>“{state.projects.find(saved => saved.id === projectToDelete)?.name}” and its recovery revisions will be removed from this browser.</p><p className="muted">Downloaded .act backups are independent.</p><div className="modal-actions"><button className="button" onClick={() => setDialog('projects')}>Keep Act</button><button className="button danger" onClick={() => { setDialog(null); void workspace.delete(projectToDelete); }}>Delete Act</button></div></Modal>}
    {dialog === 'settings' && <Modal title="Make it your workspace" onClose={() => setDialog(null)}><h3>Appearance</h3><div className="theme-options"><button className={`theme-option ${state.theme === 'dark' ? 'active' : ''}`} onClick={() => void workspace.appearance('dark', state.accent)}><Moon size={23}/><span>Dark</span></button><button className={`theme-option ${state.theme === 'light' ? 'active' : ''}`} onClick={() => void workspace.appearance('light', state.accent)}><Sun size={23}/><span>Light</span></button></div><label className="field"><span>Accent color</span><input type="color" value={state.accent} onChange={event => void workspace.appearance(state.theme, event.target.value)}/></label><h3 className="sound-settings-heading">UI sounds</h3><label className="sound-mute" data-ui-sound="off"><input type="checkbox" checked={state.sound.muted} onChange={event => void workspace.soundPreferences({ ...state.sound, muted: event.target.checked })}/>Mute UI sounds</label><label className="field"><span>UI sound volume <output>{Math.round(state.sound.volume * 100)}%</output></span><input aria-label="UI sound volume" type="range" min="0" max="100" step="1" value={Math.round(state.sound.volume * 100)} onChange={event => void workspace.soundPreferences({ ...state.sound, volume: Number(event.target.value) / 100 })}/></label><button className="button compact" data-ui-sound="off" disabled={state.sound.muted || state.sound.volume === 0} onClick={previewSound}>Test sound</button><p className="muted">Appearance and sound settings are saved on this device.</p><div className="modal-actions"><button className="button primary" onClick={() => setDialog(null)}>Done</button></div></Modal>}
    {dialog === 'help' && <Modal title="Welcome to Actwright" onClose={() => setDialog(null)} wide><p>Arrange real Silicon components into an Act. Your project stays editable and saves automatically in this browser.</p><div className="help-grid"><div><Box size={21}/><h3>Add & arrange</h3><p>Click or drag a library component onto the graph. Configure constructor values, then add it under the game or another component.</p></div><div><GitBranch size={21}/><h3>Connect behavior</h3><p>Drag an output socket to an input. Trigger connectors are separate. The Connect dialog offers a keyboard-accessible alternative.</p></div><div><Link2 size={21}/><h3>Preserve identity</h3><p>Use the inspector to create shortcut links to the same component. Hierarchy and signal relationships have distinct styles.</p></div><div><Download size={21}/><h3>Keep your work</h3><p>Save .act to keep an editable project. Export .py for runnable Python. Use the project menu to open, duplicate or import Acts.</p></div></div><h3>Keyboard shortcuts</h3><div className="shortcut-grid"><span>Save<kbd>Ctrl S</kbd></span><span>Undo<kbd>Ctrl Z</kbd></span><span>Redo<kbd>Ctrl Shift Z</kbd></span><span>Search<kbd>Ctrl F</kbd></span><span>Copy / paste<kbd>Ctrl C / V</kbd></span><span>Delete selection<kbd>Delete</kbd></span></div><p className="help-stage"><AlertTriangle size={16}/>Open Scripts to add event handlers with blocks or Python. Start npm run runtime in another terminal to check Python and run games locally. Save .act keeps your editable project; Export .py produces runnable Silicon code. Restart a running game to apply edits.</p><div className="modal-actions"><button className="button primary" onClick={() => setDialog(null)}>Start building</button></div></Modal>}
    {state.busy && <div className="busy-overlay"><LoaderCircle className="spin" size={24}/><span>Saving and opening your Act…</span></div>}
  </div>;
}
