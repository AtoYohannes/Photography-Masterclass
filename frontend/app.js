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

// ── Teacher photos ───────────────────────────────────
async function loadTeacherPhotos() {
  try {
    const res = await fetch('/api/teachers');
    const data = await res.json();
    const images = data.images || [];

    images.slice(0, 2).forEach((src, i) => {
      const slot = document.querySelector(`.teacher-photo[data-teacher="${i + 1}"]`);
      if (!slot) return;
      slot.querySelector('.photo-label')?.remove();
      const img = document.createElement('img');
      img.src = src;
      img.alt = '';
      img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;';
      slot.insertBefore(img, slot.firstChild);
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

// ── Registration form ───────────────────────────────
const form       = document.getElementById('registrationForm');
const messageBox = document.getElementById('formMessage');

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
      await updateCount();
    } else {
      messageBox.textContent = data.message || 'Registration failed.';
      messageBox.className   = 'form-message error';
    }
  } catch (_) {
    messageBox.textContent = 'Unable to submit right now.';
    messageBox.className   = 'form-message error';
  }
});

// ── Init ────────────────────────────────────────────
updateCount();
loadHeroPhotos();
loadTeacherPhotos();
