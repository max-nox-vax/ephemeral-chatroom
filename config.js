// =====================================================================
// ALL TUNABLE CONSTANTS LIVE HERE — change behavior from this file only
// =====================================================================
module.exports = {
  // The code users must type on the login page to enter the chatroom.
  // Override in production by setting the SECRET_CODE environment variable.
  SECRET_CODE: process.env.SECRET_CODE,

  // How long a message stays visible before it is permanently erased
  // (server memory + every connected screen), in milliseconds.
  MESSAGE_LIFETIME_MS: 30 * 1000, // 30 seconds

  // Max upload size for images / videos, in megabytes.
  MAX_FILE_SIZE_MB: 5,

  // Single public room name (kept as a constant in case you want to
  // support multiple rooms later).
  ROOM_NAME: 'public',

  // Express session cookie secret — override with SESSION_SECRET env var.
  SESSION_SECRET: process.env.SESSION_SECRET || 'please-change-this-session-secret',

  // Port the server listens on (Render/Railway inject PORT automatically).
  PORT: process.env.PORT || 3000,
};
