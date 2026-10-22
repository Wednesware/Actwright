import * as React from 'react';

export function ResizeHandle({ label, value, min, max, axis, direction = 1, onChange }: {
  label: string; value: number; min: number; max: number; axis: 'x' | 'y'; direction?: number; onChange: (size: number) => void;
}) {
  const drag = React.useRef<{ coordinate: number; value: number } | null>(null);
  const change = (size: number) => onChange(Math.round(Math.max(min, Math.min(max, size))));
  return <div className={`panel-resizer ${axis === 'x' ? 'vertical' : 'horizontal'}`} role="separator" tabIndex={0}
    aria-label={label} aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'} aria-valuemin={min} aria-valuemax={Math.round(max)} aria-valuenow={value}
    onPointerDown={event => { event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId); drag.current = { coordinate: axis === 'x' ? event.clientX : event.clientY, value }; }}
    onPointerMove={event => { if (drag.current) change(drag.current.value + direction * ((axis === 'x' ? event.clientX : event.clientY) - drag.current.coordinate)); }}
    onPointerUp={event => { drag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
    onLostPointerCapture={() => { drag.current = null; }}
    onKeyDown={event => {
      const delta = event.shiftKey ? 48 : 16;
      if (event.key === 'Home') change(min);
      else if (event.key === 'End') change(max);
      else if (event.key === (axis === 'x' ? 'ArrowRight' : 'ArrowDown')) change(value + direction * delta);
      else if (event.key === (axis === 'x' ? 'ArrowLeft' : 'ArrowUp')) change(value - direction * delta);
      else return;
      event.preventDefault();
    }}/>;
}

interface PanelSizes { library: number; inspector: number; console: number }
function fitPanels(sizes: PanelSizes): PanelSizes {
  const width = window.innerWidth;
  let library = Math.max(180, Math.min(sizes.library, 600, width * (width <= 650 ? 0.85 : 0.45)));
  let inspector = Math.max(180, Math.min(sizes.inspector, 600, width * (width <= 950 ? 0.85 : 0.45)));
  if (width > 950 && library + inspector > width - 310) {
    const budget = width - 310;
    library = Math.max(180, Math.round(library * budget / (library + inspector)));
    inspector = Math.max(180, budget - library);
  }
  return { library: Math.round(library), inspector: Math.round(inspector), console: Math.round(Math.max(100, Math.min(sizes.console, window.innerHeight * 0.65))) };
}

export function usePanelSizes() {
  const [sizes, setSizes] = React.useState(() => {
    const defaults = { library: 255, inspector: 290, console: 190 };
    try {
      const stored = JSON.parse(localStorage.getItem('actwright-panels') ?? '{}');
      for (const key of ['library', 'inspector', 'console'] as const) if (typeof stored[key] === 'number' && Number.isFinite(stored[key])) defaults[key] = Math.max(key === 'console' ? 100 : 180, Math.min(600, stored[key]));
    } catch { /* Use defaults when storage is unavailable. */ }
    return fitPanels(defaults);
  });
  React.useEffect(() => {
    const fit = () => setSizes(previous => fitPanels(previous));
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  React.useEffect(() => { try { localStorage.setItem('actwright-panels', JSON.stringify(sizes)); } catch { /* Resizing remains available without storage. */ } }, [sizes]);
  return { sizes, resize: (key: keyof typeof sizes, value: number) => setSizes(previous => ({ ...previous, [key]: value })) };
}
