import type { Json, Parameter } from '../registry/types.ts';
import type { Selector } from '../graph/selectors.ts';

export interface SourceRegion { id: string; source: string; reason: string; context: 'expression' | 'suite' | 'module' }
interface Node { id: string; sourceRegionId?: string }
export type Expression = Node & (
  | { kind: 'literal'; value: Json }
  | { kind: 'variable'; name: string; symbolId: string }
  | { kind: 'unary'; operator: string; operand: Expression }
  | { kind: 'binary'; operator: string; left: Expression; right: Expression }
  | { kind: 'attribute'; object: Expression; name: string; memberId: string | null }
  | { kind: 'call'; callee: Expression; args: Expression[]; keywords: { name: string; value: Expression }[] }
  | { kind: 'selector'; selector: Selector }
  | { kind: 'collection'; collection: 'list' | 'tuple' | 'set'; items: Expression[] }
  | { kind: 'rawExpression'; regionId: string }
);
export type Statement = Node & (
  | { kind: 'expression'; expression: Expression }
  | { kind: 'assignment'; target: Expression; value: Expression }
  | { kind: 'if'; condition: Expression; then: Statement[]; otherwise: Statement[] }
  | { kind: 'while'; condition: Expression; body: Statement[] }
  | { kind: 'for'; target: Expression; iterable: Expression; body: Statement[] }
  | { kind: 'return'; value: Expression | null }
  | { kind: 'comment'; text: string }
  | { kind: 'function' | 'method'; name: string; parameters: Parameter[]; decorators: Expression[]; body: Statement[]; async: boolean }
  | { kind: 'class'; name: string; bases: Expression[]; decorators: Expression[]; body: Statement[] }
  | { kind: 'state'; name: string; value: Expression; scope: 'game' | 'shared' }
  | { kind: 'signalConnect' | 'triggerConnect'; source: Expression; targets: Expression[] }
  | { kind: 'componentCreate'; target: Expression; constructor: Expression }
  | { kind: 'componentLink'; target: Expression; source: Expression }
  | { kind: 'raw'; regionId: string }
  | { kind: 'extension'; provider: string; version: number; payload: Json }
);
export interface Program { version: 1; body: Statement[]; regions: Record<string, SourceRegion> }
export interface ScriptDocument {
  id: string;
  ownerId: string;
  role: 'startup' | 'input' | 'output' | 'trigger' | 'method' | 'update' | 'lifecycle' | 'handler' | 'module';
  name: string;
  parameters: Parameter[];
  program: Program;
  synchronizedSource: string;
  draft: { source: string; revision: number; status: 'pending' | 'invalid'; diagnostics: string[] } | null;
}

export function updatePythonDraft(script: ScriptDocument, source: string): ScriptDocument {
  return { ...script, draft: { source, revision: (script.draft?.revision ?? 0) + 1, status: 'pending', diagnostics: [] } };
}

/** Analysis can only replace IR if it describes the exact current draft. */
export function acceptAnalysis(script: ScriptDocument, revision: number, source: string, program: Program | null, diagnostics: string[]): ScriptDocument {
  if (!script.draft || script.draft.revision !== revision || script.draft.source !== source) return script;
  if (!program) return { ...script, draft: { ...script.draft, status: 'invalid', diagnostics } };
  return { ...script, program, synchronizedSource: source, draft: null };
}
