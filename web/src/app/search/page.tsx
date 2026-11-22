import { SearchScreen } from './SearchScreen';

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; language?: string; genre?: string }>;
}) {
  const params = await searchParams;
  return (
    <SearchScreen
      initialQuery={params.q ?? ''}
      initialLanguage={params.language}
      initialGenre={params.genre}
    />
  );
}
