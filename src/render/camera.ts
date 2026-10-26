/** View transform for the world container: which world point sits at the screen centre, and the zoom. */
export class Camera {
  x = 0;
  y = 0;
  zoom = 1;
  private bounds = { minX: -Infinity, minY: -Infinity, maxX: Infinity, maxY: Infinity };

  constructor(
    readonly minZoom = 0.3,
    readonly maxZoom = 3,
  ) {}

  /** Keep the screen centre inside this world rectangle. */
  setBounds(minX: number, minY: number, maxX: number, maxY: number): void {
    this.bounds = { minX, minY, maxX, maxY };
    this.clamp();
  }

  centreOn(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.clamp();
  }

  /** Move the view by a screen-space distance (dragging right moves the land right). */
  panBy(dxScreen: number, dyScreen: number): void {
    this.x -= dxScreen / this.zoom;
    this.y -= dyScreen / this.zoom;
    this.clamp();
  }

  /** Zoom by a factor, keeping the world point under screen point (sx, sy) where it is. */
  zoomAt(factor: number, sx: number, sy: number, viewW: number, viewH: number): void {
    const before = this.screenToWorld(sx, sy, viewW, viewH);
    this.zoom = Math.min(this.maxZoom, Math.max(this.minZoom, this.zoom * factor));
    const after = this.screenToWorld(sx, sy, viewW, viewH);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
    this.clamp();
  }

  screenToWorld(sx: number, sy: number, viewW: number, viewH: number): { x: number; y: number } {
    return { x: (sx - viewW / 2) / this.zoom + this.x, y: (sy - viewH / 2) / this.zoom + this.y };
  }

  worldToScreen(wx: number, wy: number, viewW: number, viewH: number): { x: number; y: number } {
    return { x: (wx - this.x) * this.zoom + viewW / 2, y: (wy - this.y) * this.zoom + viewH / 2 };
  }

  private clamp(): void {
    this.x = Math.min(this.bounds.maxX, Math.max(this.bounds.minX, this.x));
    this.y = Math.min(this.bounds.maxY, Math.max(this.bounds.minY, this.y));
  }
}
