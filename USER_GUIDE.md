# 📖 TryOn AI — User Guide

> **AI Virtual Try-On Chrome Extension** — Complete user documentation

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Installation](#installation)
3. [Backend Setup (Vercel)](#backend-setup)
4. [Setting Up Your Digital Profile](#setting-up-your-digital-profile)
5. [Using the Extension](#using-the-extension)
6. [Supported Websites](#supported-websites)
7. [Product Categories](#product-categories)
8. [Try-On History](#try-on-history)
9. [Tips for Best Results](#tips-for-best-results)
10. [Troubleshooting](#troubleshooting)
11. [Privacy & Security](#privacy--security)
12. [Technical Architecture](#technical-architecture)

---

## 🎯 Overview

**TryOn AI** is a Chrome Extension that lets you virtually try on clothes, shoes, and accessories from any online shopping website — powered by Google Gemini AI.

**The workflow is simple:**
1. Upload your photos → Create Digital Profile
2. Browse any shopping website (Amazon, Flipkart, Myntra, etc.)
3. Open extension → Scan → Select Product → Try On
4. See yourself wearing the product in seconds!

---

## 🚀 Installation

### Prerequisites
- Google Chrome browser (version 88+)
- A Vercel account (free tier works)
- A Google Gemini API key

### Step 1: Load Extension in Chrome

1. Open Chrome and go to: `chrome://extensions`
2. Enable **"Developer mode"** (toggle in top-right corner)
3. Click **"Load unpacked"**
4. Select the `extension/` folder from this project
5. The TryOn AI extension will appear in your toolbar

> 💡 **Tip:** Pin the extension by clicking the puzzle piece 🧩 icon in your toolbar and pinning TryOn AI for easy access.

### Step 2: Verify Installation

You should see the sparkle ✨ icon in your Chrome toolbar. Click it — the popup should open with the TryOn AI interface.

---

## ☁️ Backend Setup

### Step 1: Get Your Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Click **"Create API Key"**
3. Copy your API key (keep it secret!)

### Step 2: Deploy to Vercel

**Option A: Vercel CLI**
```bash
cd backend/
npm install
npx vercel login
npx vercel deploy
```

**Option B: Vercel Web UI**
1. Push the `backend/` folder to a GitHub repository
2. Go to [vercel.com](https://vercel.com) → New Project → Import your repo
3. Set the **Root Directory** to `backend/`
4. Click Deploy

### Step 3: Add Environment Variable

In your Vercel project dashboard:
1. Go to **Settings → Environment Variables**
2. Add:
   - **Name:** `GEMINI_API_KEY`
   - **Value:** Your Gemini API key
3. Click **Save** and **Redeploy**

### Step 4: Update Extension with Your Backend URL

1. Open `extension/popup.js`
2. Find the line at the top:
   ```javascript
   const BACKEND_URL = 'https://ai-virtual-tryon-backend.vercel.app';
   ```
3. Replace with your actual Vercel deployment URL:
   ```javascript
   const BACKEND_URL = 'https://your-project-name.vercel.app';
   ```
4. Reload the extension in `chrome://extensions` (click the refresh icon)

---

## 👤 Setting Up Your Digital Profile

Your digital profile contains photos that the AI uses to generate try-on results. **Set it up once** and it persists across all your shopping sessions.

### Opening Profile Settings

Click the **👤 profile icon** in the top-right of the extension popup.

### Photo Types and Their Uses

| Photo Type | When It's Used | Tips |
|-----------|---------------|------|
| **Full Body** 🧍 | Dresses, full outfits, pants | Stand straight, arms slightly out, good lighting, plain background |
| **Upper Body** 👕 | T-shirts, shirts, jackets, tops | Waist-up shot, neutral pose, avoid patterns in your clothing |
| **Face** 😊 | Hats, eyewear, face accessories | Front-facing, even lighting, no sunglasses |
| **Feet / Legs** 👟 | Shoes, sneakers, sandals | Both feet visible, standing naturally, good lighting |
| **Neck / Décolletage** 💎 | Necklaces, jewellery | Bare neck, simple top, well-lit |

### Saving Your Profile

1. Enter a **Profile Name** (e.g., "My Shopping Profile")
2. Upload your photos by clicking each photo card
3. Click **💾 Save Profile**
4. A green status dot will appear in the banner, confirming your profile is ready

### Deleting Your Profile

Click **🗑️ Delete Profile** in the profile settings. This permanently removes all stored photos from Chrome's local storage.

---

## 🛍️ Using the Extension

### Step 1: Navigate to a Shopping Website

Visit Amazon, Flipkart, Myntra, AJIO, or any other online store.

### Step 2: Open the Extension

Click the ✨ TryOn AI icon in your Chrome toolbar.

> **Tip:** On product pages, you'll see a floating "✨ Try On with AI" badge on the website — this indicates products have been detected!

### Step 3: Scan for Products

Click the **🔍 Scan** button. The extension will:
1. Analyze the current webpage
2. Extract product information using JSON-LD structured data, OpenGraph metadata, and DOM selectors
3. Display detected products in a grid

### Step 4: Select a Product

Click on any product card. A purple checkmark ✓ badge will appear on the selected product.

### Step 5: Choose Category

The extension auto-detects the product category, but you can manually change it:
- **Auto-Detect** — Let AI figure it out
- **T-Shirt / Top**, **Shirt**, **Dress**, **Jacket / Coat**, **Pants / Trousers**
- **Shoes / Footwear**, **Jewellery / Necklace**, **Accessories**

### Step 6: Click "Try On"

Hit the **✨ Try On** button. You'll see:
1. A loading animation with the AI ring
2. Progress bar and live status messages
3. The generated try-on result image

> **Generation time:** Typically 15–45 seconds.

### Step 7: View and Save Your Result

Once generated:
- The try-on image shows you wearing the product
- Click **⬇️ Save** to download the image
- Click **New Try-On** to try another product

---

## 🌐 Supported Websites

The extension uses a **multi-strategy detection approach**:

| Strategy | How It Works |
|---------|-------------|
| JSON-LD Structured Data | Parses `<script type="application/ld+json">` for Product schema |
| OpenGraph Meta Tags | Reads `og:title`, `og:image` as fallback |
| Site-Specific Selectors | Custom CSS selectors for Amazon, Flipkart, Myntra, AJIO |
| Generic Selectors | `[itemprop="name"]`, `.product-title` for any website |
| Listing Page Detection | Finds product cards on grid/listing pages |

### Tested Websites
- ✅ Amazon (amazon.in, amazon.com)
- ✅ Flipkart (flipkart.com)
- ✅ Myntra (myntra.com)
- ✅ AJIO (ajio.com)
- ✅ Any Shopify store
- ✅ Any site with JSON-LD Product schema

---

## 👗 Product Categories

| Category | Body Part | Required Photos |
|---------|-----------|----------------|
| T-Shirts & Tops | Upper body | Upper Body photo |
| Shirts | Upper body | Upper Body photo |
| Dresses | Full body | Full Body photo |
| Jackets & Coats | Upper body | Upper Body photo |
| Pants & Trousers | Full body | Full Body photo |
| Shoes & Footwear | Feet | Feet/Legs photo |
| Jewellery | Neck | Neck + Face photos |
| Accessories | Varies | Full Body photo |

---

## 🕐 Try-On History

All generated try-ons are automatically saved to your history.

- Click the **🕐 clock icon** in the extension header
- Each history item shows the product and result thumbnails
- Click any item to view the full result
- History stores up to **20** most recent try-ons (stored locally in Chrome)

---

## 💡 Tips for Best Results

### Photo Tips
1. **Good Lighting** — Natural light or soft indoor lighting
2. **Plain Background** — Stand against a white or solid-colored wall
3. **Neutral Pose** — Stand straight, arms slightly away from body
4. **Clear Face** — Front-facing, no sunglasses, even lighting
5. **Simple Clothing** — Wear fitted, single-colored clothing in reference photos

### Try-On Tips
1. **Select the correct category** — Ensures the right AI prompt is used
2. **Use product detail pages** — Better results than listing pages
3. **High-quality product images** — The AI works better with clear product photos

---

## 🔧 Troubleshooting

| Problem | Cause | Solution |
|---------|-------|----------|
| "No products detected" | Non-standard page markup | Navigate to a specific product page; refresh and scan again |
| "Please set up your profile first" | No profile photos | Upload photos in the 👤 profile settings |
| "Please upload [photo type] photo" | Missing required photo | Add the required photo in profile settings |
| "Server error 500" | Backend/API issue | Check Vercel logs; verify GEMINI_API_KEY is set |
| "No image was generated" | Gemini generation failed | Try a different product; change category manually |
| Extension popup blank | JS error | Right-click → Inspect → Console; reload extension |
| Cannot scan page | Restricted page (chrome://) | Navigate to an actual website |

---

## 🔒 Privacy & Security

### Stored Locally (Chrome Storage)
- Profile photos
- Try-on history images
- Profile name and settings

### Sent to Backend (Vercel)
- Profile photo(s) for the selected category (Base64 encoded)
- Product image URL or data
- Product title and category

### Never Stored on Servers
- Profile photos are NOT permanently stored on the backend
- Generated results are returned directly and stored locally
- No user accounts or registration required

### Security Measures
- Gemini API key stored as Vercel environment variable (never in extension)
- All communication uses HTTPS
- No personal data used for AI training

---

## 🏗️ Technical Architecture

```
Chrome Extension
├── popup.html/css/js     → Main UI (profile, product scan, try-on, history)
├── content.js            → Runs on pages, detects products, shows badge
├── background.js         → Service worker, message routing
└── manifest.json         → Permissions: activeTab, storage, scripting

Vercel Backend (Serverless)
├── api/tryon.js          → POST /api/tryon  → calls Gemini AI
└── api/index.js          → GET /            → health check

Google Gemini 2.0 Flash
└── Multimodal generation: user photo + product image → try-on result
```

### Key Files
```
extension/
├── manifest.json         # Chrome Extension config (MV3)
├── popup.html            # Extension popup UI
├── popup.css             # Dark purple theme styling
├── popup.js              # All UI logic, profile, try-on
├── background.js         # Service worker
├── content.js            # Page-level product detection + badge
└── icons/                # 16, 32, 48, 128px icons

backend/
├── package.json          # Dependencies (Gemini SDK, express, cors)
├── vercel.json           # Deployment configuration
└── api/
    ├── index.js          # Health check
    └── tryon.js          # Try-on generation endpoint

website/
└── index.html            # Landing page
```

---

*Built with ❤️ using Google Gemini AI • Chrome Extension MV3 • Vercel Serverless*
