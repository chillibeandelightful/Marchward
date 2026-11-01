import type { Camera } from '../render/camera';

/** Keys held down for panning, and how fast they pan (screen pixels per second). */
const PAN_KEYS: Record<string, readonly [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  KeyA: [-1, 0],
  KeyD: [1, 0],
  KeyW: [0, -1],
  KeyS: [0, 1],
};
const PAN_SPEED = 700;
const ZOOM_STEP = 1.2;

export interface CameraInputHooks {
  onHome(): void;
  onToggleGrid(): void;
  /** Should this press drag the view? (Otherwise it's left for the designer tools.) */
  canPan(e: PointerEvent): boolean;
}

/** Mouse, touch and keyboard controls for the camera. Owns no game state. */
export class CameraInput {
  /** Last pointer position over the canvas, or null when it's elsewhere. */
  pointer: { x: number; y: number } | null = null;
  private readonly held = new Set<string>();
  private drag: { id: number; x: number; y: number } | null = null;

  constructor(
    private readonly el: HTMLCanvasElement,
    private readonly camera: Camera,
    hooks: CameraInputHooks,
  ) {
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', (e) => {
      if (!hooks.canPan(e)) return;
      this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
      el.setPointerCapture(e.pointerId);
      el.style.cursor = 'grabbing';
    });
    el.addEventListener('pointermove', (e) => {
      this.pointer = this.local(e);
      if (this.drag?.id !== e.pointerId) return;
      camera.panBy(e.clientX - this.drag.x, e.clientY - this.drag.y);
      this.drag.x = e.clientX;
      this.drag.y = e.clientY;
    });
    const endDrag = (e: PointerEvent) => {
      if (this.drag?.id !== e.pointerId) return;
      this.drag = null;
      el.style.cursor = '';
    };
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);
    el.addEventListener('pointerleave', () => {
      if (!this.drag) this.pointer = null;
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const p = this.local(e);
        this.zoomAt(Math.pow(ZOOM_STEP, -Math.sign(e.deltaY)), p.x, p.y);
      },
      { passive: false },
    );

    window.addEventListener('keydown', (e) => {
      if (e.code in PAN_KEYS) {
        this.held.add(e.code);
        e.preventDefault();
      } else if (e.key === '+' || e.key === '=' || e.code === 'KeyE') {
        this.zoomAt(ZOOM_STEP, el.clientWidth / 2, el.clientHeight / 2);
      } else if (e.key === '-' || e.key === '_' || e.code === 'KeyQ') {
        this.zoomAt(1 / ZOOM_STEP, el.clientWidth / 2, el.clientHeight / 2);
      } else if (e.code === 'Home' || e.code === 'KeyC') {
        hooks.onHome();
      } else if (e.code === 'KeyG') {
        hooks.onToggleGrid();
      }
    });
    window.addEventListener('keyup', (e) => this.held.delete(e.code));
    window.addEventListener('blur', () => this.held.clear());
  }

  /** Apply held pan keys for this frame. */
  update(dtMs: number): void {
    let dx = 0;
    let dy = 0;
    for (const code of this.held) {
      const dir = PAN_KEYS[code];
      if (!dir) continue;
      dx += dir[0];
      dy += dir[1];
    }
    if (dx === 0 && dy === 0) return;
    const step = (PAN_SPEED * dtMs) / 1000;
    // Keys move the view, so the land slides the other way.
    this.camera.panBy(-dx * step, -dy * step);
  }

  private zoomAt(factor: number, x: number, y: number): void {
    this.camera.zoomAt(factor, x, y, this.el.clientWidth, this.el.clientHeight);
  }

  /** A mouse event's position over the canvas. */
  local(e: MouseEvent): { x: number; y: number } {
    const r = this.el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
}
