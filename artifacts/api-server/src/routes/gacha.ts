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

router.get("/cards", (_req, res) => {
  res.json(cards);
});

router.get("/pull", (req, res) => {
  const username = (req.query.username as string) || "Anonymous";
  const card = weightedRandom(cards);
  recordPull(username, card);

  if (io) io.emit("pull-event", { username, card });

  res.json({ card });
});

router.get("/pull/10", (req, res) => {
  const username = (req.query.username as string) || "Anonymous";
  const results = pull10();

  results.forEach((card) => recordPull(username, card));

  if (io) {
    results
      .filter((c) => c.rarity === "legendary" || c.rarity === "epic")
      .forEach((card) => io!.emit("pull-event", { username, card }));
  }

  res.json({ cards: results });
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

export default router;
