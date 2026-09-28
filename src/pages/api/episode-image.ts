import type { APIRoute } from 'astro';
import { refreshEpisodeImage } from '../../lib/bbc-upcoming';

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const episodeId = String(body?.episodeId || '').trim();
    if (!episodeId) return Response.json({ message: 'Episode ID is required.' }, { status: 400 });
    return Response.json(await refreshEpisodeImage(episodeId));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Episode image refresh failed.';
    return Response.json({ message }, { status: 502 });
  }
};
