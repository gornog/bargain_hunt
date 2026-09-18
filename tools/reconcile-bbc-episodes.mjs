import PocketBase from 'pocketbase';

// Review the effects of an older importer before tidying a live catalogue.
// It never changes data unless --apply is supplied, and it will *never* delete
// a record referenced by team_performances.
const pb = new PocketBase(process.env.POCKETBASE_URL || 'http://localhost:8090');
if (process.env.POCKETBASE_SUPERUSER_TOKEN) pb.authStore.save(process.env.POCKETBASE_SUPERUSER_TOKEN);
else {
  const email = process.env.POCKETBASE_SUPERUSER_EMAIL || process.env.POCKETBASE_ADMIN_EMAIL;
  const password = process.env.POCKETBASE_SUPERUSER_PASSWORD || process.env.POCKETBASE_ADMIN_PASSWORD;
  if (Boolean(email) !== Boolean(password)) throw new Error('Set both POCKETBASE_SUPERUSER_EMAIL and POCKETBASE_SUPERUSER_PASSWORD, or neither.');
  if (email) await pb.collection('_superusers').authWithPassword(email, password);
}

const apply = process.argv.includes('--apply');
const [episodes, performances] = await Promise.all([
  pb.collection('episodes').getFullList({ requestKey: null }),
  pb.collection('team_performances').getFullList({ requestKey: null })
]);
const logged = new Set(performances.map((row) => row.episode).filter(Boolean));
const groups = new Map();
for (const episode of episodes.filter((episode) => episode.bbc_pid)) {
  const group = groups.get(episode.bbc_pid) || [];
  group.push(episode); groups.set(episode.bbc_pid, group);
}
const score = (episode) => [episode.image, episode.watch, episode.synopsis, episode.bbc_url, episode.presenter, episode.auction_house, episode.auctioneers?.length].filter(Boolean).length;
let duplicateGroups = 0; let removed = 0;
for (const [pid, rows] of groups) {
  if (rows.length < 2) continue;
  duplicateGroups += 1;
  const protectedRows = rows.filter((row) => logged.has(row.id));
  // Preserve a logged row even when a richer unlogged catalogue row exists.
  const canonical = [...(protectedRows.length ? protectedRows : rows)].sort((a, b) => score(b) - score(a) || String(a.created).localeCompare(String(b.created)))[0];
  const candidates = rows.filter((row) => row.id !== canonical.id && !logged.has(row.id));
  console.log(`PID ${pid}: keep ${canonical.id} (S${canonical.series} E${canonical.episod_number}); ${candidates.length} unlogged duplicate(s): ${candidates.map((row) => row.id).join(', ') || 'none'}`);
  if (apply) {
    for (const row of candidates) {
      await pb.collection('episodes').delete(row.id);
      removed += 1;
    }
  }
}

const coordinates = new Map();
for (const episode of episodes.filter((episode) => Number(episode.series) && Number(episode.episod_number))) {
  const group = coordinates.get(`${episode.series}|${episode.episod_number}`) || [];
  group.push(episode); coordinates.set(`${episode.series}|${episode.episod_number}`, group);
}
const collisions = [...coordinates.entries()].filter(([, rows]) => rows.length > 1);
for (const [coordinate, rows] of collisions) console.warn(`Coordinate collision S/E ${coordinate}: ${rows.map((row) => `${row.id} (${row.title || 'untitled'}${logged.has(row.id) ? ', LOGGED' : ''})`).join('; ')}`);

console.log(`${apply ? 'Applied' : 'Dry run'}: ${duplicateGroups} duplicate PID group(s), ${collisions.length} series/episode collision(s), ${removed} unlogged duplicate(s) removed.`);
if (!apply && duplicateGroups) console.log('Review this output, back up pb_data, then rerun with --apply only if every proposed removal is expected.');
