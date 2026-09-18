import PocketBase from 'pocketbase';

const pocketBaseUrl = process.env.POCKETBASE_URL || 'http://localhost:8090';
const pb = new PocketBase(pocketBaseUrl);
const superuserToken = process.env.POCKETBASE_SUPERUSER_TOKEN;
if (superuserToken) pb.authStore.save(superuserToken);
const pocketBaseAdminEmail = process.env.POCKETBASE_SUPERUSER_EMAIL || process.env.POCKETBASE_ADMIN_EMAIL;
const pocketBaseAdminPassword = process.env.POCKETBASE_SUPERUSER_PASSWORD || process.env.POCKETBASE_ADMIN_PASSWORD;
if (!superuserToken && Boolean(pocketBaseAdminEmail) !== Boolean(pocketBaseAdminPassword)) {
  throw new Error('Set both POCKETBASE_SUPERUSER_EMAIL and POCKETBASE_SUPERUSER_PASSWORD, or neither.');
}
if (!superuserToken && pocketBaseAdminEmail) {
  await pb.collection('_superusers').authWithPassword(pocketBaseAdminEmail, pocketBaseAdminPassword);
}
const guideUrl = 'https://www.bbc.co.uk/programmes/b006nb9z/episodes/guide';
const profileUrls = [
  ['presenter', 'https://www.bbc.co.uk/programmes/profiles/1DHTTlgtN56NkJjFT91dBX7/meet-the-presenters'],
  ['expert', 'https://www.bbc.co.uk/programmes/profiles/2rCG4qJkhKWc0qM38gy20hj/meet-the-experts']
];
const headers = { 'User-Agent': 'BargainHuntFieldNotes/1.0' };
const requestTimeoutMs = Number(process.env.BBC_REQUEST_TIMEOUT_MS || 15_000);
const maxImageBytes = Number(process.env.BBC_MAX_IMAGE_BYTES || 8 * 1024 * 1024);
const refreshImages = process.env.BBC_REFRESH_IMAGES === 'true';
const clean = (value) => (value || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const key = (value) => clean(value).toLowerCase().replace(/[’']/g, "'");
const bbcUrl = (value, base = 'https://www.bbc.co.uk') => {
  if (!value) return '';
  try {
    const url = new URL(value, base);
    const isBbcOwned = url.hostname === 'bbc.co.uk' || url.hostname.endsWith('.bbc.co.uk') || url.hostname === 'bbci.co.uk' || url.hostname.endsWith('.bbci.co.uk');
    return url.protocol === 'https:' && isBbcOwned ? url.href : '';
  } catch { return ''; }
};
const retryable = (status) => status === 408 || status === 429 || status >= 500;
const fetchBbc = async (url, kind = 'page') => {
  const safeUrl = bbcUrl(url);
  if (!safeUrl) throw new Error(`Refusing non-BBC ${kind} URL: ${url}`);
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      const response = await fetch(safeUrl, { headers, signal: controller.signal, redirect: 'follow' });
      if (!bbcUrl(response.url)) throw new Error(`BBC ${kind} redirected to an untrusted host`);
      if (response.ok || !retryable(response.status) || attempt === 2) return response;
      lastError = new Error(`${response.status} ${safeUrl}`);
    } catch (error) { lastError = error; }
    finally { clearTimeout(timeout); }
    await pause(400 * (2 ** attempt) + Math.floor(Math.random() * 150));
  }
  throw new Error(`Could not fetch BBC ${kind} ${safeUrl}: ${lastError?.message || 'unknown error'}`);
};
const fetchHtml = async (url) => { const response = await fetchBbc(url); const body = await response.text(); if (!response.ok) throw new Error(`${response.status} ${url} (${body.length} bytes)`); return body; };
const fetchImage = async (url) => {
  const response = await fetchBbc(url, 'image');
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const type = response.headers.get('content-type') || '';
  const length = Number(response.headers.get('content-length') || 0);
  if (!type.startsWith('image/') || (length && length > maxImageBytes)) throw new Error(`Rejected image (${type || 'unknown type'}, ${length || 'unknown'} bytes)`);
  if (!response.body) throw new Error('Image response had no body');
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maxImageBytes) { await reader.cancel(); throw new Error(`Rejected image larger than ${maxImageBytes} bytes`); }
    chunks.push(value);
  }
  return new Blob(chunks, { type });
};
const absolute = (value) => bbcUrl(value);

