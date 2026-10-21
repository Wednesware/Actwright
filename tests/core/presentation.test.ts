import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../../frontend/src/core/project/model.ts';
import { ProjectHistory } from '../../frontend/src/core/project/commands.ts';
import { builtins } from '../../frontend/src/core/registry/registry.ts';
import { addScript } from '../../frontend/src/scripting/scripts.ts';
import { nodeSize, saveNodeSize, scriptDescription, setScriptDescription } from '../../frontend/src/editors/rete/presentation.ts';
import { importAct, exportAct } from '../../frontend/src/import-export/archive.ts';
import { Workspace } from '../../frontend/src/app/workspace.ts';
import { ProjectRepository } from '../../frontend/src/persistence/repository.ts';
import { readSound } from '../../frontend/src/feedback/preferences.ts';

test('node sizes and script descriptions round-trip through .act and Undo', async () => {
  const project = createProject(), id = addScript(project, project.game.id, 'start');
  const history = new ProjectHistory(project, builtins());
  const next = history.transact(p => { saveNodeSize(p, id, { width: 500, height: 340 }); setScriptDescription(p, id, 'Spawn a player and draw the board.'); });
  const restored = (await importAct(await exportAct(next))).project;
  assert.deepEqual(nodeSize(restored, id), { width: 500, height: 340 });
  assert.equal(scriptDescription(restored, id), 'Spawn a player and draw the board.');
  const previous = history.undo(); assert.equal(nodeSize(previous, id), null); assert.equal(scriptDescription(previous, id), '');
  assert.equal(scriptDescription(history.redo(), id), 'Spawn a player and draw the board.');
});

test('sound preferences clamp invalid values and persist mute and volume across reopening', async () => {
  assert.deepEqual(readSound('{invalid'), { muted: false, volume: 0.18 });
  assert.equal(readSound({ muted: true, volume: 7 }).volume, 1);
  assert.equal(readSound({ volume: -1 }).volume, 0);
  const name = `sounds-${crypto.randomUUID()}`, first = new Workspace(new ProjectRepository(name));
  await first.initialize(); await first.soundPreferences({ muted: true, volume: 0.42 }); await first.dispose();
  const second = new Workspace(new ProjectRepository(name));
  try { await second.initialize(); assert.deepEqual(second.getSnapshot().sound, { muted: true, volume: 0.42 }); }
  finally { await second.dispose(); await new ProjectRepository(name).delete(); }
});
