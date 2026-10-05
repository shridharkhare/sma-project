// popup.js - Main popup logic for AI Virtual Try-On Chrome Extension

const BACKEND_URL = 'https://sma-project-backend.vercel.app';

// ========================
// State Management
// ========================
let state = {
  currentView: 'mainView',
  profile: null,
  detectedProducts: [],
  selectedProduct: null,
  isProcessing: false,
  history: []
};

// ========================
// DOM References
// ========================
const $ = id => document.getElementById(id);

// ========================
// Utility Functions
// ========================
function showToast(message, type = 'info', duration = 3000) {
  const container = $('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = '0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

function switchView(viewId) {
  const current = document.querySelector('.view.active');
  const next = $(viewId);
  if (!next || current === next) return;

  current.classList.remove('active');
  current.classList.add('slide-left');
  next.classList.add('active');
  next.classList.remove('slide-left');

  setTimeout(() => current.classList.remove('slide-left'), 300);
  state.currentView = viewId;
}

function formatDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// Resize an image File to maxWidth px before storing as base64
// This keeps storage usage low (Chrome local storage has a ~5MB quota per extension)
function resizeImageFile(file, maxWidth = 800) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (ev) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        try {
          const scale = Math.min(1, maxWidth / img.width);
          const w = Math.round(img.width * scale);
          const h = Math.round(img.height * scale);
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        } catch (err) {
          // Fallback: return original if canvas fails
          resolve(ev.target.result);
        }
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}


// ========================
// Profile Management
// ========================
async function loadProfile() {
  return new Promise(resolve => {
    chrome.storage.local.get(['profile'], result => {
      state.profile = result.profile || null;
      resolve(state.profile);
    });
  });
}

async function saveProfile() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ profile: state.profile }, () => {
      if (chrome.runtime.lastError) {
        console.error('Storage error:', chrome.runtime.lastError);
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}

function updateProfileBanner() {
  const noProfile = $('bannerNoProfile');
  const hasProfile = $('bannerHasProfile');
  const profileThumb = $('profileThumb');
  const profileName = $('profileName');

  if (state.profile && (state.profile.photos?.fullbody || state.profile.photos?.upperbody || state.profile.photos?.face)) {
    noProfile.classList.add('hidden');
    hasProfile.classList.remove('hidden');
    const thumb = state.profile.photos?.fullbody || state.profile.photos?.upperbody || state.profile.photos?.face;
    if (thumb) profileThumb.src = thumb;
    profileName.textContent = state.profile.name || 'My Profile';
  } else {
    noProfile.classList.remove('hidden');
    hasProfile.classList.add('hidden');
  }
}

function loadProfileView() {
  if (!state.profile) return;
  const nameInput = $('profileNameInput');
  if (nameInput) nameInput.value = state.profile.name || '';

  // Load photo previews
  const types = ['fullbody', 'upperbody', 'face', 'feet', 'neck'];
  types.forEach(type => {
    if (state.profile.photos?.[type]) {
      const preview = $(`preview-${type}`);
      const placeholder = document.querySelector(`#upload-${type} .photo-placeholder`);
      if (preview && placeholder) {
        preview.src = state.profile.photos[type];
        preview.classList.remove('hidden');
        placeholder.classList.add('hidden');
      }
    }
  });
}

// ========================
// History Management
// ========================
async function loadHistory() {
  return new Promise(resolve => {
    chrome.storage.local.get(['tryonHistory'], result => {
      state.history = result.tryonHistory || [];
      resolve(state.history);
    });
  });
}

async function addToHistory(entry) {
  state.history.unshift(entry);
  if (state.history.length > 20) state.history.pop(); // Keep last 20
  return new Promise(resolve => {
    chrome.storage.local.set({ tryonHistory: state.history }, resolve);
  });
}

function renderHistory() {
  const list = $('historyList');
  if (!state.history.length) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🕐</div>
        <p>No try-on history yet</p>
      </div>`;
    return;
  }

  list.innerHTML = state.history.map((item, i) => `
    <div class="history-item" data-index="${i}">
      <img class="history-thumb" src="${item.productImage || ''}" alt="Product" onerror="this.style.display='none'" />
      <div class="history-info">
        <div class="history-product">${item.productTitle || 'Unknown Product'}</div>
        <div class="history-date">${formatDate(item.timestamp)}</div>
        <div style="font-size:10px;color:#7c3aed;margin-top:3px;">${item.category || ''}</div>
      </div>
      <img class="history-result-thumb" src="${item.resultImage || ''}" alt="Result" onerror="this.style.display='none'" />
    </div>
  `).join('');

  // Click history item to view result
  list.querySelectorAll('.history-item').forEach(el => {
    el.addEventListener('click', () => {
      const item = state.history[parseInt(el.dataset.index)];
      showHistoryResult(item);
    });
  });
}

function showHistoryResult(item) {
  switchView('mainView');
  showResult(item.resultImage, item.productTitle, item.category, item.productImage);
}

// ========================
// Product Detection
// ========================
async function scanCurrentPage() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, async tabs => {
      if (!tabs[0]) return reject(new Error('No active tab'));
      try {
        const result = await chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          func: detectProductsOnPage
        });
        resolve(result[0]?.result || []);
      } catch (err) {
        reject(err);
      }
    });
  });
}

// This function runs in the context of the webpage
function detectProductsOnPage() {
  const products = [];
  const seen = new Set();

  function addProduct(title, price, imageUrl, category, sourceUrl) {
    const key = `${title}-${imageUrl}`.substring(0, 80);
    if (seen.has(key) || !title) return;
    seen.add(key);
    products.push({
      id: Math.random().toString(36).substr(2, 9),
      title: title.trim().substring(0, 120),
      price: price || '',
      imageUrl: imageUrl || '',
      category: category || 'auto',
      sourceUrl: sourceUrl || window.location.href,
      siteName: window.location.hostname.replace('www.', '')
    });
  }

  // 1. JSON-LD Structured Data
  document.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
    try {
      const data = JSON.parse(script.textContent);
      const items = Array.isArray(data) ? data : [data];
      items.forEach(item => {
        const type = item['@type'] || '';
        if (type === 'Product' || type === 'ItemList') {
          const title = item.name || '';
          const price = item.offers?.price || item.offers?.lowPrice || '';
          const imageUrl = Array.isArray(item.image) ? item.image[0] : (item.image || '');
          if (title) addProduct(title, price ? `₹${price}` : '', imageUrl, '', window.location.href);
        }
        if (item['@graph']) {
          item['@graph'].forEach(g => {
            if (g['@type'] === 'Product') {
              const title = g.name || '';
              const price = g.offers?.price || '';
              const imageUrl = Array.isArray(g.image) ? g.image[0] : (g.image || '');
              if (title) addProduct(title, price ? `₹${price}` : '', imageUrl, '', window.location.href);
            }
          });
        }
      });
    } catch(e) {}
  });

  // 2. OpenGraph / Meta tags
  if (products.length === 0) {
    const ogTitle = document.querySelector('meta[property="og:title"]')?.content || '';
    const ogImage = document.querySelector('meta[property="og:image"]')?.content || '';
    const ogUrl = document.querySelector('meta[property="og:url"]')?.content || '';
    const price = document.querySelector('meta[property="product:price:amount"]')?.content ||
                  document.querySelector('meta[property="og:price:amount"]')?.content || '';
    if (ogTitle) addProduct(ogTitle, price, ogImage, '', ogUrl || window.location.href);
  }

  // 3. Common e-commerce selectors
  const ecomSelectors = [
    // Amazon
    { titleSel: '#productTitle', priceSel: '#priceblock_ourprice, .a-price .a-offscreen, #price_inside_buybox', imgSel: '#landingImage, #imgBlkFront' },
    // Flipkart
    { titleSel: 'h1.yhB1nd, ._35KyD6, span.B_NuCI', priceSel: '._30jeq3, ._16Jk6d', imgSel: 'img._396cs4, img._2r_T1I' },
    // Myntra
    { titleSel: 'h1.pdp-name, .pdp-title', priceSel: '.pdp-price strong', imgSel: '.image-grid-image' },
    // AJIO
    { titleSel: '.prod-name', priceSel: '.prod-sp', imgSel: '.prod-img img' },
    // Generic
    { titleSel: 'h1[itemprop="name"], [itemprop="name"] h1, .product-title, .product-name, #product-title', priceSel: '[itemprop="price"], .price, .product-price', imgSel: '[itemprop="image"], .product-image img, .hero-image img' }
  ];

  ecomSelectors.forEach(({ titleSel, priceSel, imgSel }) => {
    const titleEl = document.querySelector(titleSel);
    const priceEl = document.querySelector(priceSel);
    const imgEl = document.querySelector(imgSel);
    if (titleEl) {
      const imageUrl = imgEl?.src || imgEl?.getAttribute('data-src') || '';
      addProduct(
        titleEl.textContent.trim(),
        priceEl?.textContent.trim() || '',
        imageUrl,
        '',
        window.location.href
      );
    }
  });

  // 4. Product listing pages - find multiple product cards
  const cardSelectors = [
    'a[data-tracking-id]', // Flipkart
    '.s-result-item .a-section', // Amazon
    '.product-card',
    '.product-item',
    '[class*="product-card"]',
    '[class*="ProductCard"]',
    '[class*="product_card"]',
    '.item-card'
  ];

  cardSelectors.forEach(sel => {
    document.querySelectorAll(sel).forEach(card => {
      const titleEl = card.querySelector('h2, h3, [class*="title"], [class*="name"], [class*="Title"]');
      const priceEl = card.querySelector('[class*="price"], [class*="Price"]');
      const imgEl = card.querySelector('img');
      if (titleEl && imgEl) {
        addProduct(
          titleEl.textContent.trim(),
          priceEl?.textContent.trim() || '',
          imgEl.src || imgEl.getAttribute('data-src') || '',
          '',
          card.querySelector('a')?.href || window.location.href
        );
      }
    });
  });

  // 5. Detect category from title/description
  const categoryKeywords = {
    tshirt: ['t-shirt', 'tshirt', 'tee', 't shirt'],
    shirt: ['shirt', 'formal shirt', 'casual shirt'],
    dress: ['dress', 'gown', 'frock', 'midi', 'maxi'],
    jacket: ['jacket', 'coat', 'blazer', 'hoodie', 'sweatshirt'],
    pants: ['pants', 'trousers', 'jeans', 'shorts', 'leggings', 'palazzos'],
    shoes: ['shoes', 'sneakers', 'heels', 'boots', 'sandals', 'footwear', 'loafers'],
    jewellery: ['necklace', 'earrings', 'ring', 'bracelet', 'jewellery', 'jewelry', 'pendant', 'chain'],
    accessory: ['bag', 'watch', 'sunglasses', 'belt', 'scarf', 'hat', 'cap']
  };

  products.forEach(p => {
    if (p.category !== 'auto') return;
    const text = (p.title + ' ' + (p.description || '')).toLowerCase();
    for (const [cat, keywords] of Object.entries(categoryKeywords)) {
      if (keywords.some(kw => text.includes(kw))) {
        p.category = cat;
        break;
      }
    }
  });

  return products.slice(0, 12); // Return max 12 products
}

// ========================
// Render Products
// ========================
function renderProducts(products) {
  const grid = $('productsGrid');
  const emptyState = $('emptyState');

  if (!products.length) {
    grid.classList.add('hidden');
    emptyState.classList.remove('hidden');
    emptyState.innerHTML = `
      <div class="empty-icon">😕</div>
      <p>No products detected on this page.<br>Try navigating to a product page or listing.</p>`;
    return;
  }

  emptyState.classList.add('hidden');
  grid.classList.remove('hidden');

  const categoryEmojis = {
    tshirt: '👕', shirt: '👔', dress: '👗', jacket: '🧥',
    pants: '👖', shoes: '👟', jewellery: '💎', accessory: '👜', auto: '🛍️'
  };

  grid.innerHTML = products.map(p => `
    <div class="product-card" data-id="${p.id}">
      ${p.imageUrl
        ? `<img class="product-card-image" src="${p.imageUrl}" alt="${p.title}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" />`
        : ''}
      <div class="product-card-placeholder" style="${p.imageUrl ? 'display:none' : ''}">
        ${categoryEmojis[p.category] || '🛍️'}
      </div>
      <div class="product-card-info">
        <div class="product-card-title">${p.title}</div>
        ${p.price ? `<div class="product-card-price">${p.price}</div>` : ''}
        <span class="product-card-category">${p.category === 'auto' ? 'Product' : p.category}</span>
      </div>
    </div>
  `).join('');

  grid.querySelectorAll('.product-card').forEach(card => {
    card.addEventListener('click', () => {
      const productId = card.dataset.id;
      const product = products.find(p => p.id === productId);
      selectProduct(product, card);
    });
  });
}

function selectProduct(product, cardEl) {
  // Deselect all
  document.querySelectorAll('.product-card').forEach(c => {
    c.classList.remove('selected');
    c.querySelector('.product-selected-badge')?.remove();
  });

  // Select this
  state.selectedProduct = product;
  cardEl.classList.add('selected');
  const badge = document.createElement('div');
  badge.className = 'product-selected-badge';
  badge.textContent = '✓';
  cardEl.appendChild(badge);

  // Show selected panel
  const panel = $('selectedPanel');
  const selectedProduct = $('selectedProduct');
  const categorySelect = $('categorySelect');

  panel.classList.remove('hidden');

  selectedProduct.innerHTML = `
    ${product.imageUrl ? `<img src="${product.imageUrl}" alt="${product.title}" onerror="this.style.display='none'" />` : ''}
    <div class="selected-product-info">
      <div class="selected-product-title">${product.title}</div>
      ${product.price ? `<div class="selected-product-price">${product.price}</div>` : ''}
      <div style="font-size:10px;color:var(--text-muted);margin-top:3px;">From ${product.siteName || 'this page'}</div>
    </div>
  `;

  // Pre-select detected category
  if (product.category && product.category !== 'auto') {
    categorySelect.value = product.category;
  }

  // Scroll to panel
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ========================
// Try-On Logic
// ========================
async function startTryOn() {
  if (!state.profile) {
    showToast('Please set up your digital profile first!', 'warning');
    switchView('profileView');
    return;
  }

  if (!state.selectedProduct) {
    showToast('Please select a product first', 'warning');
    return;
  }

  const requiredPhotos = getRequiredPhotosForCategory(state.selectedProduct.category);
  const missingPhotos = requiredPhotos.filter(type => !state.profile.photos?.[type]);

  if (missingPhotos.length > 0) {
    const photoNames = { fullbody: 'Full Body', upperbody: 'Upper Body', face: 'Face', feet: 'Feet/Legs', neck: 'Neck' };
    showToast(`Please upload your ${missingPhotos.map(p => photoNames[p]).join(', ')} photo for this category`, 'warning', 5000);
    switchView('profileView');
    return;
  }

  state.isProcessing = true;
  showProcessingState();

  try {
    const response = await callTryOnAPI();
    if (response.success) {
      hideProcessingState();
      showResult(response.imageUrl, state.selectedProduct.title, state.selectedProduct.category, state.selectedProduct.imageUrl);
      await addToHistory({
        productTitle: state.selectedProduct.title,
        productImage: state.selectedProduct.imageUrl,
        category: state.selectedProduct.category,
        resultImage: response.imageUrl,
        timestamp: Date.now()
      });
      showToast('Try-on generated successfully! ✨', 'success');
    } else {
      throw new Error(response.error || 'Generation failed');
    }
  } catch (err) {
    hideProcessingState();
    showToast(`Error: ${err.message}`, 'error', 5000);
    console.error('Try-on error:', err);
  } finally {
    state.isProcessing = false;
  }
}

function getRequiredPhotosForCategory(category) {
  const requirements = {
    tshirt: ['upperbody'],
    shirt: ['upperbody'],
    dress: ['fullbody'],
    jacket: ['upperbody'],
    pants: ['fullbody'],
    shoes: ['feet'],
    jewellery: ['neck', 'face'],
    accessory: ['fullbody'],
    auto: ['upperbody']
  };
  return requirements[category] || ['upperbody'];
}

async function callTryOnAPI() {
  const category = $('categorySelect').value;
  const effectiveCategory = category === 'auto' ? (state.selectedProduct.category || 'tshirt') : category;
  const requiredPhotos = getRequiredPhotosForCategory(effectiveCategory);
  const userPhotos = {};
  requiredPhotos.forEach(type => {
    if (state.profile.photos?.[type]) {
      userPhotos[type] = state.profile.photos[type];
    }
  });

  const payload = {
    productImage: state.selectedProduct.imageUrl,
    productTitle: state.selectedProduct.title,
    category: effectiveCategory,
    userPhotos,
    profileName: state.profile.name
  };

  const response = await fetch(`${BACKEND_URL}/api/tryon`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Server error: ${response.status}`);
  }

  return response.json();
}

