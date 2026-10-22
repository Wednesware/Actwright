import type { PythonWorkspace } from '../scripting/blocks.ts';
import type { Program } from '../core/ir/model.ts';
import { browserAnalyze, browserCommand, browserRun, browserStatus } from './browser.ts';
const browserRuntime = import.meta.env?.PROD || import.meta.env?.VITE_ACTWRIGHT_BROWSER_RUNTIME === '1';
export type RuntimeStatus = 'disconnected' | 'starting' | 'running' | 'paused' | 'stopped' | 'error';
export interface InputPrompt { requestId: string; prompt: string }
export interface RuntimeEvent { sequence: number; runId: string | null; kind: 'log' | 'status' | 'input_request' | 'input_resolved'; message?: string; level?: 'info' | 'error'; status?: RuntimeStatus }
export interface RuntimeSnapshot { status: RuntimeStatus; runId: string | null; sequence: number; events: RuntimeEvent[]; pendingInput?: InputPrompt | null; token?: string }
let token: string | null = null;
async function request<T>(path: string, payload?: unknown): Promise<T> {
  const response = await fetch(path, { method: payload === undefined ? 'GET' : 'POST', headers: {
    'X-Actwright-Client': 'workspace', ...(payload === undefined ? {} : { 'Content-Type': 'application/json', 'X-Actwright-Token': token ?? '' }),
  }, ...(payload === undefined ? {} : { body: JSON.stringify(payload) }), signal: AbortSignal.timeout(10_000) });
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Start the Python companion with npm run runtime in another terminal.');
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? `Runtime request failed (${response.status})`);
  return data;
}
export async function runtimeStatus(after = 0): Promise<RuntimeSnapshot> {
  if (browserRuntime) return browserStatus(after);
  try { const result = await request<RuntimeSnapshot>(`/api/runtime?after=${after}`); token = result.token ?? null; return result; }
  catch { token = null; throw new Error('Python runtime unavailable. Start npm run runtime in another terminal, then try again.'); }
}
export async function analyzeScript(source: string): Promise<{ program: Program | null; blocks?: PythonWorkspace | null; outputs?: string[]; diagnostics: string[]; line?: number; column?: number }> {
  if (browserRuntime) return browserAnalyze(source);
  if (!token) await runtimeStatus();
  return request('/api/analyze-script', { source });
}
export async function runPython(source: string): Promise<RuntimeSnapshot> {
  if (browserRuntime) return browserRun(source);
  await runtimeStatus();
  return request('/api/runtime/run', { source });
}
export async function runtimeCommand(action: 'pause' | 'resume' | 'stop' | 'input' | 'input_reply', runId: string, data: Record<string, string> = {}): Promise<RuntimeSnapshot> {
  if (browserRuntime) return browserCommand(action, runId, data);
  if (!token) await runtimeStatus();
  return request(`/api/runtime/${action}`, { ...data, runId });
}
