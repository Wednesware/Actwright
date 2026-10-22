import * as React from 'react';
import { workspace } from '../app/workspace.ts';
import { runtimeCommand, runtimeStatus, runPython, type InputPrompt, type RuntimeSnapshot, type RuntimeStatus } from './client.ts';

export function useRuntime(projectId: string | undefined) {
  const [status, setStatus] = React.useState<RuntimeStatus>('disconnected'), [busy, setBusy] = React.useState(false);
  const [pendingInput, setPendingInput] = React.useState<InputPrompt | null>(null);
  const cursor = React.useRef(0), runId = React.useRef<string | null>(null), owner = React.useRef<string | undefined>(undefined);
  const apply = React.useCallback((snapshot: RuntimeSnapshot) => {
    if (snapshot.runId === runId.current && snapshot.sequence < cursor.current) return;
    if (snapshot.runId !== runId.current) cursor.current = 0;
    for (const event of snapshot.events) if (event.sequence > cursor.current) {
      if (event.kind === 'log' && event.message !== undefined) workspace.log(event.message, event.level ?? 'info');
      cursor.current = event.sequence;
    }
    cursor.current = Math.max(cursor.current, snapshot.sequence);
    runId.current = snapshot.runId; setStatus(snapshot.status); setPendingInput(snapshot.pendingInput ?? null);
  }, []);
  React.useEffect(() => {
    let disposed = false, timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try { const expectedRun = runId.current; const result = await runtimeStatus(cursor.current); if (!disposed && (runId.current === expectedRun || result.runId === runId.current)) apply(result); }
      catch { if (!disposed) { setStatus('disconnected'); setPendingInput(null); } }
      if (!disposed) timer = setTimeout(() => void poll(), 500);
    };
    void poll(); return () => { disposed = true; clearTimeout(timer); };
  }, [apply]);
  React.useEffect(() => {
    if (owner.current && owner.current !== projectId && runId.current && (status === 'running' || status === 'paused' || status === 'starting')) void runtimeCommand('stop', runId.current).then(apply).catch(() => {});
    owner.current = projectId;
  }, [projectId, apply]);
  async function run(): Promise<void> {
    setBusy(true);
    try {
      const launchedProject = projectId;
      const source = await workspace.pythonSource(true);
      if (owner.current !== launchedProject) throw new Error('The open Act changed. Press Run again.');
      const result = await runPython(source);
      if (owner.current !== launchedProject && result.runId) { await runtimeCommand('stop', result.runId); return; }
      apply(result);
      workspace.log('Game launched from the current Act. Restart to apply script/graph edits.');
    } catch (error) { workspace.log(String(error), 'error'); }
    finally { setBusy(false); }
  }
  async function command(action: 'pause' | 'resume' | 'stop' | 'input' | 'input_reply', data: Record<string, string> = {}): Promise<void> {
    if (!runId.current) return;
    setBusy(true);
    try { apply(await runtimeCommand(action, runId.current, data)); }
    catch (error) { workspace.log(String(error), 'error'); }
    finally { setBusy(false); }
  }
  return { status, pendingInput, busy, run, command };
}
