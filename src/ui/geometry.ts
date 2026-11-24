/*
 * Shared edge geometry: rendering, dragging and hit-testing all use the same
 * cubic Bezier path.
 */

export interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * Cubic Bezier from an output port (facing right) to an input port (facing
 * left). Control distance scales with node distance; equal heights get a
 * shallow arc.
 */
export function edgePath(from: Point, to: Point): string {
  const dx = Math.abs(to.x - from.x);
  const dy = Math.abs(to.y - from.y);
  const handle = Math.max(40, Math.min(200, dx * 0.5 + dy * 0.25));
  const arc = dy < 1 ? 12 : 0;

  const c1 = { x: from.x + handle, y: from.y - arc };
  const c2 = { x: to.x - handle, y: to.y - arc };
  return `M ${from.x} ${from.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${to.x} ${to.y}`;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}
