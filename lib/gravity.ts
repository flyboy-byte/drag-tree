// Gravity removal for phones that only have a raw accelerometer (no
// gyroscope, so no Android linear-acceleration sensor).
//
// Gravity is tracked with a slow low-pass filter per axis; linear
// acceleration is the reading minus that estimate. While the reading departs
// from the estimate (a launch, a red light) the estimate is frozen so the
// launch itself isn't absorbed into "gravity" — but only for FREEZE_MAX_MS,
// so a phone that was tilted and left there re-settles instead of reading as
// a permanent push.

export const GRAVITY_TAU_MS = 400;
export const FREEZE_ABOVE = 0.6;     // m/s² — below every launch preset
export const FREEZE_MAX_MS = 1500;

export interface GravityFilter {
  /** Feed one raw sample (m/s², ms). Returns linear-acceleration magnitude in m/s². */
  push(x: number, y: number, z: number, t: number): number;
  reset(): void;
}

export function createGravityFilter(): GravityFilter {
  let gx = 0, gy = 0, gz = 0;
  let lastT: number | null = null;
  let frozenSince: number | null = null;

  return {
    push(x, y, z, t) {
      if (lastT === null) {
        gx = x; gy = y; gz = z; lastT = t;
        return 0;
      }
      const dt = Math.max(0, Math.min(50, t - lastT));
      lastT = t;
      const lx = x - gx, ly = y - gy, lz = z - gz;
      const mag = Math.sqrt(lx * lx + ly * ly + lz * lz);

      let track = true;
      if (mag >= FREEZE_ABOVE) {
        if (frozenSince === null) frozenSince = t;
        track = t - frozenSince >= FREEZE_MAX_MS;
      } else {
        frozenSince = null;
      }
      if (track) {
        const a = dt / (GRAVITY_TAU_MS + dt);
        gx += a * lx; gy += a * ly; gz += a * lz;
      }
      return mag;
    },
    reset() {
      lastT = null;
      frozenSince = null;
    },
  };
}
