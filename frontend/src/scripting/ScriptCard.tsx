import * as React from 'react';
import { Code2, ChevronDown, ChevronRight, Save, Check, Trash2, LoaderCircle } from 'lucide-react';
import { workspace } from '../app/workspace.ts';
import { blockOutputNames, reconcileScriptOutputs, scriptOutputNames } from '../core/project/script-outputs.ts';
import { componentReferences } from './referenceData.ts';
import { updatePythonDraft } from '../core/ir/model.ts';
import { scriptSource, removeScript } from './scripts.ts';
import type { Json } from '../core/registry/types.ts';
import { boundedLayout, type PythonWorkspace, type BlockLayout } from './blocks.ts';
const PythonEditor = React.lazy(() => import('./PythonEditor.tsx').then(module => ({ default: module.PythonEditor })));
const BlocksEditor = React.lazy(() => import('./BlocksEditor.tsx').then(module => ({ default: module.BlocksEditor })));

export function ScriptCard({ id }: { id: string }) {
  const state = React.useSyncExternalStore(workspace.subscribe, workspace.getSnapshot);
  const project = state.project, script = project?.scripts[id];
  const [focusLine, setFocusLine] = React.useState<number>();
  const [busy, setBusy] = React.useState(false), [message, setMessage] = React.useState('');
  if (!project || !script) return null;
  const source = scriptSource(script), collapsed = project.editor.nodes[id]?.collapsed ?? false;
  const savedLevel = (project.extensions['actwright.scriptLevels'] as Record<string, Json> | undefined)?.[id];
  const level = savedLevel === 2 || savedLevel === 3 ? savedLevel : 1;
  const layout = ((project.extensions['actwright.blockLayouts'] as Record<string, Json> | undefined)?.[id] ?? null) as BlockLayout | null;
  const rule = project.triggerRules.find(entry => entry.targets.some(target => target.kind === 'script' && target.scriptId === id));
  const event = rule?.source.member ?? 'Unconnected';
  const owner = script.ownerId === project.game.id ? 'Game' : project.instances[script.ownerId]?.name ?? 'Component';
  function change(value: string, blockState?: Json): void {
    if (value === source && !blockState) return;
    workspace.commit(p => {
      p.scripts[id] = updatePythonDraft(p.scripts[id]!, value);
      const layouts = (p.extensions['actwright.blockLayouts'] ?? {}) as Record<string, Json>;
      if (blockState) { layouts[id] = { source: value, state: boundedLayout(value, blockState as unknown as PythonWorkspace) as unknown as Json }; reconcileScriptOutputs(p, id, value, blockOutputNames(blockState, scriptOutputNames(p, id))); } else delete layouts[id];
      p.extensions['actwright.blockLayouts'] = layouts;
    }); setMessage('');
  }
  async function check(): Promise<void> {
    setBusy(true); setMessage('');
    try { setMessage(await workspace.checkScript(id) ? 'Python checked. Ready to run or export.' : 'Fix the Python errors listed below.'); }
    catch (error) { setMessage(String(error)); }
    finally { setBusy(false); }
  }
  async function switchLevel(next: 1 | 2 | 3): Promise<void> {
    if (next < 3 && level === 3 && (script?.draft || !layout || layout.source !== source)) {
      setBusy(true);
      try { await workspace.checkScript(id); }
      catch (error) { setMessage(String(error)); }
      finally { setBusy(false); }
    }
    workspace.commit(p => { const levels = (p.extensions['actwright.scriptLevels'] ?? {}) as Record<string, Json>; levels[id] = next; p.extensions['actwright.scriptLevels'] = levels; });
  }
  async function save(): Promise<void> {
    setBusy(true);
    try { await workspace.flush(); setMessage('Script saved in this Act.'); }
    catch (error) { setMessage(String(error)); }
    finally { setBusy(false); }
  }
  return <article className={`script-card ${collapsed ? 'is-collapsed' : ''}`} data-script-id={id} aria-label={`Script ${script.name}`}>
    <header className="script-card-heading"><span className="node-symbol"><Code2 size={18}/></span><div className="script-card-title"><small>{owner} · {event}</small><strong>{script.name}</strong></div>
      <div className="script-card-controls" onPointerDown={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}>
        <button className="button compact script-save" title="Save script in the current Act" disabled={busy} onClick={() => void save()}><Save size={13}/>Save</button>
        <button className="icon-button" aria-label="Check Python" title="Check Python" disabled={busy} onClick={() => void check()}>{busy ? <LoaderCircle size={15} className="spin"/> : <Check size={15}/>}</button>
        <button className="icon-button" aria-label={`Delete script ${script.name}`} title="Delete script" onClick={() => workspace.commit(p => removeScript(p, id))}><Trash2 size={14}/></button>
        <button className="icon-button" aria-label={`${collapsed ? 'Expand' : 'Collapse'} script ${script.name}`} title={collapsed ? 'Expand editor' : 'Collapse editor'} onClick={() => workspace.commit(p => { const node = p.editor.nodes[id] ?? { x: 100, y: 100, collapsed: false }; p.editor.nodes[id] = { ...node, collapsed: !collapsed }; })}>{collapsed ? <ChevronRight size={17}/> : <ChevronDown size={17}/>}</button>
      </div>
    </header>
    <div className="script-editor-surface" onPointerDown={e => e.stopPropagation()} onWheel={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}>
      {collapsed ? <div className="script-card-summary"><Code2 size={14}/><span>{source.split('\n').length} lines · {script.draft ? 'draft preserved' : 'checked Python'}</span></div> : <>
        <div className="script-levels" role="group" aria-label="Scripting level">{([1, 2, 3] as const).map(value => <button key={value} aria-pressed={level === value} disabled={busy} onClick={() => void switchLevel(value)}>{value === 1 ? '1 · Descriptive blocks' : value === 2 ? '2 · Python blocks' : '3 · Python'}</button>)}</div>
        <React.Suspense fallback={<div className="script-loading"><LoaderCircle className="spin" size={18}/>Loading editor…</div>}>
          {level === 3 ? <PythonEditor value={source} onChange={value => change(value)} theme={state.theme} diagnostics={script.draft?.diagnostics ?? []} focusLine={focusLine}/>
            : <BlocksEditor key={level} source={source} layout={layout} level={level} theme={state.theme} components={componentReferences(project, script.ownerId)} onChange={change}/>}
        </React.Suspense>
      </>}
      {!!script.draft?.diagnostics.length && <ul className="script-diagnostics" aria-label="Python errors">{script.draft.diagnostics.map((diagnostic, index) => <li key={index}><button className="button compact" onClick={() => { if (collapsed) workspace.commit(p => { const node = p.editor.nodes[id]; if (node) node.collapsed = false; }); setFocusLine(Number(/^Line (\d+):/.exec(diagnostic)?.[1] ?? 1)); void switchLevel(3); }}>{diagnostic} · View in Python</button></li>)}</ul>}
      <div className={`script-feedback ${script.draft?.status === 'invalid' ? 'error' : ''}`} role="status">{script.draft?.diagnostics.join(' · ') || message || (script.draft ? 'Draft saved automatically · check Python before running.' : 'Checked Python · saved automatically.')}</div>
    </div>
  </article>;
}
