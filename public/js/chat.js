const feed = document.getElementById('feed');
const textInput = document.getElementById('text-input');
const sendBtn = document.getElementById('send-btn');
const stickerBtn = document.getElementById('sticker-btn');
const stickerPanel = document.getElementById('sticker-panel');
const imageBtn = document.getElementById('image-btn');
const videoBtn = document.getElementById('video-btn');
const fileInput = document.getElementById('file-input');
const meName = document.getElementById('me-name');
const leaveBtn = document.getElementById('leave-btn');
const toast = document.getElementById('toast');

const STICKERS = ['🔥','😂','❤️','👍','😮','😢','🎉','👀','💀','🙌','😎','✨','🤝','😭','🥳','👏'];
let LIFETIME_MS = 30000;
let MAX_FILE_MB = 5;
let myUsername = '';
const ringTimers = new Map(); // id -> intervalId

// ---------------------------------------------------------------------
// bootstrap: confirm we're logged in, then open the socket
// ---------------------------------------------------------------------
(async function init() {
  try {
    const res = await fetch('/api/me');
    if (!res.ok) { window.location.href = '/'; return; }
    const data = await res.json();
    myUsername = data.username;
    LIFETIME_MS = data.lifetimeMs;
    MAX_FILE_MB = data.maxFileMB;
    meName.textContent = myUsername;
    connect();
  } catch {
    window.location.href = '/';
  }
})();

function connect() {
  const socket = io();

  socket.on('connect_error', () => { window.location.href = '/'; });

  socket.on('chat:history', ({ messages }) => {
    feed.innerHTML = '';
    messages.forEach((m) => renderMessage(m));
    scrollToBottom();
  });

  socket.on('chat:new', (m) => {
    renderMessage(m);
    scrollToBottom();
  });

  socket.on('chat:remove', ({ id }) => removeMessage(id));

  socket.on('chat:system', ({ text }) => {
    const el = document.createElement('div');
    el.className = 'msg system';
    el.textContent = text;
    feed.appendChild(el);
    scrollToBottom();
  });

  // ---- composer wiring ----
  sendBtn.addEventListener('click', () => sendText(socket));
  textInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendText(socket);
  });

  stickerBtn.addEventListener('click', () => {
    stickerPanel.hidden = !stickerPanel.hidden;
  });

  imageBtn.addEventListener('click', () => { fileInput.accept = 'image/*'; fileInput.click(); });
  videoBtn.addEventListener('click', () => { fileInput.accept = 'video/*'; fileInput.click(); });
  fileInput.addEventListener('change', () => handleFile(socket));

  leaveBtn.addEventListener('click', async () => {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/';
  });

  buildStickerPanel(socket);
}

function buildStickerPanel(socket) {
  stickerPanel.innerHTML = '';
  STICKERS.forEach((s) => {
    const btn = document.createElement('button');
    btn.textContent = s;
    btn.addEventListener('click', () => {
      socket.emit('chat:send', { type: 'sticker', content: s });
      stickerPanel.hidden = true;
    });
    stickerPanel.appendChild(btn);
  });
}

function sendText(socket) {
  const val = textInput.value.trim();
  if (!val) return;
  socket.emit('chat:send', { type: 'text', content: val });
  textInput.value = '';
}

async function handleFile(socket) {
  const file = fileInput.files[0];
  fileInput.value = '';
  if (!file) return;

  if (file.size > MAX_FILE_MB * 1024 * 1024) {
    showToast(`Too big — max ${MAX_FILE_MB}MB.`);
    return;
  }

  showToast('Uploading…');
  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    const data = await res.json();
    if (!data.ok) { showToast(data.error || 'Upload failed.'); return; }
    socket.emit('chat:send', { type: data.type, content: data.url, id: data.id });
    toast.hidden = true;
  } catch {
    showToast('Upload failed.');
  }
}

function showToast(text) {
  toast.textContent = text;
  toast.hidden = false;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { toast.hidden = true; }, 2500);
}

// ---------------------------------------------------------------------
// rendering
// ---------------------------------------------------------------------
function renderMessage(m) {
  const wrap = document.createElement('div');
  wrap.className = 'msg' + (m.user === myUsername ? ' mine' : '');
  wrap.dataset.id = m.id;

  const ring = buildRing(m.id, m.expiresAt);

  const bubbleWrap = document.createElement('div');
  bubbleWrap.style.display = 'flex';
  bubbleWrap.style.flexDirection = 'column';
  bubbleWrap.style.gap = '2px';
  bubbleWrap.style.minWidth = '0';

  const meta = document.createElement('div');
  meta.className = 'msg-meta';
  meta.textContent = (m.user === myUsername ? 'you' : m.user);

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';

  if (m.type === 'text') {
    bubble.textContent = m.content;
  } else if (m.type === 'sticker') {
    bubble.classList.add('msg-sticker');
    bubble.style.background = 'transparent';
    bubble.style.border = 'none';
    bubble.textContent = m.content;
  } else if (m.type === 'image') {
    const img = document.createElement('img');
    img.className = 'msg-media image';
    img.src = m.content;
    img.alt = 'shared image';
    bubble.appendChild(img);
  } else if (m.type === 'video') {
    const vid = document.createElement('video');
    vid.className = 'msg-media video';
    vid.src = m.content;
    vid.controls = true;
    bubble.appendChild(vid);
  }

  bubbleWrap.appendChild(meta);
  bubbleWrap.appendChild(bubble);

  wrap.appendChild(ring);
  wrap.appendChild(bubbleWrap);
  feed.appendChild(wrap);
}

function removeMessage(id) {
  const el = feed.querySelector(`[data-id="${CSS.escape(id)}"]`);
  clearInterval(ringTimers.get(id));
  ringTimers.delete(id);
  if (!el) return;
  el.classList.add('burning');
  setTimeout(() => el.remove(), 620);
}

// countdown ring: a small SVG circle that empties as the message's life
// runs out, then the message itself burns away
function buildRing(id, expiresAt) {
  const wrap = document.createElement('div');
  wrap.className = 'ring-wrap';
  const r = 9;
  const c = 2 * Math.PI * r;
  wrap.innerHTML = `
    <svg width="22" height="22" viewBox="0 0 22 22">
      <circle class="ring-bg" cx="11" cy="11" r="${r}" />
      <circle class="ring-fg" cx="11" cy="11" r="${r}"
        stroke-dasharray="${c}" stroke-dashoffset="0" />
    </svg>`;
  const fg = wrap.querySelector('.ring-fg');

  const tick = () => {
    const remaining = Math.max(0, expiresAt - Date.now());
    const frac = remaining / LIFETIME_MS;
    fg.style.strokeDashoffset = String(c * (1 - frac));
    if (remaining <= 0) clearInterval(interval);
  };
  tick();
  const interval = setInterval(tick, 250);
  ringTimers.set(id, interval);
  return wrap;
}

function scrollToBottom() {
  feed.scrollTop = feed.scrollHeight;
}
