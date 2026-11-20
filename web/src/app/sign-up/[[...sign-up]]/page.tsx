import { SignUp } from '@clerk/nextjs';
import { AuthShell } from '@/components/auth/AuthShell';

export const metadata = { title: 'Create account · Geet' };

export default function Page() {
  return (
    <AuthShell>
      <SignUp
        routing="path"
        path="/sign-up"
        signInUrl="/sign-in"
        forceRedirectUrl="/onboarding"
      />
    </AuthShell>
  );
}
