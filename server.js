'use strict';
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
app.disable('x-powered-by');
app.use(cors({ origin: '*' })); // public metadata API, no credentials
app.use(express.json({limit: '32kb'}));
app.get('/health', (_req, res) => res.json({ ok: true, version: '0.1.0', provider: 'demo' }));
app.get('/plugin.js', (req, res) => {
  // Render provides the public host; don't trust arbitrary forwarded hosts.
  const configured = process.env.PUBLIC_BASE_URL;
  const origin = configured || ('https://' + req.get('host'));
  const js = fs.readFileSync(path.join(__dirname, 'plugin.js'), 'utf8');
  res.type('application/javascript').send(js.replace('__API_ORIGIN__', origin.replace(/\/$/, '')));
});

// Demo content is an openly shared test clip; replace this adapter with a
// provider/API you have permission to access. No media is proxied by Render.
const demo = [{
  id: 'big-buck-bunny', title: 'Big Buck Bunny', original_title: 'Big Buck Bunny',
  year: 2008, type: 'movie',
  versions: [{ name: 'Demo / original', quality: '360p',
    url: 'https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4' }]
}];
const norm = value => String(value || '').toLowerCase().trim().replace(/ё/g, 'е');
app.get('/api/search', (req, res) => {
  const q = norm(req.query.q).slice(0, 150);
  if (!q) return res.status(400).json({error: 'Missing search query'});
  const items = demo.filter(item => [item.title, item.original_title].some(t => norm(t).includes(q) || q.includes(norm(t))));
  res.set('Cache-Control', 'public, max-age=60');
  res.json({provider: 'demo', items});
});
app.use((_req, res) => res.status(404).json({error: 'Not found'}));
const port = Number(process.env.PORT || 10000);
app.listen(port, '0.0.0.0', () => console.log(`Lampa API on port ${port}`));
