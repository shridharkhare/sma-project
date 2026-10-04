// api/tryon.js - AI Virtual Try-On endpoint
// Vercel Serverless Function

const { GoogleGenerativeAI } = require('@google/generative-ai');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json'
};

module.exports = async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).set(CORS_HEADERS).json({ ok: true });
  }

  // Set CORS headers for all responses
  Object.entries(CORS_HEADERS).forEach(([key, val]) => res.setHeader(key, val));

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { productImage, productTitle, category, userPhotos, profileName } = req.body || {};

  // Validation
  if (!productTitle && !productImage) {
    return res.status(400).json({ error: 'Product information is required' });
  }

  if (!userPhotos || Object.keys(userPhotos).length === 0) {
    return res.status(400).json({ error: 'User profile photos are required' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'AI service not configured' });
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

    return res.status(200).json(result);
  } catch (error) {
    console.error('Try-on generation error:', error);
    return res.status(500).json({
      error: error.message || 'Failed to generate try-on',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

async function generateTryOn({ productImage, productTitle, category, userPhotos, profileName, apiKey }) {
  const genAI = new GoogleGenerativeAI(apiKey);

  // Use Gemini 2.0 Flash for multimodal generation
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

  // Build the prompt based on category
  const categoryPrompts = {
    tshirt: `Create a photorealistic virtual try-on image showing a person wearing the t-shirt/top from the product image. The person's face and body features should be maintained from the reference photo. The clothing should fit naturally and realistically on the person's body with proper draping, folds, and lighting. Show the complete upper body with the garment clearly visible.`,
    shirt: `Generate a photorealistic image of a person wearing the shirt from the product image. Maintain the person's identity from the reference photo. The shirt should be properly fitted with realistic fabric texture, buttons, and collar. Show the upper body in a professional, natural pose.`,
    dress: `Create a photorealistic virtual try-on showing the full dress from the product image worn by the person in the reference photo. Maintain the person's face and body. The dress should flow naturally with correct proportions and the environment should complement the dress style (e.g., floral dress in garden, evening gown in elegant setting).`,
    jacket: `Generate a realistic try-on image of the person wearing the jacket/coat from the product image. Maintain the person's identity. Show proper layering if needed, with realistic fabric texture and fit. The background should complement the jacket style.`,
    pants: `Create a photorealistic full-body try-on showing the pants/trousers from the product image on the person. Show the complete lower body with appropriate footwear. Maintain the person's appearance with natural pose.`,
    shoes: `Generate a realistic close-up try-on showing the shoes from the product image on the person's feet. Show the shoes from a natural perspective (slightly above or at eye level) on the person's feet. Maintain natural foot positioning and appropriate background.`,
    jewellery: `Create a photorealistic image showing the jewellery/necklace from the product image worn by the person. Focus on the neck area, showing the piece of jewellery clearly against the person's skin/outfit. Proper lighting to highlight the jewellery's details and materials.`,
    accessory: `Generate a realistic image showing the accessory from the product image used/worn by the person. Position the accessory appropriately (handbag carried, watch on wrist, sunglasses on face, etc.) with natural positioning and lighting.`,
    auto: `Create a photorealistic virtual try-on image showing the product from the product image worn/used by the person from the reference photo. Position the product naturally on the appropriate body part with realistic lighting, shadows, and proportions.`
  };

  const basePrompt = categoryPrompts[category] || categoryPrompts.auto;

  const prompt = `${basePrompt}

IMPORTANT REQUIREMENTS:
1. The person's face, skin tone, body shape, and identity must be preserved from the reference user photo
2. The product's colors, patterns, logos, and distinctive features must be accurately reproduced
3. Use realistic lighting and shadows that match the scene
4. The overall image should look like a professional fashion photograph
5. Do NOT just paste the product image over the person - generate a naturally integrated, realistic result
6. Product title for reference: "${productTitle || 'Fashion product'}"
${productImage ? '7. Use the product image as the exact product to try on' : ''}

Generate a high-quality, photorealistic fashion try-on image.`;

  // Prepare image parts
  const parts = [{ text: prompt }];

  // Add user photo
  const primaryPhoto = userPhotos.fullbody || userPhotos.upperbody || userPhotos.face || userPhotos.feet || userPhotos.neck;
  if (primaryPhoto) {
    const userImageData = extractBase64(primaryPhoto);
    if (userImageData) {
      parts.push({
        inlineData: {
          mimeType: userImageData.mimeType,
          data: userImageData.data
        }
      });
    }
  }

  // Add product image if available (as URL reference in prompt since direct image passing may need base64)
  if (productImage && isBase64(productImage)) {
    const productImageData = extractBase64(productImage);
    if (productImageData) {
      parts.push({
        inlineData: {
          mimeType: productImageData.mimeType,
          data: productImageData.data
        }
      });
    }
  } else if (productImage) {
    // Reference the product image URL in the prompt
    parts[0].text += `\n\nProduct image URL for reference: ${productImage}`;
  }

  const result = await model.generateContent({
    contents: [{ role: 'user', parts }],
    generationConfig: {
      responseModalities: ['image', 'text'],
      temperature: 0.7,
    }
  });

  const response = result.response;
  
  // Extract generated image
  let generatedImageUrl = null;
  let generatedText = '';

  for (const candidate of response.candidates || []) {
    for (const part of candidate.content?.parts || []) {
      if (part.inlineData?.mimeType?.startsWith('image/')) {
        // Convert base64 image to data URL
        generatedImageUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      }
      if (part.text) {
        generatedText += part.text;
      }
    }
  }

  if (!generatedImageUrl) {
    // Fallback: Try with imagen or use text response
    throw new Error('No image was generated. Please try again or check the product image.');
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
  const match = dataUrl.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
}

function isBase64(str) {
  return str && str.startsWith('data:');
}
