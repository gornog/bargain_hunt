import PocketBase from 'pocketbase';

const apply = process.argv.includes('--apply');
const baseUrl = process.env.POCKETBASE_URL || 'http://localhost:8090';
const token = process.env.POCKETBASE_SUPERUSER_TOKEN;
const email = process.env.POCKETBASE_ADMIN_EMAIL;
const password = process.env.POCKETBASE_ADMIN_PASSWORD;

if (!token && !(email && password)) {
  throw new Error('Set POCKETBASE_SUPERUSER_TOKEN or POCKETBASE_ADMIN_EMAIL and POCKETBASE_ADMIN_PASSWORD.');
}

const pb = new PocketBase(baseUrl);
pb.autoCancellation(false);
if (token) pb.authStore.save(token);
else await pb.collection('_superusers').authWithPassword(email, password);

const normalise = (name) => String(name || '').trim().toLocaleLowerCase('en-GB');
const mergeIds = (...values) => [...new Set(values.flat().filter(Boolean))];

// This script intentionally requires the additive schema change first. It never
// deletes legacy records or changes the legacy `episodes.auctioneers` relation.
// Run it once as a dry run, validate the counts, then re-run with --apply.
const [legacyAuctioneers, experts, episodes] = await Promise.all([
  pb.collection('auctioneers').getFullList({ requestKey: null }),
  pb.collection('experts').getFullList({ requestKey: null }),
  pb.collection('episodes').getFullList({ requestKey: null }),
]);

const peopleByName = new Map(experts.map((person) => [normalise(person.name), person]));
const personIdByLegacyId = new Map();
let peopleToCreate = 0;
let peopleToUpdate = 0;

for (const legacy of legacyAuctioneers) {
  let person = legacy.expert ? experts.find((candidate) => candidate.id === legacy.expert) : undefined;
  person ||= peopleByName.get(normalise(legacy.name));
  const auctionHouses = mergeIds(person?.auction_houses || [], legacy.auction_house || []);
  if (!person) {
    peopleToCreate += 1;
    if (apply) {
      person = await pb.collection('experts').create({ name: legacy.name, is_auctioneer: true, auction_houses: auctionHouses });
      experts.push(person);
      peopleByName.set(normalise(person.name), person);
    }
  } else if (!person.is_auctioneer || auctionHouses.length !== (person.auction_houses || []).length) {
    peopleToUpdate += 1;
    if (apply) {
      person = await pb.collection('experts').update(person.id, { is_auctioneer: true, auction_houses: auctionHouses });
      const index = experts.findIndex((candidate) => candidate.id === person.id);
      if (index >= 0) experts[index] = person;
    }
  }
  // In a dry run the final relation count is still calculated from the known
  // legacy source. The ID is only needed when performing writes.
  if (person?.id) personIdByLegacyId.set(legacy.id, person.id);
}

let episodesToUpdate = 0;
let unresolvedLinks = 0;
for (const episode of episodes) {
  const legacyIds = Array.isArray(episode.auctioneers) ? episode.auctioneers : [];
  if (!legacyIds.length) continue;
  const mapped = legacyIds.map((id) => personIdByLegacyId.get(id)).filter(Boolean);
  unresolvedLinks += legacyIds.length - mapped.length;
  if (!apply) { episodesToUpdate += 1; continue; }
  const target = mergeIds(episode.auctioneer_people || [], mapped).slice(0, 3);
  if (target.length !== (episode.auctioneer_people || []).length || target.some((id, index) => id !== episode.auctioneer_people[index])) {
    await pb.collection('episodes').update(episode.id, { auctioneer_people: target });
    episodesToUpdate += 1;
  }
}

console.log(`${apply ? 'Applied' : 'Dry run'}: ${legacyAuctioneers.length} legacy auctioneers; ${peopleToCreate} people to create; ${peopleToUpdate} people to update; ${episodesToUpdate} episodes to link; ${unresolvedLinks} unresolved legacy links.`);
if (!apply) console.log('No records were changed. After reviewing this output, run again with --apply. Do not delete the legacy collection until the episode links are verified.');
