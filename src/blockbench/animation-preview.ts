import { TrailBuffer, type TrailSample, type Vector3 } from "../workflow/trail-preview.ts";
import { resolveBoneRef, type BoneRef, type BoneTree } from "./bone-tree.ts";

/** Host capabilities used by the trail preview; all reads happen after native frame evaluation. */
export interface AnimationFrameSource {
  /** Subscribes to Blockbench `display_animation_frame`. */
  onAnimationFrame(callback: () => void): () => void;
  boneTree(): BoneTree | null;
  timelineTime(): number;
  selectedAnimationId(): string | null;
  /** World position of the bone's 3D node, copied; `null` when unavailable. */
  boneWorldPosition(uuid: string): Vector3 | null;
  /** Draws the plugin-owned overlay; `null` removes it. */
  setTrailOverlay(points: readonly Vector3[] | null): void;
}

export interface TrailState {
  boneRef: BoneRef | null;
  points: TrailSample[];
  diagnostic: string | null;
}

/**
 * Samples the bound bone after each native animation frame and keeps a
 * bounded trail. An invalid binding clears the trail and stops sampling.
 */
export class AnimationTrailController {
  /** Plain object so the host's Vue 2 can observe it. */
  readonly state: TrailState = { boneRef: null, points: [], diagnostic: null };
  private readonly source: AnimationFrameSource;
  private readonly buffer = new TrailBuffer();
  private unsubscribe: (() => void) | null = null;

  constructor(source: AnimationFrameSource) {
    this.source = source;
  }

  bind(ref: BoneRef | null): void {
    this.state.boneRef = ref;
    this.reset(null);
    if (ref !== null && this.unsubscribe === null) {
      this.unsubscribe = this.source.onAnimationFrame(() => this.sample());
    }
  }

  /** Called on project switch, undo/redo or outliner edits. */
  revalidate(): void {
    if (this.state.boneRef !== null) {
      this.sample();
    }
  }

  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.source.setTrailOverlay(null);
  }

  sample(): void {
    const ref = this.state.boneRef;
    if (ref === null) {
      return;
    }

    const tree = this.source.boneTree();
    const resolution = tree === null ? null : resolveBoneRef(tree, ref);
    if (resolution === null || !resolution.ok) {
      this.reset(resolution?.message ?? "当前没有打开的工程。");
      return;
    }

    const animationId = this.source.selectedAnimationId();
    const position = this.source.boneWorldPosition(resolution.bone.uuid);
    if (animationId === null || position === null) {
      return;
    }

    this.state.diagnostic = null;
    this.buffer.push({ time: this.source.timelineTime(), animationId, position });
    this.state.points = [...this.buffer.points];
    this.source.setTrailOverlay(this.state.points.map((point) => point.position));
  }

  private reset(diagnostic: string | null): void {
    this.buffer.clear();
    this.state.points = [];
    this.state.diagnostic = diagnostic;
    this.source.setTrailOverlay(null);
  }
}
