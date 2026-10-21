import * as React from 'react';
import { Code2, Plus } from 'lucide-react';
import type { WorkspaceState } from '../app/workspace.ts';
import { ScriptCard } from './ScriptCard.tsx';
export function ScriptPanel({ state, onAdd }: { state: WorkspaceState; onAdd: () => void }) {
  const list = React.useRef<HTMLDivElement>(null);
  const selected = state.selected[0];
  React.useEffect(() => {
    const card = [...(list.current?.querySelectorAll<HTMLElement>('[data-script-id]') ?? [])].find(element => element.dataset['scriptId'] === selected);
    card?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  }, [selected]);
  const scripts = Object.values(state.project!.scripts);
  return <section className="script-panel" aria-label="Scripting workspace"><header className="script-heading"><Code2 size={17}/><strong>Script blocks</strong><small>Collapse unused editors to keep the workspace fast.</small><span className="toolbar-spacer"/><button className="button compact" onClick={onAdd}><Plus size={15}/>Script</button></header>
    <div className="script-block-list" ref={list}>{scripts.length ? scripts.map(script => <ScriptCard key={script.id} id={script.id}/>) : <div className="script-empty"><Code2 size={32}/><h2>Give your Act something to do.</h2><p>Add a Script from the library. Edit its blocks or Python here; use the graph to connect its inputs and outputs.</p><button className="button primary" onClick={onAdd}><Plus size={16}/>Script</button></div>}</div>
  </section>;
}
