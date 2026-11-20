import { parseProfilePatch } from '@geet/shared';
import { clerk } from '@/lib/clerk';
import { fail, ok, readJson } from '@/lib/http';
import { patchToColumns, toMe } from '@/lib/me';
import * as repo from '@/lib/repo';
import { preflight } from '@/lib/cors';
import { serverError, withUser } from '@/lib/route';

export const dynamic = 'force-dynamic';

export const GET = withUser(async (request, { profile }) => {
  return ok(request, toMe(profile, await repo.counts(profile.id)));
});

export const PATCH = withUser(async (request, { profile }) => {
  const read = await readJson(request);
  if ('response' in read) return read.response;
  const parsed = parseProfilePatch(read.body);
  if (!parsed.ok) return fail(request, 'invalid', parsed.message);
  const columns = patchToColumns(profile, parsed.value);
  if (parsed.value.onboarded && profile.username === null) {
    return fail(request, 'invalid', 'Pick a username first.');
  }
  const next = Object.keys(columns).length
    ? await repo.updateProfile(profile.id, columns)
    : profile;
  return ok(request, toMe(next, await repo.counts(profile.id)));
});

/** Deletes the account and personal data (docs/05, docs/15). Body: { confirm: "DELETE", deleteUploads: bool }. */
export const DELETE = withUser(
  async (request, { sub, profile }) => {
    const read = await readJson(request);
    if ('response' in read) return read.response;
    const body = read.body as { confirm?: unknown; deleteUploads?: unknown };
    if (body.confirm !== 'DELETE') return fail(request, 'invalid', 'Type DELETE to confirm.');
    if (body.deleteUploads !== undefined && typeof body.deleteUploads !== 'boolean') {
      return fail(request, 'invalid', 'deleteUploads must be true or false.');
    }

    if (body.deleteUploads === true) {
      // The rows go now. Their storage objects are removed by the storage layer in Phase 2.
      for (const id of await repo.uploadedTrackIds(profile.id))
        await repo.removeTrack(id, profile.id);
    }
    await repo.deleteProfile(profile.id);

    try {
      await clerk().users.deleteUser(sub);
    } catch (err) {
      // The data is gone. If sign-in still exists, a retry removes it (a new empty profile is made, then deleted).
      return serverError(request, err);
    }
    return ok(request, { deleted: true });
  },
  { limit: 5 },
);

export function OPTIONS(request: Request) {
  return preflight(request);
}
