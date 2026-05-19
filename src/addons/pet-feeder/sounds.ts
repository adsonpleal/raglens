// Sound playback for the pet feeder. Two built-in sounds are
// synthesised on the fly via Web Audio (no audio file shipped — keeps
// the bundle small and sidesteps any copyright fuss). Anything else
// is a user-imported file living under raglens' app-data sounds dir;
// we pull the bytes via the Rust `read_sound` command, wrap them in a
// blob URL, and play with HTMLAudioElement.
//
// `playSound` returns a `SoundHandle` so callers can stop a looping
// alert when the pet leaves the alert window (e.g. user fed it).
// Non-looped one-shots return a no-op handle.

import { invoke } from "@tauri-apps/api/core";
import {
  SOUND_DEFAULT_BUZZ,
  SOUND_DEFAULT_CHIME,
  SOUND_NONE,
} from "./config";

export interface SoundHandle {
  stop(): void;
}

const NOOP: SoundHandle = { stop: () => {} };

export async function playSound(
  soundId: string,
  volume: number,
  loop: boolean,
): Promise<SoundHandle> {
  if (soundId === SOUND_NONE) return NOOP;
  const v = clamp01(volume / 100);
  if (soundId === SOUND_DEFAULT_CHIME) {
    return playSynth(v, loop, chimeOnce);
  }
  if (soundId === SOUND_DEFAULT_BUZZ) {
    return playSynth(v, loop, buzzOnce);
  }
  return await playCustom(soundId, v, loop);
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** Re-trigger a synthesised one-shot on a single AudioContext so we
 *  don't leak contexts on every loop tick. Returns a handle the
 *  caller can stop, which kills the schedule and closes the ctx. */
function playSynth(
  volume: number,
  loop: boolean,
  one: (ctx: AudioContext, volume: number) => number,
): SoundHandle {
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const ctx = new Ctor();
  let stopped = false;
  let timer: number | null = null;

  const tick = () => {
    if (stopped) return;
    const durationSec = one(ctx, volume);
    if (loop) {
      timer = window.setTimeout(tick, durationSec * 1000 + 300);
    }
  };
  tick();

  return {
    stop() {
      if (stopped) return;
      stopped = true;
      if (timer !== null) window.clearTimeout(timer);
      void ctx.close();
    },
  };
}

// Bright two-tone chime (A5 → E6 sweep, fast decay). Celebratory but
// not annoying. Returns its duration so the loop scheduler can space
// the next trigger.
function chimeOnce(ctx: AudioContext, volume: number): number {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
  osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.08);
  gain.gain.setValueAtTime(volume * 0.35, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.5);
  return 0.5;
}

// Low ragged sawtooth for the danger zone.
function buzzOnce(ctx: AudioContext, volume: number): number {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(220, ctx.currentTime);
  osc.frequency.linearRampToValueAtTime(180, ctx.currentTime + 0.5);
  gain.gain.setValueAtTime(volume * 0.3, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.55);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.6);
  return 0.6;
}

async function playCustom(
  filename: string,
  volume: number,
  loop: boolean,
): Promise<SoundHandle> {
  try {
    const bytes = await invoke<number[]>("read_sound", { name: filename });
    const blob = new Blob([new Uint8Array(bytes)]);
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.volume = volume;
    audio.loop = loop;
    let revoked = false;
    const revoke = () => {
      if (revoked) return;
      revoked = true;
      URL.revokeObjectURL(url);
    };
    if (!loop) {
      audio.addEventListener("ended", revoke, { once: true });
    }
    audio.addEventListener(
      "error",
      () => {
        console.warn(`[sound] playback failed for ${filename}`);
        revoke();
      },
      { once: true },
    );
    await audio.play();
    return {
      stop() {
        audio.pause();
        audio.currentTime = 0;
        revoke();
      },
    };
  } catch (e) {
    console.warn(`[sound] custom playback failed for ${filename}:`, e);
    return NOOP;
  }
}

export async function listCustomSounds(): Promise<string[]> {
  try {
    return await invoke<string[]>("list_sounds");
  } catch (e) {
    console.warn("[sound] list failed:", e);
    return [];
  }
}

export async function importSound(
  filename: string,
  bytes: Uint8Array,
): Promise<string> {
  return await invoke<string>("import_sound", {
    name: filename,
    bytes: Array.from(bytes),
  });
}
