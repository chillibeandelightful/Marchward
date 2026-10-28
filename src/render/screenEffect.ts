import { Container, Filter, GlProgram, Matrix, RenderTexture, Sprite, type FilterSystem, type RenderSurface, type Renderer, type Texture } from 'pixi.js';

// Pixi's standard filter vertex shader, plus coordinates into the small scene texture (as in its displacement filter).
const VERTEX = `in vec2 aPosition;
out vec2 vTextureCoord;
out vec2 vSceneUv;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
uniform mat3 uSceneMatrix;

void main(void)
{
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
    gl_Position = vec4(position, 0.0, 1.0);
    vTextureCoord = aPosition * (uOutputFrame.zw * uInputSize.zw);
    vSceneUv = (uSceneMatrix * vec3(vTextureCoord, 1.0)).xy;
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
 * With `uSurfaces` on, a pixel is only dithered where the scene and its mask agree: the mask is the
 * scene drawn again with the small things (trees, figures, effects) blacked out, so wherever they
 * show the two differ and the pixel is left as drawn.
 * Written for WebGL 1 as well as 2: the palette is unrolled into the code rather than held in an array.
 */
function fragment(palette: readonly number[]): string {
  const tests = palette
    .map((c) => `    d = col - ${vec3(c)}; dist = dot(d * d, W); if (dist < bestD) { bestD = dist; best = ${vec3(c)}; }`)
    .join('\n');
  return `in vec2 vTextureCoord;
in vec2 vSceneUv;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform sampler2D uScene;
uniform sampler2D uMask;
uniform float uPixel;
uniform float uStrength;
uniform float uSurfaces;

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
    vec3 diff = abs(texture(uScene, vSceneUv).rgb - texture(uMask, vSceneUv).rgb);
    float detail = step(0.004, max(diff.r, max(diff.g, diff.b))) * uSurfaces;
    vec3 col = c.rgb + t * 0.16 * uStrength * (1.0 - detail);
    const vec3 W = vec3(2.0, 4.0, 3.0);
    vec3 best = col;
    float bestD = 1e9;
    vec3 d;
    float dist;
${tests}
    // Small things are left exactly as drawn, so trees keep their greens and figures stay crisp.
    finalColor = vec4(mix(best, c.rgb, detail), 1.0) * c.a;
}
`;
}

/** The palette filter, which also needs to know where on the small scene texture each screen pixel falls. */
class RetroFilter extends Filter {
  constructor(
    palette: readonly number[],
    private readonly view: Sprite,
    private readonly mask: () => Texture,
  ) {
    super({
      glProgram: GlProgram.from({ vertex: VERTEX, fragment: fragment(palette), name: 'retro-palette' }),
      resources: {
        retroUniforms: {
          uPixel: { value: 1, type: 'f32' },
          uStrength: { value: 0, type: 'f32' },
          uSurfaces: { value: 0, type: 'f32' },
          uSceneMatrix: { value: new Matrix(), type: 'mat3x3<f32>' },
        },
        uScene: view.texture.source,
        uMask: view.texture.source,
      },
    });
  }

  get uniforms(): { uPixel: number; uStrength: number; uSurfaces: number; uSceneMatrix: Matrix } {
    return (this.resources.retroUniforms as { uniforms: { uPixel: number; uStrength: number; uSurfaces: number; uSceneMatrix: Matrix } }).uniforms;
  }

  override apply(filterManager: FilterSystem, input: Texture, output: RenderSurface, clearMode: boolean): void {
    filterManager.calculateSpriteMatrix(this.uniforms.uSceneMatrix, this.view);
    this.resources.uScene = this.view.texture.source;
    this.resources.uMask = this.mask().source;
    filterManager.applyFilter(this, input, output, clearMode);
  }
}

/**
 * The retro screen effect: the scene is drawn to a small texture (1/pixel of the screen), scaled
 * back up with nearest-neighbour filtering for chunky pixels, and cut down to a limited palette
 * with ordered dithering. Off, the scene is drawn straight to the screen as usual.
 */
export class ScreenEffect {
  private texture: RenderTexture | null = null;
  private maskTexture: RenderTexture | null = null;
  private readonly view = new Sprite();
  private filter: RetroFilter | null = null;
  private paletteKey = '';
  private on = false;
  private pixel = 1;
  private strength = 0;
  private surfaces = false;
  /** The small things left undithered when only surfaces are: trees, figures, fire and smoke. */
  details: () => readonly Container[] = () => [];

  constructor(
    private readonly renderer: Renderer,
    private readonly stage: Container,
    readonly scene: Container,
  ) {
    stage.addChildAt(scene, 0);
  }

  /** Turn the effect on or off, with a pixel size (1 to 4), dither strength (0 to 1), whether only surfaces are dithered, and palette. */
  configure(on: boolean, pixel: number, strength: number, surfaces: boolean, palette: readonly number[]): void {
    this.pixel = pixel;
    this.strength = strength;
    this.surfaces = surfaces;
    const key = palette.join(',');
    if (on && key !== this.paletteKey) {
      this.paletteKey = key;
      this.filter?.destroy();
      this.filter = new RetroFilter(palette, this.view, () => this.maskTexture ?? this.view.texture);
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
      const old = [this.texture, this.maskTexture];
      this.texture = RenderTexture.create({ width: w, height: h, scaleMode: 'nearest', antialias: false });
      this.maskTexture = RenderTexture.create({ width: w, height: h, scaleMode: 'nearest', antialias: false });
      this.view.texture = this.texture;
      // Point the filter at the new textures before the old ones go.
      if (this.filter) {
        this.filter.resources.uScene = this.texture.source;
        this.filter.resources.uMask = this.maskTexture.source;
      }
      for (const t of old) t?.destroy(true);
    }
    this.scene.scale.set(1 / this.pixel);
    this.renderer.render({ container: this.scene, target: this.texture, clear: true });
    if (this.surfaces && this.maskTexture) {
      // The mask: the same scene with the small things tinted black.
      const details = this.details();
      for (const d of details) d.tint = 0x000000;
      this.renderer.render({ container: this.scene, target: this.maskTexture, clear: true });
      for (const d of details) d.tint = 0xffffff;
    }
    this.view.scale.set(this.pixel);
    if (this.filter) {
      const u = this.filter.uniforms;
      u.uPixel = this.pixel;
      u.uStrength = this.strength;
      u.uSurfaces = this.surfaces ? 1 : 0;
    }
  }
}
