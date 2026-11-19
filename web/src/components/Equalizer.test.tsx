import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Equalizer } from './Equalizer';

describe('Equalizer', () => {
  it('renders five bars', () => {
    const { container } = render(<Equalizer />);
    expect(container.querySelectorAll('.eq > span')).toHaveLength(5);
  });

  it.each([
    [14, 2],
    [24, 3],
    [48, 6],
  ] as const)('size %i scales the bars (%i px)', (size, bar) => {
    const { container } = render(<Equalizer size={size} />);
    const el = container.querySelector('.eq') as HTMLElement;
    expect(el.style.getPropertyValue('--eq-size')).toBe(`${size}px`);
    expect(el.style.getPropertyValue('--eq-bar')).toBe(`${bar}px`);
  });

  it('is hidden from screen readers unless labelled', () => {
    const plain = render(<Equalizer />).container.querySelector('.eq');
    expect(plain?.getAttribute('aria-hidden')).toBe('true');
    const named = render(<Equalizer label="Buffering" />).getByRole('img', { name: 'Buffering' });
    expect(named.getAttribute('aria-hidden')).toBeNull();
  });

  it('can be paused', () => {
    const { container } = render(<Equalizer paused />);
    expect(container.querySelector('.eq')?.className).toContain('eq-paused');
  });

  it('freezes at mid height under prefers-reduced-motion', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/styles/globals.css'), 'utf8');
    const block = css.match(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\n\}/)?.[0] ?? '';
    expect(block).toContain('animation: none');
    expect(block).toContain('scaleY(0.6)');
  });
});
