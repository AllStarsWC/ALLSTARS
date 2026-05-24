import { Router } from "express";
import { Server as SocketIOServer } from "socket.io";
import cardsData from "../cards.json" assert { type: "json" };

export type CardRarity = "legendary" | "epic" | "rare" | "common";

export interface Card {
  id: string;
  name: string;
  country: string;
  position: string;
  rarity: CardRarity;
  weight: number;
  image: string;
  flag: string;
}

const cards: Card[] = cardsData as Card[];

interface PullLogEntry {
  username: string;
  card: Card;
  timestamp: number;
}

const pullLog: PullLogEntry[] = [];
const collections: Record<string, Set<string>> = {};
const pullCounts: Record<string, number> = {};

let io: SocketIOServer | null = null;

export function setSocketIO(socketIO: SocketIOServer) {
  io = socketIO;
}

function weightedRandom(pool: Card[]): Card {
  const total = pool.reduce((s, c) => s + c.weight, 0);
  let r = Math.random() * total;
  for (const card of pool) {
    r -= card.weight;
    if (r <= 0) return card;
  }
  return pool[pool.length - 1];
}

function pull10(): Card[] {
  const results: Card[] = [];
  let hasRareOrAbove = false;

  for (let i = 0; i < 10; i++) {
    let pool = cards;
    if (i === 9 && !hasRareOrAbove) {
      pool = cards.filter((c) => c.rarity !== "common");
    }
    const card = weightedRandom(pool);
    if (card.rarity !== "common") hasRareOrAbove = true;
    results.push(card);
  }
  return results;
}

function recordPull(username: string, card: Card) {
  pullLog.push({ username, card, timestamp: Date.now() });
  if (!collections[username]) collections[username] = new Set();
  collections[username].add(card.id);
  pullCounts[username] = (pullCounts[username] ?? 0) + 1;
}

const router = Router();

router.get("/config", (_req, res) => {
  res.json({ freeMode: true, pull1Cost: 0, pull10Cost: 0, pull1CostUI: 0, pull10CostUI: 0 });
});

router.get("/cards", (_req, res) => {
  res.json(cards);
});

function doPull1(username: string): Card {
  const card = weightedRandom(cards);
  recordPull(username, card);
  if (io) io.emit("pull-event", { username, card });
  return card;
}

function doPull10Bulk(username: string): Card[] {
  const results = pull10();
  results.forEach((card) => recordPull(username, card));
  if (io) {
    results
      .filter((c) => c.rarity === "legendary" || c.rarity === "epic")
      .forEach((card) => io!.emit("pull-event", { username, card }));
  }
  return results;
}

router.get("/pull", (req, res) => {
  const username = (req.query.username as string) || "Anonymous";
  res.json({ card: doPull1(username) });
});

router.post("/pull", (req, res) => {
  const username = (req.body?.username as string) || "Anonymous";
  res.json({ card: doPull1(username) });
});

router.get("/pull/10", (req, res) => {
  const username = (req.query.username as string) || "Anonymous";
  res.json({ cards: doPull10Bulk(username) });
});

router.post("/pull/10", (req, res) => {
  const username = (req.body?.username as string) || "Anonymous";
  res.json({ cards: doPull10Bulk(username) });
});

router.get("/collection/:username", (req, res) => {
  const set = collections[req.params.username] || new Set();
  res.json([...set]);
});

router.get("/leaderboard", (_req, res) => {
  const board = Object.entries(collections)
    .map(([username, set]) => ({
      username,
      total: set.size,
      legendaries: [...set].filter((id) => {
        const c = cards.find((c) => c.id === id);
        return c && c.rarity === "legendary";
      }).length,
    }))
    .sort((a, b) => b.legendaries - a.legendaries || b.total - a.total)
    .slice(0, 20);

  res.json(board);
});

router.get("/feed", (_req, res) => {
  res.json(pullLog.slice(-30).reverse());
});

router.get("/stats/:username", (req, res) => {
  const username = req.params.username;
  const owned = collections[username] ? [...collections[username]] : [];
  const pulls = pullCounts[username] ?? 0;

  const countByRarity = (rarity: CardRarity) =>
    owned.filter((id) => {
      const c = cards.find((c) => c.id === id);
      return c && c.rarity === rarity;
    }).length;

  res.json({
    pulls,
    owned: owned.length,
    legendaries: countByRarity("legendary"),
    epics: countByRarity("epic"),
    rares: countByRarity("rare"),
    commons: countByRarity("common"),
  });
});

// ── Helius DAS ────────────────────────────────────────────────────────────────
async function heliusDAS(method: string, params: Record<string, unknown>): Promise<unknown> {
  const key = process.env.HELIUS_API_KEY ?? '';
  const r = await fetch(`https://mainnet.helius-rpc.com/?api-key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const d = (await r.json()) as { result?: unknown; error?: { message: string } };
  if (d.error) throw new Error(d.error.message);
  return d.result;
}

// GET /api/gacha/asset/:mintAddress — full DAS asset (attributes, rarity, etc.)
router.get('/asset/:mintAddress', async (req, res) => {
  try {
    const result = await heliusDAS('getAsset', { id: req.params.mintAddress });
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message ?? e) });
  }
});

// GET /api/gacha/my-players?wallet=<pubkey>  — NFTs owned by wallet from ALL STARS collection
router.get('/my-players', async (req, res) => {
  const wallet = (req.query.wallet as string) ?? '';
  if (!wallet) return void res.status(400).json({ error: 'wallet required' });
  try {
    const result = await heliusDAS('getAssetsByOwner', {
      ownerAddress: wallet,
      page: 1,
      limit: 1000,
    }) as { items?: unknown[] } | null;
    const items: any[] = (result as any)?.items ?? [];
    const filtered = items.filter((a: any) => {
      const sym: string = a?.content?.metadata?.symbol ?? '';
      return sym === 'ALLSTARS' || sym === 'AS2026' || sym.toLowerCase().includes('allstar');
    });
    res.json(filtered);
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message ?? e) });
  }
});

export default router;
