import type { Metadata } from 'next';
import { TrackSharePage } from './TrackSharePage';

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const base = process.env.NEXT_PUBLIC_API_URL;
  if (!base) return { title: 'Song · Geet', openGraph: { images: ['/og/geet-default.jpg'] } };
  try {
    const response = await fetch(
      `${base.replace(/\/$/, '')}/api/tracks/${encodeURIComponent(id)}`,
      { next: { revalidate: 300 } },
    );
    if (!response.ok)
      return { title: 'Song · Geet', openGraph: { images: ['/og/geet-default.jpg'] } };
    const payload = (await response.json()) as { track: { title: string; artist: string } };
    return {
      title: `${payload.track.title} · Geet`,
      description: `${payload.track.title} by ${payload.track.artist} on Geet.`,
      openGraph: {
        title: payload.track.title,
        description: payload.track.artist,
        siteName: 'Geet',
        type: 'music.song',
        images: [`/t/${id}/opengraph-image`],
      },
      twitter: { card: 'summary_large_image', images: [`/t/${id}/opengraph-image`] },
    };
  } catch {
    return { title: 'Song · Geet', openGraph: { images: ['/og/geet-default.jpg'] } };
  }
}

export default async function Page({ params }: Params) {
  const { id } = await params;
  return <TrackSharePage id={id} />;
}
