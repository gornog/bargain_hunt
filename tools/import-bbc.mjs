import PocketBase from 'pocketbase';

const sourceUrls = [
  'https://www.bbc.co.uk/programmes/b006nb9z/episodes/guide.json',
  'https://www.bbc.co.uk/programmes/b006nb9z/episodes/player.json',
  'https://www.bbc.co.uk/programmes/b006nb9z/episodes.json',
  'https://www.bbc.co.uk/programmes/b006nb9z/episodes/guide'
];
const pocketBaseUrl = process.env.POCKETBASE_URL || 'http://localhost:8090';
const pb = new PocketBase(pocketBaseUrl);
const profileUrls = ['https://www.bbc.co.uk/programmes/profiles/1DHTTlgtN56NkJjFT91dBX7/meet-the-presenters', 'https://www.bbc.co.uk/programmes/profiles/2rCG4qJkhKWc0qM38gy20hj/meet-the-experts'];

const text = (value) => typeof value === 'string' ? value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '';
const findAll = (node, result = []) => {
  if (!node || typeof node !== 'object') return result;
  if (Array.isArray(node)) node.forEach((item) => findAll(item, result));
  else { if ((node.pid || node.id)?.toString().match(/^e[a-z0-9]{7}$/i) && (node.title || node.display_title || node.subtitle)) result.push(node); Object.values(node).forEach((value) => findAll(value, result)); }
  return result;
};
const pick = (item, keys) => keys.map((key) => item?.[key]).find(Boolean);
const parseEpisode = (item) => {
  const title = text(pick(item, ['display_subtitle', 'subtitle', 'title', 'display_title']));
  const seriesText = text(pick(item, ['display_title', 'series_title', 'parent_title']));
  const episodeMatch = `${title} ${seriesText}`.match(/(?:episode|ep)\s*(\d+)/i);
  const seriesMatch = `${seriesText} ${title}`.match(/series\s*(\d+)/i);
  const date = pick(item, ['first_broadcast_date', 'broadcast_date', 'date', 'first_broadcast']) || '';
  const contributors = item.contributors || item.contributor || [];
  const people = Array.isArray(contributors) ? contributors : Object.values(contributors);
  const presenters = people.filter((person) => /presenter/i.test(person.role || person.type || '')).map((person) => text(person.name || person.title));
  const experts = people.filter((person) => /expert/i.test(person.role || person.type || '')).map((person) => text(person.name || person.title));
  return { pid: item.pid || item.id, title: title.replace(/^Episode\s*\d+\s*:\s*/i, '') || 'Untitled episode', series: Number(seriesMatch?.[1] || 0), episode: Number(episodeMatch?.[1] || 0), date: String(date).slice(0, 10), presenters, experts };
};
const decode = (value) => text(value).replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&quot;/g, '"');
const parseProfiles = (html) => [...html.matchAll(/<a[^>]+href="(\/programmes\/profiles\/[^"?]+)"[^>]*>([\s\S]{0,1400}?)<\/a>/gi)].map((match) => { const block = match[2]; const image = block.match(/(?:src|data-src)="([^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i)?.[1]; const name = decode(block.match(/(?:alt|title)="([^"]+)"/i)?.[1] || block.replace(/<[^>]+>/g, ' ')); return { name: name.replace(/\s+(Read more|Find out more)$/i, '').trim(), image: image?.startsWith('//') ? `https:${image}` : image }; }).filter((profile) => profile.name && profile.name.length < 80 && profile.image);

let payload;
for (const url of sourceUrls) {
  try { const response = await fetch(url, { headers: { 'User-Agent': 'BargainHuntFieldNotes/1.0' } }); if (!response.ok) continue; const body = await response.text(); try { payload = JSON.parse(body); } catch { payload = body; } if (payload) break; } catch { /* Try the next BBC representation. */ }
}
if (!payload) throw new Error('BBC source could not be reached. Try again later or check the network from the LXC.');

const raw = Array.isArray(payload) ? payload : findAll(payload);
const episodes = [...new Map(raw.map(parseEpisode).filter((episode) => episode.pid).map((episode) => [episode.pid, episode])).values()];
if (!episodes.length) throw new Error('BBC responded, but no episode records were recognised. Save a sample response and update the parser.');

const existingExperts = await pb.collection('experts').getFullList();
const existingEpisodes = await pb.collection('episodes').getFullList();
const expertId = new Map(existingExperts.map((expert) => [expert.name.toLowerCase(), expert.id]));
for (const episode of episodes) {
  for (const name of [...episode.presenters, ...episode.experts].filter(Boolean)) {
    if (!expertId.has(name.toLowerCase())) { const record = await pb.collection('experts').create({ name }); expertId.set(name.toLowerCase(), record.id); }
  }
  const duplicate = existingEpisodes.find((record) => record.series === episode.series && record.episod_number === episode.episode && record.title === episode.title);
  if (duplicate) continue;
  await pb.collection('episodes').create({ series: episode.series, episod_number: episode.episode, title: episode.title, broadcast_date: episode.date, presenter: expertId.get(episode.presenters[0]?.toLowerCase()) || '' });
}
console.log(`Imported ${episodes.length} BBC episodes; skipped existing records where matched.`);
for (const url of profileUrls) { try { const response = await fetch(url, { headers: { 'User-Agent': 'BargainHuntFieldNotes/1.0' } }); if (!response.ok) continue; for (const profile of parseProfiles(await response.text())) { const id = expertId.get(profile.name.toLowerCase()); const current = existingExperts.find((expert) => expert.id === id); if (!id || current?.avatar) continue; const imageResponse = await fetch(profile.image); if (!imageResponse.ok) continue; const blob = await imageResponse.blob(); const extension = (blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg'); await pb.collection('experts').update(id, { avatar: new File([blob], `${id}.${extension}`, { type: blob.type }) }); } } catch (error) { console.warn(`Could not import profile images from ${url}: ${error.message}`); } }
