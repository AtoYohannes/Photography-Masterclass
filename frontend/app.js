// ── Floating hero photos ────────────────────────────
async function loadHeroPhotos() {
  const container = document.getElementById('heroPhotos');
  if (!container) return;

  try {
    const res = await fetch('/api/images');
    const data = await res.json();
    const images = data.images || [];

    if (images.length === 0) {
      const hint = document.createElement('p');
      hint.className = 'hero-photos-empty';
      hint.textContent = 'Drop photos into the /images folder to display them here';
      container.appendChild(hint);
      return;
    }

    const picks = images.sort(() => Math.random() - 0.5).slice(0, 8);
    picks.forEach(src => {
      const card = document.createElement('div');
      card.className = 'photo-card';
      const img = document.createElement('img');
      img.src = src;
      img.alt = '';
      img.loading = 'lazy';
      card.appendChild(img);
      container.appendChild(card);
    });
  } catch (_) {}
}


// ── Registration count ──────────────────────────────
const countBox = document.getElementById('registrationsCount');

async function updateCount() {
  try {
    const res = await fetch('/api/registrations/count');
    const data = await res.json();
    if (data.success && countBox) countBox.textContent = data.count;
  } catch (_) {}
}

// ── Validation helpers ──────────────────────────────
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

// Accepts +251, 251, or 0 prefix followed by 9 or 7 and 8 more digits
function isValidEthiopianPhone(phone) {
  const cleaned = phone.replace(/[\s\-().]/g, '');
  return /^(?:\+251|251|0)[79]\d{8}$/.test(cleaned);
}

function setFieldError(input, msg) {
  let hint = input.parentElement.querySelector('.field-error');
  if (!hint) {
    hint = document.createElement('p');
    hint.className = 'field-error';
    input.after(hint);
  }
  hint.textContent = msg;
  input.setAttribute('aria-invalid', 'true');
}

function clearFieldError(input) {
  input.parentElement.querySelector('.field-error')?.remove();
  input.removeAttribute('aria-invalid');
}

// ── Registration form ───────────────────────────────
const form       = document.getElementById('registrationForm');
const messageBox = document.getElementById('formMessage');

// Live phone validation feedback
const phoneInput = document.getElementById('f-phone');
phoneInput?.addEventListener('blur', () => {
  const val = phoneInput.value.trim();
  if (val && !isValidEthiopianPhone(val)) {
    setFieldError(phoneInput, 'Enter an Ethiopian number: +251912345678 or 0912345678');
  } else {
    clearFieldError(phoneInput);
  }
});
phoneInput?.addEventListener('input', () => {
  if (phoneInput.getAttribute('aria-invalid')) clearFieldError(phoneInput);
});

// Live email validation feedback
const emailInput = document.getElementById('f-email');
emailInput?.addEventListener('blur', () => {
  const val = emailInput.value.trim();
  if (val && !isValidEmail(val)) {
    setFieldError(emailInput, 'Enter a valid email address.');
  } else {
    clearFieldError(emailInput);
  }
});
emailInput?.addEventListener('input', () => {
  if (emailInput.getAttribute('aria-invalid')) clearFieldError(emailInput);
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(form);
  const payload = {
    fullName: formData.get('fullName')?.toString().trim() || '',
    email:    formData.get('email')?.toString().trim()    || '',
    phone:    formData.get('phone')?.toString().trim()    || ''
  };

  messageBox.textContent = '';
  messageBox.className = 'form-message';

  // Client-side validation
  let hasError = false;
  if (!isValidEmail(payload.email)) {
    setFieldError(emailInput, 'Enter a valid email address.');
    hasError = true;
  }
  if (!isValidEthiopianPhone(payload.phone)) {
    setFieldError(phoneInput, 'Enter an Ethiopian number: +251912345678 or 0912345678');
    hasError = true;
  }
  if (hasError) return;

  const submitBtn = form.querySelector('[type="submit"]');
  const originalText = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent = 'Sending…';

  try {
    const res = await fetch('/api/register', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload)
    });

    const data = await res.json();
    if (res.ok) {
      messageBox.textContent = data.message;
      messageBox.className   = 'form-message success';
      form.reset();
      clearFieldError(emailInput);
      clearFieldError(phoneInput);
      await updateCount();
    } else {
      messageBox.textContent = data.message || 'Registration failed.';
      messageBox.className   = 'form-message error';
    }
  } catch (_) {
    messageBox.textContent = 'Unable to submit right now.';
    messageBox.className   = 'form-message error';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = originalText;
  }
});

// ── Init ────────────────────────────────────────────
updateCount();
loadHeroPhotos();
