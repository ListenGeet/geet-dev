import { SignIn } from '@clerk/nextjs';

export const metadata = { title: 'Sign in · Geet' };

export default function Page() {
  return (
    <SignIn
      routing="path"
      path="/sign-in"
      signUpUrl="/sign-up"
      fallbackRedirectUrl="/"
    />
  );
}
