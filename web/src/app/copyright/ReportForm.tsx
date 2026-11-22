'use client';

import { useState } from 'react';
import { callApi } from '@/lib/api';

const reasons = ['Copyright', 'Wrong or misleading info', 'Offensive or hateful', 'Spam', 'Other'];

export function ReportForm({ trackId }: { trackId?: string }) {
  const [kind, setKind] = useState<'song' | 'copyright'>('copyright');
  const [reason, setReason] = useState('Copyright');
  const [email, setEmail] = useState('');
  const [work, setWork] = useState('');
  const [statement, setStatement] = useState(false);
  const [note, setNote] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setStatus('');
    try {
      await callApi('/api/reports', {
        method: 'POST',
        body: {
          kind,
          reason,
          ...(trackId ? { trackId } : {}),
          note,
          ...(kind === 'copyright'
            ? { email, claimant: { work, location: trackId ? `/t/${trackId}` : 'Geet', statement } }
            : {}),
        },
      });
      setStatus('Report received. Thank you.');
      setNote('');
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : 'The report could not be sent. Try again.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="report-form" onSubmit={submit}>
      <label>
        Report type
        <select
          value={kind}
          onChange={(event) => setKind(event.target.value as 'song' | 'copyright')}
        >
          <option value="copyright">Copyright and takedown</option>
          <option value="song">Song information or content</option>
        </select>
      </label>
      <label>
        Reason
        <select value={reason} onChange={(event) => setReason(event.target.value)}>
          {reasons.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </label>
      {kind === 'copyright' ? (
        <>
          <label>
            Your contact email
            <input
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              maxLength={254}
            />
          </label>
          <label>
            Copyrighted work
            <input
              required
              value={work}
              onChange={(event) => setWork(event.target.value)}
              maxLength={200}
            />
          </label>
          <label className="report-check">
            <input
              required
              type="checkbox"
              checked={statement}
              onChange={(event) => setStatement(event.target.checked)}
            />
            I have a good-faith belief the use is unauthorised and the information is accurate.
          </label>
        </>
      ) : null}
      <label>
        Details
        <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} />
      </label>
      <button className="btn btn-primary" disabled={busy}>
        {busy ? 'Sending…' : 'Send report'}
      </button>
      <p role="status" aria-live="polite">
        {status}
      </p>
    </form>
  );
}
