import { SignUp } from '@clerk/nextjs';

export const metadata = { title: 'Create account · Geet' };

export default function Page() {
  return (
    <SignUp
      routing="path"
      path="/sign-up"
      signInUrl="/sign-in"
      forceRedirectUrl="/onboarding"
    />
  );
}
