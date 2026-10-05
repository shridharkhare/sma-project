// server.js - Local development server for AI Virtual Try-On backend
const http = require('http');
const fs = require('fs');
const path = require('path');

// Load .env file if it exists and process.env is not already set
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const value = trimmed.slice(idx + 1).trim().replace(/^["'](.*)["']$/, '$1');
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  });
}

const indexHandler = require('./api/index');
const tryonHandler = require('./api/tryon');

function createResponseWrapper(res) {
  res.status = function (code) {
    res.statusCode = code;
    return res;
  };

  res.set = function (headers) {
    if (typeof headers === 'object') {
      Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
    }
    return res;
  };

  res.json = function (data) {
    if (!res.getHeader('Content-Type')) {
      res.setHeader('Content-Type', 'application/json');
    }
    res.end(JSON.stringify(data));
    return res;
  };

  return res;
}

const server = http.createServer((req, res) => {
  createResponseWrapper(res);

  let body = '';
  req.on('data', chunk => {
    body += chunk;
  });

  req.on('end', async () => {
    if (body) {
      try {
        req.body = JSON.parse(body);
      } catch (err) {
        req.body = body;
      }
    } else {
      req.body = {};
    }

    const urlPath = req.url.split('?')[0];

    try {
      if (urlPath === '/api/tryon') {
        await tryonHandler(req, res);
      } else if (urlPath === '/' || urlPath === '/api' || urlPath === '/api/' || urlPath === '/api/health') {
        await indexHandler(req, res);
      } else {
        res.status(404).json({ error: 'Not found', path: urlPath });
      }
    } catch (err) {
      console.error('Server error:', err);
      if (!res.writableEnded) {
        res.status(500).json({ error: 'Internal server error', message: err.message });
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🚀 AI Virtual Try-On Backend running locally at:`);
  console.log(`   http://localhost:${PORT}`);
  console.log(`   - Health check: http://localhost:${PORT}/api/health`);
  console.log(`   - TryOn API:    http://localhost:${PORT}/api/tryon (POST)\n`);
  if (!process.env.GEMINI_API_KEY) {
    console.warn(`⚠️  Warning: GEMINI_API_KEY is not set in backend/.env`);
  } else {
    console.log(`✅ GEMINI_API_KEY detected`);
  }
});
