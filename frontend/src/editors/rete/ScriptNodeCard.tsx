import * as React from 'react';
import { Code2, Pencil } from 'lucide-react';
import { workspace } from '../../app/workspace.ts';
import { scriptDescription, setScriptDescription } from './presentation.ts';
export function ScriptNodeCard({ id, ports, onEdit }: { id: string; ports: React.ReactNode; onEdit: () => void }) {
  const { project } = React.useSyncExternalStore(workspace.subscribe, workspace.getSnapshot);
  const script = project?.scripts[id], description = project ? scriptDescription(project, id) : '';
  const [draft, setDraft] = React.useState(description);
  React.useEffect(() => { setDraft(description); }, [description]);
  if (!project || !script) return null;
  const event = project.triggerRules.find(rule => rule.targets.some(target => target.kind === 'script' && target.scriptId === id))?.source.member ?? 'Unconnected';
  const owner = script.ownerId === project.game.id ? 'Game' : project.instances[script.ownerId]?.name ?? 'Component';
  return <article className="script-card script-node-card" aria-label={`Script ${script.name}`} data-script-id={id}>
    <div className="node-heading"><span className="node-symbol"><Code2 size={19}/></span><div><small>{owner} · {event}</small><strong>{script.name}</strong></div></div>
    <div className="script-node-description" onPointerDown={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
      <label htmlFor={`description-${id}`}>Description</label>
      <textarea id={`description-${id}`} aria-label={`Description for ${script.name}`} rows={3} maxLength={2000} placeholder="What does this script do?" value={draft}
        onChange={event => setDraft(event.target.value)} onBlur={event => { const value = event.currentTarget.value; if (value !== description) workspace.commit(p => setScriptDescription(p, id, value)); }}
        onKeyDown={event => { if (event.key === 'Escape') { setDraft(description); event.currentTarget.value = description; event.currentTarget.blur(); } if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) event.currentTarget.blur(); }}/>
    </div>
    {ports}
    <footer className="script-node-footer"><small>{script.draft ? 'Draft saved' : 'Checked Python'}</small><button className="button compact" onPointerDown={event => event.stopPropagation()} onClick={onEdit}><Pencil size={13}/>Edit Script</button></footer>
  </article>;
}
