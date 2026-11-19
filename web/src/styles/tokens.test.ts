import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { colors } from '@geet/shared';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8').toLowerCase();

describe('design tokens', () => {
  it.each(Object.values(colors))('tokens.css has %s from doc 01', (hex) => {
    expect(css).toContain(hex.toLowerCase());
  });
  it('has no gradient, blur or green', () => {
    const all = [
      css,
      readFileSync(resolve(process.cwd(), 'src/styles/globals.css'), 'utf8').toLowerCase(),
    ].join('\n');
    expect(all).not.toMatch(/gradient|blur\(|backdrop-filter|#1ed760/);
  });
});

describe('illustrations', () => {
  it.each(['offline', 'error', 'no-downloads', 'no-results'])(
    '%s.svg has no glow or gradient',
    (name) => {
      const svg = readFileSync(resolve(process.cwd(), `public/illustrations/${name}.svg`), 'utf8');
      expect(svg).not.toMatch(/Gradient|glow/i);
    },
  );
});
