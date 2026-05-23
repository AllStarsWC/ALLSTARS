/**
 * Pinata upload script for WC 2026 All Stars NFT collection.
 *
 * Uploads all card images + Metaplex metadata JSONs to Pinata,
 * then writes:
 *   candy-machine/cache.json   — mapping of card index → {imageCid, metaCid}
 *   candy-machine/config.json  — Sugar CLI config ready to run sugar deploy
 *
 * Run: node scripts/pinata-upload.mjs
 * Resume: safe to re-run — already-uploaded cards are skipped.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, extname, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..');

const JWT = process.env.PINATA_JWT;
if (!JWT) { console.error('PINATA_JWT env var not set'); process.exit(1); }

const CARDS_JSON  = join(ROOT, 'artifacts/api-server/src/cards.json');
const CARDS_DIR   = join(ROOT, 'artifacts/gacha/public/cards');
const OUT_DIR     = join(ROOT, 'candy-machine');
const CACHE_FILE  = join(OUT_DIR, 'cache.json');

const TREASURY    = '5zxQnDjbw12Tb7fr3eFy888SFGQACvNfgvymvaAvMB8b';
const SYMBOL      = 'ALLSTARS';
const SELLER_FEE  = 500;
const GATEWAY     = 'https://gateway.pinata.cloud/ipfs';
const CONCURRENCY = 3;

const cards = JSON.parse(readFileSync(CARDS_JSON, 'utf8'));
mkdirSync(OUT_DIR, { recursive: true });

// Load or initialise cache so we can resume interrupted runs
let cache = existsSync(CACHE_FILE) ? JSON.parse(readFileSync(CACHE_FILE, 'utf8')) : {};

function saveCache() {
  writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}

// ── Pinata helpers ──────────────────────────────────────────────────────────

async function pinFile(filePath, name) {
  const bytes = readFileSync(filePath);
  const blob  = new Blob([bytes]);
  const form  = new FormData();
  form.append('file', blob, basename(filePath));
  form.append('pinataMetadata', JSON.stringify({ name }));
  form.append('pinataOptions',  JSON.stringify({ cidVersion: 1 }));

  const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
    method: 'POST',
    headers: { Authorization: `Bearer ${JWT}` },
    body: form,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`pinFile failed (${res.status}): ${txt}`);
  }
  const { IpfsHash } = await res.json();
  return IpfsHash;
}

async function pinJSON(obj, name) {
  const res = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${JWT}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ pinataMetadata: { name }, pinataOptions: { cidVersion: 1 }, pinataContent: obj }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`pinJSON failed (${res.status}): ${txt}`);
  }
  const { IpfsHash } = await res.json();
  return IpfsHash;
}

// ── Metadata builder (Metaplex standard) ───────────────────────────────────

function buildMetadata(card, imageCid) {
  const mime = extname(card.image).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';
  const imageUri = `${GATEWAY}/${imageCid}`;
  return {
    name: card.name,
    symbol: SYMBOL,
    description: `WC 2026 All Stars — ${card.name} | ${card.country} | ${card.position} | ${card.rating} OVR`,
    seller_fee_basis_points: SELLER_FEE,
    image: imageUri,
    external_url: 'https://allstars.thefogcoin.fun',
    attributes: [
      { trait_type: 'Position', value: card.position },
      { trait_type: 'Rarity',   value: card.rarity.charAt(0).toUpperCase() + card.rarity.slice(1) },
      { trait_type: 'Country',  value: card.country },
      { trait_type: 'Rating',   value: String(card.rating) },
    ],
    properties: {
      files: [{ uri: imageUri, type: mime }],
      category: 'image',
      creators: [{ address: TREASURY, share: 100 }],
    },
  };
}

// ── Concurrency pool ────────────────────────────────────────────────────────

async function processCard(card, idx) {
  const key = String(card.id);

  // Strip leading slash from image path, e.g. "/cards/FOO.png" → "FOO.png"
  const imgFile = card.image.replace(/^\/cards\//, '');
  const imgPath = join(CARDS_DIR, imgFile);

  if (!existsSync(imgPath)) {
    console.warn(`  [${idx}] SKIP  ${card.name} — image not found: ${imgFile}`);
    return;
  }

  // Image upload (skip if cached)
  let imageCid = cache[key]?.imageCid;
  if (!imageCid) {
    imageCid = await pinFile(imgPath, `${SYMBOL} #${idx} image — ${card.name}`);
    cache[key] = { ...cache[key], imageCid };
    saveCache();
    console.log(`  [${idx}] IMG   ${card.name}  → ${imageCid}`);
  } else {
    console.log(`  [${idx}] IMG   ${card.name}  (cached)`);
  }

  // Metadata upload (skip if cached)
  let metaCid = cache[key]?.metaCid;
  if (!metaCid) {
    const meta = buildMetadata(card, imageCid);
    metaCid = await pinJSON(meta, `${SYMBOL} #${idx} metadata — ${card.name}`);
    cache[key] = { ...cache[key], metaCid, name: card.name, index: idx };
    saveCache();
    console.log(`  [${idx}] META  ${card.name}  → ${metaCid}`);
  } else {
    console.log(`  [${idx}] META  ${card.name}  (cached)`);
  }
}

async function runWithConcurrency(tasks, limit) {
  const results = [];
  let i = 0;
  async function next() {
    while (i < tasks.length) {
      const taskIdx = i++;
      try { await tasks[taskIdx](); }
      catch (err) { console.error(`Task ${taskIdx} error:`, err.message); }
    }
  }
  const workers = Array.from({ length: limit }, () => next());
  await Promise.all(workers);
}

// ── Main ────────────────────────────────────────────────────────────────────

console.log(`\nUploading ${cards.length} cards to Pinata (concurrency ${CONCURRENCY})…\n`);

const tasks = cards.map((card, idx) => () => processCard(card, idx));
await runWithConcurrency(tasks, CONCURRENCY);

// Write Sugar config.json
const sugarConfig = {
  price: 0.05,
  number: cards.length,
  symbol: SYMBOL,
  sellerFeeBasisPoints: SELLER_FEE,
  solTreasuryAccount: TREASURY,
  goLiveDate: '2026-06-01T00:00:00Z',
  creators: [{ address: TREASURY, share: 100 }],
  hiddenSettings: null,
  uploadMethod: 'pinata',
  pinataConfig: {
    jwt: 'SET_YOUR_PINATA_JWT_HERE',
    ipfsGateway: GATEWAY,
  },
};
writeFileSync(join(OUT_DIR, 'config.json'), JSON.stringify(sugarConfig, null, 2));

const uploaded = Object.values(cache).filter(v => v.imageCid && v.metaCid).length;
console.log(`\nDone. ${uploaded}/${cards.length} cards uploaded.`);
console.log(`Cache  → candy-machine/cache.json`);
console.log(`Config → candy-machine/config.json`);
console.log('\nNext steps (on your local machine with Sugar installed):');
console.log('  sugar validate');
console.log('  sugar deploy');
console.log('  sugar verify');
