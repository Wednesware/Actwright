import { scriptDescription, setScriptDescription } from '../editors/rete/presentation.ts';
import * as React from 'react';
import { Box, ChevronDown, Link2, Trash2, ArrowUp, ArrowDown, Settings2, Unplug } from 'lucide-react';
import { registry, workspace, type WorkspaceState } from '../app/workspace.ts';
import { linkComponent, unlinkComponent } from '../core/project/commands.ts';
import { ValueField } from './ValueField.tsx';

export function Inspector({ state }: { state: WorkspaceState }) {
  const project = state.project;
  const id = state.selected[0];
  const [linkParent, setLinkParent] = React.useState(''), [linkAlias, setLinkAlias] = React.useState('shortcut');
  if (!project) return null;
  if (!id) return <aside className="inspector"><div className="panel-heading"><span>Inspector</span><Settings2 size={15}/></div><div className="inspector-empty"><Box size={30}/><h3>Every detail, in one place.</h3><p>Select a component to inspect its properties, connections and place in the tree.</p><button className="button" onClick={() => workspace.select(project.game.id)}>Inspect Game</button></div></aside>;
  const instance = project.instances[id];
  const root = id === project.game.id;
  const script = project.scripts[id];
  if (script) return <aside className="inspector"><div className="panel-heading"><span>Script</span><Settings2 size={15}/></div><div className="inspector-body"><h2>{script.name}</h2><p className="description">Use Edit Script on the graph card to open its editor in the Scripts tab.</p><ValueField key={id} label="Script name" value={script.name} onSave={value => typeof value === 'string' && !!value.trim() && workspace.commit(p => { p.scripts[id]!.name = value; })}/><ValueField key={`description:${id}`} label="Script description" value={scriptDescription(project, id)} onSave={value => typeof value === 'string' && workspace.commit(p => setScriptDescription(p, id, value))}/><p className="muted small">{script.draft ? 'Python draft preserved in your Act.' : 'Checked Python.'}</p></div></aside>;
  if (!instance && !root) return null;
  const definition = instance ? project.definitions[instance.typeId] ?? registry.get(instance.typeId) : undefined;
  const canonical = project.locations.find(entry => entry.componentId === id && entry.kind === 'canonical');
  const parentOptions = <><option value={project.game.id}>Game · {project.name}</option>{project.game.order.filter(key => key !== id).map(key => <option value={key} key={key}>{project.instances[key]?.name}</option>)}</>;
  const connections = project.slotEdges.filter(edge => edge.sourceId === id || edge.targetId === id);
  const links = project.locations.filter(entry => entry.componentId === id && entry.kind === 'link');
  return <aside className="inspector"><div className="panel-heading"><span>Inspector {state.selected.length > 1 && <small>· {state.selected.length} selected</small>}</span><Settings2 size={15}/></div>
    <div className="inspector-body"><div className="inspector-identity"><span className="large-symbol"><Box size={24}/></span><span><small>{definition?.category ?? 'Project'}</small><h2>{root ? 'Game' : definition?.name ?? 'Missing component'}</h2></span><span className="badge">{root ? 'root' : 'instance'}</span></div>
      <p className="description">{root ? 'The root of your Act. Components, signals and triggers belong to this game.' : definition?.description || 'A reusable Silicon component.'}</p>
      <ValueField key={`name:${id}`} label={root ? 'Act name' : 'Display name'} value={root ? project.name : instance!.name} onSave={value => typeof value === 'string' && value.trim().length > 0 && workspace.commit(p => { if (root) p.game.name = p.name = value; else p.instances[id]!.name = value; })}/>
      {root ? <>
        <h3>Game configuration</h3><ValueField label="Tick rate" value={project.game.tickRate} onSave={value => typeof value === 'number' && workspace.commit(p => { p.game.tickRate = value; })}/>
        <ValueField label="Random seed" value={project.game.seed} onSave={value => (typeof value === 'number' || value === null) && workspace.commit(p => { p.game.seed = value; })}/>
        <label className="field"><span>Connection validation</span><select value={project.game.validation} onChange={event => workspace.commit(p => { p.game.validation = event.target.value as 'framework' | 'strict'; })}><option value="framework">Silicon-compatible (default)</option><option value="strict">Strict authoring checks</option></select></label>
        <h3>Construction & update order</h3><p className="muted small">Order affects simulation. Moving graph nodes does not change it.</p><ol className="order-list">{project.game.order.map((key, index) => <li key={key}><button className="text-button" onClick={() => workspace.select(key)}>{project.instances[key]?.name}</button><span/>{[-1, 1].map(direction => <button key={direction} className="icon-button" aria-label={`Move ${project.instances[key]?.name} ${direction === -1 ? 'up' : 'down'}`} disabled={index + direction < 0 || index + direction >= project.game.order.length} onClick={() => workspace.commit(p => { [p.game.order[index], p.game.order[index + direction]] = [p.game.order[index + direction]!, p.game.order[index]!]; })}>{direction === -1 ? <ArrowUp size={13}/> : <ArrowDown size={13}/>}</button>)}</li>)}</ol>
      </> : <>
        <h3>Component tree</h3><label className="field"><span>Canonical parent</span><select aria-label="Canonical parent" value={canonical?.parentId ?? project.game.id} onChange={event => workspace.commit(p => { const location = p.locations.find(e => e.componentId === id && e.kind === 'canonical'); if (location) { location.parentId = event.target.value; if (p.instances[id]!.construction.kind === 'add' && location.parentId !== p.game.id) p.instances[id]!.construction = { kind: 'tree' }; } })}>{parentOptions}</select></label>
        <ValueField key={`aliases:${id}`} label="Tree IDs" value={canonical?.aliases.join(', ') ?? ''} onSave={value => typeof value === 'string' && workspace.commit(p => {
          const entry = p.locations.find(e => e.componentId === id && e.kind === 'canonical');
          if (entry) { entry.aliases = value.split(',').map(s => s.trim()).filter(Boolean); entry.singleton = entry.aliases.length === 0; const construction = p.instances[id]!.construction; if (construction.kind === 'add') { if (entry.aliases.length !== 1) throw new Error('A flat registration requires one ID'); construction.runtimeId = entry.aliases[0]!; } }
        })}/><p className="muted small">An empty ID list makes this a type singleton. Multiple IDs are aliases of this same component.</p>
        {instance!.construction.kind === 'add' && <div className="info-line">Flat runtime ID <code>{instance!.construction.runtimeId}</code></div>}
        <h3>Configuration <span className="badge">{Object.keys(instance!.config).length}</span></h3>
        {Object.entries(instance!.config).map(([name, value]) => <ValueField key={`${id}:${name}`} label={name} value={value} onSave={next => workspace.commit(p => { p.instances[id]!.config[name] = next; })}/>)}
        {!Object.keys(instance!.config).length && <p className="muted small">This component has no configured constructor arguments.</p>}
        <h3>Shortcut links <span className="badge">{links.length}</span></h3>{links.map(link => <div className="relationship-row" key={link.id}><Link2 size={14}/><span>{link.aliases.join(', ') || 'singleton'}<small>in {link.parentId === project.game.id ? 'Game' : project.instances[link.parentId]?.name}</small></span><button className="icon-button" aria-label={`Unlink ${link.aliases.join(', ')}`} onClick={() => workspace.commit(p => unlinkComponent(p, link.id))}><Unplug size={14}/></button></div>)}
        <details className="inspector-details"><summary>Add a link <ChevronDown size={14}/></summary><label className="field"><span>Link parent</span><select value={linkParent || project.game.id} onChange={event => setLinkParent(event.target.value)}>{parentOptions}</select></label><label className="field"><span>Link alias</span><input value={linkAlias} onChange={event => setLinkAlias(event.target.value)}/></label><button className="button full" onClick={() => workspace.commit(p => linkComponent(p, id, linkParent || p.game.id, linkAlias.split(',').map(s => s.trim()).filter(Boolean)))}>Create shortcut link</button></details>
        <h3>Members</h3>{definition?.members.filter(m => ['input', 'output', 'trigger', 'update'].includes(m.kind)).map(member => <div className={`member-row ${member.kind}`} key={member.id}><i/><code>{member.name}</code><span>{member.kind}</span></div>)}
        <h3>Declared state</h3>{definition?.state.map(field => <div className="relationship-row" key={field.id}><span><code>{field.name}</code><small>scope: {field.scope.kind === 'literal' ? String(field.scope.value) : 'dynamic'}</small></span><code className="muted">{field.default.kind === 'literal' ? JSON.stringify(field.default.value) : 'Python'}</code></div>)}{!definition?.state.length && <p className="muted small">No locally declared State fields.</p>}
        <h3>Signal connections <span className="badge">{connections.length}</span></h3>{connections.map(edge => <div className="relationship-row" key={edge.id}><span><code>{edge.output} → {edge.input}</code><small>{project.instances[edge.sourceId]?.name ?? project.scripts[edge.sourceId]?.name} → {project.instances[edge.targetId]?.name}</small></span><button className="icon-button" aria-label={`Remove signal ${edge.output}`} onClick={() => workspace.commit(p => { p.slotEdges = p.slotEdges.filter(e => e.id !== edge.id); })}><Unplug size={14}/></button></div>)}
        <div className="inspector-bottom"><button className="button danger full" onClick={() => workspace.removeSelected()}><Trash2 size={15}/>Delete selected component{state.selected.length > 1 ? 's' : ''}</button><p className="muted small">Also removes canonical descendants and relationships. Undo is available.</p></div>
      </>}
      {state.diagnostics.filter(d => d.subjectId === id).map((d, index) => <p className="field-error" key={index}>{d.message}</p>)}
    </div>
  </aside>;
}
