import * as React from 'react';
import { scriptOutputNames } from '../core/project/script-outputs.ts';
import { Modal } from './Modal.tsx';
import { registry, workspace } from '../app/workspace.ts';
import type { ActProject } from '../core/project/model.ts';
export function ConnectionDialog({ project, selected, onClose }: { project: ActProject; selected: string[]; onClose: () => void }) {
  const fieldId = React.useId();
  const [kind, setKind] = React.useState<'signal' | 'trigger'>('signal');
  const [source, setSource] = React.useState(selected[0] && (project.instances[selected[0]] || project.scripts[selected[0]]) ? selected[0] : project.game.order[0] ?? project.game.id);
  const [target, setTarget] = React.useState(project.game.order.find(id => id !== source) ?? project.game.order[0] ?? Object.keys(project.scripts)[0] ?? '');
  const [output, setOutput] = React.useState(''), [input, setInput] = React.useState('');
  const [error, setError] = React.useState('');
  const members = (id: string, role: 'input' | 'output' | 'trigger') => {
    if (id === project.game.id) return role === 'trigger' ? ['start', 'pause', 'resume', 'stop'] : [];
    if (project.scripts[id]) return role === 'trigger' ? ['run'] : role === 'output' ? scriptOutputNames(project, id) : [];
    const instance = project.instances[id];
    return instance ? (project.definitions[instance.typeId] ?? registry.get(instance.typeId))?.members.filter(m => m.kind === role).map(m => m.name) ?? [] : [];
  };
  const outputs = members(source, kind === 'signal' ? 'output' : 'trigger'), inputs = members(target, kind === 'signal' ? 'input' : 'trigger');
  const activeOutput = outputs.includes(output) ? output : outputs[0] ?? '', activeInput = inputs.includes(input) ? input : inputs[0] ?? '';
  function submit(event: React.FormEvent): void {
    event.preventDefault();
    if (!activeInput || !activeOutput) { setError('Choose components with available members.'); return; }
    const success = workspace.commit(p => {
      if (kind === 'signal') p.slotEdges.push({ id: crypto.randomUUID(), sourceId: source, output: activeOutput, targetId: target, input: activeInput, enabled: true });
      else {
        const endpoint = p.scripts[target] ? { kind: 'script' as const, scriptId: target } : { kind: 'trigger' as const, selector: { id: crypto.randomUUID(), root: target, path: [], result: 'selection' as const }, member: activeInput };
        if (source === p.game.id) p.triggerRules.push({ id: crypto.randomUUID(), source: { kind: 'game', member: activeOutput as 'start' | 'pause' | 'resume' | 'stop' }, targets: [endpoint] });
        else p.triggerRules.push({ id: crypto.randomUUID(), source: { kind: 'component', selector: { id: crypto.randomUUID(), root: source, path: [], result: 'selection' }, member: activeOutput }, targets: [endpoint] });
      }
    });
    if (success) { workspace.log(`Created a ${kind} connection.`); onClose(); } else setError('Connection rejected. See the console for details.');
  }
  const options = (includeGame: boolean, includeScripts = false) => <>{includeGame && <option value={project.game.id}>Game · {project.name}</option>}{project.game.order.map(id => <option key={id} value={id}>{project.instances[id]?.name} · {project.locations.find(e => e.componentId === id && e.kind === 'canonical')?.aliases.join(', ') || 'singleton'}</option>)}{includeScripts && Object.values(project.scripts).map(script => <option key={script.id} value={script.id}>Script · {script.name}</option>)}</>;
  return <Modal title="Connect components" onClose={onClose}><form onSubmit={submit}>
    <div className="segmented"><button type="button" aria-pressed={kind === 'signal'} onClick={() => setKind('signal')}>Typed signal</button><button type="button" aria-pressed={kind === 'trigger'} onClick={() => setKind('trigger')}>Trigger → callable</button></div>
    <p className="muted">{kind === 'signal' ? 'Pass an output payload to a declared input. Additional inference warns in framework validation mode.' : 'Run a callable trigger after another trigger. Target order is kept separately from slot connections.'}</p>
    <div className="field"><label htmlFor={`${fieldId}-source`}>Source component</label><select id={`${fieldId}-source`} value={source} onChange={event => setSource(event.target.value)}>{options(kind === 'trigger', kind === 'signal')}</select></div>
    <div className="field"><label htmlFor={`${fieldId}-output`}>Source member</label><select id={`${fieldId}-output`} value={activeOutput} onChange={event => setOutput(event.target.value)}>{!outputs.length && <option value="">No available outputs/triggers</option>}{outputs.map(name => <option key={name}>{name}</option>)}</select></div>
    <div className="field"><label htmlFor={`${fieldId}-target`}>Target component</label><select id={`${fieldId}-target`} value={target} onChange={event => setTarget(event.target.value)}>{options(false, kind === 'trigger')}</select></div>
    <div className="field"><label htmlFor={`${fieldId}-input`}>Target member</label><select id={`${fieldId}-input`} value={activeInput} onChange={event => setInput(event.target.value)}>{!inputs.length && <option value="">No available inputs/triggers</option>}{inputs.map(name => <option key={name}>{name}</option>)}</select></div>
    {error && <p role="alert" className="field-error">{error}</p>}<div className="modal-actions"><button type="button" className="button" onClick={onClose}>Cancel</button><button className="button primary" disabled={!activeInput || !activeOutput}>Create connection</button></div>
  </form></Modal>;
}
