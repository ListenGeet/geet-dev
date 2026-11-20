import { SignIn } from '@clerk/nextjs';
import { AuthShell } from '@/components/auth/AuthShell';
import { clerkAppearance } from '@/components/auth/clerkAppearance';

export const metadata = { title: 'Sign in · Geet' };

export default function Page() {
  return (
    <AuthShell>
      <SignIn
        appearance={clerkAppearance}
        routing="path"
        path="/sign-in"
        signUpUrl="/sign-up"
        fallbackRedirectUrl="/"
      />
    </AuthShell>
  );
}
