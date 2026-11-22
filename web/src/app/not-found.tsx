import Link from 'next/link';
import { EmptyState } from '@/components/catalogue/CatalogueComponents';

export default function NotFound() {
  return (
    <main className="public-page">
      <EmptyState
        title="We couldn't find that page"
        sentence="Check the address, or go back to the songs."
        image="/illustrations/error.svg"
        action={
          <Link className="btn btn-secondary" href="/">
            Go to Home
          </Link>
        }
      />
    </main>
  );
}
