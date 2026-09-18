import PocketBase from 'pocketbase';

const url = process.env.POCKETBASE_URL || 'http://localhost:8090';
const token = process.env.POCKETBASE_SUPERUSER_TOKEN;
const email = process.env.POCKETBASE_SUPERUSER_EMAIL;
const password = process.env.POCKETBASE_SUPERUSER_PASSWORD;
if (!token && Boolean(email) !== Boolean(password)) throw new Error('Set both POCKETBASE_SUPERUSER_EMAIL and POCKETBASE_SUPERUSER_PASSWORD, or neither.');
if (!token && !email) throw new Error('Set POCKETBASE_SUPERUSER_EMAIL and POCKETBASE_SUPERUSER_PASSWORD (or POCKETBASE_SUPERUSER_TOKEN).');

const pb = new PocketBase(url);
if (token) pb.authStore.save(token);
else await pb.collection('_superusers').authWithPassword(email, password);
const rules = { listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null };
const collections = await pb.collections.getFullList();
const targets = collections.filter((collection) => !collection.system);
const apply = process.argv.includes('--apply');
console.table(targets.map(({ name }) => ({ collection: name, action: apply ? 'lock' : 'would lock' })));
if (!apply) {
  console.log('Dry run only. Re-run with --apply after taking a pb_data backup.');
  process.exit(0);
}
for (const collection of targets) await pb.collections.update(collection.id, rules);
console.log(`Locked ${targets.length} collections. Only the Astro server token can now access them.`);
