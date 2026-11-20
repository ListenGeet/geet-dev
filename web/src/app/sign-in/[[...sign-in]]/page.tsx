import { SignIn } from '@clerk/nextjs';
import { AuthShell } from '@/components/auth/AuthShell';

export const metadata = { title: 'Sign in · Geet' };

export default function Page() {
  return (
    <AuthShell>
      <SignIn
        appearance={{ elements: { card: { backgroundColor: 'var(--midnight)' } } }}
        routing="path"
        path="/sign-in"
        signUpUrl="/sign-up"
        fallbackRedirectUrl="/"
      />
    </AuthShell>
  );
}
