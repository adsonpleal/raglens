// One-off: regenerate `src-tauri/resources/pet_food_db.json` from
// rAthena's renewal YAML database.
//
// The pet-feeder overlay shows the number of units of the active pet's
// designated food item in the player's inventory. The `0x01a1` /
// `0x01a4` pet packets don't carry an item id, so we resolve it via:
//
//   pet_db.yml      Mob: PORING       → FoodItem: Apple_Juice
//   mob_db.yml      AegisName: PORING → Id: 1002    (= pet sprite id)
//   item_db_*.yml   AegisName: Apple_Juice → Id: 531
//
// We pull the renewal (`db/re/`) variants — latamRO is renewal-era.
// Food is split between item_db_usable.yml (juices) and
// item_db_etc.yml (herbs, pet food). Both are fetched and merged.
//
// Usage:
//   node scripts/build-pet-food-db.mjs
//
// Writes `src-tauri/resources/pet_food_db.json` and prints a summary
// to stderr. Idempotent; safe to re-run when rathena master shifts.
//
// Note: latamRO is a private server with custom pets that mainline
// rathena doesn't ship. Mapping gaps surface as `Comida: —` in the UI.
// Curate a latamRO overlay later if/when the user identifies which
// pet ids are missing.

import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
// JSON sits in the frontend tree — the pet-feeder hook imports it as
// a static module via Vite's built-in JSON loader. We don't need a
// Rust mirror: ZC_FEED_PET (0x01a3) carries the food id on the wire,
// so the backend doesn't need the pet→food mapping at all.
const outFile = join(
  here,
  "..",
  "src",
  "addons",
  "pet-feeder",
  "pet_food_db.json",
);

const BASE = "https://raw.githubusercontent.com/rathena/rathena/master/db/re";
const SOURCES = {
  pet: `${BASE}/pet_db.yml`,
  mob: `${BASE}/mob_db.yml`,
  itemUsable: `${BASE}/item_db_usable.yml`,
  itemEtc: `${BASE}/item_db_etc.yml`,
};

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} → ${res.status}`);
  return await res.text();
}

// Each rAthena DB file uses a `Body:` array of objects with simple
// scalar fields plus nested blocks. We don't need a real YAML parser —
// every entry begins at column 2 (`  - SomeKey:`) and its scalars are
// at column 4. We scan line-by-line, splitting on the `  - ` marker
// and extracting the keys we care about per entry.

function splitEntries(yaml) {
  const lines = yaml.split(/\r?\n/);
  const entries = [];
  let current = null;
  for (const line of lines) {
    // A new entry starts at exactly two spaces + dash. We don't want
    // to match list items nested deeper (e.g. Evolution -
    // ItemRequirements - Item:); those are 6+ spaces deep.
    if (/^  - [A-Z]/.test(line)) {
      if (current) entries.push(current);
      current = [line];
    } else if (current) {
      current.push(line);
    }
  }
  if (current) entries.push(current);
  return entries.map((arr) => arr.join("\n"));
}

function scalar(block, key) {
  // Matches `    Key: Value` (4 leading spaces is the standard top-
  // level field indent inside an entry) OR `  - Key: Value` (the
  // first field of an entry sits next to the list dash). Trailing
  // comments and quoted values handled.
  const re = new RegExp(`^(?:[ ]{2,4}|[ ]{2}- )${key}:[ ]+(.+?)\\s*$`, "m");
  const m = block.match(re);
  if (!m) return null;
  let v = m[1];
  // Strip inline `   # comment` tails (rathena tags unresolved
  // food items with `Pet_Food   # unknown` and similar). Real food
  // names never contain `#`.
  const hash = v.indexOf("#");
  if (hash >= 0) v = v.slice(0, hash);
  v = v.trim();
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  if (v.startsWith("'") && v.endsWith("'")) v = v.slice(1, -1);
  return v;
}

function parseMobOrItem(yaml) {
  // mob_db.yml and item_db_*.yml both share: each Body entry has
  // `Id: NNN` and `AegisName: SOMETHING`. Build name → id.
  const map = new Map();
  for (const block of splitEntries(yaml)) {
    const id = scalar(block, "Id");
    const aegis = scalar(block, "AegisName");
    if (id && aegis) map.set(aegis, parseInt(id, 10));
  }
  return map;
}

function parsePets(yaml) {
  // pet_db.yml: each entry has `Mob: <AegisName>` and
  // `FoodItem: <AegisName>`.
  const pairs = [];
  for (const block of splitEntries(yaml)) {
    const mob = scalar(block, "Mob");
    const food = scalar(block, "FoodItem");
    if (mob && food) pairs.push({ mob, food });
  }
  return pairs;
}

async function main() {
  process.stderr.write("Fetching rAthena master YAML…\n");
  const [petsRaw, mobsRaw, usableRaw, etcRaw] = await Promise.all([
    fetchText(SOURCES.pet),
    fetchText(SOURCES.mob),
    fetchText(SOURCES.itemUsable),
    fetchText(SOURCES.itemEtc),
  ]);

  const pets = parsePets(petsRaw);
  const mobs = parseMobOrItem(mobsRaw);
  const usable = parseMobOrItem(usableRaw);
  const etc = parseMobOrItem(etcRaw);
  const items = new Map([...usable, ...etc]);

  process.stderr.write(
    `pets=${pets.length} mobs=${mobs.size} items=${items.size}\n`,
  );

  const out = {};
  const missing = [];
  for (const { mob, food } of pets) {
    const petId = mobs.get(mob);
    const foodId = items.get(food);
    if (!petId || !foodId) {
      missing.push({ mob, food, petId, foodId });
      continue;
    }
    out[String(petId)] = { food_item_id: foodId, food_name: food };
  }

  if (missing.length > 0) {
    process.stderr.write(
      `Skipped ${missing.length} unresolved entries (printed below).\n`,
    );
    for (const m of missing) {
      process.stderr.write(
        `  ${m.mob} → ${m.food} (petId=${m.petId ?? "?"} foodId=${m.foodId ?? "?"})\n`,
      );
    }
  }

  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, JSON.stringify(out, null, 2) + "\n");
  process.stderr.write(
    `Wrote ${Object.keys(out).length} entries → ${outFile}\n`,
  );

  // Smoke-check a few canonical entries so a future format change in
  // rathena that breaks our regex parser surfaces here instead of
  // silently dropping pets.
  const expected = [
    { mob: "PORING", petId: 1002, food: "Apple_Juice" },
    { mob: "LUNATIC", petId: 1063, food: "Carrot_Juice" },
  ];
  for (const ex of expected) {
    const got = out[String(ex.petId)];
    if (!got || got.food_name !== ex.food) {
      throw new Error(
        `Smoke check failed: ${ex.mob} (${ex.petId}) → expected food=${ex.food}, got=${JSON.stringify(got)}`,
      );
    }
  }
}

main().catch((e) => {
  process.stderr.write(`FAIL: ${e.message}\n`);
  process.exit(1);
});
