import { Container, Graphics } from 'pixi.js';
import type { SimState } from '../sim/state';
import { heightAt } from '../sim/state';
import { isoToScreen, LEVEL_H, TILE_H, TILE_W } from './iso';

const LEVEL_COLOURS = [0x5d8a3c, 0x6f9c47, 0x83ad55];

/** Draws the M0 test scene from sim state. Reads state; never changes it. */
export class TestSceneView {
  readonly root = new Container();
  private readonly ground = new Graphics();
  private readonly actors = new Graphics();

  constructor(state: SimState) {
    this.root.addChild(this.ground, this.actors);
    this.drawGround(state);
  }

  private drawGround(state: SimState): void {
    const g = this.ground;
    // Back-to-front so nearer tiles overlap farther ones.
    for (let d = 0; d < state.width + state.height - 1; d++) {
      for (let x = 0; x < state.width; x++) {
        const y = d - x;
        if (y < 0 || y >= state.height) continue;
        const level = heightAt(state, x, y);
        const { sx, sy } = isoToScreen(x, y, level);
        const hw = TILE_W / 2;
        const hh = TILE_H / 2;
        const side = level * LEVEL_H;
        if (side > 0) {
          g.poly([sx - hw, sy, sx, sy + hh, sx, sy + hh + side, sx - hw, sy + side]).fill(0x6b5338);
          g.poly([sx, sy + hh, sx + hw, sy, sx + hw, sy + side, sx, sy + hh + side]).fill(0x54402b);
        }
        g.poly([sx, sy - hh, sx + hw, sy, sx, sy + hh, sx - hw, sy])
          .fill(LEVEL_COLOURS[level] ?? 0x83ad55)
          .stroke({ width: 1, color: 0x2f4a1f, alpha: 0.6 });
      }
    }
  }

  update(state: SimState): void {
    const g = this.actors.clear();
    for (const w of state.wanderers) {
      const { sx, sy } = isoToScreen(w.x, w.y, heightAt(state, w.x, w.y));
      g.rect(sx - 4, sy - 22, 8, 18).fill(0xc8b27a).stroke({ width: 1, color: 0x3a2e18 });
      g.circle(sx, sy - 26, 5).fill(0xe8d3a8).stroke({ width: 1, color: 0x3a2e18 });
    }
  }
}
