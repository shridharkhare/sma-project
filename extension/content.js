// content.js - Runs on every webpage to detect products

(function() {
  'use strict';

  // Notify background that page has loaded (for proactive detection)
  const hostname = window.location.hostname;
  
  // Listen for messages from popup / background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'PING') {
      sendResponse({ alive: true, url: window.location.href, title: document.title });
    }
    if (message.type === 'GET_PAGE_INFO') {
      sendResponse({
        url: window.location.href,
        title: document.title,
        hostname,
        hasProducts: detectHasProducts()
      });
    }
    return true;
  });

  function detectHasProducts() {
    // Quick check if page likely has products
    const indicators = [
      'script[type="application/ld+json"]',
      '[itemprop="name"]',
      '[class*="product"]',
      '#productTitle',
      '.pdp-name',
      'h1.yhB1nd'
    ];
    return indicators.some(sel => document.querySelector(sel) !== null);
  }

  // Add subtle floating badge on product pages to indicate extension is active
  function addProductPageIndicator() {
    if (!detectHasProducts()) return;
    if (document.getElementById('tryon-badge')) return;

    const badge = document.createElement('div');
    badge.id = 'tryon-badge';
    badge.innerHTML = `
      <div style="
        position: fixed;
        bottom: 24px;
        right: 24px;
        background: linear-gradient(135deg, #7c3aed, #ec4899);
        color: white;
        padding: 10px 16px;
        border-radius: 24px;
        font-size: 13px;
        font-weight: 600;
        font-family: system-ui, sans-serif;
        box-shadow: 0 4px 20px rgba(124, 58, 237, 0.5);
        cursor: pointer;
        z-index: 2147483647;
        display: flex;
        align-items: center;
        gap: 8px;
        transition: transform 0.2s ease, opacity 0.2s ease;
        animation: slideIn 0.5s cubic-bezier(0.4, 0, 0.2, 1);
        user-select: none;
      " id="tryon-inner-badge">
        ✨ Try On with AI
        <span style="font-size:11px;opacity:0.8;">(Click Extension)</span>
      </div>
      <style>
        @keyframes slideIn {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        #tryon-inner-badge:hover {
          transform: translateY(-2px) !important;
          box-shadow: 0 8px 28px rgba(124, 58, 237, 0.7) !important;
        }
      </style>
    `;

    document.body.appendChild(badge);

    // Auto-hide after 5 seconds
    setTimeout(() => {
      const inner = document.getElementById('tryon-inner-badge');
      if (inner) {
        inner.style.opacity = '0';
        inner.style.transform = 'translateY(20px)';
        setTimeout(() => badge.remove(), 300);
      }
    }, 5000);
  }

  // Run indicator on product pages
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addProductPageIndicator);
  } else {
    addProductPageIndicator();
  }
})();