// The catalogue index contains links for several series in one large page.  Do
// not infer a series number from text *before* a link: that was assigning the
// next series' cards to the preceding heading (for example S71E13 as S68E13).
// A series page is fetched below and its own document title is the authority.
const parseSeriesLinks = (html) => [...html.matchAll(/<a\b[^>]*href=["'](?:https?:\/\/www\.bbc\.co\.uk)?(\/programmes\/([a-z0-9]+)\/episodes\/guide)["'][^>]*>([\s\S]*?)<\/a>/gi)]
  .map((match) => ({ url: `https://www.bbc.co.uk${match[1]}`, label: clean(match[3]) }))
  // Extended/shortened series are separate accordion sections in the guide.
  // Exclude the whole section by its visible link label, rather than hoping
  // that each individual card repeats "55-minute version" in its title.
  .filter(({ url, label }) => url !== guideUrl && !/\b(?:extended|55[-\s]?minute|30[-\s]?minute)\b/i.test(label))
  .filter((entry, index, all) => all.findIndex(({ url }) => url === entry.url) === index)
  .map(({ url }) => url);

const parseEpisodePageLinks = (html, seriesUrl) => {
  const target = new URL(seriesUrl);
  return [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map((match) => ({ url: bbcUrl(match[1], seriesUrl), label: clean(match[2]) }))
    .filter(({ url, label }) => {
      if (!url) return false;
      const candidate = new URL(url);
      return candidate.pathname === target.pathname && candidate.search &&
        (/\b(?:more\s+episodes|next|page\s+\d+)\b/i.test(label) || candidate.searchParams.has('page'));
    })
    .filter((entry, index, all) => all.findIndex(({ url }) => url === entry.url) === index)
    .map(({ url }) => url);
};

const seriesFromPage = (html) => {
  const title = clean(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '');
  const fromTitle = title.match(/\bseries\s+(\d+)\b/i)?.[1];
  if (fromTitle) return Number(fromTitle);
  // The h1 is a fallback for BBC templates which omit the series in <title>.
  const heading = clean(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || '');
  return Number(heading.match(/\bseries\s+(\d+)\b/i)?.[1] || 0);
};

const isAlternateCut = ({ title, synopsis }) => /\b(?:extended|short(?:ened)?|condensed|30\s*(?:min(?:ute)?s?)|55\s*(?:min(?:ute)?s?))\b/i.test(`${title} ${synopsis}`) || /\b\d{1,3}\s+and\s*$/i.test(title);

const parseEpisodes = (html, series) => {
  const starts = [...html.matchAll(/<div\b[^>]*class=["'][^"']*\bprogramme--episode\b[^"']*["'][^>]*>/gi)];
  return starts.map((match, index) => {
  const start = match.index ?? 0;
  const end = starts[index + 1]?.index ?? html.length;
  const block = html.slice(start, end);
  const pid = match[0].match(/\bdata-pid=["']([a-z0-9]+)["']/i)?.[1] || block.match(/\bdata-pid=["']([a-z0-9]+)["']/i)?.[1];
  if (!pid) return null;
  const programmeLink = block.match(/href=["'](?:https?:\/\/www\.bbc\.co\.uk)?(\/programmes\/[a-z0-9]+)["']/i)?.[1];
  if (!programmeLink) return null;
  // BBC's older series do not consistently use a <span> for these fields.
  // Accept the semantic class regardless of whether its content closes as a
  // span, link, heading or paragraph.
  const titleText = clean(block.match(/class=["'][^"']*programme__title[^"']*["'][^>]*>([\s\S]*?)<\/(?:span|a|h[1-6]|p)>/i)?.[1] || '');
  const title = titleText.replace(/^Episode\s*\d+\s*:\s*/i, '').trim();
  const rawSynopsis = clean(block.match(/class=["'][^"']*programme__synopsis[^"']*["'][^>]*>([\s\S]*?)<\/(?:p|span|div)>/i)?.[1] || '');
  // Read ordinal metadata only from its labelled card field. Do not search the
  // arbitrary HTML card: an unrelated 1/32 in markup was collapsing records to
  // episode 1. Normally "Southwell 25" is episode 25; the labelled marker
  // wins when it is present (older cards occasionally disagree with the title).
  const cardText = clean(block);
  const labelledEpisode = cardText.match(/\bEpisode\s+(\d{1,3})\s+of\s+\d{1,3}\b/i)?.[1];
  const ordinal = rawSynopsis.match(/^(\d{1,3})\s*\/\s*\d{1,3}\b/);
  const titleEpisode = title.match(/\s(\d{1,3})$/)?.[1];
  // Specials and other deliberately unnumbered BBC programmes remain useful
  // catalogue entries, but are N/A so they cannot collide with a standard
  // episode number or invite duplicate logging.
  const isSpecial = /\bspecial\b/i.test(`${title} ${rawSynopsis}`) || (!labelledEpisode && !titleEpisode && !ordinal);
  const episode = isSpecial ? 0 : Number(labelledEpisode || titleEpisode || ordinal?.[1] || 0);
  const image = absolute(block.match(/(?:data-src|src)\s*=\s*["']([^"']+\.(?:jpg|jpeg|png|webp))["']/i)?.[1]);
  const synopsis = rawSynopsis.replace(/^\d{1,3}\s*\/\s*\d{1,3}\s*/, '');
  const watchHref = block.match(/href=["']([^"']*\/iplayer\/episode\/[a-z0-9]+[^"']*)["']/i)?.[1] || '';
  const watch = absolute(watchHref);
  // "Southwell 25" becomes the location title "Southwell", but generic
  // historical cards such as "Episode 35" must retain their number. Without
  // it all 35 of those cards shared the title "Episode" and collapsed into
  // a single PocketBase record through the old fallback matcher.
  const displayTitle = /^Episode\s+\d{1,3}$/i.test(title) ? title : title.replace(/\s+\d{1,3}$/, '').trim() || title;
  return { pid, url: `https://www.bbc.co.uk${programmeLink}`, watch, series, episode, title: displayTitle, synopsis, image, isSpecial };
  }).filter((episode) => episode && episode.title && episode.title.toLowerCase() !== 'series' && (episode.episode > 0 || episode.isSpecial) && !isAlternateCut(episode));
};

const parseProfileLinks = (html, role) => [...html.matchAll(/<a[^>]+href=["'](\/programmes\/profiles\/[^"'?]+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map((match) => {
  const linkStart = match.index ?? 0;
  const itemStart = html.lastIndexOf('<li', linkStart);
  const itemEnd = html.indexOf('</li>', linkStart);
  const item = html.slice(itemStart >= 0 ? itemStart : Math.max(0, linkStart - 3000), itemEnd >= 0 ? itemEnd : Math.min(html.length, linkStart + 3000));
  const card = match[2];
  const slug = match[1].split('/').filter(Boolean).pop() || '';
  const name = clean(card.match(/<(?:h1|h2|h3|h4)[^>]*>([\s\S]*?)<\/(?:h1|h2|h3|h4)>/i)?.[1] || card).replace(/\s+(Read more|Find out more)$/i, '').trim() || slug.replace(/-/g, ' ');
  const image = absolute(item.match(/(?:data-src|src)\s*=\s*["']([^"']+\.(?:jpg|jpeg|png|webp))["']/i)?.[1] || '');
  return { name, profileUrl: `https://www.bbc.co.uk${match[1]}`, role, image };
}).filter((profile, index, all) => profile.name && profile.name.length < 80 && key(profile.name) !== 'n/a' && all.findIndex((item) => item.profileUrl === profile.profileUrl) === index);
const profileImage = (html, name) => {
  const nameIndex = html.toLowerCase().indexOf(name.toLowerCase());
  if (nameIndex < 0) return '';
  const local = html.slice(Math.max(0, nameIndex - 1000), Math.min(html.length, nameIndex + 7000));
  return absolute(local.match(/(?:data-src|src)\s*=\s*["']([^"']+\.(?:jpg|jpeg|png|webp))["']/i)?.[1]);
};
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const episodesByPid = new Map();
const fetchedSeries = new Set();
for (let page = 1; page <= 4; page += 1) {
  const guidePageUrl = page === 1 ? guideUrl : `${guideUrl}?page=${page}`;
  const html = await fetchHtml(guidePageUrl);
  const seriesLinks = parseSeriesLinks(html);
  console.log(`Guide page ${page}: ${html.length} bytes, ${seriesLinks.length} series links`);
  for (const seriesUrl of seriesLinks) {
    if (fetchedSeries.has(seriesUrl)) continue;
    fetchedSeries.add(seriesUrl);
    const seriesHtml = await fetchHtml(seriesUrl);
    const series = seriesFromPage(seriesHtml);
    if (!series) { console.warn(`  Skipped series page without a verified series number: ${seriesUrl}`); continue; }
    const pendingPages = [seriesUrl];
    const fetchedPages = new Set();
    let cards = 0;
    while (pendingPages.length) {
      const episodePageUrl = pendingPages.shift();
      if (!episodePageUrl || fetchedPages.has(episodePageUrl)) continue;
      fetchedPages.add(episodePageUrl);
      const episodeHtml = episodePageUrl === seriesUrl ? seriesHtml : await fetchHtml(episodePageUrl);
      const found = parseEpisodes(episodeHtml, series);
      cards += found.length;
      for (const episode of found) episodesByPid.set(episode.pid, episode);
      for (const moreUrl of parseEpisodePageLinks(episodeHtml, seriesUrl)) {
        if (!fetchedPages.has(moreUrl)) pendingPages.push(moreUrl);
      }
    }
    console.log(`  Series ${series}: ${cards} episode cards across ${fetchedPages.size} page(s)`);
  }
  console.log(`Guide page ${page}: ${episodesByPid.size} unique episode links collected`);
}
const episodes = [...episodesByPid.values()];
if (!episodes.length) throw new Error('BBC guide returned no episode links. Check the saved HTML and parser selectors.');

const [existingEpisodes, performances] = await Promise.all([
  pb.collection('episodes').getFullList({ requestKey: null }),
  pb.collection('team_performances').getFullList({ requestKey: null })
]);
const loggedEpisodeIds = new Set(performances.map((performance) => performance.episode).filter(Boolean));
const recordsByPid = new Map();
for (const record of existingEpisodes.filter((item) => item.bbc_pid)) {
  const records = recordsByPid.get(record.bbc_pid) || [];
  records.push(record);
  recordsByPid.set(record.bbc_pid, records);
}
const byPid = new Map([...recordsByPid].map(([pid, records]) => {
  const expected = episodesByPid.get(pid);
  // A logged record is always canonical. Otherwise prefer the record which
  // already has the BBC manifest coordinates before choosing the oldest one.
  const canonical = records.find((record) => loggedEpisodeIds.has(record.id)) ||
    records.find((record) => expected && Number(record.series) === expected.series && Number(record.episod_number) === expected.episode) ||
    records[0];
  return [pid, canonical];
}));
const legacyByCoordinate = new Map();
for (const record of existingEpisodes.filter((item) => !item.bbc_pid && Number(item.episod_number) > 0)) {
  const coordinate = `${record.series}|${record.episod_number}`;
  // Do not guess if two legacy records claim the same coordinate.
  legacyByCoordinate.set(coordinate, legacyByCoordinate.has(coordinate) ? null : record);
}
let created = 0; let updated = 0; let images = 0; let synopses = 0;
for (const episode of episodes) {
  const record = byPid.get(episode.pid) || (episode.episode > 0 ? legacyByCoordinate.get(`${episode.series}|${episode.episode}`) : null);
  const logged = Boolean(record && loggedEpisodeIds.has(record.id));
  // Catalogue fields are filled once, not repeatedly treated as a source of
  // truth.  This preserves a corrected title, a hand-written synopsis, and all
  // logged episode identity data.  BBC metadata can still be refreshed.
  const payload = {};
  if (!record || !logged) {
    // PID is BBC's stable identity.  It is safe to repair the catalogue
    // coordinates from that identity as long as this record has no user log.
    payload.series = episode.series;
    payload.episod_number = episode.episode;
    payload.title = episode.title;
  }
  if (episode.pid) payload.bbc_pid = episode.pid;
  if (episode.url) payload.bbc_url = episode.url;
  if (episode.watch) payload.watch = episode.watch;
  // An existing synopsis is considered curated.  In particular this prevents
  // a user's text being replaced with BBC text or a placeholder on a later run.
  if (episode.synopsis && (!record || !String(record.synopsis || '').trim())) payload.synopsis = episode.synopsis;
  const saved = record ? await pb.collection('episodes').update(record.id, payload) : await pb.collection('episodes').create(payload);
  if (record) updated += 1; else { created += 1; existingEpisodes.push(saved); }
  byPid.set(episode.pid, saved);
  if (episode.synopsis) synopses += 1;
  if (episode.image && (refreshImages || !saved.image)) { try { const blob = await fetchImage(episode.image); await pb.collection('episodes').update(saved.id, { image: new File([blob], `${episode.pid}.jpg`, { type: blob.type || 'image/jpeg' }) }); images += 1; } catch (error) { console.warn(`Could not save image for ${episode.pid}: ${error.message}`); } }
}

const profileMap = new Map();
for (const [role, url] of profileUrls) {
  const profiles = parseProfileLinks(await fetchHtml(url), role);
  console.log(`${role} profile page: ${profiles.length} named profiles found`);
  for (const profile of profiles) {
    let image = profile.image || '';
    if (!image) {
      try {
        image = profileImage(await fetchHtml(profile.profileUrl), profile.name);
      } catch (error) {
        console.warn(`  Could not read profile page for ${profile.name}: ${error.message}`);
      }
    }
    console.log(`  ${profile.name}: ${image ? 'portrait found' : 'portrait not found'} (${profile.profileUrl})`);
    const person = profileMap.get(key(profile.name)) || { ...profile, is_presenter: false, is_expert: false, image: '' };
    person.is_presenter ||= role === 'presenter';
    person.is_expert ||= role === 'expert';
    if (image) person.image = image;
    profileMap.set(key(profile.name), person);
    await pause(350);
  }
}
const existingExperts = await pb.collection('experts').getFullList({ requestKey: null });
const expertByName = new Map(existingExperts.map((expert) => [key(expert.name), expert]));
let peopleCreated = 0; let peopleUpdated = 0; let portraits = 0;
for (const profile of profileMap.values()) {
  const fields = { name: profile.name, is_presenter: profile.is_presenter, is_expert: profile.is_expert };
  const existing = expertByName.get(key(profile.name));
  const person = existing ? await pb.collection('experts').update(existing.id, fields) : await pb.collection('experts').create(fields);
  if (existing) peopleUpdated += 1; else { peopleCreated += 1; expertByName.set(key(profile.name), person); }
  if (profile.image && (refreshImages || !person.avatar)) { try { const blob = await fetchImage(profile.image); await pb.collection('experts').update(person.id, { avatar: new File([blob], `${person.id}.jpg`, { type: blob.type || 'image/jpeg' }) }); portraits += 1; } catch (error) { console.warn(`Could not save portrait for ${profile.name}: ${error.message}`); } }
}
console.log(`BBC sync complete: ${episodes.length} cards, ${created} created, ${updated} updated, ${synopses} synopses, ${images} episode images, ${peopleCreated} experts created, ${peopleUpdated} experts updated, ${portraits} portraits.`);

// The normal sync above is intentionally non-destructive. Nuclear mode is a
// separately opted-in catalogue reset using the fresh, verified BBC PID
// manifest already fetched by this run.
if (process.argv.includes('--nuclear')) {
  const apply = process.argv.includes('--apply');
  const includeLogged = process.argv.includes('--include-logged');
  if (includeLogged && !apply) throw new Error('--include-logged is destructive and requires --apply.');
  let removals = 0; let protectedCount = 0; let unknown = 0;
  for (const row of existingEpisodes) {
    if (loggedEpisodeIds.has(row.id) && !includeLogged) {
      protectedCount += 1;
      continue;
    }
    const standard = row.bbc_pid ? episodesByPid.get(row.bbc_pid) : null;
    const canonical = row.bbc_pid ? byPid.get(row.bbc_pid) : null;
    if (standard && canonical?.id === row.id) continue;
    unknown += 1;
    const reason = standard ? `duplicate BBC PID ${row.bbc_pid}` : row.bbc_pid ? `nonstandard PID ${row.bbc_pid}` : 'record with no BBC PID';
    console.log(`REMOVE ${reason}: ${row.id} S${row.series} E${row.episod_number} ${row.title || ''}`);
    if (apply) { await pb.collection('episodes').delete(row.id); removals += 1; }
  }
  console.log(`${apply ? 'Applied' : 'Dry run'} nuclear pass: ${unknown} ${includeLogged ? '' : 'unlogged '}nonstandard BBC record(s), ${protectedCount} protected episode(s) with team data, ${removals} deletion(s).`);
  if (!apply) console.log('Review this plan and back up pb_data before rerunning with --nuclear --apply.');
}
