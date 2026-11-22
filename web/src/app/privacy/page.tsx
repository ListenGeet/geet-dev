export default function PrivacyPage() {
  return (
    <main className="legal-page">
      <h1>Privacy</h1>
      <p>
        Last updated November 2026. This draft explains what Geet stores and how to request
        deletion.
      </p>
      <h2>Information we store</h2>
      <p>
        Geet stores account and profile details, favourites, playlists, play history for up to 12
        months, messages, device details, and push tokens when you choose to enable notifications.
        We do not show private listening history or email on public profiles.
      </p>
      <h2>Service providers</h2>
      <p>
        Geet uses Clerk for sign-in, Supabase for account and catalogue data, Backblaze for audio
        storage, Vercel for hosting, Cloudflare for DNS and delivery, and NVIDIA when a person uses
        the assistant.
      </p>
      <h2>Your choices</h2>
      <p>
        You can change profile details and notification preferences in your account. Contact Geet to
        request account and data deletion. Deleted accounts remove associated personal data, subject
        to limited operational and legal retention.
      </p>
      <h2>Children</h2>
      <p>Geet is not for children under 13.</p>
      <h2>Contact</h2>
      <p>
        Privacy questions: <a href="mailto:privacy@listengeet.com">privacy@listengeet.com</a>.
      </p>
    </main>
  );
}
