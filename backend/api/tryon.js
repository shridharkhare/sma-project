// api/tryon.js - AI Virtual Try-On endpoint
// Vercel Serverless Function

const { GoogleGenerativeAI } = require('@google/generative-ai');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

module.exports = async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
    res.statusCode = 200;
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // Set CORS + JSON headers for all responses
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  const { productImage, productTitle, category, userPhotos, profileName } = req.body || {};

  // Validation
  if (!productTitle && !productImage) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: 'Product information is required' }));
    return;
  }

  if (!userPhotos || Object.keys(userPhotos).length === 0) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: 'User profile photos are required' }));
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'AI service not configured. Set GEMINI_API_KEY.' }));
    return;
  }

  try {
    const result = await generateTryOn({
      productImage,
      productTitle,
      category,
      userPhotos,
      profileName,
      apiKey
    });

    res.statusCode = 200;
    res.end(JSON.stringify(result));
  } catch (error) {
    console.error('Try-on generation error:', error);
    res.statusCode = 500;
    res.end(JSON.stringify({
      error: error.message || 'Failed to generate try-on',
      details: error.stack
    }));
  }
};

async function generateTryOn({ productImage, productTitle, category, userPhotos, profileName, apiKey }) {
  const genAI = new GoogleGenerativeAI(apiKey);

  // Category-specific prompts
  const categoryPrompts = {
    tshirt: `Create a photorealistic virtual try-on image showing a person wearing this exact t-shirt/top. The person's face and body features from the reference photo must be preserved. The clothing should fit naturally with realistic draping, folds, and lighting. Show complete upper body.`,
    shirt: `Create a photorealistic image of the person from the reference photo wearing this exact shirt. Maintain their identity. The shirt should be properly fitted with realistic fabric texture. Show upper body in a natural pose.`,
    dress: `Create a photorealistic virtual try-on showing this exact dress worn by the person from the reference photo. Maintain their face and body. The dress should flow naturally with correct proportions. Choose a background that complements the dress style.`,
    jacket: `Create a realistic try-on of the person from the reference photo wearing this exact jacket/coat. Maintain their identity with realistic fabric texture and fit. Choose a complementary background.`,
    pants: `Create a photorealistic full-body try-on showing these exact pants/trousers on the person from the reference photo. Show complete lower body with appropriate footwear. Maintain their appearance with natural pose.`,
    shoes: `Create a realistic try-on showing these exact shoes on the person's feet from the reference photo. Show from a natural perspective angle. Maintain natural foot positioning.`,
    jewellery: `Create a photorealistic image showing this exact jewellery/necklace worn by the person from the reference photo. Focus on the neck/décolletage area. Use proper lighting to highlight the jewellery's details.`,
    accessory: `Create a realistic image showing this exact accessory worn/used by the person from the reference photo. Position it appropriately (handbag carried, watch on wrist, sunglasses on face) with natural positioning.`,
    auto: `Create a photorealistic virtual try-on image showing this product worn/used by the person from the reference photo. Position it naturally on the appropriate body part with realistic lighting and proportions.`
  };

  const basePrompt = categoryPrompts[category] || categoryPrompts.auto;

  const prompt = `${basePrompt}

CRITICAL REQUIREMENTS:
1. PRESERVE the person's face, skin tone, body shape, and overall identity from the reference user photo exactly
2. ACCURATELY reproduce the product's colors, patterns, logos, and distinctive features 
3. Use realistic lighting and shadows that match the environment
4. Result should look like a professional fashion/editorial photograph - NOT a composited image
5. The product title for context: "${productTitle || 'Fashion product'}"
6. Do NOT generate a generic similar product - use the EXACT product shown

Generate ONE high-quality photorealistic fashion try-on image.`;

  // Build parts array — user photo first, then product image
  const parts = [{ text: prompt }];

  // Add user photo (primary reference)
  const primaryPhoto = userPhotos.upperbody || userPhotos.fullbody || userPhotos.face || userPhotos.feet || userPhotos.neck;
  if (primaryPhoto) {
    const userData = extractBase64(primaryPhoto);
    if (userData) {
      parts.push({ inlineData: { mimeType: userData.mimeType, data: userData.data } });
    }
  }

  // Add product image if it's a base64 data URL
  if (productImage && productImage.startsWith('data:')) {
    const productData = extractBase64(productImage);
    if (productData) {
      parts.push({ inlineData: { mimeType: productData.mimeType, data: productData.data } });
    }
  } else if (productImage && productImage.startsWith('http')) {
    // Fetch the product image and convert to base64
    try {
      const fetchedData = await fetchImageAsBase64(productImage);
      if (fetchedData) {
        parts.push({ inlineData: { mimeType: fetchedData.mimeType, data: fetchedData.data } });
      }
    } catch (e) {
      // If fetch fails, just reference in prompt
      parts[0].text += `\n\nProduct image URL (use this as visual reference for the exact product): ${productImage}`;
    }
  }

  // Use gemini-2.0-flash-preview-image-generation for image output
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash-preview-image-generation',
  });

  const result = await model.generateContent({
    contents: [{ role: 'user', parts }],
    generationConfig: {
      responseModalities: ['IMAGE', 'TEXT'],
      temperature: 0.7,
    }
  });

  const response = result.response;

  // Extract generated image from response
  let generatedImageUrl = null;
  let generatedText = '';

  for (const candidate of response.candidates || []) {
    for (const part of candidate.content?.parts || []) {
      if (part.inlineData?.mimeType?.startsWith('image/')) {
        generatedImageUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      }
      if (part.text) {
        generatedText += part.text;
      }
    }
  }

  if (!generatedImageUrl) {
    const finishReason = response.candidates?.[0]?.finishReason;
    throw new Error(
      `No image generated. Finish reason: ${finishReason || 'unknown'}. ` +
      `This may be due to safety filters or an unsupported request. Try a different product image.`
    );
  }

  return {
    success: true,
    imageUrl: generatedImageUrl,
    description: generatedText,
    category,
    productTitle
  };
}

function extractBase64(dataUrl) {
  if (!dataUrl) return null;
  const match = dataUrl.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9\-\.+]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
}

async function fetchImageAsBase64(url) {
  // Use Node.js built-in fetch (Node 18+) or https module
  const https = require('https');
  const http = require('http');

  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, { timeout: 8000 }, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const base64 = buffer.toString('base64');
        const contentType = res.headers['content-type'] || 'image/jpeg';
        const mimeType = contentType.split(';')[0].trim();
        resolve({ mimeType, data: base64 });
      });
      res.on('error', reject);
    }).on('error', reject).on('timeout', () => reject(new Error('Image fetch timeout')));
  });
}
