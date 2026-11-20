'use client';

import { useClerk } from '@clerk/nextjs';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useMe } from './MeProvider';

/** Top-right account control: "Sign in" for guests, an avatar with a Sign out menu for everyone else. */
export function AccountMenu() {
  const { me, status } = useMe();
  const { signOut } = useClerk();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  if (status === 'loading') return <span className="account-slot" aria-hidden="true" />;
  if (status === 'guest') {
    return (
      <Link className="btn btn-secondary btn-sm" href="/sign-in">
        Sign in
      </Link>
    );
  }
  const name = me?.displayName ?? me?.username ?? 'You';
  return (
    <div className="account" ref={box}>
      <button
        type="button"
        className="avatar-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        onClick={() => setOpen((v) => !v)}
      >
        {me?.avatarUrl ? (
          <img src={me.avatarUrl} alt="" width={40} height={40} />
        ) : (
          <span>{name.trim().charAt(0).toUpperCase()}</span>
        )}
      </button>
      {open ? (
        <div className="menu" role="menu">
          <div className="menu-head">
            <strong>{name}</strong>
            {me?.username ? <span>@{me.username}</span> : null}
          </div>
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            onClick={() => void signOut({ redirectUrl: '/' })}
          >
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
