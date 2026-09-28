import { getPocketBase } from './archive';
import { fetchBbcImage, imageFromProgrammePage } from './bbc-images';

export async function refreshEpisodeImage(episodeId: string) {
  const pb = await getPocketBase();
  const record = await pb.collection('episodes').getOne(episodeId, { requestKey: null });
  if (!record.bbc_url) throw new Error('This episode has no BBC programme URL.');
  const response = await fetch(record.bbc_url, { headers: { 'User-Agent': 'BargainHuntFieldNotes/1.0', Accept: 'text/html,application/xhtml+xml' } });
  if (!response.ok) throw new Error(`BBC programme page returned ${response.status}.`);
  const imageUrl = imageFromProgrammePage(await response.text(), record.bbc_pid || '');
  if (!imageUrl) throw new Error('No BBC episode image was found.');
  const image = await fetchBbcImage(imageUrl);
  const saved = await pb.collection('episodes').update(record.id, { image });
  return { id: saved.id, filename: saved.image };
}
