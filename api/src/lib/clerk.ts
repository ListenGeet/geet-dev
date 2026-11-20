import { createClerkClient, type ClerkClient } from '@clerk/backend';

let client: ClerkClient | null = null;

export function clerk(): ClerkClient {
  if (client) return client;
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) throw new Error('CLERK_SECRET_KEY is not set');
  client = createClerkClient({ secretKey });
  return client;
}

export interface ClerkPerson {
  displayName: string | null;
  avatarUrl: string | null;
  /** Primary email, lowercased. Only ever held in memory: email is never stored in Geet's tables. */
  email: string | null;
  emailVerified: boolean;
  username: string | null;
}

export function adminEmails(env: Record<string, string | undefined> = process.env): Set<string> {
  return new Set(
    (env.ADMIN_EMAILS ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

/** Admin only when the address is on the list AND Clerk says the address is verified. */
export function roleFor(
  person: Pick<ClerkPerson, 'email' | 'emailVerified'>,
  env: Record<string, string | undefined> = process.env,
): 'admin' | 'user' {
  return person.email && person.emailVerified && adminEmails(env).has(person.email)
    ? 'admin'
    : 'user';
}

const clean = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : null;

interface EmailAddressLike {
  id?: string;
  email_address?: string;
  emailAddress?: string;
  verification?: { status?: string } | null;
}

/** Shared by the REST user object (camelCase) and the webhook user object (snake_case). */
function pickEmail(
  addresses: EmailAddressLike[] | undefined,
  primaryId: string | null | undefined,
): { email: string | null; verified: boolean } {
  const list = addresses ?? [];
  const primary = list.find((a) => a.id === primaryId) ?? list[0];
  const email = clean(primary?.email_address ?? primary?.emailAddress)?.toLowerCase() ?? null;
  return { email, verified: primary?.verification?.status === 'verified' };
}

const fullName = (first: unknown, last: unknown) =>
  clean([clean(first), clean(last)].filter(Boolean).join(' '));

/** Person from the `user.created` webhook payload (snake_case). */
export function personFromWebhook(data: Record<string, unknown>): ClerkPerson {
  const { email, verified } = pickEmail(
    data.email_addresses as EmailAddressLike[] | undefined,
    data.primary_email_address_id as string | null | undefined,
  );
  return {
    displayName: fullName(data.first_name, data.last_name) ?? clean(data.username),
    avatarUrl: clean(data.image_url),
    email,
    emailVerified: verified,
    username: clean(data.username),
  };
}

/** Person from Clerk's REST API (used on the first API call). */
export async function fetchPerson(sub: string): Promise<ClerkPerson> {
  const u = await clerk().users.getUser(sub);
  const { email, verified } = pickEmail(
    u.emailAddresses as unknown as EmailAddressLike[],
    u.primaryEmailAddressId,
  );
  return {
    displayName: fullName(u.firstName, u.lastName) ?? clean(u.username),
    avatarUrl: clean(u.imageUrl),
    email,
    emailVerified: verified,
    username: clean(u.username),
  };
}
