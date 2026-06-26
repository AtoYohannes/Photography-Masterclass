const form = document.getElementById('registrationForm');
const messageBox = document.getElementById('formMessage');
const countBox = document.getElementById('registrationsCount');

async function updateCount() {
  try {
    const response = await fetch('/api/registrations/count');
    const data = await response.json();
    if (data.success) {
      countBox.textContent = data.count;
    }
  } catch (error) {
    console.error(error);
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(form);
  const payload = {
    fullName: formData.get('fullName')?.toString().trim() || '',
    email: formData.get('email')?.toString().trim() || '',
    phone: formData.get('phone')?.toString().trim() || ''
  };

  messageBox.textContent = '';
  messageBox.className = 'form-message';

  try {
    const response = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (response.ok) {
      messageBox.textContent = data.message;
      messageBox.className = 'form-message success';
      form.reset();
      await updateCount();
    } else {
      messageBox.textContent = data.message || 'Registration failed.';
      messageBox.className = 'form-message error';
    }
  } catch (error) {
    messageBox.textContent = 'Unable to submit right now.';
    messageBox.className = 'form-message error';
  }
});

updateCount();
