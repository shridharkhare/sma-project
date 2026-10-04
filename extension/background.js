// background.js - Service Worker for AI Virtual Try-On Chrome Extension

// Handle extension install
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('AI Virtual Try-On Extension installed!');
    // Open onboarding page
    chrome.tabs.create({ url: 'https://ai-virtual-tryon-backend.vercel.app' });
  }
});

// Handle messages from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PRODUCTS_DETECTED') {
    // Store detected products temporarily
    chrome.storage.session.set({ 
      lastDetectedProducts: message.products,
      lastDetectedUrl: message.url 
    });
    sendResponse({ success: true });
  }
  
  if (message.type === 'GET_CACHED_PRODUCTS') {
    chrome.storage.session.get(['lastDetectedProducts', 'lastDetectedUrl'], (result) => {
      sendResponse(result);
    });
    return true; // Keep channel open for async response
  }
  
  return true;
});

// Handle side panel
chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: false }).catch(() => {});