// ========================
// UI State Management
// ========================
let progressInterval = null;

function showProcessingState() {
  $('selectedPanel').classList.add('hidden');
  $('resultPanel').classList.add('hidden');
  $('processingPanel').classList.remove('hidden');

  const messages = [
    'Analyzing product details...',
    'Preparing your digital profile...',
    'Running AI virtual try-on...',
    'Generating realistic visualization...',
    'Adding final touches...'
  ];

  let step = 0;
  let progress = 0;
  const progressFill = $('progressFill');
  const processingMessage = $('processingMessage');

  progressInterval = setInterval(() => {
    progress = Math.min(progress + Math.random() * 8 + 2, 92);
    progressFill.style.width = `${progress}%`;
    if (step < messages.length - 1 && progress > (step + 1) * 18) {
      step++;
      processingMessage.textContent = messages[step];
    }
  }, 800);
}

function hideProcessingState() {
  if (progressInterval) {
    clearInterval(progressInterval);
    progressInterval = null;
  }
  $('progressFill').style.width = '100%';
  setTimeout(() => {
    $('processingPanel').classList.add('hidden');
    $('progressFill').style.width = '0%';
  }, 300);
}

function showResult(imageUrl, title, category, productImage) {
  $('resultPanel').classList.remove('hidden');
  $('processingPanel').classList.add('hidden');
  $('selectedPanel').classList.add('hidden');

  const resultImg = $('resultImage');
  resultImg.src = imageUrl;
  resultImg.alt = 'Try-on Result';

  $('resultProductInfo').innerHTML = `
    <strong>${title || 'Product'}</strong>
    ${category && category !== 'auto' ? ` • <span style="color:var(--accent-light)">${category}</span>` : ''}
    <br><span style="font-size:10px;color:var(--text-muted)">Generated by TryOn AI • Powered by Google Gemini</span>
  `;

  // Set download
  $('downloadBtn').onclick = () => downloadImage(imageUrl, title);

  resultImg.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function downloadImage(url, title) {
  const a = document.createElement('a');
  a.href = url;
  a.download = `tryon-${(title || 'result').replace(/[^a-z0-9]/gi, '-').toLowerCase()}.jpg`;
  a.target = '_blank';
  a.click();
  showToast('Downloading result...', 'info');
}

// ========================
// Event Listeners
// ========================
function initEventListeners() {
  // Navigation
  $('openProfileBtn').addEventListener('click', () => {
    loadProfileView();
    switchView('profileView');
  });

  $('openHistoryBtn').addEventListener('click', async () => {
    await loadHistory();
    renderHistory();
    switchView('historyView');
  });

  $('backFromProfile').addEventListener('click', () => switchView('mainView'));
  $('backFromHistory').addEventListener('click', () => switchView('mainView'));

  // Profile setup from banner
  $('setupProfileBtnBanner').addEventListener('click', () => {
    loadProfileView();
    switchView('profileView');
  });

  // Scan button
  $('scanBtn').addEventListener('click', async () => {
    const scanIcon = $('scanIcon');
    const scanText = $('scanText');
    const scanningState = $('scanningState');
    const emptyState = $('emptyState');
    const productsGrid = $('productsGrid');

    scanIcon.textContent = '⏳';
    scanText.textContent = 'Scanning...';
    scanningState.classList.remove('hidden');
    emptyState.classList.add('hidden');
    productsGrid.classList.add('hidden');

    try {
      const products = await scanCurrentPage();
      state.detectedProducts = products;
      renderProducts(products);
      if (products.length > 0) {
        showToast(`Found ${products.length} product${products.length > 1 ? 's' : ''}!`, 'success');
      }
    } catch (err) {
      showToast('Could not scan page. Make sure you\'re on a shopping website.', 'error');
      emptyState.classList.remove('hidden');
      emptyState.innerHTML = `
        <div class="empty-icon">⚠️</div>
        <p>Cannot access this page.<br>Navigate to a shopping website and try again.</p>`;
    } finally {
      scanningState.classList.add('hidden');
      scanIcon.textContent = '🔍';
      scanText.textContent = 'Scan';
    }
  });

  // Clear selection
  $('clearSelectionBtn').addEventListener('click', () => {
    state.selectedProduct = null;
    $('selectedPanel').classList.add('hidden');
    document.querySelectorAll('.product-card').forEach(c => {
      c.classList.remove('selected');
      c.querySelector('.product-selected-badge')?.remove();
    });
  });

  // Try On button
  $('tryOnBtn').addEventListener('click', startTryOn);

  // Cancel button
  $('cancelBtn').addEventListener('click', () => {
    state.isProcessing = false;
    hideProcessingState();
    $('selectedPanel').classList.remove('hidden');
    showToast('Try-on cancelled', 'info');
  });

  // New try-on
  $('newTryOnBtn').addEventListener('click', () => {
    $('resultPanel').classList.add('hidden');
    $('selectedPanel').classList.remove('hidden');
  });

  // Profile photo uploads
  const photoTypes = ['fullbody', 'upperbody', 'face', 'feet', 'neck'];
  photoTypes.forEach(type => {
    const fileInput = $(`file-${type}`);
    if (!fileInput) {
      console.warn(`File input not found for type: ${type}`);
      return;
    }

    fileInput.addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      console.log(`Photo selected for ${type}:`, file.name, file.size);

      // Resize image before storing (to avoid Chrome storage quota errors)
      resizeImageFile(file, 800).then(dataUrl => {
        const preview = $(`preview-${type}`);
        const placeholder = document.querySelector(`#upload-${type} .photo-placeholder`);
        const card = fileInput.closest('.photo-card');

        if (preview) {
          preview.src = dataUrl;
          preview.classList.remove('hidden');
        }
        if (placeholder) placeholder.classList.add('hidden');
        if (card) card.classList.add('has-uploaded');

        if (!state.profile) state.profile = { name: '', photos: {} };
        if (!state.profile.photos) state.profile.photos = {};
        state.profile.photos[type] = dataUrl;
        showToast(`${type === 'fullbody' ? 'Full Body' : type === 'upperbody' ? 'Upper Body' : type.charAt(0).toUpperCase() + type.slice(1)} photo added ✓`, 'success', 1500);
      }).catch(err => {
        console.error('Image resize error:', err);
        showToast('Failed to load image. Try a smaller file.', 'error');
      });
    });
  });

  // Save Profile
  $('saveProfileBtn').addEventListener('click', async () => {
    const name = $('profileNameInput').value.trim() || 'My Profile';
    if (!state.profile) state.profile = { photos: {} };
    if (!state.profile.photos) state.profile.photos = {};
    state.profile.name = name;
    state.profile.updatedAt = Date.now();

    const hasPhotos = Object.keys(state.profile.photos).length > 0;
    if (!hasPhotos) {
      showToast('Please upload at least one photo before saving', 'warning');
      return;
    }

    try {
      await saveProfile();
      updateProfileBanner();
      showToast('Profile saved! ✓', 'success');
      switchView('mainView');
    } catch (err) {
      showToast(`Save failed: ${err.message}. Try smaller images.`, 'error', 5000);
    }
  });

  // Delete Profile
  $('deleteProfileBtn').addEventListener('click', async () => {
    if (!confirm('Delete your profile? This cannot be undone.')) return;
    state.profile = null;
    await new Promise(resolve => chrome.storage.local.remove(['profile'], resolve));
    updateProfileBanner();
    showToast('Profile deleted', 'info');

    // Reset photo previews
    photoTypes.forEach(type => {
      const preview = $(`preview-${type}`);
      const placeholder = document.querySelector(`#upload-${type} .photo-placeholder`);
      if (preview) {
        preview.src = '';
        preview.classList.add('hidden');
      }
      if (placeholder) placeholder.classList.remove('hidden');
      document.querySelector(`[data-type="${type}"]`)?.classList.remove('has-uploaded');
    });

    switchView('mainView');
  });
}

// ========================
// Initialization
// ========================
async function init() {
  await loadProfile();
  await loadHistory();
  updateProfileBanner();
  initEventListeners();

  // Auto-scan if user is on a shopping website
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (!tabs[0]) return;
    const url = tabs[0].url || '';
    const shoppingSites = ['amazon', 'flipkart', 'myntra', 'ajio', 'nykaa', 'meesho', 'ebay', 'shopify', 'etsy', 'zara', 'h&m', 'snapdeal', 'jabong'];
    const isShoppingPage = shoppingSites.some(site => url.includes(site)) || url.includes('/product') || url.includes('/item') || url.includes('/shop');
    if (isShoppingPage) {
      // Auto-trigger scan after a short delay
      setTimeout(() => $('scanBtn').click(), 500);
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
