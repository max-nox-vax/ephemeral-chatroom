let clicks = 0;
let lastClickTime = 0;
const CLICK_GAP_LIMIT_MS = 400; // max gap allowed between consecutive clicks

document.addEventListener('click', () => {
  const now = Date.now();

  if (now - lastClickTime > CLICK_GAP_LIMIT_MS) {
    // too much time passed since the last click — restart the count
    clicks = 1;
  } else {
    clicks++;
  }
  lastClickTime = now;

  if (clicks >= 5) {
    window.location.href = '/login.html';
  }
});