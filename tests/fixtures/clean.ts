export interface Point {
  x: number;
  y: number;
}

export function translate(point: Point, dx: number, dy: number): Point {
  return { x: point.x + dx, y: point.y + dy };
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
