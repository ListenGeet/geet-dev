'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { callApi } from '@/lib/api';

type State = 'loading' | 'confirm' | 'done' | 'error';

export default function UnsubscribeScreen({ token }: { token: string }) {
  const [state, setState] = useState<State>('loading');
  const [canUndo, setCanUndo] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) {
      setState('error');
      return;
    }
    void callApi<{ valid: boolean; subscribed: boolean; canUndo: boolean }>(
      `/api/email/unsubscribe?t=${encodeURIComponent(token)}`,
    )
      .then((result) => {
        setCanUndo(result.canUndo);
        setState(result.subscribed ? 'confirm' : 'done');
      })
      .catch(() => setState('error'));
  }, [token]);

  async function update(action: 'unsubscribe' | 'undo') {
    setBusy(true);
    try {
      const result = await callApi<{ unsubscribed: boolean }>(
        `/api/email/unsubscribe?t=${encodeURIComponent(token)}`,
        { method: 'POST', body: { action } },
      );
      setState(result.unsubscribed ? 'done' : 'confirm');
    } catch {
      setState('error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="unsubscribe-page">
      {state === 'loading' ? <p role="status">Loading…</p> : null}
      {state === 'confirm' ? (
        <>
          <h1>Unsubscribe from Geet news?</h1>
          <p>You can change this later in email preferences.</p>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => void update('unsubscribe')}
          >
            {busy ? 'Saving…' : 'Unsubscribe'}
          </button>
        </>
      ) : null}
      {state === 'done' ? (
        <>
          <h1>You're unsubscribed.</h1>
          <p>You'll still get security emails.</p>
          <div className="unsubscribe-actions">
            {canUndo ? (
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy}
                onClick={() => void update('undo')}
              >
                Undo
              </button>
            ) : null}
            <Link className="btn btn-secondary" href="/profile">
              Email preferences
            </Link>
          </div>
        </>
      ) : null}
      {state === 'error' ? (
        <>
          <h1>This link is not valid.</h1>
          <p>Open the unsubscribe link from your Geet email again.</p>
        </>
      ) : null}
    </main>
  );
}
