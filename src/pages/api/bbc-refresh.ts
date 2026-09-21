import type { APIRoute } from 'astro';
import { refreshUpcomingEpisodes } from '../../lib/bbc-upcoming';

export const POST: APIRoute = async ({ request }) => {
  try {
    const force = new URL(request.url).searchParams.get('force') === '1';
    const result = await refreshUpcomingEpisodes(force);
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'BBC refresh failed.';
    return Response.json({ message }, { status: 502 });
  }
};
