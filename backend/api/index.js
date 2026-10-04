// api/index.js - Health check and root endpoint

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

module.exports = async function handler(req, res) {
  Object.entries(CORS_HEADERS).forEach(([key, val]) => res.setHeader(key, val));

  if (req.method === 'OPTIONS') {
    return res.status(200).json({ ok: true });
  }

  return res.status(200).json({
    name: 'AI Virtual Try-On Backend',
    version: '1.0.0',
    status: 'healthy',
    description: 'Backend service for the AI Virtual Try-On Chrome Extension',
    endpoints: {
      'POST /api/tryon': 'Generate virtual try-on image using Gemini AI',
      'GET /api/health': 'Health check'
    },
    timestamp: new Date().toISOString()
  });
};
