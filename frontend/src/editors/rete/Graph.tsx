import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { ClassicPreset, NodeEditor, type GetSchemes } from 'rete';
import { AreaPlugin, AreaExtensions } from 'rete-area-plugin';
import { ConnectionPlugin, Presets as ConnectionPresets } from 'rete-connection-plugin';
import { ReactPlugin, Presets, type ReactArea2D, type RenderEmit } from 'rete-react-plugin';
import { MinimapPlugin, type MinimapExtra } from 'rete-minimap-plugin';
import { ChevronDown, ChevronRight, Box, Workflow, Maximize, LayoutGrid, ZoomIn, ZoomOut, Trash2, X } from 'lucide-react';
import { unlinkComponent } from '../../core/project/commands.ts';
import { resolveSelector } from '../../core/graph/selectors.ts';
import type { ComponentDefinition } from '../../core/registry/types.ts';
import { registry, workspace, type WorkspaceState } from '../../app/workspace.ts';
import { scriptOutputNames } from '../../core/project/script-outputs.ts';
import { ScriptNodeCard } from './ScriptNodeCard.tsx';
import { ResizeHandle } from './ResizeHandle.tsx';
import { nodeSize, saveNodeSize, type NodeSize } from './presentation.ts';
import { TutorialCard } from '../../tutorial/TutorialCard.tsx';

export type Relationship = 'signal' | 'trigger' | 'hierarchy' | 'link';
type Filters = Record<Relationship, boolean>;
class ActSocket extends ClassicPreset.Socket {
  kind: Relationship;
  constructor(name: string, kind: Relationship) { super(name); this.kind = kind; }
}
class ActNode extends ClassicPreset.Node<Record<string, ActSocket>, Record<string, ActSocket>> {
  width = 270;
  minHeight = 120;
  editScript: () => void = () => {};
  resize: (size: NodeSize, commit: boolean) => void = () => {};
  height = 250;
  typeName: string;
  category: string;
  summary = '';
  collapsed = false;
  root: boolean;
  script: boolean;
  constructor(id: string, name: string, definition: ComponentDefinition | undefined, root = false, script = false) {
    super(name); this.id = id; this.typeName = definition?.name ?? (root ? 'Game' : 'Missing component');
    this.category = definition?.category ?? 'Core'; this.root = root; this.script = script;
    if (script) { this.typeName = 'Script'; this.category = 'Scripts'; this.addInput('script', new ClassicPreset.Input(new ActSocket('Run script callback', 'trigger'), 'run', true)); return; }
    this.addOutput('children', new ClassicPreset.Output(new ActSocket('Contains components', 'hierarchy'), 'children'));
    if (!root) {
      this.addInput('parent', new ClassicPreset.Input(new ActSocket('Canonical parent', 'hierarchy'), 'parent', true));
      this.addInput('link', new ClassicPreset.Input(new ActSocket('Shortcut reference', 'link'), 'link', true));
    }
    for (const member of definition?.members ?? []) {
      const signature = member.parameters.map(p => p.annotation ?? '?').join(', ');
      if (member.kind === 'input') this.addInput(`in:${member.name}`, new ClassicPreset.Input(new ActSocket(signature, 'signal'), member.name, true));
      if (member.kind === 'output') this.addOutput(`out:${member.name}`, new ClassicPreset.Output(new ActSocket(signature, 'signal'), member.name));
      if (member.kind === 'trigger') {
        this.addInput(`trig-in:${member.name}`, new ClassicPreset.Input(new ActSocket('Callable trigger', 'trigger'), member.name, true));
        this.addOutput(`trig-out:${member.name}`, new ClassicPreset.Output(new ActSocket('Trigger event', 'trigger'), member.name));
      }
    }
    if (root) for (const name of ['start', 'pause', 'resume', 'stop']) this.addOutput(`trig-out:${name}`, new ClassicPreset.Output(new ActSocket('Game lifecycle trigger', 'trigger'), name));
  }
}
class ActConnection extends ClassicPreset.Connection<ActNode, ActNode> {
  kind: Relationship;
  highlighted = false;
  choose: () => void = () => {};
  label = '';
  openMenu: (event: MouseEvent) => void = () => {};
  constructor(source: ActNode, output: string, target: ActNode, input: string, kind: Relationship, id: string) {
    super(source, output, target, input); this.id = id; this.kind = kind; this.label = `${source.label}.${output.replace(/^(out:|trig-out:)/, '')} → ${target.label}.${input.replace(/^(in:|trig-in:)/, '')}`;
  }
}
type Schemes = GetSchemes<ActNode, ActConnection>;
type Extra = ReactArea2D<Schemes> | MinimapExtra;

