import { PublicProfilePage } from './PublicProfilePage';

export default async function Page({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  return <PublicProfilePage username={decodeURIComponent(username)} />;
}
