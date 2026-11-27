import UnsubscribeScreen from './screen';

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await searchParams;
  return <UnsubscribeScreen token={t ?? ''} />;
}
