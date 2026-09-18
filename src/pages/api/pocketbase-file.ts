import type { APIRoute } from 'astro';
import { getPocketBase, pocketBaseUrl } from '../../lib/archive';

const safePart = (value: string | null, pattern: RegExp) => value && pattern.test(value) ? value : null;

export const GET: APIRoute = async ({ url }) => {
  const collection = safePart(url.searchParams.get('collection'), /^[a-zA-Z0-9_-]+$/);
  const record = safePart(url.searchParams.get('record'), /^[a-zA-Z0-9_-]+$/);
  const file = safePart(url.searchParams.get('file'), /^[^\\/]+$/);
  if (!collection || !record || !file) return new Response('Invalid file reference', { status: 400 });

  const pb = await getPocketBase();
  const response = await fetch(`${pocketBaseUrl}/api/files/${collection}/${record}/${encodeURIComponent(file)}`, {
    headers: pb.authStore.token ? { Authorization: pb.authStore.token } : {},
  });
  if (!response.ok) return new Response('Image not found', { status: response.status });
  return new Response(response.body, { status: 200, headers: { 'Content-Type': response.headers.get('content-type') || 'image/jpeg', 'Cache-Control': 'public, max-age=86400' } });
};
