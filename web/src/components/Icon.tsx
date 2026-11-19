import type { Icon as PhosphorIcon, IconProps } from '@phosphor-icons/react';

interface Props extends Omit<IconProps, 'size' | 'weight'> {
  icon: PhosphorIcon;
  /** Fill weight is for the active or on state only (docs/01). */
  on?: boolean;
  size?: number;
}

/** The one icon wrapper. Phosphor, regular weight at 24 px; fill when on. Decorative unless `aria-label` is set. */
export function Icon({ icon: Glyph, on = false, size = 24, ...rest }: Props) {
  const decorative = rest['aria-label'] === undefined;
  return (
    <Glyph
      size={size}
      weight={on ? 'fill' : 'regular'}
      aria-hidden={decorative ? true : undefined}
      {...rest}
    />
  );
}
