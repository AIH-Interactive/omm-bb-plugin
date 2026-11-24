/*
 * Bounded bone trail for the editor preview. Samples arrive after the host
 * evaluated an animation frame.
 */

export type Vector3 = readonly [number, number, number];

export interface TrailSample {
  /** Timeline time in seconds. */
  readonly time: number;
  readonly animationId: string;
  readonly position: Vector3;
}

export const DEFAULT_TRAIL_LENGTH = 12;

export class TrailBuffer {
  private samples: TrailSample[] = [];
  private readonly maxSamples: number;

  constructor(maxSamples = DEFAULT_TRAIL_LENGTH) {
    this.maxSamples = maxSamples;
  }

  get points(): readonly TrailSample[] {
    return this.samples;
  }

  /**
   * Same-time samples are ignored. Going back in time (scrub, loop) or
   * switching animation restarts the trail so segments never mix.
   */
  push(sample: TrailSample): void {
    const last = this.samples.at(-1);
    if (last !== undefined) {
      if (last.animationId !== sample.animationId || sample.time < last.time) {
        this.samples = [];
      } else if (sample.time === last.time) {
        return;
      }
    }

    const [x, y, z] = sample.position;
    this.samples.push({ ...sample, position: [x, y, z] });
    if (this.samples.length > this.maxSamples) {
      this.samples.shift();
    }
  }

  /** Called when the binding becomes invalid or the project changes. */
  clear(): void {
    this.samples = [];
  }
}
