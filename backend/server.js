const http = require('http');
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');

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
              const email = String(payload.email || '').trim();
              const phone = String(payload.phone || '').trim();

              if (!fullName || !email || !phone) {
                sendJson(res, 400, { success: false, message: 'Please complete all fields.' });
                return;
              }

              if (db.prepare) {
                const existing = db
                  .prepare('SELECT 1 FROM registrations WHERE lower(email) = lower(?) OR lower(phone) = lower(?) LIMIT 1')
                  .get(email, phone);

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
                  phone,
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
              } else {
                const existing = await db.query({
                  text: 'SELECT 1 FROM registrations WHERE lower(email) = lower($1) OR lower(phone) = lower($2) LIMIT 1',
                  values: [email, phone]
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
                  phone,
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
              }
            } catch (error) {
              sendJson(res, 400, { success: false, message: 'Invalid request payload.' });
            }
          });
          return;
        }

        if (pathname === '/') {
          serveStaticFile(res, path.join(FRONTEND_DIR, 'index.html'));
          return;
        }

        const safePath = pathname === '/' ? '/index.html' : pathname;
        const relativePath = safePath.startsWith('/') ? safePath.slice(1) : safePath;
        const filePath = path.join(FRONTEND_DIR, relativePath);
        const isInsideFrontend = path.resolve(filePath).startsWith(path.resolve(FRONTEND_DIR));

        if (isInsideFrontend) {
          serveStaticFile(res, filePath);
        } else {
          res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Forbidden');
        }
      } catch (error) {
        sendJson(res, 500, { success: false, message: 'Database error.' });
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
