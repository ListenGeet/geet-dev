import { SignUp } from '@clerk/nextjs';
import { AuthShell } from '@/components/auth/AuthShell';
import { clerkAppearance } from '@/components/auth/clerkAppearance';

export const metadata = { title: 'Create account · Geet' };

export default function Page() {
  return (
    <AuthShell>
      <SignUp
        appearance={clerkAppearance}
        routing="path"
        path="/sign-up"
        signInUrl="/sign-in"
        forceRedirectUrl="/onboarding"
      />
    </AuthShell>
  );
}
