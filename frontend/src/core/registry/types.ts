export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type PythonValue = { kind: 'missing' } | { kind: 'literal'; value: Json } | { kind: 'source'; source: string };
export interface Parameter {
  name: string;
  annotation: string | null;
  kind: 'positionalOnly' | 'positionalOrKeyword' | 'keywordOnly' | 'varPositional' | 'varKeyword';
  default: PythonValue;
}
export interface Member {
  id: string;
  name: string;
  kind: 'input' | 'output' | 'trigger' | 'method' | 'update' | 'property' | 'lifecycle';
  parameters: Parameter[];
  returns: string | null;
  decorators: string[];
  async: boolean;
  description: string;
  line: number;
  rate?: PythonValue;
}
export interface StateDefinition {
  id: string;
  name: string;
  annotation: string | null;
  default: PythonValue;
  scope: PythonValue;
}
export interface ComponentDefinition {
  id: string;
  version: number;
  provider: string;
  name: string;
  module: string;
  kind: 'component' | 'function';
  description: string;
  bases: string[];
  members: Member[];
  state: StateDefinition[];
  constructor: { strategy: '__init__' | '__component__' | 'inherited' | 'function'; parameters: Parameter[] };
  serialization: { toConfig: boolean; fromConfig: boolean; status: 'unknown' | 'declared' | 'basePattern' };
  provenance: { path: string; line: number; endLine: number; revision: string | null };
  confidence: 'static';
  warnings: string[];
  category: string;
  optionalDependencies: string[];
  lifecycleHooks?: string[];
}
