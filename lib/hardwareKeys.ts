// Hardware button input for hold-and-release (PLAN.md idea 4b).
//
// SCAFFOLD ONLY. Expo has no volume-key listener, so a real implementation
// needs a native module (a small local Expo module, or react-native-keyevent).
// That is new native code, which means:
//   - its own release, with the full F-Droid two-run check (fdroid/README.md)
//   - no other native change in the same release (CLAUDE.md NEVER #5)
//   - the key event must be consumed so the system volume doesn't change
//
// Until then this returns `null` and callers fall back to the on-screen button.

export type KeyHandler = (e: { down: boolean; at: number }) => void;

export interface HardwareKeySource {
  // Start listening; returns an unsubscribe function.
  subscribe(handler: KeyHandler): () => void;
}

export function getHardwareKeySource(): HardwareKeySource | null {
  return null;
}
