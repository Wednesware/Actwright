import * as React from 'react';
import type { Json } from '../core/registry/types.ts';
export function ValueField({ label, value, onSave }: { label: string; value: Json; onSave: (value: Json) => boolean | void }) {
  const [draft, setDraft] = React.useState(typeof value === 'string' ? value : JSON.stringify(value));
  const [error, setError] = React.useState('');
  React.useEffect(() => { setDraft(typeof value === 'string' ? value : JSON.stringify(value)); setError(''); }, [value]);
  const save = () => {
    if (draft === (typeof value === 'string' ? value : JSON.stringify(value))) return;
    try {
      const parsed: Json = typeof value === 'string' ? draft : JSON.parse(draft);
      if (typeof value === 'number' && (typeof parsed !== 'number' || !Number.isFinite(parsed))) throw new Error('Enter a finite number');
      if (onSave(parsed) === false) throw new Error('Change was rejected; see the console');
      setError('');
    } catch (error) { setError(String(error)); }
  };
  if (typeof value === 'boolean') return <label className="toggle-row"><span>{label}</span><input aria-label={label} type="checkbox" checked={value} onChange={event => onSave(event.target.checked)}/></label>;
  return <label className="field"><span>{label}<small>{typeof value === 'string' ? 'string' : typeof value === 'number' ? 'number' : 'JSON'}</small></span>
    <input aria-label={label} value={draft} onChange={event => setDraft(event.target.value)} onBlur={save} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} aria-invalid={!!error}/>{error && <small className="field-error">{error}</small>}
  </label>;
}
