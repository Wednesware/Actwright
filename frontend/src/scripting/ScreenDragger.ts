import * as Blockly from 'blockly/core';
/** Pointer deltas are in screen pixels. The canvas matrix includes both Blockly
 * zoom and any outer CSS/Rete transform; dividing by workspace.scale alone does not. */
export class ScreenDragger extends Blockly.dragging.Dragger {
  protected override pixelsToWorkspaceUnits(delta: Blockly.utils.Coordinate): Blockly.utils.Coordinate {
    const matrix = this.draggable.workspace.getCanvas().getScreenCTM();
    if (!matrix) return super.pixelsToWorkspaceUnits(delta);
    const inverse = matrix.inverse();
    return new Blockly.utils.Coordinate(inverse.a * delta.x + inverse.c * delta.y, inverse.b * delta.x + inverse.d * delta.y);
  }
}
