import * as React from 'react';
import * as Blockly from 'blockly/core';
import * as En from 'blockly/msg/en';
import type { Json } from '../core/registry/types.ts';
import { ScreenDragger } from './ScreenDragger.ts';
import { installComponentCategory, registerComponentBlocks, setComponentReferences, type ComponentReference } from './componentReferences.ts';
import { registerBlocks, toolbox, translateWorkspace } from './blockCatalog.ts';
import { workspacePython, type PythonWorkspace, type BlockLayout } from './blocks.ts';
export type { BlockLayout } from './blocks.ts';

Blockly.setLocale(Object.fromEntries(Object.entries(En).filter((entry): entry is [string, string] => typeof entry[1] === 'string')));
registerBlocks(); registerComponentBlocks();
const themes = {
  dark: Blockly.Theme.defineTheme('actwright_dark', { name: 'actwright_dark', base: Blockly.Themes.Classic, componentStyles: {
    workspaceBackgroundColour: '#10131c', toolboxBackgroundColour: '#171b26', toolboxForegroundColour: '#dce0ee',
    flyoutBackgroundColour: '#1d2230', flyoutForegroundColour: '#dce0ee', flyoutOpacity: 1, scrollbarColour: '#66728a',
    insertionMarkerColour: '#a89aff', insertionMarkerOpacity: 0.5, cursorColour: '#a89aff',
  } }),
  light: Blockly.Theme.defineTheme('actwright_light', { name: 'actwright_light', base: Blockly.Themes.Classic, componentStyles: {
    workspaceBackgroundColour: '#edf0f6', toolboxBackgroundColour: '#fafbfe', toolboxForegroundColour: '#263149',
    flyoutBackgroundColour: '#e9edf5', flyoutForegroundColour: '#263149', flyoutOpacity: 1, scrollbarColour: '#929bb0',
  } }),
};
function loadSource(instance: Blockly.WorkspaceSvg, source: string, layout: BlockLayout | null, level: 1 | 2): void {
  Blockly.Events.disable();
  try {
    instance.clear();
    let loaded = false;
    if (layout && layout.source === source) {
      try { Blockly.serialization.workspaces.load(translateWorkspace(layout.state, level), instance); loaded = true; }
      catch { instance.clear(); }
    }
    if (!loaded && source.trim()) {
      const print = /^print\(("(?:[^"\\]|\\.)*")\)\s*$/.exec(source);
      const state: PythonWorkspace = { blocks: { languageVersion: 0, blocks: [print
        ? { type: 'act_print', inputs: { VALUE: { block: { type: 'act_text', fields: { TEXT: JSON.parse(print[1]!) as string } } } } }
        : { type: 'act_python', extraState: { source } }] } };
      Blockly.serialization.workspaces.load(translateWorkspace(state, level), instance);
    }
    const first = instance.getTopBlocks(true)[0]; if (first) first.moveBy(25 - first.getRelativeToSurfaceXY().x, 25 - first.getRelativeToSurfaceXY().y);
  } finally { Blockly.Events.enable(); }
}
export function BlocksEditor({ source, layout, level, theme, components, onChange }: { source: string; layout: BlockLayout | null; level: 1 | 2; theme: 'dark' | 'light'; components: ComponentReference[]; onChange: (source: string, state: Json) => void }) {
  const element = React.useRef<HTMLDivElement>(null), workspace = React.useRef<Blockly.WorkspaceSvg | null>(null);
  const change = React.useRef(onChange); change.current = onChange;
  const currentSource = React.useRef(source);
  React.useEffect(() => {
    const instance = Blockly.inject(element.current!, { toolbox: toolbox(level), theme: themes[theme],
      plugins: { blockDragger: ScreenDragger }, trashcan: true, scrollbars: true, sounds: false, renderer: 'zelos', zoom: { controls: true, wheel: false, startScale: 0.85 },
    });
    workspace.current = instance;
    setComponentReferences(instance, components); installComponentCategory(instance, level);
    loadSource(instance, source, layout, level);
    const listener = (event: Blockly.Events.Abstract) => {
      if (event.isUiEvent || !new Set<string>([Blockly.Events.BLOCK_CHANGE, Blockly.Events.BLOCK_CREATE, Blockly.Events.BLOCK_DELETE, Blockly.Events.BLOCK_MOVE]).has(event.type)) return;
      const state = translateWorkspace(Blockly.serialization.workspaces.save(instance) as PythonWorkspace);
      const order = instance.getTopBlocks(true).map(block => block.id);
      state.blocks?.blocks.sort((a, b) => order.indexOf(a.id!) - order.indexOf(b.id!));
      const generated = workspacePython(state);
      currentSource.current = generated;
      change.current(generated, state as unknown as Json);
    };
    instance.addChangeListener(listener);
    const resize = new ResizeObserver(() => Blockly.svgResize(instance)); resize.observe(element.current!);
    return () => { resize.disconnect(); instance.removeChangeListener(listener); instance.dispose(); workspace.current = null; };
  }, [level]);
  const referenceKey = JSON.stringify(components);
  React.useEffect(() => { if (workspace.current) setComponentReferences(workspace.current, components); }, [referenceKey]);
  React.useEffect(() => { workspace.current?.setTheme(themes[theme]); }, [theme]);
  React.useEffect(() => {
    if (workspace.current && currentSource.current !== source) { loadSource(workspace.current, source, layout, level); currentSource.current = source; }
  }, [source, layout, level]);
  return <div className="blocks-editor" aria-label={`Level ${level} visual script editor`} ref={element}/>;
}
