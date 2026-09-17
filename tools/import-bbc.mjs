import PocketBase from 'pocketbase';

const pocketBaseUrl = process.env.POCKETBASE_URL || 'http://localhost:8090';
const pb = new PocketBase(pocketBaseUrl);
const guideUrl = 'https://www.bbc.co.uk/programmes/b006nb9z/episodes/guide';
const profileUrls = [
  ['presenter', 'https://www.bbc.co.uk/programmes/profiles/1DHTTlgtN56NkJjFT91dBX7/meet-the-presenters'],
  ['expert', 'https://www.bbc.co.uk/programmes/profiles/2rCG4qJkhKWc0qM38gy20hj/meet-the-experts']
];
const headers = { 'User-Agent': 'BargainHuntFieldNotes/1.0' };
const clean = (value) => (value || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const key = (value) => clean(value).toLowerCase().replace(/[’']/g, "'");
const fetchHtml = async (url) => { const response = await fetch(url, { headers }); const body = await response.text(); if (!response.ok) throw new Error(`${response.status} ${url} (${body.length} bytes)`); return body; };
const absolute = (value) => value?.startsWith('//') ? `https:${value}` : value;

const parseSeriesLinks = (html) => [...html.matchAll(/(?:https?:\/\/www\.bbc\.co\.uk)?\/programmes\/([a-z0-9]+)\/episodes\/guide/gi)].map((match) => { const block = html.slice(Math.max(0, match.index - 1800), Math.min(html.length, match.index + 300)); return { url: `https://www.bbc.co.uk/programmes/${match[1]}/episodes/guide`, label: clean(block), series: Number(clean(block).match(/series\s*(\d+)/i)?.[1] || 0) }; }).filter((series, index, all) => series.series && all.findIndex((item) => item.url === series.url) === index);

const parseEpisodes = (html, series) => [...html.matchAll(/<a[^>]+href="(?:https?:\/\/www\.bbc\.co\.uk)?(\/programmes\/([a-z0-9]+))"[^>]*>([\s\S]*?)<\/a>/gi)].map((match) => {
  const pid = match[2];
  const programmeStart = html.lastIndexOf('<div class="programme', match.index);
  const block = html.slice(programmeStart >= 0 ? programmeStart : Math.max(0, match.index - 1500), Math.min(html.length, (programmeStart >= 0 ? programmeStart : match.index) + 10000));
  const titleText = clean(block.match(/class="[^"]*programme__title[^"]*"[^>]*>([\s\S]*?)<\/span>/i)?.[1] || match[3]);
  const title = titleText.replace(/^Episode\s*\d+\s*:\s*/i, '').trim();
  const episode = Number(title.match(/\s(\d{1,3})$/)?.[1] || 0);
  const image = absolute(block.match(/(?:data-src|src)\s*=\s*["']([^"']+\.(?:jpg|jpeg|png|webp))["']/i)?.[1]);
  const synopsis = clean(block.match(/<p[^>]*class="[^"]*programme__synopsis[^"]*"[^>]*>([\s\S]*?)<\/p>/i)?.[1] || '');
  const watch = block.match(/href=["'](https?:\/\/www\.bbc\.co\.uk\/iplayer\/episode\/[a-z0-9]+)["']/i)?.[1] || '';
  return { pid, url: `https://www.bbc.co.uk${match[1]}`, watch, series, episode, title: title.replace(/\s+\d{1,3}$/, '').trim() || title, synopsis, image };
}).filter((episode) => episode.pid !== 'b006nb9z' && episode.title && !episode.url.endsWith('/episodes/guide'));

const parseProfiles = (html, role) => [...html.matchAll(/<a[^>]+href="(\/programmes\/profiles\/[^"?]+)"[^>]*>([\s\S]*?)<\/a>/gi)].map((match) => {
  const card = match[2];
  const image = absolute(card.match(/(?:data-src|src)\s*=\s*["']([^"']+\.(?:jpg|jpeg|png|webp))["']/i)?.[1]);
  const name = clean(card.match(/(?:alt|title)\s*=\s*["']([^"']+)["']/i)?.[1] || card).replace(/\s+(Read more|Find out more)$/i, '').trim();
  return { name, image, role };
}).filter((profile) => profile.name && profile.name.length < 80 && profile.image);

const episodesByPid = new Map();
for (let page = 1; page <= 4; page += 1) {
  const guidePageUrl = page === 1 ? guideUrl : `${guideUrl}?page=${page}`;
  const html = await fetchHtml(guidePageUrl);
  const seriesLinks = parseSeriesLinks(html);
  console.log(`Guide page ${page}: ${html.length} bytes, ${seriesLinks.length} series links`);
  for (const series of seriesLinks) { const seriesHtml = await fetchHtml(series.url); const found = parseEpisodes(seriesHtml, series.series); console.log(`  Series ${series.series}: ${found.length} episode cards`); for (const episode of found) episodesByPid.set(episode.pid, episode); }
  console.log(`Guide page ${page}: ${episodesByPid.size} unique episode links collected`);
}
const episodes = [...episodesByPid.values()];
if (!episodes.length) throw new Error('BBC guide returned no episode links. Check the saved HTML and parser selectors.');

const existingEpisodes = await pb.collection('episodes').getFullList({ requestKey: null });
const byPid = new Map(existingEpisodes.filter((record) => record.bbc_pid).map((record) => [record.bbc_pid, record]));
const byFallback = new Map(existingEpisodes.map((record) => [`${record.series}|${record.title}`.toLowerCase(), record]));
let created = 0; let updated = 0; let images = 0; let synopses = 0;
for (const episode of episodes) {
  const payload = { series: episode.series, episod_number: episode.episode, title: episode.title };
  if (episode.pid) payload.bbc_pid = episode.pid;
  if (episode.url) payload.bbc_url = episode.url;
  if (episode.watch) payload.watch = episode.watch;
  if (episode.synopsis) payload.synopsis = episode.synopsis;
  const record = byPid.get(episode.pid) || byFallback.get(`${episode.series}|${episode.title}`.toLowerCase());
  const saved = record ? await pb.collection('episodes').update(record.id, payload) : await pb.collection('episodes').create(payload);
  if (record) updated += 1; else { created += 1; existingEpisodes.push(saved); }
  byPid.set(episode.pid, saved); byFallback.set(`${episode.series}|${episode.title}`.toLowerCase(), saved);
  if (episode.synopsis) synopses += 1;
  if (episode.image) { try { const imageResponse = await fetch(episode.image, { headers }); if (imageResponse.ok) { const blob = await imageResponse.blob(); await pb.collection('episodes').update(saved.id, { image: new File([blob], `${episode.pid}.jpg`, { type: blob.type || 'image/jpeg' }) }); images += 1; } } catch (error) { console.warn(`Could not save image for ${episode.pid}: ${error.message}`); } }
}

const profileMap = new Map();
for (const [role, url] of profileUrls) for (const profile of parseProfiles(await fetchHtml(url), role)) { const person = profileMap.get(key(profile.name)) || { ...profile, is_presenter: false, is_expert: false }; person.is_presenter ||= role === 'presenter'; person.is_expert ||= role === 'expert'; profileMap.set(key(profile.name), person); }
const existingExperts = await pb.collection('experts').getFullList({ requestKey: null });
const expertByName = new Map(existingExperts.map((expert) => [key(expert.name), expert]));
let peopleCreated = 0; let peopleUpdated = 0; let portraits = 0;
for (const profile of profileMap.values()) {
  const fields = { name: profile.name, is_presenter: profile.is_presenter, is_expert: profile.is_expert };
  const existing = expertByName.get(key(profile.name));
  const person = existing ? await pb.collection('experts').update(existing.id, fields) : await pb.collection('experts').create(fields);
  if (existing) peopleUpdated += 1; else { peopleCreated += 1; expertByName.set(key(profile.name), person); }
  if (profile.image) { try { const imageResponse = await fetch(profile.image, { headers }); if (imageResponse.ok) { const blob = await imageResponse.blob(); await pb.collection('experts').update(person.id, { avatar: new File([blob], `${person.id}.jpg`, { type: blob.type || 'image/jpeg' }) }); portraits += 1; } } catch (error) { console.warn(`Could not save portrait for ${profile.name}: ${error.message}`); } }
}
console.log(`BBC sync complete: ${episodes.length} cards, ${created} created, ${updated} updated, ${synopses} synopses, ${images} episode images, ${peopleCreated} experts created, ${peopleUpdated} experts updated, ${portraits} portraits.`);
