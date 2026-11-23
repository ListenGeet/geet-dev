import HomeScreen, { type HomeData } from './HomeScreen';

export const revalidate = 60;

async function getHomeData(): Promise<HomeData | null> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '');
  if (!apiUrl) return null;

  try {
    const response = await fetch(`${apiUrl}/api/home`, { next: { revalidate: 60 } });
    if (!response.ok) return null;
    return (await response.json()) as HomeData;
  } catch {
    return null;
  }
}

export default async function HomePage() {
  return <HomeScreen initialData={await getHomeData()} />;
}
