import { ReportForm } from './ReportForm';

export default async function CopyrightPage({
  searchParams,
}: {
  searchParams: Promise<{ track?: string }>;
}) {
  const params = await searchParams;
  return (
    <main className="legal-page">
      <h1>Copyright and takedowns</h1>
      <p>
        Tell us about a song that may use copyrighted work without permission. Include the work,
        where it appears on Geet, your contact details, and a statement that you have a good-faith
        belief the use is unauthorised and that you are the rights holder or their authorised
        representative.
      </p>
      <p>
        We review reports and may remove content while we investigate. Repeat copyright violations
        can lead to an uploader losing access. We aim to respond within three working days.
      </p>
      <p>
        Contact: <a href="mailto:copyright@listengeet.com">copyright@listengeet.com</a>
      </p>
      <h2>Report a song</h2>
      <ReportForm trackId={params.track} />
    </main>
  );
}
