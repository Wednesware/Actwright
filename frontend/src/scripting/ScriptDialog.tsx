import * as React from 'react';
import { Code2 } from 'lucide-react';
import { Modal } from '../components/Modal.tsx';
import { workspace, registry, type WorkspaceState } from '../app/workspace.ts';
import { addScript } from './scripts.ts';
export function ScriptDialog({ state, position, onClose }: { state: WorkspaceState; position?: { x: number; y: number }; onClose: () => void }) {
  const project = state.project!;
  const [owner, setOwner] = React.useState(project.game.id), [event, setEvent] = React.useState('start'), [name, setName] = React.useState('On game start');
  const events = owner === project.game.id ? ['start', 'pause', 'resume', 'stop'] : (project.definitions[project.instances[owner]?.typeId ?? ''] ?? registry.get(project.instances[owner]?.typeId ?? ''))?.members.filter(member => member.kind === 'trigger').map(member => member.name) ?? [];
  const activeEvent = events.includes(event) ? event : events[0] ?? '';
  return <Modal title="Script" onClose={onClose}><form onSubmit={e => {
    e.preventDefault(); if (!activeEvent) return;
    let id = '';
    if (workspace.commit(p => { id = addScript(p, owner, activeEvent); p.scripts[id]!.name = name.trim() || 'Script'; p.editor.nodes[id] = { x: position?.x ?? 170 + Object.keys(p.scripts).length * 40, y: position?.y ?? 160, collapsed: false }; })) { workspace.select(id); onClose(); }
  }}><p className="muted">Add a Script block with its own editor. Connect an event to run it, or use the event selected below.</p>
    <label className="field"><span>Script name</span><input autoFocus value={name} onChange={e => setName(e.target.value)} required/></label>
    <label className="field"><span>Script owner</span><select value={owner} onChange={e => setOwner(e.target.value)}><option value={project.game.id}>Game</option>{project.game.order.map(id => <option key={id} value={id}>{project.instances[id]?.name}</option>)}</select></label>
    <label className="field"><span>When</span><select value={activeEvent} onChange={e => setEvent(e.target.value)}>{!events.length && <option value="">No trigger events</option>}{events.map(name => <option key={name} value={name}>{owner === project.game.id ? `Game ${name === 'start' ? 'starts' : name === 'stop' ? 'stops' : name === 'pause' ? 'pauses' : 'resumes'}` : name}</option>)}</select></label>
    <div className="modal-actions"><button type="button" className="button" onClick={onClose}>Cancel</button><button className="button primary" disabled={!activeEvent}><Code2 size={15}/>Script</button></div>
  </form></Modal>;
}
