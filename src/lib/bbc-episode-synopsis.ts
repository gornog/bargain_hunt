import { getPocketBase } from './archive';

const clean = (value: string) => value.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

const synopsisFromPage = (html: string) => {
  const shortBlock = html.match(/<div\b[^>]*class=["'][^"']*synopsis-toggle__short[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || '';
  const longBlock = html.match(/<div\b[^>]*class=["'][^"']*synopsis-toggle__long[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || '';
  const paragraphs = [...shortBlock.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi), ...longBlock.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((match) => clean(match[1])).filter(Boolean);
  return paragraphs.join('\n\n').trim();
};

export async function refreshEpisodeSynopsis(episodeId: string) {
  const pb = await getPocketBase();
  const record = await pb.collection('episodes').getOne(episodeId, { requestKey: null });
  if (!record.bbc_url) throw new Error('This episode has no BBC programme URL.');
  const response = await fetch(record.bbc_url, { headers: { 'User-Agent': 'BargainHuntFieldNotes/1.0', Accept: 'text/html,application/xhtml+xml' } });
  if (!response.ok) throw new Error(`BBC programme page returned ${response.status}.`);
  const synopsis = synopsisFromPage(await response.text());
  if (!synopsis) throw new Error('No long BBC synopsis was found.');
  const saved = await pb.collection('episodes').update(record.id, { synopsis });
  return { id: saved.id, synopsis: saved.synopsis };
}
