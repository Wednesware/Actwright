export interface TutorialProgress {
  version: 1;
  status: 'active' | 'skipped' | 'completed';
  step: 0 | 1 | 2;
}
export function initialTutorial(): TutorialProgress { return { version: 1, status: 'active', step: 0 }; }
export function readTutorial(source: string | undefined): TutorialProgress {
  try {
    const value: unknown = source ? JSON.parse(source) : null;
    if (typeof value === 'object' && value !== null && 'version' in value && value.version === 1
      && 'status' in value && ['active', 'skipped', 'completed'].includes(String(value.status))
      && 'step' in value && [0, 1, 2].includes(Number(value.step)) && typeof value.step === 'number') return value as TutorialProgress;
  } catch { /* Invalid preference data cannot prevent opening the workspace. */ }
  return initialTutorial();
}
