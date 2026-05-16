const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const cards = require('./cards.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── In-memory store (swap with DB/Replit DB later) ───────────────────────────
const pullLog = [];      // { username, card, timestamp }
const collections = {};  // { username: Set<cardId> }

// ─── Weighted random pull ─────────────────────────────────────────────────────
function weightedRandom(pool) {
  const total = pool.reduce((s, c) => s + c.weight, 0);
  let r = Math.random() * total;
  for (const card of pool) {
    r -= card.weight;
    if (r <= 0) return card;
  }
  return pool[pool.length - 1];
}

// Guarantee at least one rare/epic/legendary in a 10-pull
function pull10() {
  const results = [];
  let hasRareOrAbove = false;

  for (let i = 0; i < 10; i++) {
    let pool = cards;
    // Last slot: if no rare+ yet, force from rare+ pool
    if (i === 9 && !hasRareOrAbove) {
      pool = cards.filter(c => c.rarity !== 'common');
    }
    const card = weightedRandom(pool);
    if (card.rarity !== 'common') hasRareOrAbove = true;
    results.push(card);
  }
  return results;
}

// ─── API routes ───────────────────────────────────────────────────────────────

// Single pull
app.get('/api/pull', (req, res) => {
  const card = weightedRandom(cards);
  const username = req.query.username || 'Anonymous';

  pullLog.push({ username, card, timestamp: Date.now() });
  if (!collections[username]) collections[username] = new Set();
  collections[username].add(card.id);

  // Broadcast to live feed
  io.emit('pull-event', { username, card });

  res.json({ card });
});

// 10-pull
app.get('/api/pull/10', (req, res) => {
  const results = pull10();
  const username = req.query.username || 'Anonymous';

  if (!collections[username]) collections[username] = new Set();
  results.forEach(card => {
    pullLog.push({ username, card, timestamp: Date.now() });
    collections[username].add(card.id);
  });

  // Broadcast notable pulls
  results
    .filter(c => c.rarity === 'legendary' || c.rarity === 'epic')
    .forEach(card => io.emit('pull-event', { username, card }));

  res.json({ cards: results });
});

// Leaderboard — top collectors by unique cards
app.get('/api/leaderboard', (req, res) => {
  const board = Object.entries(collections)
    .map(([username, set]) => ({
      username,
      total: set.size,
      legendaries: [...set].filter(id => {
        const c = cards.find(c => c.id === id);
        return c && c.rarity === 'legendary';
      }).length
    }))
    .sort((a, b) => b.legendaries - a.legendaries || b.total - a.total)
    .slice(0, 20);

  res.json(board);
});

// All cards (for collection view)
app.get('/api/cards', (req, res) => {
  res.json(cards);
});

// Collection for a user
app.get('/api/collection/:username', (req, res) => {
  const set = collections[req.params.username] || new Set();
  res.json([...set]);
});

// Recent pulls (live feed)
app.get('/api/feed', (req, res) => {
  res.json(pullLog.slice(-30).reverse());
});

// ─── Socket.io — Live chat ────────────────────────────────────────────────────
io.on('connection', (socket) => {
  socket.on('chat-message', ({ username, message }) => {
    const safe = message.replace(/</g, '&lt;').replace(/>/g, '&gt;').slice(0, 200);
    io.emit('chat-message', { username, message: safe, timestamp: Date.now() });
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`⚽ WC 2026 Gacha running on http://localhost:${PORT}`);
});
