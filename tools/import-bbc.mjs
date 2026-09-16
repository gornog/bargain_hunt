import PocketBase from 'pocketbase';

const pocketBaseUrl = process.env.POCKETBASE_URL || 'http://localhost:8090';
const pb = new PocketBase(pocketBaseUrl);
const guideUrl = 'https://www.bbc.co.uk/programmes/b006nb9z/episodes/guide';
const profileUrls = ['https://www.bbc.co.uk/programmes/profiles/1DHTTlgtN56NkJjFT91dBX7/meet-the-presenters', 'https://www.bbc.co.uk/programmes/profiles/2rCG4qJkhKWc0qM38gy20hj/meet-the-experts'];
const headers = { 'User-Agent': 'BargainHuntFieldNotes/1.0' };
const clean = (value) => (value || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
const fetchHtml = async (url) => { const response = await fetch(url, { headers }); const body = await response.text(); if (!response.ok) throw new Error(`${response.status} ${url} (${body.length} bytes)`); return body.replaceAll("'", '"').replaceAll('\\/', '/'); };

const parseSeriesLinks = (html) => [...html.matchAll(/<a[^>]+href="(?:https?:\/\/www\.bbc\.co\.uk)?(\/programmes\/[a-z0-9]+\/episodes\/guide)"[^>]*>([\s\S]{0,180}?)<\/a>/gi)].map((match) => ({ url: `https://www.bbc.co.uk${match[1]}`, label: clean(match[2]), series: Number(clean(match[2]).match(/series\s*(\d+)/i)?.[1] || 0) })).filter((series) => series.series);
const parseSeriesLinksLoose = (html) => [...html.matchAll(/(?:https?:\/\/www\.bbc\.co\.uk)?\/programmes\/([a-z0-9]+)\/episodes\/guide/gi)].map((match) => { const block = html.slice(Math.max(0, match.index - 250), match.index + 250); return { url: `https://www.bbc.co.uk/programmes/${match[1]}/episodes/guide`, label: clean(block), series: Number(clean(block).match(/series\s*(\d+)/i)?.[1] || 0) }; }).filter((series) => series.series);
const parseEpisodes = (html, series) => [...html.matchAll(/<a[^>]+href="(?:https?:\/\/www\.bbc\.co\.uk)?(\/programmes\/([a-z0-9]+))"[^>]*>([\s\S]{0,220}?)<\/a>/gi)].map((match) => { const block = html.slice(Math.max(0, match.index - 900), Math.min(html.length, match.index + 900)); const label = clean(match[3]); const title = label.replace(/^\d{1,2}\s+[A-Za-z]{3,9}(?:\s+\d{1,2}:\d{2})?:\s*/i, '').replace(/^Episode\s*\d+\s*:\s*/i, '').trim(); const episode = Number(title.match(/\s(\d{1,3})$/)?.[1] || 0); const image = block.match(/(?:src|data-src)\s*=\s*["']([^"']*(?:jpg|jpeg|png|webp)[^"']*)["']/i)?.[1] || block.match(/(?:src|data-src)\s*=\s*["']([^"']+)["']/i)?.[1]; const synopsis = clean(block.match(/<p[^>]*>([\s\S]{20,400}?)<\/p>/i)?.[1] || ''); return { pid: match[2], url: `https://www.bbc.co.uk${match[1]}`, series, episode, title: title.replace(/\s+\d{1,3}$/, '').trim() || title, synopsis, image: image?.startsWith('//') ? `https:${image}` : image, presenters: [], experts: [] }; }).filter((episode) => episode.pid !== 'b006nb9z' && episode.title && !episode.url.endsWith('/episodes/guide'));
const parseProfiles = (html) => [...html.matchAll(/<a[^>]+href="(\/programmes\/profiles\/[^"?]+)"[^>]*>([\s\S]{0,1400}?)<\/a>/gi)].map((match) => { const block = html.slice(Math.max(0, match.index - 300), Math.min(html.length, match.index + 1400)); const image = block.match(/(?:src|data-src)\s*=\s*["']([^"']*(?:jpg|jpeg|png|webp)[^"']*)["']/i)?.[1] || block.match(/(?:src|data-src)\s*=\s*["']([^"']+)["']/i)?.[1]; const name = clean(block.match(/(?:alt|title)\s*=\s*["']([^"']+)["']/i)?.[1] || match[2]); return { name: name.replace(/\s+(Read more|Find out more)$/i, '').trim(), image: image?.startsWith('//') ? `https:${image}` : image }; }).filter((profile) => profile.name && profile.name.length < 80 && profile.image);

const episodesByPid = new Map();
for (let page = 1; page <= 4; page += 1) { const html = await fetchHtml(page === 1 ? guideUrl : `${guideUrl}?page=${page}`); const seriesLinks = parseSeriesLinks(html); const resolvedSeriesLinks = seriesLinks.length ? seriesLinks : parseSeriesLinksLoose(html); if (!resolvedSeriesLinks.length) console.warn(`Guide page ${page}: no series links found in ${html.length} bytes`); for (const series of resolvedSeriesLinks) { const seriesHtml = await fetchHtml(series.url); for (const episode of parseEpisodes(seriesHtml, series.series)) episodesByPid.set(episode.pid, episode); } console.log(`Guide page ${page}: ${episodesByPid.size} episode links collected`); }
const episodes = [...episodesByPid.values()];
if (!episodes.length) throw new Error('BBC guide returned no episode links. The page structure may have changed.');

const schemaResponse = await fetch(`${pocketBaseUrl}/api/collections/episodes`, { headers });
const schema = schemaResponse.ok ? await schemaResponse.json() : { fields: [] };
const fieldNames = new Set((schema.fields || []).map((field) => field.name));
const schemaKnown = fieldNames.size > 0;
// The public PocketBase API may hide collection metadata. We know the image
// field is part of this app, so keep importing thumbnails even in that case.
const canStore = (name) => schemaKnown ? fieldNames.has(name) : name === 'image';
const existingExperts = await pb.collection('experts').getFullList();
const existingEpisodes = await pb.collection('episodes').getFullList();
const expertId = new Map(existingExperts.map((expert) => [expert.name.toLowerCase(), expert.id]));
for (const episode of episodes) {
  const payload = { series: episode.series, episod_number: episode.episode, title: episode.title, presenter: '' };
  if (canStore('bbc_pid')) payload.bbc_pid = episode.pid;
  if (canStore('bbc_url')) payload.bbc_url = episode.url;
  if (canStore('synopsis')) payload.synopsis = episode.synopsis;
  const duplicate = existingEpisodes.find((record) => (canStore('bbc_pid') && record.bbc_pid === episode.pid) || (record.series === episode.series && record.episod_number === episode.episode && record.title === episode.title));
  const record = duplicate || await pb.collection('episodes').create(payload);
  if (canStore('image') && episode.image && !record.image) { try { const imageResponse = await fetch(episode.image); if (imageResponse.ok) { const blob = await imageResponse.blob(); await pb.collection('episodes').update(record.id, { image: new File([blob], `${episode.pid}.jpg`, { type: blob.type }) }); } } catch (error) { console.warn(`Could not save image for ${episode.pid}: ${error.message}`); } }
}
for (const episode of episodes) for (const name of [...episode.presenters, ...episode.experts]) { const key = name.toLowerCase(); const isPresenter = episode.presenters.some((person) => person.toLowerCase() === key); const isExpert = episode.experts.some((person) => person.toLowerCase() === key); if (!expertId.has(key)) { const fields = { name }; if (canStore('is_presenter')) fields.is_presenter = isPresenter; if (canStore('is_expert')) fields.is_expert = isExpert; const record = await pb.collection('experts').create(fields); expertId.set(key, record.id); } }
const expertsForImages = await pb.collection('experts').getFullList();
for (const url of profileUrls) { try { for (const profile of parseProfiles(await fetchHtml(url))) { const person = expertsForImages.find((expert) => expert.name.toLowerCase() === profile.name.toLowerCase()); if (!person || person.avatar) continue; const imageResponse = await fetch(profile.image); if (imageResponse.ok) { const blob = await imageResponse.blob(); await pb.collection('experts').update(person.id, { avatar: new File([blob], `${person.id}.jpg`, { type: blob.type }) }); } } } catch (error) { console.warn(`Could not import profile images: ${error.message}`); } }
console.log(`BBC sync complete: ${episodes.length} episode links processed.`);
