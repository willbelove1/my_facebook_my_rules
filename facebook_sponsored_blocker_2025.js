/**
 * Module: blockSponsored (Cải tiến 2025 + Auto DOM Analysis)
 * Mục đích: Nhận diện bài đăng được tài trợ + Thu thập data để cải tiến
 * Tính năng mới: Auto-report suspected sponsored posts để phân tích
 */
FBCMF.registerModule('blockSponsored', async ({ DOMUtils, settings, FilterRegistry }) => {
  if (!FilterRegistry) {
    console.error('[blockSponsored] FilterRegistry không được khởi tạo');
    return;
  }
  if (!settings.blockSponsored) return;

  // Cache và logging system
  const sponsoredCache = new WeakMap();
  const suspectedPosts = [];
  const detectionLogs = [];
  
  // Enhanced patterns
  const SPONSORED_PATTERNS = {
    vietnamese: [
      'đượctàitrợ', 'được tài trợ', 'tài trợ', 'đăng hợp tác trả tiền',
      'partnership', 'hợptáctrảtiền', 'quảngcáo', 'khuyếnmãi',
      'sponsored', 'promotion', 'được quảng bá', 'bài viết được tài trợ'
    ],
    english: [
      'sponsored', 'paidpartnership', 'paid partnership', 'advertisement',
      'promoted', 'ad', 'promo', 'commercial', 'boosted', 'marketing',
      'brand content', 'paid promotion'
    ],
    indicators: [
      '·', '•', 'Sponsored', 'Ad', 'Promoted', 'Tài trợ'
    ],
    patterns: [
      /sponsored/i, /tài\s*trợ/i, /quảng\s*cáo/i, /partnership/i,
      /promoted?/i, /\bad\b/i, /commercial/i, /marketing/i,
      /được\s*tài\s*trợ/i, /hợp\s*tác\s*trả\s*tiền/i
    ]
  };

  const SPONSORED_SELECTORS = [
    // Traditional selectors
    '[aria-label*="Sponsored"]', '[aria-label*="Được tài trợ"]',
    '[aria-label*="quảng cáo"]', '[aria-label*="Why am I seeing this ad"]',
    '[aria-label*="Tại sao tôi thấy quảng cáo này"]',
    
    // Modern Facebook structure (2024-2025)
    '[data-ad-preview="message"]', '[data-sponsored="true"]',
    '[data-testid*="sponsored"]', '[data-testid*="ad-"]',
    '[data-ad-comet-preview="message"]',
    
    // Menu/dropdown indicators
    'div[aria-haspopup="menu"] span:has-text("Sponsored")',
    'div[aria-haspopup="menu"] span:has-text("Được tài trợ")',
    
    // Generic ad containers
    '[class*="ad-container"]', '[class*="sponsored"]',
    '[id*="hyperfeed_story_id_"]',
    
    // New 2025 patterns
    'span[dir="auto"]:contains("Sponsored")',
    'span[dir="auto"]:contains("Được tài trợ")',
    'div[data-pagelet*="FeedUnit"] [role="button"][aria-label*="ad"]'
  ];

  // === DETECTION FUNCTIONS ===
  function normalizeText(text) {
    return text
      .toLowerCase()
      .replace(/[\s\u00A0\u2000-\u200B\u2028\u2029]/g, '')
      .replace(/[^\w]/g, '');
  }

  function checkTextPatterns(text) {
    const normalized = normalizeText(text);
    const original = text.toLowerCase();
    
    // Check Vietnamese patterns
    for (const pattern of SPONSORED_PATTERNS.vietnamese) {
      if (normalized.includes(normalizeText(pattern))) return { match: true, pattern, type: 'vietnamese' };
    }
    
    // Check English patterns  
    for (const pattern of SPONSORED_PATTERNS.english) {
      if (normalized.includes(normalizeText(pattern))) return { match: true, pattern, type: 'english' };
    }
    
    // Check regex patterns
    for (const pattern of SPONSORED_PATTERNS.patterns) {
      if (pattern.test(original)) return { match: true, pattern: pattern.source, type: 'regex' };
    }
    
    return { match: false };
  }

  function extractDOMStructure(element) {
    if (!element) return null;
    
    return {
      tagName: element.tagName,
      className: element.className,
      id: element.id,
      attributes: Array.from(element.attributes).reduce((acc, attr) => {
        acc[attr.name] = attr.value;
        return acc;
      }, {}),
      textContent: (element.textContent || '').substring(0, 200), // Limit text length
      children: Array.from(element.children).slice(0, 5).map(child => ({
        tagName: child.tagName,
        className: child.className,
        textContent: (child.textContent || '').substring(0, 100)
      }))
    };
  }

  function isSponsored(post) {
    if (sponsoredCache.has(post)) {
      return sponsoredCache.get(post);
    }

    const detectionResult = {
      isSponsored: false,
      confidence: 0,
      methods: [],
      domStructure: null,
      timestamp: Date.now()
    };

    try {
      // Method 1: Direct selectors
      for (const selector of SPONSORED_SELECTORS) {
        try {
          const found = post.querySelector(selector);
          if (found) {
            detectionResult.isSponsored = true;
            detectionResult.confidence = 0.9;
            detectionResult.methods.push({ type: 'selector', value: selector });
            break;
          }
        } catch (e) { continue; }
      }

      // Method 2: Aria labels
      if (!detectionResult.isSponsored) {
        const ariaElements = post.querySelectorAll('[aria-label]');
        for (const el of ariaElements) {
          const label = el.getAttribute('aria-label');
          const result = checkTextPatterns(label || '');
          if (result.match) {
            detectionResult.isSponsored = true;
            detectionResult.confidence = 0.85;
            detectionResult.methods.push({ type: 'aria-label', value: label, pattern: result.pattern });
            break;
          }
        }
      }

      // Method 3: Text content analysis
      if (!detectionResult.isSponsored) {
        // Priority zones
        const priorityZones = [
          post.querySelector('[id][aria-labelledby]'),
          post.querySelector('[data-testid*="story-header"]'),
          post.querySelector('h3, h4'),
          post.querySelector('[role="button"][aria-label*="More"]')
        ].filter(Boolean);

        for (const zone of priorityZones) {
          const result = checkTextPatterns(zone.textContent || '');
          if (result.match) {
            detectionResult.isSponsored = true;
            detectionResult.confidence = 0.75;
            detectionResult.methods.push({ type: 'text-priority', pattern: result.pattern });
            break;
          }
        }

        // Fallback: all spans
        if (!detectionResult.isSponsored) {
          const spans = Array.from(post.querySelectorAll('span')).slice(0, 20); // Limit for performance
          for (const span of spans) {
            const text = span.textContent || '';
            if (text.length < 50) { // Focus on short indicator texts
              const result = checkTextPatterns(text);
              if (result.match) {
                detectionResult.isSponsored = true;
                detectionResult.confidence = 0.6;
                detectionResult.methods.push({ type: 'text-span', pattern: result.pattern });
                break;
              }
            }
          }
        }
      }

      // Extract DOM structure for analysis
      detectionResult.domStructure = extractDOMStructure(post);

    } catch (error) {
      console.warn('[blockSponsored] Detection error:', error);
      detectionResult.error = error.message;
    }

    // Cache result
    sponsoredCache.set(post, detectionResult.isSponsored);
    
    // Log detection result
    detectionLogs.push(detectionResult);

    return detectionResult.isSponsored;
  }

  // === SUSPICIOUS POST DETECTION ===
  function detectSuspiciousPatterns(post) {
    const suspiciousIndicators = [];
    
    // 1. Check for promotional language
    const promoWords = ['shop now', 'buy', 'order', 'download', 'sign up', 'subscribe', 'learn more', 'get started', 'claim', 'limited time'];
    const text = (post.textContent || '').toLowerCase();
    const hasPromoWords = promoWords.some(word => text.includes(word));
    if (hasPromoWords) suspiciousIndicators.push('promotional-language');

    // 2. Check for external links with UTM parameters
    const links = post.querySelectorAll('a[href*="utm_"], a[href*="fbclid"], a[href*="gclid"]');
    if (links.length > 0) suspiciousIndicators.push('tracking-links');

    // 3. Check for brand/business indicators
    const hasBusinessLink = post.querySelector('a[href*="/business/"], a[href*="/shop/"], a[href*="/store/"]');
    if (hasBusinessLink) suspiciousIndicators.push('business-link');

    // 4. Check for "Why am I seeing this" type buttons
    const buttons = post.querySelectorAll('[role="button"]');
    for (const btn of buttons) {
      const label = (btn.getAttribute('aria-label') || '').toLowerCase();
      if (/(why.*seeing|tại sao.*thấy|hide.*ad|ẩn.*quảng cáo)/i.test(label)) {
        suspiciousIndicators.push('why-seeing-button');
        break;
      }
    }

    return suspiciousIndicators;
  }

  // === AUTO-REPORTING SYSTEM ===
  
  // Track posts that user manually hides to learn from Facebook's response
  const manuallyHiddenPosts = new WeakMap();
  const confirmedAds = [];

  function setupHideButtonListeners() {
    // Monitor clicks on hide/close buttons (X button)
    document.addEventListener('click', function(event) {
      const target = event.target;
      
      // Find potential hide buttons
      const hideButton = target.closest('[role="button"][aria-label*="Hide"], [role="button"][aria-label*="Ẩn"], [aria-label*="More options"], [aria-label*="Tùy chọn"]');
      
      if (hideButton) {
        // Find the parent post
        const post = hideButton.closest('[role="article"], [data-pagelet*="FeedUnit"], div[data-testid*="story"]');
        
        if (post && !manuallyHiddenPosts.has(post)) {
          manuallyHiddenPosts.set(post, {
            timestamp: Date.now(),
            domStructure: extractDOMStructure(post),
            hideButtonInfo: {
              ariaLabel: hideButton.getAttribute('aria-label'),
              className: hideButton.className,
              innerHTML: hideButton.innerHTML.substring(0, 200)
            }
          });
          
          // Watch for Facebook's response after hiding
          setTimeout(() => checkForAdConfirmation(post), 1000);
          setTimeout(() => checkForAdConfirmation(post), 3000);
          setTimeout(() => checkForAdConfirmation(post), 5000);
        }
      }
    }, true);
  }

  function checkForAdConfirmation(post) {
    // Look for Facebook's "Đã ẩn quảng cáo" or "Ad hidden" messages
    const adHiddenMessages = [
      'đã ẩn quảng cáo',
      'ad hidden',
      'advertisement hidden', 
      'sponsored post hidden',
      'quảng cáo đã được ẩn',
      'bạn sẽ không thấy quảng cáo này nữa',
      "you won't see this ad again"
    ];

    // Check for confirmation messages in various locations
    const possibleMessageContainers = [
      // Toast/notification messages
      document.querySelectorAll('[role="alert"], [role="status"], .notificationContent'),
      // Overlay messages
      document.querySelectorAll('[data-testid*="toast"], [data-testid*="notification"]'),
      // Inline messages (where the post was)
      post ? [post] : [],
      // General message containers
      document.querySelectorAll('div[style*="position: fixed"], div[style*="z-index"]')
    ].flat();

    for (const container of possibleMessageContainers) {
      if (!container) continue;
      
      const text = (container.textContent || '').toLowerCase();
      const isAdConfirmation = adHiddenMessages.some(msg => text.includes(msg));
      
      if (isAdConfirmation) {
        // BINGO! Facebook confirmed this was an ad
        const postData = manuallyHiddenPosts.get(post);
        if (postData) {
          const confirmedAd = {
            ...postData,
            confirmedAt: Date.now(),
            confirmationText: container.textContent.substring(0, 200),
            confirmationType: 'facebook-hide-confirmation',
            wasDetectedByScript: sponsoredCache.get(post) || false
          };

          confirmedAds.push(confirmedAd);
          
          console.log('[blockSponsored] 🎯 CONFIRMED AD by Facebook:', confirmedAd);
          
          // If our script didn't catch this, it's a missed detection
          if (!confirmedAd.wasDetectedByScript) {
            console.warn('[blockSponsored] ❌ MISSED DETECTION - Facebook confirmed ad that we missed!');
            learnFromMissedAd(confirmedAd);
          } else {
            console.log('[blockSponsored] ✅ CORRECT DETECTION - We caught this ad correctly!');
          }
          
          return true;
        }
      }
    }
    
    return false;
  }

  function learnFromMissedAd(confirmedAd) {
    // Extract patterns from ads we missed
    const domStructure = confirmedAd.domStructure;
    if (!domStructure) return;

    // Look for new patterns we should add
    const newPatterns = {
      dataTestIds: domStructure.attributes['data-testid'],
      className: domStructure.className,
      ariaLabels: confirmedAd.hideButtonInfo?.ariaLabel,
      textPatterns: extractPotentialPatterns(domStructure.textContent)
    };

    suspectedPosts.push({
      ...confirmedAd,
      type: 'confirmed-missed-ad',
      suggestedPatterns: newPatterns,
      priority: 'HIGH' // This should be fixed ASAP
    });

    if (settings.verbosity === 'verbose') {
      console.error('[blockSponsored] 🚨 LEARNING FROM MISSED AD:', newPatterns);
    }
  }

  function extractPotentialPatterns(text) {
    if (!text) return [];
    
    const words = text.toLowerCase().split(/\s+/);
    const potentialSponsoredWords = words.filter(word => 
      word.length > 3 && 
      /(sponsor|tài|trợ|quảng|cáo|ad|promo|shop|buy|sale)/i.test(word)
    );
    
    return potentialSponsoredWords.slice(0, 5); // Limit to prevent noise
  }

  function reportSuspiciousPost(post) {
    const suspiciousIndicators = detectSuspiciousPatterns(post);
    
    if (suspiciousIndicators.length >= 2) { // Threshold for suspicion
      const report = {
        timestamp: new Date().toISOString(),
        url: window.location.href,
        suspiciousIndicators,
        domStructure: extractDOMStructure(post),
        textSample: (post.textContent || '').substring(0, 300),
        attributes: {
          hasImages: post.querySelectorAll('img').length,
          hasVideo: post.querySelectorAll('video').length,
          hasLinks: post.querySelectorAll('a').length,
          dataTestIds: Array.from(post.querySelectorAll('[data-testid]')).map(el => el.getAttribute('data-testid')),
          ariaLabels: Array.from(post.querySelectorAll('[aria-label]')).map(el => el.getAttribute('aria-label')).slice(0, 5)
        }
      };

      suspectedPosts.push(report);
      
      if (settings.verbosity === 'verbose') {
        console.warn('[blockSponsored] SUSPECTED SPONSORED POST (not caught):', report);
      }
    }
  }

  // === MAIN FILTER REGISTRATION ===
  FilterRegistry.register('blockSponsored', (post) => {
    const isBlocked = isSponsored(post);
    
    if (!isBlocked) {
      // Check if this might be a sponsored post we missed
      reportSuspiciousPost(post);
    }
    
    return isBlocked ? 'Sponsored Content' : '';
  });

  // === LOGGING AND DEBUGGING FUNCTIONS ===
  function exportDetectionLogs() {
    const logs = {
      timestamp: new Date().toISOString(),
      detectedPosts: detectionLogs.filter(log => log.isSponsored),
      suspectedPosts: suspectedPosts,
      confirmedAds: confirmedAds,
      missedAds: confirmedAds.filter(ad => !ad.wasDetectedByScript),
      statistics: {
        totalProcessed: detectionLogs.length,
        totalDetected: detectionLogs.filter(log => log.isSponsored).length,
        totalSuspected: suspectedPosts.length,
        totalConfirmed: confirmedAds.length,
        totalMissed: confirmedAds.filter(ad => !ad.wasDetectedByScript).length,
        detectionRate: (detectionLogs.filter(log => log.isSponsored).length / detectionLogs.length * 100).toFixed(2) + '%',
        accuracy: confirmedAds.length > 0 ? 
          (confirmedAds.filter(ad => ad.wasDetectedByScript).length / confirmedAds.length * 100).toFixed(2) + '%' : 'N/A'
      }
    };
    
    console.log('[blockSponsored] DETECTION LOGS:', JSON.stringify(logs, null, 2));
    
    // Save to localStorage for manual inspection (if available)
    try {
      localStorage.setItem('fbcmf_sponsored_logs', JSON.stringify(logs));
    } catch (e) {
      console.warn('[blockSponsored] Could not save logs to localStorage');
    }
    
    return logs;
  }

  // Export functions to global scope for debugging
  window.FBCMF_SponsoredDebug = {
    exportLogs: exportDetectionLogs,
    getSuspectedPosts: () => suspectedPosts,
    getDetectionLogs: () => detectionLogs,
    getConfirmedAds: () => confirmedAds,
    getMissedAds: () => confirmedAds.filter(ad => !ad.wasDetectedByScript),
    getCorrectDetections: () => confirmedAds.filter(ad => ad.wasDetectedByScript),
    getAccuracyStats: () => {
      const total = confirmedAds.length;
      const correct = confirmedAds.filter(ad => ad.wasDetectedByScript).length;
      return {
        total: total,
        correct: correct,
        missed: total - correct,
        accuracy: total > 0 ? (correct / total * 100).toFixed(2) + '%' : 'N/A'
      };
    },
    clearLogs: () => {
      detectionLogs.length = 0;
      suspectedPosts.length = 0;
      confirmedAds.length = 0;
      console.log('[blockSponsored] All logs cleared');
    }
  };

  // Auto-export logs every 5 minutes
  setInterval(() => {
    if (detectionLogs.length > 0) {
      exportDetectionLogs();
    }
  }, 5 * 60 * 1000);

  // Memory management
  setInterval(() => {
    for (const [element] of sponsoredCache) {
      if (!document.contains(element)) {
        sponsoredCache.delete(element);
      }
    }
    
    // Keep only recent logs (last 100 entries)
    if (detectionLogs.length > 100) {
      detectionLogs.splice(0, detectionLogs.length - 100);
    }
    if (suspectedPosts.length > 50) {
      suspectedPosts.splice(0, suspectedPosts.length - 50);
    }
  }, 30000);

  // Initialize hide button monitoring
  setupHideButtonListeners();

  if (settings.verbosity === 'verbose') {
    console.log('[blockSponsored] Enhanced blocker with auto-reporting initialized');
    console.log('[blockSponsored] Debug functions available at window.FBCMF_SponsoredDebug');
    console.log('[blockSponsored] Use FBCMF_SponsoredDebug.exportLogs() to see detection data');
    console.log('[blockSponsored] Hide button monitoring active - will learn from Facebook confirmations');
  }
});
