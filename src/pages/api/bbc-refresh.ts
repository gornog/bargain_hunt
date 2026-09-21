import type { APIRoute } from 'astro';
import { refreshUpcomingEpisodes } from '../../lib/bbc-upcoming';

export const POST: APIRoute = async () => {
  try {
    const result = await refreshUpcomingEpisodes();
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'BBC refresh failed.';
    return Response.json({ message }, { status: 502 });
  }
};
