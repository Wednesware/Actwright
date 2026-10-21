export interface SoundPreferences { muted: boolean; volume: number }
export const defaultSound: SoundPreferences = { muted: false, volume: 0.18 };
export function readSound(value: unknown): SoundPreferences {
  try {
    const data = typeof value === 'string' ? JSON.parse(value) : value;
    if (!data || typeof data !== 'object') return { ...defaultSound };
    return { muted: data.muted === true, volume: typeof data.volume === 'number' && Number.isFinite(data.volume) ? Math.max(0, Math.min(1, data.volume)) : defaultSound.volume };
  } catch { return { ...defaultSound }; }
}
