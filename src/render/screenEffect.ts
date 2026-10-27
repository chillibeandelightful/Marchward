import { Container, Filter, GlProgram, RenderTexture, Sprite, type Renderer } from 'pixi.js';

// Pixi's standard filter vertex shader.
const VERTEX = `in vec2 aPosition;
out vec2 vTextureCoord;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

void main(void)
{
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
    gl_Position = vec4(position, 0.0, 1.0);
    vTextureCoord = aPosition * (uOutputFrame.zw * uInputSize.zw);
}
`;

function vec3(c: number): string {
  const f = (v: number) => (v / 255).toFixed(4);
  return `vec3(${f((c >> 16) & 0xff)}, ${f((c >> 8) & 0xff)}, ${f(c & 0xff)})`;
}

/**
 * Snaps every pixel to the nearest colour of a fixed palette, after nudging it by a 4×4 ordered-dither
 * (Bayer) pattern, so in-between colours become a checker of two palette colours as on an old screen.
 * The pattern works on blocks of `uPixel` screen pixels, so it lines up with the chunky pixels.
 * Written for WebGL 1 as well as 2: the palette is unrolled into the code rather than held in an array.
 */
function fragment(palette: readonly number[]): string {
  const tests = palette
    .map((c) => `    d = col - ${vec3(c)}; dist = dot(d * d, W); if (dist < bestD) { bestD = dist; best = ${vec3(c)}; }`)
    .join('\n');
  return `in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform float uPixel;
uniform float uStrength;

float bayer2(vec2 a) {
    a = floor(a);
    return fract(dot(a, vec2(0.5, a.y * 0.75)));
}

float bayer4(vec2 a) {
    return bayer2(0.5 * a) * 0.25 + bayer2(a);
}

void main(void)
{
    vec4 c = texture(uTexture, vTextureCoord);
    float t = bayer4(floor(gl_FragCoord.xy / uPixel)) - 0.47;
    vec3 col = c.rgb + t * 0.16 * uStrength;
    const vec3 W = vec3(2.0, 4.0, 3.0);
    vec3 best = col;
    float bestD = 1e9;
    vec3 d;
    float dist;
${tests}
    finalColor = vec4(best, 1.0) * c.a;
}
`;
}

/**
 * The retro screen effect: the scene is drawn to a small texture (1/pixel of the screen), scaled
 * back up with nearest-neighbour filtering for chunky pixels, and cut down to a limited palette
 * with ordered dithering. Off, the scene is drawn straight to the screen as usual.
 */
export class ScreenEffect {
  private texture: RenderTexture | null = null;
  private readonly view = new Sprite();
  private filter: Filter | null = null;
  private paletteKey = '';
  private on = false;
  private pixel = 1;
  private strength = 0;

  constructor(
    private readonly renderer: Renderer,
    private readonly stage: Container,
    readonly scene: Container,
  ) {
    stage.addChildAt(scene, 0);
  }

  /** Turn the effect on or off, with a pixel size (1 to 4), dither strength (0 to 1) and palette. */
  configure(on: boolean, pixel: number, strength: number, palette: readonly number[]): void {
    this.pixel = pixel;
    this.strength = strength;
    const key = palette.join(',');
    if (on && key !== this.paletteKey) {
      this.paletteKey = key;
      this.filter?.destroy();
      this.filter = new Filter({
        glProgram: GlProgram.from({ vertex: VERTEX, fragment: fragment(palette), name: 'retro-palette' }),
        resources: {
          retroUniforms: {
            uPixel: { value: pixel, type: 'f32' },
            uStrength: { value: strength, type: 'f32' },
          },
        },
      });
      this.view.filters = [this.filter];
    }
    if (on === this.on) return;
    this.on = on;
    if (on) {
      this.stage.removeChild(this.scene);
      this.stage.addChildAt(this.view, 0);
    } else {
      this.stage.removeChild(this.view);
      this.stage.addChildAt(this.scene, 0);
      this.scene.scale.set(1);
    }
  }

  /** Call once a frame, after the scene is positioned and before the stage is drawn. */
  render(width: number, height: number): void {
    if (!this.on) return;
    const w = Math.max(1, Math.ceil(width / this.pixel));
    const h = Math.max(1, Math.ceil(height / this.pixel));
    if (!this.texture || this.texture.width !== w || this.texture.height !== h) {
      this.texture?.destroy(true);
      this.texture = RenderTexture.create({ width: w, height: h, scaleMode: 'nearest', antialias: false });
      this.view.texture = this.texture;
    }
    this.scene.scale.set(1 / this.pixel);
    this.renderer.render({ container: this.scene, target: this.texture, clear: true });
    this.view.scale.set(this.pixel);
    const u = this.filter?.resources.retroUniforms as { uniforms: { uPixel: number; uStrength: number } } | undefined;
    if (u) {
      u.uniforms.uPixel = this.pixel;
      u.uniforms.uStrength = this.strength;
    }
  }
}
