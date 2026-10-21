import type { ActProject, TreeLocation } from '../project/model.ts';

export type SelectorToken =
  | { kind: 'exact'; value: string }
  | { kind: 'glob'; pattern: string }
  | { kind: 'numbered'; prefix: string; offset: number };
export type SelectorMatch = { kind: 'singleton' } | { kind: 'ids'; tokens: SelectorToken[]; optional: boolean };
export interface SelectorSegment { typeId: string; match: SelectorMatch }
export interface Selector {
  id: string;
  root: string;
  path: SelectorSegment[];
  result: 'selection' | 'component';
}

/** Parse lookup syntax only. Creation '#' templates have different semantics. */
export function parseMatch(source: string | null): SelectorMatch {
  if (source === null) return { kind: 'singleton' };
  const parts = source.split(',').map(s => s.trim()).filter(Boolean);
  const optional = parts.at(-1)?.endsWith('?') ?? false;
  if (optional) parts[parts.length - 1] = parts.at(-1)!.slice(0, -1);
  return { kind: 'ids', optional, tokens: parts.map(value => {
    if (value.includes('*')) return { kind: 'glob', pattern: value };
    const numbered = /^(.*)#(-\d+)?$/s.exec(value);
    if (numbered) return { kind: 'numbered', prefix: numbered[1]!, offset: Number(numbered[2] ?? 0) };
    return { kind: 'exact', value };
  }) };
}

export function formatMatch(match: SelectorMatch): string | null {
  if (match.kind === 'singleton') return null;
  return match.tokens.map(token => token.kind === 'exact' ? token.value : token.kind === 'glob' ? token.pattern
    : `${token.prefix}#${token.offset === 0 ? '' : token.offset}`).join(',') + (match.optional ? '?' : '');
}

function glob(pattern: string, value: string): boolean {
  const escaped = pattern.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
  return new RegExp(`^${escaped}$`, 's').test(value);
}

function matchLocations(entries: TreeLocation[], match: SelectorMatch): string[] {
  if (match.kind === 'singleton') return entries.filter(e => e.singleton).map(e => e.componentId);
  const result: string[] = [];
  for (const token of match.tokens) {
    let candidates: TreeLocation[];
    if (token.kind === 'numbered') {
      const numbered = entries.filter(entry => entry.aliases.some(alias => alias.startsWith(token.prefix)
        && /^\d+$/.test(alias.slice(token.prefix.length))));
      const index = numbered.length - 1 + token.offset;
      const entry = numbered[index];
      candidates = entry ? [entry] : [];
    } else candidates = entries.filter(entry => token.kind === 'glob' && token.pattern === '*'
      || entry.aliases.some(alias => token.kind === 'exact' ? alias === token.value : glob(token.pattern, alias)));
    for (const entry of candidates) if (!result.includes(entry.componentId)) result.push(entry.componentId);
  }
  return result;
}

/** Resolve afresh on every call, including aliases and links, just like Selection. */
export function resolveSelector(project: ActProject, selector: Selector): string[] {
  if (selector.root !== project.game.id && !Object.hasOwn(project.instances, selector.root)) throw new Error('Unknown selector root');
  let current = [selector.root];
  for (const segment of selector.path) {
    const next: string[] = [];
    for (const parent of current) {
      const entries = project.locations.filter(entry => entry.parentId === parent
        && project.instances[entry.componentId]?.typeId === segment.typeId);
      for (const id of matchLocations(entries, segment.match)) if (!next.includes(id)) next.push(id);
    }
    if (!next.length && segment.match.kind === 'ids' && !segment.match.optional) throw new Error(`No ${segment.typeId} matches selector`);
    current = next;
  }
  if (selector.result === 'component' && current.length !== 1) throw new Error(`Expected one component, selected ${current.length}`);
  return current;
}

export function allocateAliases(template: string[], used: Iterable<string>): string[] {
  const taken = new Set(used);
  const result: string[] = [];
  for (const token of template) {
    if (!token || token.includes('*') || token.includes('#-') || token.endsWith('?')) throw new Error('Invalid creation ID');
    let name = token;
    if (token.includes('#')) {
      if (!/^[^#]*#$/.test(token)) throw new Error('Number template must end with one #');
      const prefix = token.slice(0, -1);
      let index = 0;
      while (taken.has(`${prefix}${index}`) || result.includes(`${prefix}${index}`)) index++;
      name = `${prefix}${index}`;
    }
    if (taken.has(name)) throw new Error(`Duplicate ID: ${name}`);
    if (!result.includes(name)) result.push(name);
  }
  return result;
}
