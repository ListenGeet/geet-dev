import type { ButtonHTMLAttributes } from 'react';
import { Equalizer } from './Equalizer';

type Variant = 'primary' | 'secondary' | 'text' | 'destructive';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  small?: boolean;
  /** Destructive only: the filled version for confirm dialogs. */
  confirm?: boolean;
  /** Replaces the label with the equalizer and locks the width (docs/03). */
  loading?: boolean;
}

export function Button({
  variant = 'primary',
  small = false,
  confirm = false,
  loading = false,
  className,
  children,
  disabled,
  style,
  ...rest
}: Props) {
  const classes = [
    'btn',
    `btn-${variant}`,
    small ? 'btn-sm' : '',
    variant === 'destructive' && confirm ? 'btn-confirm' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button
      type="button"
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      style={style}
      {...rest}
    >
      {loading ? (
        <>
          <span className="btn-label-locked">{children}</span>
          <span className="btn-spinner">
            <Equalizer size={24} />
          </span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
