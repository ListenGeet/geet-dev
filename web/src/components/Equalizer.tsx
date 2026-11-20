import type { CSSProperties } from 'react';

export type EqualizerSize = 14 | 24 | 40 | 48;

interface EqualizerProps {
  /** 14 inline, 24 buffering, 40 the sign-in sheet, 48 empty or loading screens (docs/03, docs/05). */
  size?: EqualizerSize;
  /** Stops the animation but keeps the bars visible. */
  paused?: boolean;
  /** Accessible name. Leave out when the surrounding text already says what is happening. */
  label?: string;
}

/** Five bars, 3 px wide at 24 px. Scaled with the size. Colour comes from `currentColor`, default accent. */
export function Equalizer({ size = 24, paused = false, label }: EqualizerProps) {
  const bar = Math.max(2, Math.round((size * 3) / 24));
  const style = { '--eq-size': `${size}px`, '--eq-bar': `${bar}px` } as CSSProperties;
  return (
    <span
      className={paused ? 'eq eq-paused' : 'eq'}
      style={style}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      data-size={size}
    >
      <span />
      <span />
      <span />
      <span />
      <span />
    </span>
  );
}
