import * as React from 'react';
import { Grip } from 'lucide-react';
import type { NodeSize } from './presentation.ts';
export function ResizeHandle({ name, size, minimum, onResize }: { name: string; size: NodeSize; minimum: NodeSize; onResize: (size: NodeSize, commit: boolean) => void }) {
  const drag = React.useRef<{ x: number; y: number; width: number; height: number; scale: number; next: NodeSize } | null>(null);
  return <button className="node-resize-handle" aria-label={`Resize ${name}`} title="Drag to resize · Arrow keys resize · Shift for larger steps" data-ui-sound="off"
    onPointerDown={event => {
      if (event.button !== 0) return;
      event.stopPropagation(); event.preventDefault();
      const node = event.currentTarget.closest<HTMLElement>('.act-node')!;
      const width = node.offsetWidth, height = node.offsetHeight;
      drag.current = { x: event.clientX, y: event.clientY, width, height, scale: node.getBoundingClientRect().width / width, next: { width, height } };
      event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={event => {
      const start = drag.current; if (!start) return;
      event.stopPropagation();
      start.next = { width: Math.round(Math.max(minimum.width, Math.min(1000, start.width + (event.clientX - start.x) / start.scale))), height: Math.round(Math.max(minimum.height, Math.min(1800, start.height + (event.clientY - start.y) / start.scale))) };
      onResize(start.next, false);
    }}
    onPointerUp={event => { if (!drag.current) return; event.stopPropagation(); const next = drag.current.next; drag.current = null; event.currentTarget.releasePointerCapture(event.pointerId); onResize(next, true); }}
    onPointerCancel={() => { const start = drag.current; drag.current = null; if (start) onResize({ width: start.width, height: start.height }, false); }}
    onKeyDown={event => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation(); const delta = event.shiftKey ? 40 : 10;
      onResize({ width: Math.max(minimum.width, Math.min(1000, size.width + (event.key === 'ArrowRight' ? delta : event.key === 'ArrowLeft' ? -delta : 0))), height: Math.max(minimum.height, Math.min(1800, size.height + (event.key === 'ArrowDown' ? delta : event.key === 'ArrowUp' ? -delta : 0))) }, true);
    }}><Grip size={13}/></button>;
}
