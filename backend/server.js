require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
const IMAGES_DIR   = path.join(FRONTEND_DIR, 'images');
const TEACHERS_DIR = path.join(FRONTEND_DIR, 'Teachers');
fs.mkdirSync(IMAGES_DIR,   { recursive: true });
fs.mkdirSync(TEACHERS_DIR, { recursive: true });

const IMAGE_EXTS     = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif']);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'VisitAddis@Organizer';

function checkAdminAuth(req) {
  const header = req.headers['authorization'] || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : '';
  return token === ADMIN_PASSWORD;
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp'
};

function getDatabaseConfig() {
  if (process.env.DATABASE_URL) {
    return { connectionString: process.env.DATABASE_URL };
  }

  const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'data', 'registrations.sqlite');
  return { databasePath: dbPath };
}

async function connectDatabase() {
  const config = getDatabaseConfig();

  if (config.connectionString) {
    const client = new Client({ connectionString: config.connectionString });
    await client.connect();
    await client.query(`
      CREATE TABLE IF NOT EXISTS registrations (
        id TEXT PRIMARY KEY,
        full_name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT NOT NULL,
        registered_at TEXT NOT NULL
      );
    `);
    return client;
  }

  const { DatabaseSync } = require('node:sqlite');
  const dbPath = config.databasePath;
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS registrations (
      id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      registered_at TEXT NOT NULL
    );
  `);

  const legacyJsonPath = path.join(path.dirname(dbPath), 'registrations.json');
  if (fs.existsSync(legacyJsonPath)) {
    try {
      const legacyEntries = JSON.parse(fs.readFileSync(legacyJsonPath, 'utf8'));
      if (Array.isArray(legacyEntries) && legacyEntries.length > 0) {
        for (const entry of legacyEntries) {
          const existing = db.prepare('SELECT 1 FROM registrations WHERE id = ?').get(entry.id);
          if (!existing) {
            db.prepare('INSERT INTO registrations (id, full_name, email, phone, registered_at) VALUES (?, ?, ?, ?, ?)').run(
              entry.id,
              entry.fullName || entry.full_name || '',
              entry.email || '',
              entry.phone || '',
              entry.registeredAt || entry.registered_at || new Date().toISOString()
            );
          }
        }
      }
    } catch (error) {
      // Ignore legacy data import errors and continue with the empty database.
    }
  }

  return db;
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

// ── Validation ────────────────────────────────────────

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

// Accepts: +251912345678 | 251912345678 | 0912345678 (with optional spaces)
// Ethiopian mobile: 9xx or 7xx series after country code
function validateEthiopianPhone(phone) {
  const cleaned = phone.replace(/[\s\-().]/g, '');
  return /^(?:\+251|251|0)[79]\d{8}$/.test(cleaned);
}

function normalizePhone(phone) {
  const cleaned = phone.replace(/[\s\-().]/g, '');
  if (cleaned.startsWith('+251')) return cleaned;
  if (cleaned.startsWith('251'))  return '+' + cleaned;
  if (cleaned.startsWith('0'))    return '+251' + cleaned.slice(1);
  return phone;
}

// ── Notifications (fire-and-forget, never block the response) ─

const EVENT_DATE     = process.env.EVENT_DATE     || 'Date TBA';
const EVENT_LOCATION = process.env.EVENT_LOCATION || 'Addis Ababa';

function emailHtml(reg) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:20px;overflow:hidden;max-width:560px;width:100%;">

        <!-- Header -->
        <tr><td style="background:#0b2122;padding:36px 40px 28px;">
          <p style="margin:0 0 4px;font-size:11px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:#2bbcc0;">Visit Addis Ababa</p>
          <h1 style="margin:0;font-size:26px;font-weight:800;color:#ffffff;line-height:1.25;">Photography Master Class</h1>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:36px 40px;">
          <p style="margin:0 0 12px;font-size:16px;color:#0b2122;font-weight:600;">Hey ${escHtml(reg.fullName)} 👋</p>
          <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.7;">
            You're officially registered for the <strong>Photography Master Class</strong> hosted by Visit Addis Ababa.
            We're excited to have you with us!
          </p>

          <!-- Detail box -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f8f7;border-radius:14px;margin:0 0 28px;">
            <tr><td style="padding:24px 28px;">
              <p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#5a6e6f;">Event details</p>
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:5px 16px 5px 0;font-size:13px;color:#5a6e6f;white-space:nowrap;">📅 Date</td>
                  <td style="padding:5px 0;font-size:13px;color:#0b2122;font-weight:600;">${EVENT_DATE}</td>
                </tr>
                <tr>
                  <td style="padding:5px 16px 5px 0;font-size:13px;color:#5a6e6f;white-space:nowrap;">📍 Location</td>
                  <td style="padding:5px 0;font-size:13px;color:#0b2122;font-weight:600;">${EVENT_LOCATION}</td>
                </tr>
                <tr>
                  <td style="padding:5px 16px 5px 0;font-size:13px;color:#5a6e6f;white-space:nowrap;">🎟 Admission</td>
                  <td style="padding:5px 0;font-size:13px;color:#0b2122;font-weight:600;">Free</td>
                </tr>
              </table>
            </td></tr>
          </table>

          <p style="margin:0 0 8px;font-size:14px;color:#374151;line-height:1.7;">
            What you'll learn: street photography, portraiture, composition, and how to tell visual stories about Addis Ababa.
          </p>
          <p style="margin:0 0 28px;font-size:14px;color:#374151;line-height:1.7;">
            More details (exact time, venue address, what to bring) will be sent closer to the event. Keep an eye on your inbox!
          </p>

          <p style="margin:0;font-size:13px;color:#5a6e6f;">
            See you behind the lens,<br>
            <strong style="color:#0b2122;">Visit Addis Ababa Team</strong>
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:20px 40px;border-top:1px solid rgba(11,33,34,0.08);">
          <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center;">
            You received this because you registered at visitaddisababa.et · Photography Master Class
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function smsTxt(reg) {
  const name = reg.fullName.split(' ')[0];
  return `Hi ${name}! You're registered for the Photography Master Class by Visit Addis Ababa (${EVENT_DATE}, ${EVENT_LOCATION}). See you there! — Visit Addis`;
}

