const form = document.getElementById('login-form');
const codeInput = document.getElementById('code');
const errorMsg = document.getElementById('error-msg');
const goBtn = document.getElementById('go-btn');
const goText = document.getElementById('go-text');
const goSpinner = document.getElementById('go-spinner');
const card = document.querySelector('.login-card');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const code = codeInput.value;
  if (!code) return;

  setLoading(true);
  errorMsg.hidden = true;

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const data = await res.json();
    if (data.ok) {
      window.location.href = '/chat.html';
      return;
    }
    showError(data.error || 'Wrong code. Try again.');
  } catch (err) {
    showError('Could not reach the server. Try again.');
  }
  setLoading(false);
});

function showError(text) {
  errorMsg.textContent = text;
  errorMsg.hidden = false;
  codeInput.value = '';
  codeInput.focus();
  card.classList.remove('shake');
  // force reflow so the animation can replay
  void card.offsetWidth;
  card.classList.add('shake');
}

function setLoading(isLoading) {
  goBtn.disabled = isLoading;
  goText.hidden = isLoading;
  goSpinner.hidden = !isLoading;
}
