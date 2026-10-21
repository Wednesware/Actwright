import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ProjectRepository, SaveConflict } from '../../frontend/src/persistence/repository.ts';
import { createProject } from '../../frontend/src/core/project/model.ts';
import { builtins } from '../../frontend/src/core/registry/registry.ts';
import { addComponent, linkComponent } from '../../frontend/src/core/project/commands.ts';
import { exportAct, importAct, digest } from '../../frontend/src/import-export/archive.ts';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

test('IndexedDB persists projects/revisions across repository reopen, with CAS conflicts', async () => {
  const name = `test-${crypto.randomUUID()}`;
  const first = new ProjectRepository(name), second = new ProjectRepository(name);
  const project = createProject('Original');
  try {
    await first.save(project, null);
    assert.equal((await second.load(project.id))?.project.name, 'Original');
    const updated = structuredClone(project); updated.revision++; updated.name = 'Renamed';
    await first.save(updated, 0);
    const stale = structuredClone(project); stale.revision++; stale.name = 'Stale tab';
    await assert.rejects(second.save(stale, 0), SaveConflict);
    first.close(); await first.open();
    assert.equal((await first.load(project.id))?.project.name, 'Renamed');
    assert.equal((await first.list()).length, 1);
    await first.remove(project.id);
    assert.equal(await first.load(project.id), null);
    assert.equal(await first.revisions.count(), 0);
  } finally { second.close(); await first.delete(); }
});
test('Interrupted/corrupt latest revision recovers an intact version and retains original data', async () => {
  const repository = new ProjectRepository(`recovery-${crypto.randomUUID()}`);
  const project = createProject('Recovery');
  try {
    await repository.save(project, null);
    project.revision = 1; project.name = 'Latest'; await repository.save(project, 0);
    const row = (await repository.projects.get(project.id))!;
    await repository.projects.put({ ...row, project: { broken: true } as never });
    await repository.revisions.put({ key: `${project.id}:1`, projectId: project.id, revision: 1, project: { broken: true } as never });
    const recovered = await repository.load(project.id);
    assert.equal(recovered?.recovered, true);
    assert.equal(recovered?.project.name, 'Recovery');
    assert.equal(recovered?.diskRevision, 1);
    assert.deepEqual((await repository.projects.get(project.id))?.project, { broken: true });
  } finally { await repository.delete(); }
});
test('Archives preserve link identity, unsupported scripts, plugin data and assets exactly', async () => {
  const project = createProject('Portable');
  const registry = builtins();
  const stage = addComponent(project, registry, 'silicon.Stage2D', { aliases: [], config: { width: 5, height: 3 } });
  const player = addComponent(project, registry, 'silicon.Entity', { parentId: stage, aliases: ['player'] });
  linkComponent(project, player, project.game.id, ['hero']);
  const source = '# Exact source\r\nmatch x:\r\n    case _: print("λ")\r\n';
  project.sourceModules['module'] = { id: 'module', path: 'rules.py', encoding: 'utf-8', source };
  project.extensions['absent.plugin'] = { custom: ['preserve', { unknown: true }] };
  project.plugins.push({ id: 'absent.plugin', version: '9', required: true });
  const bytes = new Uint8Array([0, 127, 255, 12]); const hash = await digest(bytes);
  project.assets['texture'] = { id: 'texture', path: 'images/tile.bin', mediaType: 'application/octet-stream', size: bytes.length, sha256: hash };
  const packed = await exportAct(project, new Map([[hash, bytes]]));
  const imported = await importAct(packed);
  assert.deepEqual(imported.project, project);
  assert.deepEqual(imported.assets.get(hash), bytes);
  assert.equal(imported.project.locations.filter(location => location.componentId === player).length, 2);
  const repository = new ProjectRepository(`assets-${crypto.randomUUID()}`);
  try {
    await repository.save(imported.project, null, imported.assets);
    assert.deepEqual((await repository.assetBytes(project)).get(hash), bytes);
  } finally { await repository.delete(); }
});
test('Archive importer rejects tampered payloads, unsupported versions and traversal', async () => {
  const packed = await exportAct(createProject('Integrity'));
  const files = unzipSync(packed);
  const tampered = { ...files, 'project.json': strToU8('{}') };
  await assert.rejects(importAct(zipSync(tampered)), /integrity/);
  const manifest = JSON.parse(strFromU8(files['manifest.json']!)); manifest.version = 2;
  await assert.rejects(importAct(zipSync({ ...files, 'manifest.json': strToU8(JSON.stringify(manifest)) })), /version/);
  await assert.rejects(importAct(zipSync({ '../outside': strToU8('bad') })), /Unsafe/);
  await assert.rejects(importAct(zipSync({ 'safe': new Uint8Array(2_000_000) })), /expansion/);
  await assert.rejects(importAct(new Uint8Array(32)), /ZIP/);
  await assert.rejects(exportAct({ ...createProject(), assets: { lost: { id: 'lost', path: 'lost.png', mediaType: 'image/png', size: 2, sha256: 'x' } } }), /Missing/);
});
test('Recovery history is bounded without dropping the current project', async () => {
  const repository = new ProjectRepository(`bounded-${crypto.randomUUID()}`), project = createProject();
  try {
    for (let revision = 0; revision < 25; revision++) { project.revision = revision; await repository.save(project, revision === 0 ? null : revision - 1); }
    assert.equal(await repository.revisions.count(), 20);
    assert.equal((await repository.load(project.id))?.project.revision, 24);
  } finally { await repository.delete(); }
});
