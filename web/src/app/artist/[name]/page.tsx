import { ArtistPage } from './ArtistPage';

export default async function Page({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  return <ArtistPage artistKey={decodeURIComponent(name)} />;
}
