// Programmatic audio cues: amber ticks, a soft green beep, result tones.
// Uses expo-av with synthesized WAV data URIs — no bundled asset files needed.
// Android plays them on the media stream (media volume); iOS plays through the
// silent switch. Background music dips briefly rather than stopping.

import { Audio } from "expo-av";
import type { ReactionGrade } from "@/components/ReactionDisplay";
import { settings } from "./settings";

const SR = 22050; // sample rate

// ── WAV synthesis helpers ──────────────────────────────────────────────────

function buildWavUri(samples: Float32Array): string {
  const n = samples.length;
  const dataBytes = n * 2; // 16-bit PCM
  const buf = new ArrayBuffer(44 + dataBytes);
  const v = new DataView(buf);
  const u8 = new Uint8Array(buf);

  const wr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) u8[off + i] = s.charCodeAt(i);
  };

  wr(0, "RIFF");
  v.setUint32(4, 36 + dataBytes, true);
  wr(8, "WAVE");
  wr(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);      // PCM
  v.setUint16(22, 1, true);      // mono
  v.setUint32(24, SR, true);     // sample rate
  v.setUint32(28, SR * 2, true); // byte rate
  v.setUint16(32, 2, true);      // block align
  v.setUint16(34, 16, true);     // bits per sample
  wr(36, "data");
  v.setUint32(40, dataBytes, true);

  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  let bin = "";
  for (let i = 0; i < u8.byteLength; i++) bin += String.fromCharCode(u8[i]);
  return "data:audio/wav;base64," + btoa(bin);
}

// Soft tick for each amber (~35ms, 800 Hz, fast decay). Short and quiet: it
// marks that the tree is running without being a cue to react to.
function makeTickSamples(): Float32Array {
  const n = Math.floor(SR * 0.035);
  const out = new Float32Array(n);
  let phase = 0;
  const attackN = Math.floor(SR * 0.003);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const env = Math.min(1, i / attackN) * Math.exp(-t * 85);
    phase += (2 * Math.PI * 800) / SR;
    out[i] = 0.7 * env * Math.sin(phase);
  }
  return out;
}

// Clear mid-pitch beep for green (~100ms, 880→1000 Hz), loud enough to hear
// over an engine. Lower than the old 1400→2000 Hz chirp, which read as harsh.
function makeGreenSamples(): Float32Array {
  const n = Math.floor(SR * 0.100);
  const out = new Float32Array(n);
  let phase = 0;
  const attackN = Math.floor(SR * 0.012);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const env = Math.min(1, i / attackN) * Math.exp(-t * 10);
    const freq = 880 + (t / 0.100) * 120;
    phase += (2 * Math.PI * freq) / SR;
    out[i] = 0.85 * env * Math.sin(phase);
  }
  return out;
}

// Bright rising ping for clean results (~110ms, 1600→2100 Hz)
function makeResultGoodSamples(): Float32Array {
  const n = Math.floor(SR * 0.110);
  const out = new Float32Array(n);
  let phase = 0;
  const attackN = Math.floor(SR * 0.006);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const env = Math.min(1, i / attackN) * Math.exp(-t * 9);
    const freq = 1600 + (t / 0.110) * 500;
    phase += (2 * Math.PI * freq) / SR;
    out[i] = 0.8 * env * Math.sin(phase);
  }
  return out;
}

// Low descending buzz for red light (~180ms, 220→60 Hz with square distortion)
function makeResultRedLightSamples(): Float32Array {
  const n = Math.floor(SR * 0.180);
  const out = new Float32Array(n);
  let phase = 0;
  const attackN = Math.floor(SR * 0.005);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const env = Math.min(1, i / attackN) * Math.exp(-t * 7);
    const freq = Math.max(60, 220 - (t / 0.180) * 160);
    phase += (2 * Math.PI * freq) / SR;
    const sine = Math.sin(phase);
    out[i] = 0.85 * env * (0.7 * sine + 0.3 * Math.sign(sine));
  }
  return out;
}

// ── Sound cache ────────────────────────────────────────────────────────────

type SoundSlot = { sound: Audio.Sound } | null;

type SoundKey = "tick" | "green" | "good" | "redlight";

const cache: Record<SoundKey, SoundSlot> = {
  tick:     null,
  green:    null,
  good:     null,
  redlight: null,
};

// Lazily-built WAV data URIs — generated once the first time ensureReady() runs.
let wavUris: Record<SoundKey, string> | null = null;

let initPromise: Promise<void> | null = null;

async function ensureReady(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    // Build WAV data URIs on first use (sync ~1–2ms on device).
    if (!wavUris) {
      wavUris = {
        tick:     buildWavUri(makeTickSamples()),
        green:    buildWavUri(makeGreenSamples()),
        good:     buildWavUri(makeResultGoodSamples()),
        redlight: buildWavUri(makeResultRedLightSamples()),
      };
    }

    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,   // fire through silent switch on iOS
        staysActiveInBackground: false,
        // Android: cues request transient may-duck focus (expo-av's default
        // DuckOthers mode), so music dips for a beep instead of stopping.
        // This flag only controls whether *our* cues get ducked by others.
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false,
      });
    } catch {
      // Some devices reject an audio-mode field; play with the defaults.
    }

    const keys = ["tick", "green", "good", "redlight"] as const;
    await Promise.all(
      keys.map(async (key) => {
        if (cache[key]) return;
        try {
          const { sound } = await Audio.Sound.createAsync(
            { uri: wavUris![key] },
            { shouldPlay: false, volume: 1.0 },
          );
          cache[key] = { sound };
        } catch {
          // Audio unavailable on this device — silently no-op.
        }
      }),
    );
  })().catch(() => {
    // Let the next cue try again instead of staying broken for the session.
    initPromise = null;
  });
  return initPromise;
}

async function playSlot(key: SoundKey): Promise<void> {
  const slot = cache[key];
  if (!slot) return;
  try {
    await slot.sound.replayAsync();
  } catch {
    // Best-effort — ignore playback errors.
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

// Build the sounds ahead of the first run so the first green beep isn't late
// while the player loads (noticeable on slower phones).
export function preloadAudio(): void {
  if (!settings.get().soundEnabled) return;
  void ensureReady();
}

// One tick per amber. Pro Tree ambers light together (three state updates in
// the same instant), so ticks closer than TICK_GAP_MS collapse into one.
const TICK_GAP_MS = 120;
let lastTickAt = 0;
export async function playAmberTick(): Promise<void> {
  if (!settings.get().soundEnabled) return;
  const now = Date.now();
  if (now - lastTickAt < TICK_GAP_MS) return;
  lastTickAt = now;
  await ensureReady();
  await playSlot("tick");
}

export async function playGreenBeep(): Promise<void> {
  if (!settings.get().soundEnabled) return;
  await ensureReady();
  await playSlot("green");
}

// "late" grade → intentional silence; null means no result yet.
export async function playResultTone(grade: ReactionGrade): Promise<void> {
  if (!settings.get().soundEnabled) return;
  if (grade === "late" || grade === null) return;
  await ensureReady();
  await playSlot(grade === "redlight" ? "redlight" : "good");
}
