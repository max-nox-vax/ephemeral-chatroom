# Ephemeral — a self-destructing public chatroom

Single public room. Log in with a secret code, then chat with text, stickers,
images, and videos (≤5MB). **Every message disappears 30 seconds after it's
sent** — for everyone, on every screen — and nothing is ever written to disk.
Restarting the server also wipes everything instantly, since all state lives
in RAM only.

## How it behaves

- **Login**: one input box + "GO" button. Correct code → session cookie set → redirected to the chat room. Wrong code → shake + error, no redirect.
- **Public room**: everyone who's logged in lands in the same room and sees the same live feed.
- **Message lifetime**: exactly 30 seconds from send, enforced by the **server** (not the browser), so it's the same for every viewer regardless of when they joined. A small burning ring next to each message shows the countdown; the message fades out and is removed from every client the instant the server erases it.
- **Storage**: messages and uploaded media live in plain JavaScript memory (an array + a Map). Nothing touches the filesystem or a database. If the server restarts, everything is gone — by design, per your requirements.
- **Uploads**: images/videos are size-checked client-side and server-side (max 5MB, configurable), held in RAM only, and served from `/media/:id` until they expire alongside their chat message.

## Everything you'll want to tune lives in one file: `config.js`

```js
SECRET_CODE          // the login code
MESSAGE_LIFETIME_MS  // how long a message survives (default 30000 = 30s)
MAX_FILE_SIZE_MB      // upload cap (default 5)
SESSION_SECRET        // cookie signing secret — set a real random value in prod
PORT                   // defaults to process.env.PORT (Render sets this for you)
```
Everything in `config.js` reads from environment variables first, so on Render
you never have to edit code — just set the values as Environment Variables in
the dashboard (see below).

## Run locally

```bash
npm install
export SECRET_CODE=letmein
export SESSION_SECRET=some-long-random-string
npm start
# open http://localhost:3000
```

## Deploy free on Render

1. Push this folder to a new GitHub repo.
2. On [render.com](https://render.com) → **New +** → **Web Service** → connect that repo.
3. Settings:
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free
4. Under **Environment Variables**, add:
   - `SECRET_CODE` → whatever code you want people to type in
   - `SESSION_SECRET` → any long random string
5. Deploy. Render gives you a free `https://your-app.onrender.com` URL — that's your chat room.

Note: Render's free tier spins the service down after inactivity, so the very
first request after a quiet period takes a few extra seconds to wake up. Since
all chat state is in memory anyway, that "cold start" behaves exactly like a
restart — the room is simply empty again, which matches how you wanted this
to work.

## Honest limitations worth knowing

- **Single server instance only.** Because messages and login sessions live in RAM, this won't work if you scale to multiple server instances (Render free tier only runs one, so you're fine).
- **No message history after a restart or a scale-to-zero cycle.** That's intentional here, but worth knowing if you ever want it otherwise.
- **The login "code" is a shared shared password, not per-user accounts.** Anyone with the code can join and gets a random guest name like `Guest4821`.
