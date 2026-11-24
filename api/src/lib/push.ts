import { sendNotification, setVapidDetails } from 'web-push';
import { db } from './db';

export type PushCategory = 'friend_requests' | 'messages' | 'jams' | 'suggestions';

export interface PushMessage {
  title: string;
  body: string;
  url: string;
  tag?: string;
}

let configured = false;

function configurePush(): boolean {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return false;

  if (!configured) {
    setVapidDetails(subject, publicKey, privateKey);
    configured = true;
  }
  return true;
}

/** Send one notification to each subscribed device, respecting its event preferences. */
export async function sendPush(profileId: string, category: PushCategory, message: PushMessage) {
  if (!configurePush()) return;

  const { data: subscriptions, error } = await db()
    .from('push_tokens')
    .select('endpoint, keys, prefs')
    .eq('profile_id', profileId)
    .eq('kind', 'webpush');

  if (error || !subscriptions) return;

  const payload = JSON.stringify({
    title: message.title,
    body: message.body,
    tag: message.tag,
    data: { url: message.url },
  });

  await Promise.all(
    subscriptions.map(async (subscription) => {
      const prefs = subscription.prefs as Record<string, boolean> | null;
      const keys = subscription.keys as { p256dh?: string; auth?: string } | null;
      if (prefs?.[category] === false || !keys?.p256dh || !keys.auth) return;

      try {
        await sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: keys.p256dh, auth: keys.auth },
          },
          payload,
        );
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await db()
            .from('push_tokens')
            .delete()
            .eq('profile_id', profileId)
            .eq('endpoint', subscription.endpoint);
        }
      }
    }),
  );
}
