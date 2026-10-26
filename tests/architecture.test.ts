import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('architecture', () => {
  it('keeps src/sim free of PixiJS, DOM and render/ui imports', () => {
    const dir = join(process.cwd(), 'src', 'sim');
    for (const file of readdirSync(dir)) {
      const src = readFileSync(join(dir, file), 'utf8');
      expect(src, file).not.toMatch(/from ['"]pixi\.js['"]/);
      expect(src, file).not.toMatch(/from ['"]\.\.\/(render|ui)\//);
      expect(src, file).not.toMatch(/\b(document|window)\./);
    }
  });
});
