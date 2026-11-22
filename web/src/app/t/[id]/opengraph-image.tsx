import { ImageResponse } from 'next/og';

export const alt = 'Song on Geet';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OpenGraphImage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const base = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '');
  let title = 'Music sounds better together.';
  let artist = 'Geet';
  let cover = '';
  try {
    if (base) {
      const response = await fetch(`${base}/api/tracks/${encodeURIComponent(id)}`, {
        next: { revalidate: 300 },
      });
      if (response.ok) {
        const payload = (await response.json()) as {
          track: { title: string; artist: string; coverUrl: string };
        };
        title = payload.track.title;
        artist = payload.track.artist;
        const coverResponse = await fetch(`${base}${payload.track.coverUrl}`);
        if (coverResponse.ok)
          cover = `data:${coverResponse.headers.get('content-type') ?? 'image/jpeg'};base64,${Buffer.from(await coverResponse.arrayBuffer()).toString('base64')}`;
      }
    }
  } catch {
    // The shared page uses the provided default image when catalogue data is unavailable.
  }
  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        alignItems: 'center',
        gap: 48,
        padding: 48,
        background: '#0B1226',
        color: '#FFFFFF',
        fontFamily: 'sans-serif',
      }}
    >
      {cover ? (
        <img src={cover} width="500" height="500" style={{ objectFit: 'cover', borderRadius: 6 }} />
      ) : (
        <div
          style={{
            display: 'flex',
            width: 500,
            height: 500,
            background: '#181818',
            borderRadius: 6,
          }}
        />
      )}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 18 }}>
        <div style={{ color: '#FFDC00', fontSize: 28, fontWeight: 700 }}>GEET</div>
        <div style={{ fontSize: 54, fontWeight: 800, lineHeight: 1.1 }}>{title.slice(0, 90)}</div>
        <div style={{ color: '#B3B3B3', fontSize: 34 }}>{artist.slice(0, 70)}</div>
        <div style={{ color: '#FFDC00', fontSize: 22, marginTop: 28 }}>
          Music sounds better together.
        </div>
      </div>
    </div>,
    size,
  );
}
