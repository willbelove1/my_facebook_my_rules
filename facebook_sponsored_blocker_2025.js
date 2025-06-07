/**
 * Module: blockSponsored (Cải tiến 2025)
 * Mục đích: Nhận diện bài đăng được tài trợ với độ chính xác cao và khả năng chống thay đổi
 * Cập nhật: Thêm nhiều phương pháp detection mới để đối phó với Facebook thay đổi DOM
 */
FBCMF.registerModule('blockSponsored', async ({ DOMUtils, settings, FilterRegistry }) => {
  if (!FilterRegistry) {
    console.error('[blockSponsored] FilterRegistry không được khởi tạo');
    return;
  }
  if (!settings.blockSponsored) return;

  // Cache để tăng performance
  const sponsoredCache = new WeakMap();
  
  // Patterns được mở rộng với nhiều ngôn ngữ và biến thể
  const SPONSORED_PATTERNS = {
    vietnamese: [
      'đượctàitrợ', 'được tài trợ', 'tài trợ', 'đăng hợp tác trả tiền',
      'partnership', 'hợptáctrảtiền', 'quảngcáo', 'khuyếnmãi',
      'sponsored', 'promotion'
    ],
    english: [
      'sponsored', 'paidpartnership', 'paid partnership', 'advertisement',
      'promoted', 'ad', 'promo', 'commercial', 'boosted', 'marketing'
    ],
    patterns: [
      /sponsored/i, /tài\s*trợ/i, /quảng\s*cáo/i, /partnership/i,
      /promoted?/i, /\bad\b/i, /commercial/i, /marketing/i
    ]
  };

  // Selectors mới dựa trên cấu trúc DOM Facebook 2024-2025
  const SPONSORED_SELECTORS = [
    // Traditional selectors
    '[aria-label*="Sponsored"]',
    '[aria-label*="Được tài trợ"]',
    '[aria-label*="quảng cáo"]',
    '[aria-label*="Why am I seeing this ad"]',
    '[aria-label*="Tại sao tôi thấy quảng cáo này"]',
    
    // New Facebook structure selectors
    '[data-ad-preview="message"]',
    '[data-sponsored="true"]',
    '[data-testid*="sponsored"]',
    '[data-testid*="ad-"]',
    'div[role="article"] span[dir="auto"]:contains("Sponsored")',
    
    // Menu/dropdown indicators
    'div[aria-haspopup="menu"] span:contains("Sponsored")',
    'div[aria-haspopup="menu"] span:contains("Được tài trợ")',
    
    // Story sponsored indicators  
    '[data-pagelet*="FeedUnit"] [aria-label*="story"]',
    
    // New patterns from 2024-2025
    'div[data-ad-comet-preview="message"]',
    'span[dir="auto"] > span:contains("·"):next() + span:contains("Sponsored")',
    
    // Generic ad containers
    '[class*="ad-container"]',
    '[class*="sponsored"]',
    '[id*="hyperfeed_story_id_"]'
  ];

  function normalizeText(text) {
    return text
      .toLowerCase()
      .replace(/[\s\u00A0\u2000-\u200B\u2028\u2029]/g, '')
      .replace(/[^\w]/g, '');
  }

  function checkTextPatterns(text) {
    const normalized = normalizeText(text);
    
    // Check Vietnamese patterns
    for (const pattern of SPONSORED_PATTERNS.vietnamese) {
      if (normalized.includes(normalizeText(pattern))) return true;
    }
    
    // Check English patterns  
    for (const pattern of SPONSORED_PATTERNS.english) {
      if (normalized.includes(normalizeText(pattern))) return true;
    }
    
    // Check regex patterns
    for (const pattern of SPONSORED_PATTERNS.patterns) {
      if (pattern.test(text)) return true;
    }
    
    return false;
  }

  function checkAriaLabels(post) {
    // Check all elements with aria-label
    const ariaElements = post.querySelectorAll('[aria-label]');
    for (const el of ariaElements) {
      const label = el.getAttribute('aria-label');
      if (label && checkTextPatterns(label)) return true;
    }
    
    // Check aria-labelledby references
    const labelledByElements = post.querySelectorAll('[aria-labelledby]');
    for (const el of labelledByElements) {
      const labelIds = el.getAttribute('aria-labelledby').split(' ');
      for (const id of labelIds) {
        const labelEl = document.getElementById(id);
        if (labelEl && checkTextPatterns(labelEl.textContent || labelEl.innerText)) {
          return true;
        }
      }
    }
    
    return false;
  }

  function checkDirectSelectors(post) {
    // Check against all sponsored selectors
    for (const selector of SPONSORED_SELECTORS) {
      try {
        if (post.querySelector(selector)) return true;
      } catch (e) {
        // Ignore invalid selectors
        continue;
      }
    }
    return false;
  }

  function checkTextContent(post) {
    // Priority zones for sponsored indicators
    const priorityZones = [
      // Meta information areas
      post.querySelector('[id][aria-labelledby]'),
      post.querySelector('[data-testid*="story-header"]'),
      post.querySelector('[data-testid*="post-header"]'),
      
      // Author info areas
      post.querySelector('h3, h4'),
      post.querySelector('[role="link"][tabindex="0"]'),
      
      // Menu areas
      post.querySelector('[aria-haspopup="menu"]'),
      post.querySelector('[role="button"][aria-label*="More"]')
    ].filter(Boolean);

    // Check priority zones first
    for (const zone of priorityZones) {
      const text = zone.textContent || zone.innerText || '';
      if (checkTextPatterns(text)) return true;
    }

    // Fallback: check all spans but with more targeted approach
    const spans = Array.from(post.querySelectorAll('span'));
    const relevantSpans = spans.filter(span => {
      const rect = span.getBoundingClientRect();
      // Focus on visible spans in likely header areas
      return rect.height > 0 && rect.width > 0 && rect.top < 200;
    });

    for (const span of relevantSpans) {
      const text = span.textContent || span.innerText || '';
      if (text.length < 50 && checkTextPatterns(text)) { // Sponsored indicators are usually short
        return true;
      }
    }

    return false;
  }

  function checkStructuralIndicators(post) {
    // Check for structural patterns indicating ads
    
    // 1. Posts with specific data attributes
    const dataAttrs = ['data-testid', 'data-ad-preview', 'data-sponsored'];
    for (const attr of dataAttrs) {
      const elements = post.querySelectorAll(`[${attr}]`);
      for (const el of elements) {
        const value = el.getAttribute(attr);
        if (value && /(ad|sponsor|promo)/i.test(value)) return true;
      }
    }
    
    // 2. Posts with "Why am I seeing this" buttons
    const whyButtons = post.querySelectorAll('[role="button"]');
    for (const btn of whyButtons) {
      const label = btn.getAttribute('aria-label') || btn.textContent || '';
      if (/(why.*seeing|tại sao.*thấy)/i.test(label)) return true;
    }
    
    // 3. Posts with promotional link structures
    const links = post.querySelectorAll('a[href*="ads/about"], a[href*="ad_center"]');
    if (links.length > 0) return true;
    
    return false;
  }

  function isSponsored(post) {
    // Use cache if available
    if (sponsoredCache.has(post)) {
      return sponsoredCache.get(post);
    }

    let result = false;

    try {
      // Multi-layer detection approach
      result = 
        checkDirectSelectors(post) ||
        checkAriaLabels(post) ||
        checkTextContent(post) ||
        checkStructuralIndicators(post);

      // Additional heuristic: check if post has unusual promotional characteristics
      if (!result) {
        const hasCallToAction = post.querySelector('a[role="link"]:not([aria-label*="profile"]):not([href*="/user/"])');
        const hasPromoText = /\b(shop now|buy|order|download|sign up|subscribe)\b/i.test(
          post.textContent || ''
        );
        
        if (hasCallToAction && hasPromoText) {
          // This might be an organic promotional post, but worth flagging
          result = checkTextPatterns(post.textContent || '');
        }
      }

    } catch (error) {
      console.warn('[blockSponsored] Error during detection:', error);
      result = false;
    }

    // Cache the result
    sponsoredCache.set(post, result);
    
    if (result && settings.verbosity === 'verbose') {
      console.log('[blockSponsored] Sponsored post detected:', post);
    }

    return result;
  }

  // Register the filter
  FilterRegistry.register('blockSponsored', (post) => {
    return isSponsored(post) ? 'Sponsored Content' : '';
  });

  // Clear cache periodically to prevent memory leaks
  setInterval(() => {
    // Clear cache for removed elements
    for (const [element] of sponsoredCache) {
      if (!document.contains(element)) {
        sponsoredCache.delete(element);
      }
    }
  }, 30000); // Every 30 seconds

  if (settings.verbosity === 'verbose') {
    console.log('[blockSponsored] Enhanced sponsored post blocker initialized');
    console.log('[blockSponsored] Monitoring patterns:', SPONSORED_PATTERNS);
    console.log('[blockSponsored] Using selectors:', SPONSORED_SELECTORS.length);
  }
});