import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type { ActProject } from '../core/project/model.ts';
import { parseProject } from '../core/validation/project.ts';
import { isRecord } from '../core/validation/schema.ts';

const MAX_ARCHIVE = 32 * 1024 * 1024, MAX_EXPANDED = 128 * 1024 * 1024, MAX_ENTRIES = 2048;
export function safePath(path: string): boolean {
  return path.length > 0 && path.length < 512 && !/[\\\x00-\x1f:]/.test(path) && !path.startsWith('/')
    && path.split('/').every(part => part !== '..' && part !== '.' && part.length > 0);
}
export async function digest(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer);
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
/** Validate central-directory lengths before allocating any inflated contents. */
function preflight(bytes: Uint8Array): void {
  if (bytes.length > MAX_ARCHIVE || bytes.length < 22) throw new Error('Act archive is empty or exceeds 32 MB');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.length - 22;
  while (end >= Math.max(0, bytes.length - 65557) && view.getUint32(end, true) !== 0x06054b50) end--;
  if (end < 0 || view.getUint32(end, true) !== 0x06054b50 || end + 22 + view.getUint16(end + 20, true) !== bytes.length) throw new Error('Invalid ZIP directory');
  const count = view.getUint16(end + 10, true), size = view.getUint32(end + 12, true), offset = view.getUint32(end + 16, true);
  if (view.getUint32(end + 4, true) !== 0 || view.getUint16(end + 8, true) !== count || count > MAX_ENTRIES || offset + size !== end) throw new Error('Unsupported ZIP layout');
  const names = new Set<string>();
  let cursor = offset, total = 0;
  for (let index = 0; index < count; index++) {
    if (cursor + 46 > end || view.getUint32(cursor, true) !== 0x02014b50) throw new Error('Invalid ZIP entry');
    const compressed = view.getUint32(cursor + 20, true), original = view.getUint32(cursor + 24, true);
    const nameSize = view.getUint16(cursor + 28, true), extra = view.getUint16(cursor + 30, true), comment = view.getUint16(cursor + 32, true);
    const local = view.getUint32(cursor + 42, true);
    if (cursor + 46 + nameSize + extra + comment > end || local + 30 > offset) throw new Error('Truncated ZIP entry');
    const name = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(cursor + 46, cursor + 46 + nameSize));
    if (!safePath(name) || names.has(name)) throw new Error(`Unsafe or duplicate archive path: ${name}`);
    names.add(name); total += original;
    if (total > MAX_EXPANDED || original > Math.max(1, compressed) * 500 || view.getUint16(cursor + 8, true) & 1) throw new Error('Archive exceeds expansion limits or is encrypted');
    if (view.getUint32(local, true) !== 0x04034b50) throw new Error('Invalid local ZIP entry');
    const localNameSize = view.getUint16(local + 26, true), localExtra = view.getUint16(local + 28, true);
    if (local + 30 + localNameSize + localExtra + compressed > offset) throw new Error('Overlapping ZIP entry');
    const localName = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(local + 30, local + 30 + localNameSize));
    if (name !== localName || ![0, 8].includes(view.getUint16(cursor + 10, true))) throw new Error('Unsupported or mismatched ZIP entry');
    cursor += 46 + nameSize + extra + comment;
  }
  if (cursor !== end) throw new Error('ZIP entry count mismatch');
}
export async function exportAct(project: ActProject, assets = new Map<string, Uint8Array>()): Promise<Uint8Array> {
  parseProject(project);
  const files: Record<string, Uint8Array> = Object.create(null);
  files['project.json'] = strToU8(JSON.stringify(project));
  for (const module of Object.values(project.sourceModules)) {
    if (!safePath(module.id)) throw new Error('Invalid source module ID');
    files[`sources/${module.id}.py`] = strToU8(module.source);
  }
  for (const asset of Object.values(project.assets)) {
    if (!safePath(asset.path)) throw new Error('Invalid asset path');
    const bytes = assets.get(asset.sha256);
    if (!bytes || bytes.length !== asset.size || await digest(bytes) !== asset.sha256) throw new Error(`Missing or corrupt asset: ${asset.path}`);
    const path = `assets/${asset.path}`;
    if (files[path]) throw new Error('Duplicate asset path');
    files[path] = bytes;
  }
  const entries = await Promise.all(Object.entries(files).map(async ([path, bytes]) => [path, { size: bytes.length, sha256: await digest(bytes) }]));
  files['manifest.json'] = strToU8(JSON.stringify({ format: 'actwright', version: 1, projectId: project.id, files: Object.fromEntries(entries) }));
  const archive = zipSync(files, { level: 6 });
  preflight(archive);
  return archive;
}
export async function importAct(bytes: Uint8Array): Promise<{ project: ActProject; assets: Map<string, Uint8Array> }> {
  preflight(bytes);
  const files = unzipSync(bytes);
  if (!files['manifest.json'] || !files['project.json']) throw new Error('Missing Act manifest or project');
  const manifest: unknown = JSON.parse(strFromU8(files['manifest.json']));
  if (!isRecord(manifest) || manifest['format'] !== 'actwright' || manifest['version'] !== 1 || !isRecord(manifest['files'])) throw new Error('Unsupported Act archive version');
  const listed = manifest['files'];
  if (Object.keys(listed).length !== Object.keys(files).length - 1) throw new Error('Unlisted archive entries');
  for (const [path, info] of Object.entries(listed)) {
    const content = files[path];
    if (path === 'manifest.json' || !safePath(path) || !isRecord(info) || !content || info['size'] !== content.length || info['sha256'] !== await digest(content)) throw new Error(`Archive integrity check failed: ${path}`);
  }
  const project = parseProject(JSON.parse(strFromU8(files['project.json'])));
  if (manifest['projectId'] !== project.id) throw new Error('Manifest project identity mismatch');
  const assets = new Map<string, Uint8Array>();
  for (const asset of Object.values(project.assets)) {
    const content = files[`assets/${asset.path}`];
    if (!safePath(asset.path) || !content || content.length !== asset.size || await digest(content) !== asset.sha256) throw new Error(`Missing asset: ${asset.path}`);
    assets.set(asset.sha256, content);
  }
  for (const module of Object.values(project.sourceModules)) {
    const source = files[`sources/${module.id}.py`];
    if (!safePath(module.id) || !source || strFromU8(source) !== module.source) throw new Error(`Source mismatch: ${module.path}`);
  }
  return { project, assets };
}
