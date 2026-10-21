import * as React from 'react';
import { defaultSound, type SoundPreferences } from './preferences.ts';
let context: AudioContext | null = null, master: GainNode | null = null, preferences = defaultSound;
let lastSound = 0;
function configure(sound: SoundPreferences) {
  preferences = sound;
  if (context && master) master.gain.setTargetAtTime(sound.muted ? 0 : sound.volume, context.currentTime, 0.01);
}
export function previewSound(): void { playSound(true); }
function playSound(confirm = false): void {
  if (preferences.muted || !preferences.volume || typeof AudioContext === 'undefined') return;
  const now = performance.now(); if (!confirm && now - lastSound < 65) return; lastSound = now;
  try {
    context ??= new AudioContext();
    if (!master) { master = context.createGain(); master.connect(context.destination); }
    master.gain.value = preferences.volume;
    const audio = context, gain = master;
    void audio.resume().then(() => {
      if (preferences.muted || !preferences.volume) return;
      const tone = audio.createOscillator(), envelope = audio.createGain(), start = audio.currentTime;
      tone.type = 'sine'; tone.frequency.setValueAtTime(confirm ? 660 : 480, start);
      tone.frequency.exponentialRampToValueAtTime(confirm ? 880 : 350, start + 0.065);
      envelope.gain.setValueAtTime(0, start); envelope.gain.linearRampToValueAtTime(0.24, start + 0.007);
      envelope.gain.exponentialRampToValueAtTime(0.001, start + 0.085);
      tone.connect(envelope); envelope.connect(gain); tone.start(start); tone.stop(start + 0.09);
      tone.onended = () => { tone.disconnect(); envelope.disconnect(); };
    }).catch(() => {});
  } catch { /* Audio availability never interrupts editing. */ }
}
export function useUIFeedback(sound: SoundPreferences): void {
  React.useEffect(() => { configure(sound); }, [sound.muted, sound.volume]);
  React.useEffect(() => {
    const click = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest('button') : null;
      if (target && !target.disabled && !target.closest('.blocklySvg,.monaco-editor,[data-ui-sound="off"]')) playSound();
    };
    document.addEventListener('click', click);
    return () => { document.removeEventListener('click', click); };
  }, []);
}
