'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { Equalizer } from '@/components/Equalizer';

export const GATE_TITLES = {
  preview: 'Want the rest of this song?',
  favourite: 'Sign in to save songs',
  playlist: 'Sign in to build playlists',
  friends: 'Sign in to listen with friends',
  ask: 'Sign in to ask Geet',
} as const;

export type GateReason = keyof typeof GATE_TITLES;

interface Props {
  open: boolean;
  reason?: GateReason;
  onClose: () => void;
}

/**
 * The sign-in gate sheet (docs/05): a bottom sheet on phones, a centred dialog on desktop.
 * Built on <dialog>, so focus is trapped, Esc closes it, and a tap on the scrim closes it.
 */
export function SignInGate({ open, reason = 'preview', onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const back = encodeURIComponent(pathname || '/');
  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby="gate-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose(); // the scrim is the dialog's own box
      }}
    >
      <div className="sheet-body">
        <span className="sheet-handle" aria-hidden="true" />
        <Equalizer size={40} />
        <h2 id="gate-title" className="sheet-title">
          {GATE_TITLES[reason]}
        </h2>
        <p className="sheet-text">
          Sign in free to hear full songs, build playlists and listen with friends.
        </p>
        <div className="sheet-actions">
          <Link className="btn btn-primary" href={`/sign-in?redirect_url=${back}`}>
            Sign in
          </Link>
          <Link className="btn btn-secondary" href={`/sign-up?redirect_url=${back}`}>
            Create account
          </Link>
          <button type="button" className="btn btn-text" onClick={onClose}>
            Keep browsing
          </button>
        </div>
      </div>
    </dialog>
  );
}