function GraphNode({ data, emit }: { data: ActNode; emit: RenderEmit<Schemes> }) {

  const port = (key: string, side: 'input' | 'output', label: string, socket: ActSocket) => (
    <div className={`node-port ${side} ${socket.kind}`} key={`${side}:${key}`} data-port={`${side}:${key}`}>
      {side === 'output' && <span className="port-label">{label}<small>{socket.name}</small></span>}
      <Presets.classic.RefSocket<Schemes> name={`${side}-socket`} side={side} socketKey={key} nodeId={data.id} emit={emit} payload={socket} />
      {side === 'input' && <span className="port-label">{label}<small>{socket.name}</small></span>}
    </div>
  );
  const resize = <ResizeHandle name={data.label} size={{ width: data.width, height: data.height }} minimum={{ width: data.script ? 320 : 270, height: data.minHeight }} onResize={data.resize}/>;
  if (data.script) return <div className={`act-node script-graph-node ${data.selected ? 'selected' : ''}`} style={{ width: data.width, height: data.height }} data-testid="graph-node" data-node-id={data.id}>
    <ScriptNodeCard id={data.id} onEdit={data.editScript} ports={<div className="node-ports script-node-ports"><div>{port('script', 'input', 'Run script', data.inputs['script']!.socket)}</div><div>{Object.entries(data.outputs).map(([key, output]) => output && port(key, 'output', output.label ?? key, output.socket))}</div></div>}/>{resize}</div>;

  return <div className={`act-node ${data.selected ? 'selected' : ''} ${data.root ? 'game-node' : ''}`} style={{ width: data.width, height: data.height }} data-testid="graph-node" data-node-id={data.id}>
    <div className="node-heading"><span className="node-symbol">{data.root ? <Workflow size={19}/> : <Box size={19}/>}</span>
      <div><small>{data.typeName}</small><strong>{data.label}</strong></div>
      {!data.root && <button aria-label={`Collapse ${data.label}`} className="icon-button" onPointerDown={e => e.stopPropagation()} onClick={() => workspace.commit(p => { const node = p.editor.nodes[data.id]; if (node) node.collapsed = !node.collapsed; })}>{data.collapsed ? <ChevronRight size={15}/> : <ChevronDown size={15}/>}</button>}
    </div>
    <div className="node-ports">
      <div>{Object.entries(data.inputs).map(([key, input]) => input && port(key, 'input', input.label ?? key, input.socket))}</div>
      <div>{Object.entries(data.outputs).map(([key, output]) => output && port(key, 'output', output.label ?? key, output.socket))}</div>
    </div>
    {!data.collapsed && <div className="node-summary"><span>{data.category}</span><code>{data.summary || 'Ready to configure'}</code></div>}
    {resize}
  </div>;
}
function GraphConnection({ data }: { data: ActConnection }) {
  const { path } = Presets.classic.useConnection();
  return path ? <svg className={`graph-wire ${data.kind} ${data.highlighted ? 'selected' : ''}`} data-edge-id={data.id}>
    <path className="wire-hit" d={path} tabIndex={0} role="button" aria-label={`Select ${data.kind} connection ${data.label}`} aria-pressed={data.highlighted}
      onPointerDown={event => { event.stopPropagation(); if (event.button === 0) { data.choose(); event.currentTarget.focus({ preventScroll: true }); } }}
      onContextMenu={event => { event.preventDefault(); event.stopPropagation(); data.openMenu(event.nativeEvent); }}
      onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); data.choose(); } }}/>
    <path className="wire-line" d={path}/>
  </svg> : null;
}
function GraphSocket({ data }: { data: ActSocket }) {
  return <div className={`act-socket ${data.kind}`} title={`${data.kind}: ${data.name}`} />;
}
interface GraphApi {
  sync(state: WorkspaceState, filters: Filters): Promise<void>;
  highlight(id: string | null): void;
  fit(): Promise<void>;
  zoom(factor: number): void;
  point(event: { clientX: number; clientY: number }): { x: number; y: number };
  destroy(): void;
}
function createGraph(container: HTMLElement, editScript: (id: string) => void, pickEdge: (id: string | null) => void, context: (event: MouseEvent, id: string, kind: 'node' | 'edge') => void): GraphApi {
  const editor = new NodeEditor<Schemes>();
  const area = new AreaPlugin<Schemes, Extra>(container);
  const render = new ReactPlugin<Schemes, Extra>({ createRoot });
  const connection = new ConnectionPlugin<Schemes, Extra>();
  const minimap = new MinimapPlugin<Schemes>();
  render.addPreset(Presets.classic.setup({ customize: { node: () => GraphNode, socket: () => GraphSocket, connection: () => GraphConnection } }));
  render.addPreset(Presets.minimap.setup({ size: 170 }));
  connection.addPreset(ConnectionPresets.classic.setup());
  editor.use(area); area.use(connection); area.use(render); area.use(minimap);
  const accumulating = AreaExtensions.accumulateOnCtrl();
  const selector = AreaExtensions.selector();
  const selectable = AreaExtensions.selectableNodes(area, selector, { accumulating });
  AreaExtensions.zIndexNodesOrder(area);
  let syncing = false, destroyed = false, currentProject = '', selection = '';
  let selectedWire: string | null = null;
  let chain = Promise.resolve();
  let viewportTimer: ReturnType<typeof setTimeout> | undefined;
  const report = (error: unknown) => workspace.log(`Graph: ${String(error)}`, 'error');
  editor.addPipe(event => {
    if (syncing || destroyed) return event;
    if (event.type === 'connectioncreate') {
      const edge = event.data;
      const accepted = workspace.commit(project => {
        if (edge.targetInput === 'script' && String(edge.sourceOutput).startsWith('trig-out:')) {
          const member = String(edge.sourceOutput).slice(9);
          project.triggerRules.push({ id: edge.id, source: edge.source === project.game.id ? { kind: 'game', member: member as 'start' | 'pause' | 'resume' | 'stop' } : { kind: 'component', selector: { id: crypto.randomUUID(), root: edge.source, path: [], result: 'selection' }, member }, targets: [{ kind: 'script', scriptId: edge.target }] });
        } else if (String(edge.sourceOutput).startsWith('out:') && String(edge.targetInput).startsWith('in:')) {
          project.slotEdges.push({ id: edge.id, sourceId: edge.source, output: String(edge.sourceOutput).slice(4), targetId: edge.target, input: String(edge.targetInput).slice(3), enabled: true });
        } else if (String(edge.sourceOutput).startsWith('trig-out:') && String(edge.targetInput).startsWith('trig-in:')) {
          const member = String(edge.sourceOutput).slice(9);
          const target = { kind: 'trigger' as const, selector: { id: crypto.randomUUID(), root: edge.target, path: [], result: 'selection' as const }, member: String(edge.targetInput).slice(8) };
          if (edge.source === project.game.id) {
            if (!['start', 'pause', 'resume', 'stop'].includes(member)) throw new Error('Unknown lifecycle trigger');
            project.triggerRules.push({ id: edge.id, source: { kind: 'game', member: member as 'start' | 'pause' | 'resume' | 'stop' }, targets: [target] });
          } else project.triggerRules.push({ id: edge.id, source: { kind: 'component', selector: { id: crypto.randomUUID(), root: edge.source, path: [], result: 'selection' }, member }, targets: [target] });
        } else throw new Error('Connect an output to an input, or a trigger event to a callable trigger. Edit hierarchy and links in the inspector.');
      });
      // Model changes are rendered through sync; never let plugin state become
      // a second source of truth (including failed/partial rewiring).
      if (accepted) queueMicrotask(() => { /* React subscription schedules sync. */ });
      return undefined;
    }
    if (event.type === 'connectionremove') return undefined;
    return event;
  });
  area.addPipe(event => {
    if (destroyed) return event;
    if (event.type === 'zoomed') container.style.setProperty('--connection-hit-width', `${20 / area.area.transform.k}px`);
    if (event.type === 'contextmenu' && event.data.context !== 'root') {
      event.data.event.preventDefault();
      const item = event.data.context;
      pickEdge(item instanceof ActNode ? null : item.id);
      context(event.data.event, item.id, item instanceof ActNode ? 'node' : 'edge');
    }
    if (!syncing && event.type === 'nodepicked') {
      pickEdge(null);
      const selected = editor.getNodes().filter(n => n.selected).map(n => n.id);
      workspace.clearSelection();
      selected.forEach((id, index) => workspace.select(id, index > 0));
    }
    if (!syncing && event.type === 'nodedragged') {
      workspace.commit(project => {
        for (const node of editor.getNodes()) {
          const position = area.nodeViews.get(node.id)?.position;
          if (position && !node.root) project.editor.nodes[node.id] = { ...position, collapsed: node.collapsed };
        }
      });
    }
    if (!syncing && (event.type === 'zoomed' || event.type === 'translated')) {
      clearTimeout(viewportTimer);
      viewportTimer = setTimeout(() => {
        if (destroyed || syncing) return;
        const { x, y, k } = area.area.transform;
        const previous = workspace.getSnapshot().project?.editor.viewport;
        if (previous && (previous.x !== x || previous.y !== y || previous.zoom !== k)) workspace.commit(project => { project.editor.viewport = { x, y, zoom: k }; });
      }, 180);
    }
    return event;
  });
  async function sync(state: WorkspaceState, filters: Filters): Promise<void> {
    const project = state.project;
    if (!project || destroyed) return;
    syncing = true;
    try {
      const changedProject = currentProject !== project.id;
      if (changedProject) { await editor.clear(); currentProject = project.id; selection = ''; }
      const wantedNodes = new Set([project.game.id, ...project.game.order, ...Object.keys(project.scripts)]);
      const addedScripts: ActNode[] = [];
      for (const edge of editor.getConnections()) await editor.removeConnection(edge.id);
      for (const node of editor.getNodes()) if (!wantedNodes.has(node.id)) await editor.removeNode(node.id);
      for (const id of wantedNodes) {
        if (destroyed) return;
        const root = id === project.game.id;
        const instance = project.instances[id], script = project.scripts[id];
        const definition = instance ? project.definitions[instance.typeId] ?? registry.get(instance.typeId) : undefined;
        let node = editor.getNodes().find(n => n.id === id);
        if (!node) { node = new ActNode(id, root ? project.name : script?.name ?? instance?.name ?? 'Component', definition, root, !!script); await editor.addNode(node); if (script) addedScripts.push(node); }
        node.label = root ? project.name : script?.name ?? instance?.name ?? 'Component';
        node.collapsed = project.editor.nodes[id]?.collapsed ?? false;
        node.summary = root ? `${project.game.order.length} components · ${project.game.tickRate} Hz` : Object.entries(instance?.config ?? {}).slice(0, 2).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join(' · ');
        if (script) {
          const names = scriptOutputNames(project, id);
          for (const key of Object.keys(node.outputs)) if (!names.includes(key.slice(4))) node.removeOutput(key);
          for (const name of names) if (!node.outputs[`out:${name}`]) node.addOutput(`out:${name}`, new ClassicPreset.Output(new ActSocket('Script arguments', 'signal'), name));
        }
        node.minHeight = script ? 210 + Math.max(1, Object.keys(node.outputs).length) * 38 : 90 + Math.max(Object.keys(node.inputs).length, Object.keys(node.outputs).length) * 38 + (node.collapsed ? 0 : 52);
        const savedSize = nodeSize(project, id);
        node.width = Math.max(script ? 320 : 270, savedSize?.width ?? (script ? 380 : 270));
        node.height = Math.max(node.minHeight, savedSize?.height ?? node.minHeight);
        node.editScript = () => editScript(id);
        const sizedNode = node;
        node.resize = (size, commit) => {
          sizedNode.width = size.width; sizedNode.height = size.height;
          void area.resize(id, size.width, size.height).then(() => area.update('node', id)).catch(report);
          if (commit) workspace.commit(p => saveNodeSize(p, id, size));
        };
        await area.update('node', id);
        const position = root ? { x: -240, y: 120 } : project.editor.nodes[id] ?? { x: 100, y: 100 };
        const view = area.nodeViews.get(id);
        if (view && (view.position.x !== position.x || view.position.y !== position.y)) await area.translate(id, position);
      }
      const addEdge = async (sourceId: string, sourcePort: string, targetId: string, targetPort: string, kind: Relationship, id: string) => {
        if (!filters[kind]) return;
        const source = editor.getNodes().find(n => n.id === sourceId), target = editor.getNodes().find(n => n.id === targetId);
        if (source?.outputs[sourcePort] && target?.inputs[targetPort]) {
          const edge = new ActConnection(source, sourcePort, target, targetPort, kind, id);
          edge.highlighted = id === selectedWire; edge.choose = () => pickEdge(id);
          edge.openMenu = event => { pickEdge(id); context(event, id, 'edge'); };
          await editor.addConnection(edge);
        }
      };
      for (const entry of project.locations) await addEdge(entry.parentId, 'children', entry.componentId, entry.kind === 'link' ? 'link' : 'parent', entry.kind === 'link' ? 'link' : 'hierarchy', entry.id);
      for (const edge of project.slotEdges) if (edge.enabled) await addEdge(edge.sourceId, `out:${edge.output}`, edge.targetId, `in:${edge.input}`, 'signal', edge.id);
      for (const rule of project.triggerRules) {
        try {
          const sources = rule.source.kind === 'game' ? [project.game.id] : resolveSelector(project, rule.source.selector);
          for (const [index, target] of rule.targets.entries()) if (target.kind === 'script') {
            for (const source of sources) await addEdge(source, `trig-out:${rule.source.member}`, target.scriptId, 'script', 'trigger', `trigger:${rule.id}:${index}:${source}:${target.scriptId}`);
          } else {
            for (const source of sources) for (const dest of resolveSelector(project, target.selector)) await addEdge(source, `trig-out:${rule.source.member}`, dest, `trig-in:${target.member}`, 'trigger', `trigger:${rule.id}:${index}:${source}:${dest}`);
          }
        } catch { /* Inspector diagnostics explain unresolved live selectors. */ }
      }
      const nextSelection = state.selected.join(',');
      if (selection !== nextSelection) {
        await selector.unselectAll();
        for (const id of state.selected) if (wantedNodes.has(id)) await selectable.select(id, true);
        selection = nextSelection;
      }
      if (!changedProject && addedScripts.length) await AreaExtensions.zoomAt(area, addedScripts);
      if (changedProject) {
        const { x, y, zoom } = project.editor.viewport;
        if (x !== 0 || y !== 0 || zoom !== 1) { await area.area.zoom(zoom); await area.area.translate(x, y); }
        else await AreaExtensions.zoomAt(area, editor.getNodes());
      }
    } finally { syncing = false; }
  }
  return {
    sync(state, filters) { chain = chain.catch(report).then(() => sync(state, filters)); return chain; },
    highlight(id) { selectedWire = id; for (const edge of editor.getConnections()) { if (edge.highlighted !== (edge.id === id)) { edge.highlighted = edge.id === id; void area.update('connection', edge.id).catch(report); } } },
    async fit() { await chain; if (!destroyed) await AreaExtensions.zoomAt(area, editor.getNodes()); },
    zoom(factor) { void area.area.zoom(Math.max(0.15, Math.min(2, area.area.transform.k * factor))); },
    point(event) { const bounds = container.getBoundingClientRect(), transform = area.area.transform; return { x: (event.clientX - bounds.left - transform.x) / transform.k, y: (event.clientY - bounds.top - transform.y) / transform.k }; },
    destroy() { destroyed = true; clearTimeout(viewportTimer); accumulating.destroy(); void chain.finally(() => { area.destroy(); }).catch(report); },
  };
}
export function Graph({ state, onAdd, onAddScript, onInspectTutorial, onEditScript }: { state: WorkspaceState; onAdd: (typeId: string, position?: { x: number; y: number }) => void; onAddScript: (position?: { x: number; y: number }) => void; onInspectTutorial: () => void; onEditScript: (id: string) => void }) {
  const openScript = React.useRef(onEditScript); openScript.current = onEditScript;
  const container = React.useRef<HTMLDivElement>(null), api = React.useRef<GraphApi | null>(null);
  const [filters, setFilters] = React.useState<Filters>({ signal: true, trigger: true, hierarchy: true, link: true });
  const [selectedEdge, setSelectedEdge] = React.useState<string | null>(null);
  const [menu, setMenu] = React.useState<{ x: number; y: number; id: string; kind: 'node' | 'edge' } | null>(null);
  React.useEffect(() => {
    if (!container.current) return;
    const graph = createGraph(container.current, id => openScript.current(id), id => { setSelectedEdge(id); if (id && workspace.getSnapshot().selected.length) workspace.clearSelection(); }, (event, id, kind) => { const rect = container.current!.getBoundingClientRect(); setMenu({ x: event.clientX - rect.left, y: event.clientY - rect.top, id, kind }); });
    api.current = graph;
    return () => { api.current = null; graph.destroy(); };
  }, []);
  React.useEffect(() => { if (api.current) void api.current.sync(state, filters).catch(error => workspace.log(String(error), 'error')); }, [state.project, state.selected, filters]);
  React.useEffect(() => { api.current?.highlight(selectedEdge); }, [selectedEdge]);
  const selectedLocation = state.project?.locations.find(location => location.id === selectedEdge);
  const selectedSignal = state.project?.slotEdges.find(edge => edge.id === selectedEdge);
  const selectedRule = selectedEdge?.startsWith('trigger:') ? state.project?.triggerRules.find(rule => rule.id === selectedEdge.split(':')[1]) : null;
  const selectedExists = !!selectedLocation || !!selectedSignal || !!selectedRule;
  React.useEffect(() => { if (selectedEdge && !selectedExists) setSelectedEdge(null); }, [selectedEdge, selectedExists, state.project?.id]);
  React.useEffect(() => {
    if (!selectedEdge || !selectedExists) return;
    const keydown = (event: KeyboardEvent) => {
      if ((event.target as Element | null)?.closest('input,textarea,select,[contenteditable=true],[role=dialog]')) return;
      if (event.key === 'Escape') { setSelectedEdge(null); setMenu(null); }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault(); event.stopImmediatePropagation();
        if (selectedLocation?.kind !== 'canonical') removeEdge(selectedEdge);
      }
    };
    window.addEventListener('keydown', keydown, true);
    return () => window.removeEventListener('keydown', keydown, true);
  }, [selectedEdge, selectedExists, state.project]);
  const name = (id: string) => id === state.project?.game.id ? state.project.name : state.project?.instances[id]?.name ?? state.project?.scripts[id]?.name ?? 'Component';
  const selectedLabel = selectedSignal ? `${name(selectedSignal.sourceId)}.${selectedSignal.output} → ${name(selectedSignal.targetId)}.${selectedSignal.input}`
    : selectedLocation ? `${name(selectedLocation.parentId)} → ${name(selectedLocation.componentId)}` : selectedRule ? `${selectedRule.source.member} → trigger callback` : '';
  function editParent(): void {
    if (selectedLocation) { workspace.select(selectedLocation.componentId); onInspectTutorial(); setSelectedEdge(null); setMenu(null); }
  }
  const arrange = () => workspace.commit(project => {
    [...project.game.order, ...Object.keys(project.scripts)].forEach((id, index) => { project.editor.nodes[id] = { ...project.editor.nodes[id]!, x: 130 + (index % 3) * 760, y: 80 + Math.floor(index / 3) * 660, collapsed: project.editor.nodes[id]?.collapsed ?? false }; });
  });
  function removeEdge(id: string): void {
    const removed = workspace.commit(project => {
      const entry = project.locations.find(location => location.id === id);
      if (entry) {
        if (entry.kind === 'canonical') throw new Error('Change the canonical parent in the inspector.');
        unlinkComponent(project, id); return;
      }
      if (id.startsWith('trigger:')) {
        const [, ruleId, index] = id.split(':');
        const rule = project.triggerRules.find(rule => rule.id === ruleId);
        if (rule) rule.targets.splice(Number(index), 1);
        project.triggerRules = project.triggerRules.filter(rule => rule.targets.length > 0);
      } else project.slotEdges = project.slotEdges.filter(edge => edge.id !== id);
    });
    if (removed) { setSelectedEdge(null); setMenu(null); }
  }
  return <section className="graph-panel" aria-label="Component graph" onPointerDown={event => { if (menu) setMenu(null); if (!(event.target as Element).closest('.graph-wire,.connection-selection,.graph-context')) setSelectedEdge(null); }}>
    <div className="canvas-heading"><div><span className="eyebrow">WORKSPACE</span><h1>Component graph</h1></div><span className="canvas-hint">Drag to arrange · scroll to zoom</span></div>
    <div className="relationship-filters" aria-label="Relationship visibility">{(Object.keys(filters) as Relationship[]).map(kind => <button key={kind} aria-pressed={filters[kind]} className={filters[kind] ? kind : 'muted'} onClick={() => setFilters({ ...filters, [kind]: !filters[kind] })}><i/>{kind === 'signal' ? 'Signals' : kind === 'trigger' ? 'Triggers' : kind === 'hierarchy' ? 'Hierarchy' : 'Links'}</button>)}</div>
    <div ref={container} className="rete-canvas" data-testid="rete-canvas" onDragOver={event => event.preventDefault()} onDrop={event => { if (event.dataTransfer.getData('application/actwright-script')) { event.preventDefault(); onAddScript(api.current?.point(event)); return; } event.preventDefault(); const typeId = event.dataTransfer.getData('application/actwright-component'); if (typeId) onAdd(typeId, api.current?.point(event)); }}/>
    {selectedEdge && selectedExists && <div className="connection-selection" role="region" aria-label="Selected connection" onPointerDown={event => event.stopPropagation()}>
      <span><small>{selectedLocation?.kind === 'canonical' ? 'Canonical parent' : 'Selected connection'}</small><strong title={selectedLabel}>{selectedLabel}</strong></span>
      {selectedLocation?.kind === 'canonical' ? <button className="button compact" onClick={editParent}>Edit parent</button> : <button className="button compact danger" onClick={() => removeEdge(selectedEdge)}><Trash2 size={14}/>Delete connection</button>}
      <button className="icon-button" aria-label="Deselect connection" onClick={() => setSelectedEdge(null)}><X size={14}/></button>
    </div>}
    <TutorialCard state={state} onAddStage={() => onAdd('silicon.Stage2D')} onInspect={onInspectTutorial}/>
    <div className="canvas-tools"><button title="Zoom out" aria-label="Zoom out" onClick={() => api.current?.zoom(0.85)}><ZoomOut size={17}/></button><button title="Zoom in" aria-label="Zoom in" onClick={() => api.current?.zoom(1.15)}><ZoomIn size={17}/></button><span/><button title="Fit graph" aria-label="Fit graph" onClick={() => void api.current?.fit()}><Maximize size={17}/></button><button title="Arrange nodes" aria-label="Arrange nodes" onClick={arrange}><LayoutGrid size={17}/></button></div>
    {menu && <div className="graph-context" data-relationship-id={menu.id} role="menu" onPointerDown={event => event.stopPropagation()} onContextMenu={event => { event.preventDefault(); event.stopPropagation(); }} style={{ left: menu.x, top: menu.y }}>
      {menu.kind === 'node' ? <><button role="menuitem" onClick={() => { workspace.select(menu.id); setMenu(null); }}>Inspect component</button><button role="menuitem" onClick={() => { workspace.select(menu.id); workspace.removeSelected(); setMenu(null); }}>Delete {state.project?.scripts[menu.id] ? 'script' : 'component'}</button></> : <button role="menuitem" onClick={() => { if (selectedLocation?.kind === 'canonical') editParent(); else removeEdge(menu.id); }}>{selectedLocation?.kind === 'canonical' ? 'Edit parent in Inspector' : 'Remove relationship'}</button>}
    </div>}
  </section>;
}
