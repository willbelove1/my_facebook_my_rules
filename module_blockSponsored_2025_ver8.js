/**
 * Module: blockSponsored (Fixed Version 2025)
 * Mục đích: Nhận diện bài đăng được tài trợ với độ chính xác cao - CHỈ TRÊN TRANG CHỦ
 * Fixed: Syntax errors và performance issues, chỉ hoạt động trên news feed
 * Cập nhật: Không hoạt động trên trang cá nhân để tránh ẩn bài viết thường
 */
FBCMF.registerModule('blockSponsored', async ({ DOMUtils, settings, FilterRegistry }) => {
  if (!FilterRegistry) {
    console.error('[blockSponsored] FilterRegistry không được khởi tạo');
    return;
  }
  if (!settings.blockSponsored) return;

  // Kiểm tra xem có phải trang chủ Facebook không (tương tự FeedExpander)
  function isHomePage() {
    const url = new URL(window.location.href);
    
    if (url.hostname !== 'www.facebook.com') return false;
    
    const path = url.pathname;
    
    // CHỈ hoạt động trên trang chủ, KHÔNG hoạt động trên trang cá nhân
    if (path.length > 1 && path !== '/') {
      // Bất kỳ path nào khác ngoài '/' đều không được phép
      return false;
    }
    
    // Loại bỏ các tham số đặc biệt cho profile
    if (url.searchParams.has('id') || 
        url.searchParams.has('sk') && url.searchParams.get('sk') !== 'h_chr') {
      return false;
    }
    
    // Chỉ chấp nhận:
    // - facebook.com/
    // - facebook.com/?sk=h_chr (news feed)  
    // - facebook.com (không có gì)
    return true;
  }

  // Biến để theo dõi trạng thái
  let isActive = false;
  let urlObserver = null;

  // Cache và logging system
  const sponsoredCache = new WeakMap();
  const suspectedPosts = [];
  const detectionLogs = [];
  const confirmedAds = [];
  const manuallyHiddenPosts = new WeakMap();
  
  // Enhanced patterns - simplified and tested
  const SPONSORED_PATTERNS = {
    vietnamese: [
      'đượctàitrợ', 'được tài trợ', 'tài trợ', 'quảng cáo', 'sponsored'
    ],
    english: [
      'sponsored', 'paidpartnership', 'paid partnership', 'advertisement',
      'promoted', 'ad', 'commercial', 'marketing'
    ],
    regex: [
      /sponsored/i, 
      /tài\s*trợ/i, 
      /quảng\s*cáo/i, 
      /được\s*tài\s*trợ/i,
      /paid\s*partnership/i
    ]
  };

  // Reliable selectors that actually work
  const SPONSORED_SELECTORS = [
    '[aria-label*="Sponsored"]', 
    '[aria-label*="Được tài trợ"]',
    '[aria-label*="quảng cáo"]', 
    '[aria-label*="Why am I seeing this ad"]',
    '[aria-label*="Tại sao tôi thấy quảng cáo này"]',
    '[data-testid*="sponsored"]',
    'span:contains("Sponsored")',
    'span:contains("Được tài trợ")'
  ];

  function log(message, level = 'verbose') {
    if (settings?.verbosity === 'verbose' || level === 'error') {
      console[level === 'error' ? 'error' : 'log'](`[blockSponsored] ${message}`);
    }
  }

  // === CORE DETECTION FUNCTIONS ===
  function normalizeText(text) {
    if (!text) return '';
    return text
      .toLowerCase()
      .replace(/[\s\u00A0\u2000-\u200B\u2028\u2029]/g, '')
      .replace(/[^\w]/g, '');
  }

  function checkTextPatterns(text) {
    if (!text) return false;
    
    const normalized = normalizeText(text);
    const original = text.toLowerCase();
    
    // Check Vietnamese patterns
    for (const pattern of SPONSORED_PATTERNS.vietnamese) {
      if (normalized.includes(normalizeText(pattern))) {
        return true;
      }
    }
    
    // Check English patterns  
    for (const pattern of SPONSORED_PATTERNS.english) {
      if (normalized.includes(normalizeText(pattern))) {
        return true;
      }
    }
    
    // Check regex patterns
    for (const pattern of SPONSORED_PATTERNS.regex) {
      if (pattern.test(original)) {
        return true;
      }
    }
    
    return false;
  }

  function isSponsored(post) {
    // KIỂM TRA QUAN TRỌNG: Chỉ hoạt động khi active và ở trang chủ
    if (!isActive || !isHomePage()) {
      return false;
    }

    if (!post) return false;
    
    // Use cache if available
    if (sponsoredCache.has(post)) {
      return sponsoredCache.get(post);
    }

    let result = false;

    try {
      // Method 1: Check direct selectors (most reliable)
      for (const selector of SPONSORED_SELECTORS) {
        try {
          // Handle :contains() pseudo-selector manually
          if (selector.includes(':contains(')) {
            const parts = selector.match(/(.+):contains\("(.+)"\)/);
            if (parts) {
              const baseSelector = parts[1];
              const searchText = parts[2];
              const elements = post.querySelectorAll(baseSelector);
              for (const el of elements) {
                if ((el.textContent || '').includes(searchText)) {
                  result = true;
                  break;
                }
              }
            }
          } else {
            if (post.querySelector(selector)) {
              result = true;
              break;
            }
          }
        } catch (e) {
          // Skip invalid selectors
          continue;
        }
      }

      // Method 2: Check aria-labels
      if (!result) {
        const ariaElements = post.querySelectorAll('[aria-label]');
        for (const el of ariaElements) {
          const label = el.getAttribute('aria-label');
          if (checkTextPatterns(label)) {
            result = true;
            break;
          }
        }
      }

      // Method 3: Text content analysis (focused on header areas)
      if (!result) {
        // Check specific areas likely to contain sponsored indicators
        const headerSelectors = [
          'h3', 'h4', 'h5',
          '[role="link"][tabindex="0"]',
          '[data-testid*="story-header"]',
          '[data-testid*="post-header"]'
        ];

        for (const selector of headerSelectors) {
          const headers = post.querySelectorAll(selector);
          for (const header of headers) {
            if (checkTextPatterns(header.textContent)) {
              result = true;
              break;
            }
          }
          if (result) break;
        }
      }

      // Method 4: Check spans near the top of the post (fallback)
      if (!result) {
        const spans = post.querySelectorAll('span');
        let checkedCount = 0;
        
        for (const span of spans) {
          // Only check first 10 spans for performance
          if (checkedCount >= 10) break;
          
          const text = span.textContent || '';
          // Focus on short text that might be sponsored indicators
          if (text.length > 0 && text.length < 30) {
            if (checkTextPatterns(text)) {
              result = true;
              break;
            }
          }
          checkedCount++;
        }
      }

    } catch (error) {
      console.warn('[blockSponsored] Detection error:', error);
      result = false;
    }

    // Cache the result
    sponsoredCache.set(post, result);
    
    // Log for debugging
    if (result && settings.verbosity === 'verbose') {
      log('Sponsored post detected');
    }

    return result;
  }

  // === HIDE BUTTON MONITORING ===
  function setupHideButtonListeners() {
    // Chỉ setup khi active
    if (!isActive) return;

    document.addEventListener('click', function(event) {
      // Kiểm tra lại trang hiện tại
      if (!isHomePage()) return;

      try {
        const target = event.target;
        
        // Look for hide/menu buttons
        const button = target.closest('[role="button"]');
        if (!button) return;
        
        const ariaLabel = button.getAttribute('aria-label') || '';
        const isHideButton = /hide|ẩn|menu|more|tùy chọn/i.test(ariaLabel);
        
        if (isHideButton) {
          // Find parent post
          const post = button.closest('[role="article"], div[data-pagelet*="FeedUnit"]');
          if (post && !manuallyHiddenPosts.has(post)) {
            manuallyHiddenPosts.set(post, {
              timestamp: Date.now(),
              wasDetected: sponsoredCache.get(post) || false
            });
            
            // Check for ad confirmation after a delay
            setTimeout(() => checkForAdConfirmation(post), 2000);
          }
        }
      } catch (error) {
        // Silently handle errors to avoid breaking the page
      }
    }, true);
  }

  function checkForAdConfirmation(post) {
    try {
      const confirmationMessages = [
        'đã ẩn quảng cáo',
        'ad hidden',
        'advertisement hidden',
        'quảng cáo đã được ẩn',
        'bạn sẽ không thấy quảng cáo này nữa',
        "you won't see this ad again"
      ];

      // Check for confirmation in common message areas
      const messageContainers = document.querySelectorAll(
        '[role="alert"], [role="status"], [data-testid*="toast"], [data-testid*="notification"]'
      );

      for (const container of messageContainers) {
        const text = (container.textContent || '').toLowerCase();
        const isConfirmation = confirmationMessages.some(msg => text.includes(msg));
        
        if (isConfirmation) {
          const postData = manuallyHiddenPosts.get(post);
          if (postData) {
            confirmedAds.push({
              ...postData,
              confirmedAt: Date.now(),
              confirmationText: text.substring(0, 100)
            });
            
            if (!postData.wasDetected) {
              console.warn('[blockSponsored] Missed sponsored post detected by Facebook!');
            }
            
            return true;
          }
        }
      }
    } catch (error) {
      // Silently handle errors
    }
    
    return false;
  }

  // === URL MONITORING ===
  function setupUrlObserver() {
    // Theo dõi thay đổi URL bằng popstate
    window.addEventListener('popstate', handleUrlChange);
    
    // Theo dõi thay đổi URL bằng MutationObserver trên document
    urlObserver = new MutationObserver(() => {
      handleUrlChange();
    });
    
    // Observe changes to the entire document to catch navigation
    urlObserver.observe(document, { 
      childList: true, 
      subtree: true,
      attributes: true,
      attributeFilter: ['href']
    });
    
    log('Đã thiết lập URL observer');
  }

  function handleUrlChange() {
    const wasActive = isActive;
    const shouldBeActive = isHomePage() && settings?.blockSponsored;
    
    if (shouldBeActive && !wasActive) {
      log('Chuyển đến trang chủ - Kích hoạt blockSponsored');
      activateModule();
    } else if (!shouldBeActive && wasActive) {
      log('Rời khỏi trang chủ - Tạm dừng blockSponsored');
      pauseModule();
    }
  }

  function activateModule() {
    if (isActive) return;
    
    isActive = true;
    setupHideButtonListeners();
    log('✅ Đã kích hoạt blockSponsored');
  }

  function pauseModule() {
    if (!isActive) return;
    
    isActive = false;
    log('⏸️ Đã tạm dừng blockSponsored');
  }

  // === MAIN FILTER REGISTRATION ===
  FilterRegistry.register('blockSponsored', (post) => {
    return isSponsored(post) ? 'Sponsored Content' : '';
  });

  // === DEBUG FUNCTIONS ===
  function getStats() {
    const totalConfirmed = confirmedAds.length;
    const correctDetections = confirmedAds.filter(ad => ad.wasDetected).length;
    
    return {
      totalConfirmed: totalConfirmed,
      correctDetections: correctDetections,
      missedDetections: totalConfirmed - correctDetections,
      accuracy: totalConfirmed > 0 ? ((correctDetections / totalConfirmed) * 100).toFixed(2) + '%' : 'N/A',
      isActive: isActive,
      currentPage: window.location.pathname
    };
  }

  function exportLogs() {
    const stats = getStats();
    const logs = {
      timestamp: new Date().toISOString(),
      statistics: stats,
      confirmedAds: confirmedAds,
      missedAds: confirmedAds.filter(ad => !ad.wasDetected)
    };
    
    log('LOGS: ' + JSON.stringify(logs, null, 2));
    return logs;
  }

  // === INITIALIZATION ===
  function init() {
    if (!document.body) {
      log('DOM chưa sẵn sàng, thử lại sau 1s');
      setTimeout(init, 1000);
      return;
    }

    if (!settings?.blockSponsored) {
      log('Tính năng block sponsored bị tắt, không khởi tạo');
      return;
    }

    // Thiết lập URL observer ngay từ đầu
    setupUrlObserver();

    // Kiểm tra và kích hoạt nếu đang ở trang chủ
    if (isHomePage()) {
      activateModule();
    } else {
      log('Không phải trang chủ Facebook, blockSponsored ở chế độ chờ');
    }

    log('🚀 Đã khởi tạo blockSponsored với URL monitoring');
  }

  function destroy() {
    pauseModule();
    
    if (urlObserver) {
      urlObserver.disconnect();
      urlObserver = null;
    }
    
    window.removeEventListener('popstate', handleUrlChange);
    
    // Clear cache
    sponsoredCache.clear && sponsoredCache.clear();
    confirmedAds.length = 0;
    
    isActive = false;
    log('🗑️ Đã hủy blockSponsored hoàn toàn');
  }

  // Export debug functions to global scope
  window.FBCMF_SponsoredDebug = {
    getStats: getStats,
    exportLogs: exportLogs,
    getConfirmedAds: () => confirmedAds,
    getMissedAds: () => confirmedAds.filter(ad => !ad.wasDetected),
    clearLogs: () => {
      confirmedAds.length = 0;
      log('Logs cleared');
    },
    isActive: () => isActive,
    isHomePage: isHomePage
  };

  // Memory cleanup
  const cleanupInterval = setInterval(() => {
    if (!isActive) return;
    
    // Clean up cache for removed elements
    if (sponsoredCache.forEach) {
      const toDelete = [];
      sponsoredCache.forEach((value, element) => {
        if (!document.contains(element)) {
          toDelete.push(element);
        }
      });
      toDelete.forEach(element => sponsoredCache.delete(element));
    }
  }, 60000); // Every minute

  // Khởi tạo
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Cleanup on module destroy
  window.addEventListener('beforeunload', () => {
    clearInterval(cleanupInterval);
    destroy();
  });

  log('Sponsored post blocker initialized with homepage restriction');
  if (settings.verbosity === 'verbose') {
    log('Debug available: window.FBCMF_SponsoredDebug');
  }

  // Return API
  return {
    init,
    destroy,
    isActive: () => isActive,
    isHomePage
  };
});
