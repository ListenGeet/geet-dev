const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function incomingKey(userId: string, trackId: string): string {
  if (!uuid.test(userId) || !uuid.test(trackId)) throw new Error('Invalid storage id');
  return `incoming/${userId}/${trackId}`;
}

export function trackFileKey(trackId: string, kind: 'full' | 'preview'): string {
  if (!uuid.test(trackId)) throw new Error('Invalid storage id');
  if (kind !== 'full' && kind !== 'preview') throw new Error('Invalid storage kind');
  return `tracks/${trackId}/${kind}.m4a`;
}

export function coverKey(trackId: string): string {
  if (!uuid.test(trackId)) throw new Error('Invalid storage id');
  return `covers/${trackId}.jpg`;
}
