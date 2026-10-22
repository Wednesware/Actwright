import * as Blockly from 'blockly/core';
import { box, gameIcon, parentIcon, componentTypes, type ComponentReference } from './referenceData.ts';
export type { ComponentReference } from './referenceData.ts';
const references = new WeakMap<Blockly.Workspace, ComponentReference[]>();
function context(workspace: Blockly.Workspace): ComponentReference[] {
  const main = (workspace as Blockly.WorkspaceSvg).targetWorkspace ?? workspace;
  return references.get(main) ?? [{ id: '$game', name: 'game', type: 'Game', icon: gameIcon }, { id: '$parent', name: 'parent', type: 'Component', icon: parentIcon }];
}
type ReferenceBlock = Blockly.Block & { referenceId: string; refreshReference: () => void };
export function registerComponentBlocks(): void {
  for (const level of [1, 2]) for (const singleton of [false, true]) Blockly.Blocks[`act_l${level}_new_${singleton ? 'singleton' : 'instance'}`] = {
    init(this: Blockly.Block) {
      this.appendDummyInput().appendField(level === 1 ? `New ${singleton ? 'singleton' : 'instance of'}` : `new_${singleton ? 'singleton' : 'instance'}(`)
        .appendField(new Blockly.FieldDropdown(componentTypes().map(type => [type.name, type.id] as [string, string])), 'TYPE');
      if (!singleton) this.appendValueInput('ID').appendField(level === 1 ? 'with ID' : 'id =');
      this.appendValueInput('PARENT').appendField(level === 1 ? 'in parent' : 'parent =');
      this.appendValueInput('ARGS').appendField(level === 1 ? 'constructor arguments' : '*args, **kwargs =');
      this.setOutput(true); this.setColour(260);
      this.setTooltip('Creates a component in game (or the supplied parent) and returns its game-bound reference. Connect an Arguments block for constructor arguments. Entity creation does not automatically spawn or place it. Singleton creation rejects an existing singleton.');
    },
  };

  for (const level of [1, 2]) Blockly.Blocks[`act_l${level}_component`] = {
    init(this: ReferenceBlock) {
      this.referenceId = '$game';
      const options = () => {
        const values = context(this.workspace).map(ref => [ref.name, ref.id] as [string, string]);
        if (!values.some(([, id]) => id === this.referenceId)) values.push(['Missing component', this.referenceId]);
        return values;
      };
      const dropdown = new Blockly.FieldDropdown(options, id => { this.referenceId = String(id); this.refreshReference(); return id; });
      this.appendDummyInput().appendField(new Blockly.FieldImage(gameIcon, 18, 18, 'Component'), 'ICON').appendField(dropdown, 'ID').appendField(new Blockly.FieldLabelSerializable('Game'), 'TYPE');
      this.setOutput(true); this.setColour(260); this.setTooltip('A game-bound reference to this exact component. game and parent are also available directly in Python.');
    },
    refreshReference(this: ReferenceBlock) {
      const ref = context(this.workspace).find(ref => ref.id === this.referenceId);
      this.getField('TYPE')?.setValue(ref?.type ?? 'Missing component');
      this.getField('ICON')?.setValue(ref?.icon ?? box);
    },
    saveExtraState(this: ReferenceBlock) { return { componentId: this.getFieldValue('ID') }; },
    loadExtraState(this: ReferenceBlock, state: { componentId?: string }) {
      this.referenceId = state.componentId ?? '$game'; this.getField('ID')?.setValue(this.referenceId); this.refreshReference();
    },
  };
}
export function setComponentReferences(workspace: Blockly.WorkspaceSvg, refs: ComponentReference[]): void {
  references.set(workspace, refs);
  for (const block of workspace.getAllBlocks(false)) if (typeof (block as unknown as ReferenceBlock).refreshReference === 'function') (block as unknown as ReferenceBlock).refreshReference();
  const selected = workspace.getToolbox()?.getSelectedItem();
  if (selected?.getId() === 'actwright-components') workspace.getToolbox()?.refreshSelection();
}
export function installComponentCategory(workspace: Blockly.WorkspaceSvg, level: 1 | 2): void {
  workspace.registerToolboxCategoryCallback('ACTWRIGHT_COMPONENTS', () => [{ kind: 'block', type: `act_l${level}_output` }, ...context(workspace).map(ref => ({ kind: 'block', type: `act_l${level}_component`, fields: { ID: ref.id }, extraState: { componentId: ref.id } })), { kind: 'label', text: 'Create a component' }, ...['instance', 'singleton'].map(kind => ({ kind: 'block', type: `act_l${level}_new_${kind}`, fields: { TYPE: 'silicon.Entity' } }))]);
}
