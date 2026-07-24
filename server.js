const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const multer = require('multer');
const http = require('http');
const { Server } = require('socket.io');
const config = require('./config');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// ---------------------------------------------------------------------
// SESSION (shared between Express routes and Socket.io handshake)
// Memory store only -> wiped automatically whenever the server restarts.
// ---------------------------------------------------------------------
const sessionMiddleware = session({
  secret: config.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }, // cookie itself may live 24h, but it only
                                            // grants a login — no chat content is ever
                                            // stored in it or on disk.
});
app.use(sessionMiddleware);
io.engine.use(sessionMiddleware);

// ---------------------------------------------------------------------
// IN-MEMORY-ONLY STATE — nothing here ever touches disk.
// A server restart / crash wipes everything instantly, by design.
// ---------------------------------------------------------------------
const messages = [];         // [{id, type, content, user, ts}]
const mediaStore = new Map(); // id -> {buffer, mimetype}
const pendingTimers = new Map(); // id -> Timeout

function scheduleErase(id) {
  const t = setTimeout(() => {
    const idx = messages.findIndex((m) => m.id === id);
    if (idx !== -1) messages.splice(idx, 1);
    mediaStore.delete(id);
    pendingTimers.delete(id);
    io.to(config.ROOM_NAME).emit('chat:remove', { id });
  }, config.MESSAGE_LIFETIME_MS);
  pendingTimers.set(id, t);
}

// ---------------------------------------------------------------------
// AUTH ROUTES
// ---------------------------------------------------------------------
app.post('/api/login', (req, res) => {
  const { code } = req.body || {};
  if (typeof code === 'string' && code.trim() === config.SECRET_CODE) {
    req.session.authenticated = true;
    if (!req.session.username) {
      req.session.username = 'Guest' + Math.floor(1000 + Math.random() * 9000);
    }
    return res.json({ ok: true });
  }
  return res.status(401).json({ ok: false, error: 'Wrong code. Try again.' });
});

app.get('/api/me', (req, res) => {
  if (!req.session.authenticated) return res.status(401).json({ ok: false });
  res.json({ ok: true, username: req.session.username, lifetimeMs: config.MESSAGE_LIFETIME_MS, maxFileMB: config.MAX_FILE_SIZE_MB });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  return res.redirect('/');
}

// app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
// app.get('/chat.html', requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'public', 'chat.html')));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'wallpaper.html')));
app.get('/login.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/chat.html', requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'public', 'chat.html')));

// ---------------------------------------------------------------------
// UPLOAD (image / video) — kept purely in RAM (multer memoryStorage),
// never written to disk, auto-deleted along with its chat message.
// ---------------------------------------------------------------------
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.MAX_FILE_SIZE_MB * 1024 * 1024 },
});

app.post('/api/upload', (req, res) => {
  if (!req.session.authenticated) return res.status(401).json({ ok: false });
  upload.single('file')(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE'
        ? `File too large — max ${config.MAX_FILE_SIZE_MB}MB.`
        : 'Upload failed.';
      return res.status(400).json({ ok: false, error: msg });
    }
    if (!req.file) return res.status(400).json({ ok: false, error: 'No file received.' });
    const type = req.file.mimetype.startsWith('video') ? 'video' : 'image';
    const id = crypto.randomUUID();
    mediaStore.set(id, { buffer: req.file.buffer, mimetype: req.file.mimetype });
    res.json({ ok: true, id, url: `/media/${id}`, type });
  });
});

app.get('/media/:id', (req, res) => {
  const item = mediaStore.get(req.params.id);
  if (!item) return res.status(404).send('This media has expired.');
  res.set('Content-Type', item.mimetype);
  res.send(item.buffer);
});

// ---------------------------------------------------------------------
// SOCKET.IO — public room, live chat + live countdown-based erasure
// ---------------------------------------------------------------------
io.use((socket, next) => {
  const req = socket.request;
  if (req.session && req.session.authenticated) return next();
  next(new Error('unauthorized'));
});

io.on('connection', (socket) => {
  const username = socket.request.session.username;
  socket.join(config.ROOM_NAME);

  // send current (still-alive) messages to the newly joined client only
  socket.emit('chat:history', {
    username,
    lifetimeMs: config.MESSAGE_LIFETIME_MS,
    messages,
  });

  socket.to(config.ROOM_NAME).emit('chat:system', { text: `${username} joined the room.` });

  socket.on('chat:send', (payload) => {
    if (!payload || !payload.type) return;
    const { type } = payload;
    if (!['text', 'sticker', 'image', 'video'].includes(type)) return;

    let content = payload.content;
    let id = payload.id; // image/video already have an id from /api/upload
    if (type === 'text' || type === 'sticker') {
      if (typeof content !== 'string' || !content.trim()) return;
      content = content.trim().slice(0, 1000);
      id = crypto.randomUUID();
    } else {
      // image/video: must reference an id that really exists in mediaStore
      if (!id || !mediaStore.has(id)) return;
    }

    const msg = {
      id,
      type,
      content,
      user: username,
      ts: Date.now(),
      expiresAt: Date.now() + config.MESSAGE_LIFETIME_MS,
    };
    messages.push(msg);
    io.to(config.ROOM_NAME).emit('chat:new', msg);
    scheduleErase(id);
  });

  socket.on('disconnect', () => {
    socket.to(config.ROOM_NAME).emit('chat:system', { text: `${username} left the room.` });
  });
});

server.listen(config.PORT, "0.0.0.0", () => {
  console.log(`Chatroom running on http://localhost:${config.PORT}`);
});
