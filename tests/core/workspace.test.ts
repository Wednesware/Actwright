import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Workspace } from '../../frontend/src/app/workspace.ts';
import { ProjectRepository } from '../../frontend/src/persistence/repository.ts';
import { initialTutorial, readTutorial } from '../../frontend/src/tutorial/progress.ts';

test('workspace queues autosaves and switches projects without losing the latest edit', async () => {
  const name = `workspace-${crypto.randomUUID()}`, repository = new ProjectRepository(name), workspace = new Workspace(repository);
  try {
    await workspace.initialize();
    const original = workspace.getSnapshot().project!.id;
    workspace.commit(project => { project.name = project.game.name = 'First edit'; });
    const first = workspace.flush();
    workspace.commit(project => { project.name = project.game.name = 'Latest edit'; });
    await workspace.flush(); await first;
    assert.equal((await repository.load(original))?.project.name, 'Latest edit');
    assert.equal(workspace.getSnapshot().saveStatus, 'saved');
    await workspace.duplicate();
    assert.notEqual(workspace.getSnapshot().project!.id, original);
    assert.equal(workspace.getSnapshot().project!.name, 'Latest edit copy');
    assert.equal((await repository.list()).length, 2);
    await workspace.open(original);
    assert.equal(workspace.getSnapshot().project!.name, 'Latest edit');
  } finally { await workspace.dispose(); await repository.delete(); }
});
test('workspace exposes a cross-tab conflict and preserves unsaved work as a new Act', async () => {
  const name = `tabs-${crypto.randomUUID()}`;
  const first = new Workspace(new ProjectRepository(name)), second = new Workspace(new ProjectRepository(name));
  try {
    await first.initialize(); await second.initialize();
    const original = first.getSnapshot().project!.id;
    first.commit(project => { project.name = project.game.name = 'First tab'; }); await first.flush();
    second.commit(project => { project.name = project.game.name = 'Second tab'; });
    await assert.rejects(second.flush(), /changed in another tab/);
    assert.equal(second.getSnapshot().saveStatus, 'error');
    await second.keepRecoveryCopy();
    assert.equal(second.getSnapshot().saveStatus, 'saved');
    assert.equal(second.getSnapshot().project!.name, 'Second tab recovered');
    assert.notEqual(second.getSnapshot().project!.id, original);
    assert.equal((await first.repository.load(original))?.project.name, 'First tab');
  } finally { await first.dispose(); await second.dispose(); await new ProjectRepository(name).delete(); }
});
test('workspace repair commits a recovered project at a newer monotonic revision', async () => {
  const name = `repair-${crypto.randomUUID()}`, repository = new ProjectRepository(name), first = new Workspace(repository);
  await first.initialize();
  const original = first.getSnapshot().project!;
  first.commit(project => { project.name = project.game.name = 'Latest'; }); await first.flush();
  await first.dispose();
  await repository.open();
  const row = (await repository.projects.get(original.id))!;
  await repository.projects.put({ ...row, project: { broken: true } as never });
  await repository.revisions.put({ key: `${original.id}:1`, projectId: original.id, revision: 1, project: { broken: true } as never });
  const recovered = new Workspace(repository);
  try {
    await recovered.initialize();
    assert.equal(recovered.getSnapshot().project!.revision, 2);
    assert.equal(recovered.getSnapshot().project!.name, original.name);
    assert.equal(recovered.getSnapshot().saveStatus, 'saved');
    assert.equal((await repository.revisions.get(`${original.id}:1`))!.project['broken' as never], true);
  } finally { await recovered.dispose(); await repository.delete(); }
});
test('skipping or completing the tutorial survives reopening and creating other Acts; replay is explicit', async () => {
  for (const status of ['skipped', 'completed'] as const) {
    const name = `tutorial-${status}-${crypto.randomUUID()}`;
    const first = new Workspace(new ProjectRepository(name));
    await first.initialize();
    assert.deepEqual(first.getSnapshot().tutorial, initialTutorial());
    if (status === 'completed') await first.finishTutorial();
    else await first.setTutorial({ version: 1, status, step: 0 });
    await first.dispose();
    const reopened = new Workspace(new ProjectRepository(name));
    try {
      await reopened.initialize();
      assert.equal(reopened.getSnapshot().tutorial.status, status);
      await reopened.create('Another Act');
      assert.equal(reopened.getSnapshot().tutorial.status, status);
      const before = reopened.getSnapshot().project;
      await reopened.setTutorial(initialTutorial());
      assert.deepEqual(reopened.getSnapshot().tutorial, initialTutorial());
      assert.deepEqual(reopened.getSnapshot().project, before);
    } finally { await reopened.dispose(); await new ProjectRepository(name).delete(); }
  }
});
test('adding a real Stage2D advances only an active tutorial and malformed preferences recover safely', async () => {
  assert.deepEqual(readTutorial('{bad json'), initialTutorial());
  assert.deepEqual(readTutorial('{"version":1,"status":"completed","step":99}'), initialTutorial());
  const repository = new ProjectRepository(`tutorial-progress-${crypto.randomUUID()}`), workspace = new Workspace(repository);
  try {
    await workspace.initialize();
    const root = workspace.getSnapshot().project!.game.id;
    assert.equal(workspace.add('silicon.Stage2D', root, ['stage'], { width: 8, height: 6 }), true);
    // The preference commit is asynchronous; wait for the queued IndexedDB write.
    for (let attempt = 0; attempt < 20 && workspace.getSnapshot().tutorial.step === 0; attempt++) await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(workspace.getSnapshot().tutorial.step, 1);
    await workspace.setTutorial({ version: 1, status: 'skipped', step: 1 });
    assert.equal(workspace.add('silicon.Stage2D', root, ['another'], { width: 4, height: 4 }), true);
    await workspace.flush();
    assert.equal(workspace.getSnapshot().tutorial.status, 'skipped');
  } finally { await workspace.dispose(); await repository.delete(); }
});
