import * as React from 'react';
import { Box, ArrowRight } from 'lucide-react';
import { registry, workspace } from '../app/workspace.ts';
import { Modal } from './Modal.tsx';
import type { ActProject } from '../core/project/model.ts';
import type { Json } from '../core/registry/types.ts';
export function ComponentDialog({ typeId, project, position, onClose }: { typeId: string; project: ActProject; position?: { x: number; y: number }; onClose: () => void }) {
  const definition = registry.require(typeId);
  const params = definition.constructor.parameters.filter(param => !param.kind.startsWith('var'));
  const [parent, setParent] = React.useState(project.game.id);
  const [aliases, setAliases] = React.useState(`${definition.name.toLowerCase()}#`);
  const [singleton, setSingleton] = React.useState(false);
  const [error, setError] = React.useState('');
  const [config, setConfig] = React.useState<Record<string, string>>(() => Object.fromEntries(params.map(param => [param.name,
    param.default.kind === 'literal' ? JSON.stringify(param.default.value) : param.name === 'width' ? '8' : param.name === 'height' ? '6' : ''])));
  function submit(event: React.FormEvent): void {
    event.preventDefault();
    try {
      const values: Record<string, Json> = {};
      for (const param of params) {
        const source = config[param.name]?.trim();
        if (!source) { if (param.default.kind === 'missing') throw new Error(`Provide ${param.name}`); continue; }
        values[param.name] = JSON.parse(source);
      }
      if (!singleton && !aliases.trim()) throw new Error('Provide an ID or choose singleton');
      if (workspace.add(typeId, parent, singleton ? [] : aliases.split(',').map(s => s.trim()).filter(Boolean), values, position)) onClose();
      else setError('The component could not be added. See the console for details.');
    } catch (error) { setError(String(error)); }
  }
  return <Modal title={`Add ${definition.name}`} onClose={onClose}><form onSubmit={submit}>
    <div className="component-intro"><span className="large-symbol"><Box size={24}/></span><div><span className="eyebrow">{definition.category}</span><p>{definition.description || 'A Silicon component. Configure its constructor and position in your Act.'}</p></div></div>
    <label className="field"><span>Parent component</span><select value={parent} onChange={event => setParent(event.target.value)}><option value={project.game.id}>Game · {project.name}</option>{project.game.order.map(id => <option key={id} value={id}>{project.instances[id]?.name} · {project.instances[id]?.typeId.split('.').at(-1)}</option>)}</select></label>
    <label className="toggle-row"><span>Singleton under this parent</span><input type="checkbox" checked={singleton} onChange={event => setSingleton(event.target.checked)}/></label>
    {!singleton && <label className="field"><span>Instance IDs <small>comma-separated · # allocates a number</small></span><input aria-label="Instance IDs" value={aliases} onChange={event => setAliases(event.target.value)} required/></label>}
    {params.length > 0 && <h3>Constructor arguments</h3>}{params.map(param => <label className="field" key={param.name}><span>{param.name}<small>{param.default.kind === 'missing' ? 'required' : 'optional'} · JSON value</small></span><input aria-label={`Constructor ${param.name}`} value={config[param.name] ?? ''} onChange={event => setConfig({ ...config, [param.name]: event.target.value })} placeholder={param.default.kind === 'source' ? `Default Python expression: ${param.default.source}` : 'e.g. 8, "player", null'}/></label>)}
    <p className="muted small">Use JSON values: numbers, quoted strings, arrays, objects, true/false or null. Constructor expressions are not executed by the editor.</p>
    {error && <p className="field-error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="button" onClick={onClose}>Cancel</button><button className="button primary" type="submit">Add component <ArrowRight size={16}/></button></div>
  </form></Modal>;
}
