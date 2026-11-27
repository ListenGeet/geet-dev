import { askGeet } from '@/lib/ai';
import { corsFor, preflight } from '@/lib/cors';
import { fail, readJson } from '@/lib/http';
import { rateLimitHit } from '@/lib/repo';
import { serverError, withUser } from '@/lib/route';

export const dynamic = 'force-dynamic';

export const POST = withUser(async (request, { profile }) => {
  const rpm = Math.max(1, Math.min(120, Number(process.env.AI_GLOBAL_RPM || 30)));
  if (!(await rateLimitHit('ai:global', rpm, 60)))
    return fail(request, 'rate_limited', 'Ask Geet is busy. Try again in a minute.', {
      'Retry-After': '60',
    });
  const parsed = await readJson(request);
  if ('response' in parsed) return parsed.response;
  const messages = (parsed.body as { messages?: unknown })?.messages;
  if (
    !Array.isArray(messages) ||
    messages.length < 1 ||
    messages.length > 20 ||
    messages.some(
      (message) =>
        !message ||
        typeof message !== 'object' ||
        !['user', 'assistant'].includes((message as { role?: string }).role ?? '') ||
        typeof (message as { content?: unknown }).content !== 'string' ||
        (message as { content: string }).content.length > 500,
    ) ||
    (messages[messages.length - 1] as { role?: string }).role !== 'user'
  )
    return fail(request, 'invalid', 'Ask a question in 500 characters or fewer.');

  try {
    const result = await askGeet(
      profile.id,
      messages as { role: 'user' | 'assistant'; content: string }[],
    );
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(`event: cards\ndata: ${JSON.stringify(result.cards)}\n\n`),
        );
        const chunks = result.text.match(/.{1,48}(?:\s|$)/gs) ?? (result.text ? [result.text] : []);
        for (const text of chunks)
          controller.enqueue(encoder.encode(`event: text\ndata: ${JSON.stringify(text)}\n\n`));
        controller.enqueue(
          encoder.encode(
            `event: done\ndata: ${JSON.stringify({ remaining: result.remaining })}\n\n`,
          ),
        );
        controller.close();
      },
    });
    return new Response(stream, {
      headers: {
        ...corsFor(request),
        'Cache-Control': 'no-store',
        'Content-Type': 'text/event-stream; charset=utf-8',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    if ((error as { code?: string }).code === 'daily_limit')
      return fail(request, 'capped', "You've used today's questions. Back tomorrow.");
    if ((error as { code?: string }).code === 'unavailable')
      return fail(request, 'capped', 'Ask Geet is busy. Try again in a minute.');
    return serverError(request, error);
  }
});

export function OPTIONS(request: Request) {
  return preflight(request);
}