function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function sendRegistrationEmail(reg) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;

  try {
    const from = process.env.EMAIL_FROM || 'Photography Master Class <onboarding@resend.dev>';
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to:      reg.email,
        subject: `You're registered! Photography Master Class — ${EVENT_DATE}`,
        html:    emailHtml(reg)
      })
    });
  } catch (_) {}
}

async function sendRegistrationSms(reg) {
  const apiKey   = process.env.AT_API_KEY;
  if (!apiKey) return;

  try {
    const username = process.env.AT_USERNAME || 'sandbox';
    const base     = username === 'sandbox'
      ? 'https://api.sandbox.africastalking.com'
      : 'https://api.africastalking.com';

    const params = new URLSearchParams({ username, to: reg.phone, message: smsTxt(reg) });
    if (process.env.AT_SENDER_ID) params.set('from', process.env.AT_SENDER_ID);

    await fetch(`${base}/version1/messaging`, {
      method:  'POST',
      headers: { 'apiKey': apiKey, 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
      body:    params.toString()
    });
  } catch (_) {}
}

function serveStaticFile(res, filePath) {
  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': contentType });
  fs.createReadStream(filePath).pipe(res);
}

function createServer() {
  let dbPromise = connectDatabase();

  return http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = decodeURIComponent(url.pathname);

    const handleRequest = async () => {
      try {

        // ── Routes that don't need the database ──────────
        // These run immediately regardless of DB state.

        if (pathname === '/api/auth') {
          if (req.method !== 'POST') {
            sendJson(res, 405, { success: false, message: 'Method not allowed.' });
            return;
          }
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try {
              const { password } = JSON.parse(body || '{}');
              if (password === ADMIN_PASSWORD) {
                sendJson(res, 200, { success: true });
              } else {
                sendJson(res, 401, { success: false, message: 'Incorrect password.' });
              }
            } catch (_) {
              sendJson(res, 400, { success: false, message: 'Invalid request.' });
            }
          });
          return;
        }

        if (pathname === '/api/images') {
          if (req.method !== 'GET') {
            sendJson(res, 405, { success: false, message: 'Method not allowed.' });
            return;
          }
          const files = fs.readdirSync(IMAGES_DIR)
            .filter(f => IMAGE_EXTS.has(path.extname(f).toLowerCase()))
            .map(f => `/images/${f}`);
          sendJson(res, 200, { images: files });
          return;
        }

        if (pathname === '/api/teachers') {
          if (req.method !== 'GET') {
            sendJson(res, 405, { success: false, message: 'Method not allowed.' });
            return;
          }
          const files = fs.readdirSync(TEACHERS_DIR)
            .filter(f => IMAGE_EXTS.has(path.extname(f).toLowerCase()))
            .sort()
            .map(f => `/Teachers/${encodeURIComponent(f)}`);
          sendJson(res, 200, { images: files });
          return;
        }

        if (pathname === '/organizer') {
          serveStaticFile(res, path.join(FRONTEND_DIR, 'organizer.html'));
          return;
        }

        if (pathname === '/') {
          serveStaticFile(res, path.join(FRONTEND_DIR, 'index.html'));
          return;
        }

        if (!pathname.startsWith('/api/')) {
          const relativePath = pathname.startsWith('/') ? pathname.slice(1) : pathname;
          const filePath = path.join(FRONTEND_DIR, relativePath);
          const isInsideFrontend = path.resolve(filePath).startsWith(path.resolve(FRONTEND_DIR));
          if (isInsideFrontend) {
            serveStaticFile(res, filePath);
          } else {
            res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Forbidden');
          }
          return;
        }

        // ── Routes that need the database ────────────────
        const db = await dbPromise;

        if (pathname === '/api/registrations/count') {
          if (req.method !== 'GET') {
            sendJson(res, 405, { success: false, message: 'Method not allowed.' });
            return;
          }

          if (db.prepare) {
            const row = db.prepare('SELECT COUNT(*) AS count FROM registrations').get();
            sendJson(res, 200, { success: true, count: Number(row.count) });
          } else {
            const row = await db.query('SELECT COUNT(*) AS count FROM registrations');
            sendJson(res, 200, { success: true, count: Number(row.rows[0].count) });
          }
          return;
        }

        if (pathname === '/api/registrations') {
          if (req.method !== 'GET') {
            sendJson(res, 405, { success: false, message: 'Method not allowed.' });
            return;
          }

          if (!checkAdminAuth(req)) {
            sendJson(res, 401, { success: false, message: 'Unauthorized.' });
            return;
          }

          if (db.prepare) {
            const rows = db
              .prepare('SELECT id, full_name AS fullName, email, phone, registered_at AS registeredAt FROM registrations ORDER BY registered_at DESC')
              .all();
            sendJson(res, 200, { success: true, registrations: rows });
          } else {
            const rows = await db.query('SELECT id, full_name AS fullName, email, phone, registered_at AS registeredAt FROM registrations ORDER BY registered_at DESC');
            sendJson(res, 200, { success: true, registrations: rows.rows });
          }
          return;
        }

        if (pathname === '/api/register') {
          if (req.method !== 'POST') {
            sendJson(res, 405, { success: false, message: 'Method not allowed.' });
            return;
          }

          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
          });

          req.on('end', async () => {
            try {
              const payload = JSON.parse(body || '{}');
              const fullName = String(payload.fullName || '').trim();
              const email   = String(payload.email   || '').trim();
              const phone   = String(payload.phone   || '').trim();

              if (!fullName || !email || !phone) {
                sendJson(res, 400, { success: false, message: 'Please complete all fields.' });
                return;
              }

              if (!validateEmail(email)) {
                sendJson(res, 400, { success: false, message: 'Please enter a valid email address.' });
                return;
              }

              if (!validateEthiopianPhone(phone)) {
                sendJson(res, 400, { success: false, message: 'Please enter a valid Ethiopian phone number (e.g. +251912345678 or 0912345678).' });
                return;
              }

              const normalizedPhone = normalizePhone(phone);

              if (db.prepare) {
                const existing = db
                  .prepare('SELECT 1 FROM registrations WHERE lower(email) = lower(?) OR lower(phone) = lower(?) LIMIT 1')
                  .get(email, normalizedPhone);

                if (existing) {
                  sendJson(res, 409, {
                    success: false,
                    message: 'You have already registered for this master class.'
                  });
                  return;
                }

                const registration = {
                  id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
                  fullName,
                  email,
                  phone: normalizedPhone,
                  registeredAt: new Date().toISOString()
                };

                db.prepare('INSERT INTO registrations (id, full_name, email, phone, registered_at) VALUES (?, ?, ?, ?, ?)').run(
                  registration.id,
                  registration.fullName,
                  registration.email,
                  registration.phone,
                  registration.registeredAt
                );

                const countRow = db.prepare('SELECT COUNT(*) AS count FROM registrations').get();

                sendJson(res, 201, {
                  success: true,
                  message: 'You have been successfully pre-registered!',
                  count: Number(countRow.count),
                  registration
                });

                // Fire notifications after responding (non-blocking)
                sendRegistrationEmail(registration).catch(() => {});
                sendRegistrationSms(registration).catch(() => {});

              } else {
                const existing = await db.query({
                  text: 'SELECT 1 FROM registrations WHERE lower(email) = lower($1) OR lower(phone) = lower($2) LIMIT 1',
                  values: [email, normalizedPhone]
                });

                if (existing.rows.length > 0) {
                  sendJson(res, 409, {
                    success: false,
                    message: 'You have already registered for this master class.'
                  });
                  return;
                }

                const registration = {
                  id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
                  fullName,
                  email,
                  phone: normalizedPhone,
                  registeredAt: new Date().toISOString()
                };

                await db.query({
                  text: 'INSERT INTO registrations (id, full_name, email, phone, registered_at) VALUES ($1, $2, $3, $4, $5)',
                  values: [registration.id, registration.fullName, registration.email, registration.phone, registration.registeredAt]
                });

                const countRow = await db.query('SELECT COUNT(*) AS count FROM registrations');

                sendJson(res, 201, {
                  success: true,
                  message: 'You have been successfully pre-registered!',
                  count: Number(countRow.rows[0].count),
                  registration
                });

                // Fire notifications after responding (non-blocking)
                sendRegistrationEmail(registration).catch(() => {});
                sendRegistrationSms(registration).catch(() => {});
              }
            } catch (error) {
              sendJson(res, 400, { success: false, message: 'Invalid request payload.' });
            }
          });
          return;
        }

        sendJson(res, 404, { success: false, message: 'Not found.' });

      } catch (error) {
        sendJson(res, 500, { success: false, message: 'Server error.' });
      }
    };

    handleRequest();
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  const server = createServer();
  server.listen(port, () => {
    console.log(`Registration portal running at http://localhost:${port}`);
  });
}

module.exports = { createServer };
