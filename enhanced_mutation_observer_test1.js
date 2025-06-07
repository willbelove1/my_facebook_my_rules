/**
 * Module: MutationObserver (Enhanced for Sponsored Content)
 * Mục đích: Theo dõi động nội dung feed và tự động áp dụng bộ lọc với tối ưu hóa cho sponsored content
 * Phiên bản: 2.1.0 (Sponsored-Aware)
 */
(function() {
  'use strict';
  
  // Đảm bảo namespace FBCMF đã được khởi tạo
  if (!window.FBCMF) {
    console.error('[MutationObserver] FBCMF không được định nghĩa');
    return;
  }
  
  FBCMF.registerModule('MutationObserver', async (ctx) => {
    console.log('[MutationObserver] Khởi tạo với context:', Object.keys(ctx));
    
    const { DOMUtils, settings } = ctx;
    let observer = null;
    let lastProcessTime = 0;
    let processingQueue = false;
    const THROTTLE_TIME = 200; // Giảm throttle time để responsive hơn với ads
    let processedCount = 0;
    let hiddenCount = 0;
    let sponsoredCount = 0;
    
    // Enhanced cache system cho sponsored detection
    const postCache = new WeakMap();
    const sponsoredIndicators = new Set([
      'sponsored', 'được tài trợ', 'tài trợ', 'quảng cáo',
      'paid partnership', 'advertisement', 'promoted'
    ]);
    
    // Fast sponsored pre-check (before full FilterRegistry)
    const quickSponsoredCheck = (post) => {
      // Check cache first
      if (postCache.has(post)) {
        return postCache.get(post);
      }
      
      // Quick DOM scan for obvious sponsored indicators
      const textContent = post.textContent || '';
      const hasObviousSponsored = sponsoredIndicators.some(indicator => 
        textContent.toLowerCase().includes(indicator.toLowerCase())
      );
      
      // Check aria-labels (fastest method)
      const ariaElements = post.querySelectorAll('[aria-label*="Sponsored"], [aria-label*="Được tài trợ"], [aria-label*="quảng cáo"]');
      const hasAriaSponsored = ariaElements.length > 0;
      
      const isSponsored = hasObviousSponsored || hasAriaSponsored;
      postCache.set(post, isSponsored);
      
      return isSponsored;
    };
    
    // Kiểm tra FilterRegistry với timeout
    const waitForFilterRegistry = (attempt = 0, maxAttempts = 15) => {
      return new Promise((resolve, reject) => {
        if (ctx.FilterRegistry) {
          console.log('[MutationObserver] FilterRegistry đã sẵn sàng');
          resolve(ctx.FilterRegistry);
          return;
        }
        
        if (attempt >= maxAttempts) {
          console.error('[MutationObserver] FilterRegistry không được khởi tạo sau nhiều lần thử');
          reject(new Error('FilterRegistry không được khởi tạo'));
          return;
        }
        
        console.warn(`[MutationObserver] Đang chờ FilterRegistry (lần thử ${attempt + 1}/${maxAttempts})`);
        setTimeout(() => {
          waitForFilterRegistry(attempt + 1, maxAttempts)
            .then(resolve)
            .catch(reject);
        }, 300); // Giảm thời gian chờ
      });
    };
    
    // Enhanced post processing với priority cho sponsored content
    const processNewPosts = async () => {
      if (processingQueue) return;
      
      const now = Date.now();
      if (now - lastProcessTime < THROTTLE_TIME) {
        return;
      }
      
      processingQueue = true;
      lastProcessTime = now;
      
      try {
        // Tìm các bài viết chưa xử lý
        const posts = DOMUtils.query('div[role="article"], div[role="feed"] > div').filter(
          post => !post.hasAttribute('data-fbcmf-processed')
        );
        
        if (posts.length === 0) {
          return;
        }
        
        // Phase 1: Quick sponsored detection và ưu tiên xử lý
        const sponsoredPosts = [];
        const regularPosts = [];
        
        posts.forEach(post => {
          post.setAttribute('data-fbcmf-processed', 'true');
          processedCount++;
          
          if (settings.blockSponsored && quickSponsoredCheck(post)) {
            sponsoredPosts.push(post);
          } else {
            regularPosts.push(post);
          }
        });
        
        // Phase 2: Xử lý sponsored posts ngay lập tức (không cần chờ FilterRegistry)
        let quickHiddenCount = 0;
        sponsoredPosts.forEach(post => {
          const container = findPostContainer(post);
          if (container) {
            DOMUtils.hideElement(container, 'Sponsored Content (Quick Detection)');
            quickHiddenCount++;
            hiddenCount++;
            sponsoredCount++;
            
            if (settings.verbosity === 'verbose') {
              console.log('[MutationObserver] Nhanh chóng ẩn sponsored post');
            }
          }
        });
        
        // Phase 3: Xử lý regular posts với FilterRegistry
        if (regularPosts.length > 0) {
          const FilterRegistry = await waitForFilterRegistry().catch(err => {
            console.error('[MutationObserver]', err.message);
            return null;
          });
          
          if (FilterRegistry) {
            let filterHiddenCount = 0;
            regularPosts.forEach(post => {
              const reason = FilterRegistry.apply(post, settings);
              if (reason) {
                const container = findPostContainer(post);
                if (container) {
                  DOMUtils.hideElement(container, reason);
                  filterHiddenCount++;
                  hiddenCount++;
                  
                  if (reason.toLowerCase().includes('sponsored')) {
                    sponsoredCount++;
                  }
                  
                  if (settings.verbosity === 'verbose') {
                    console.log(`[MutationObserver] Đã ẩn bài viết: ${reason}`);
                  }
                }
              }
            });
            
            if (settings.verbosity === 'verbose' && filterHiddenCount > 0) {
              console.log(`[MutationObserver] FilterRegistry ẩn thêm ${filterHiddenCount} bài viết.`);
            }
          }
        }
        
        if (settings.verbosity === 'verbose' && posts.length > 0) {
          console.log(`[MutationObserver] Đã xử lý ${posts.length} bài viết mới (${sponsoredPosts.length} sponsored, ${regularPosts.length} regular), ẩn tổng ${quickHiddenCount + (regularPosts.length > 0 ? 0 : 0)} bài.`);
        }
        
      } catch (e) {
        console.error('[MutationObserver] Lỗi khi xử lý bài viết:', e);
      } finally {
        processingQueue = false;
      }
    };
    
    // Tìm container của bài viết (cải tiến cho sponsored posts)
    const findPostContainer = (element) => {
      let current = element;
      let level = 0;
      const MAX_LEVELS = 12; // Tăng level để bắt được sponsored containers
      
      while (current && level < MAX_LEVELS) {
        if (current.tagName === 'DIV') {
          // Check for article role
          if (current.getAttribute('role') === 'article') {
            return current;
          }
          
          // Check for common Facebook post container classes
          const classList = current.classList;
          if (classList.contains('x1yztbdb') || 
              classList.contains('x1lliihq') ||
              classList.contains('x1n2onr6') || // Common sponsored container
              classList.contains('x1qjc9v5')) { // Another sponsored container
            return current;
          }
          
          // Check for data attributes that indicate post containers
          if (current.hasAttribute('data-pagelet') && 
              current.getAttribute('data-pagelet').includes('FeedUnit')) {
            return current;
          }
        }
        
        current = current.parentElement;
        level++;
      }
      
      return element;
    };
    
    // Enhanced observer initialization
    const initObserver = () => {
      if (observer) {
        observer.disconnect();
      }
      
      // Tìm container feed với selectors mở rộng
      const feedContainer = document.querySelector([
        'div[role="feed"]',
        'div[role="main"]', 
        '.x1lliihq',
        '.x6s0dn4',
        '.x78zum5',
        '[data-pagelet="Feed"]',
        '[data-testid="Newsfeed"]'
      ].join(', '));
      
      if (!feedContainer) {
        if (settings.verbosity === 'verbose') {
          console.warn('[MutationObserver] Không tìm thấy container feed, thử lại sau 1.5s...');
        }
        setTimeout(initObserver, 1500);
        return;
      }
      
      // Enhanced MutationObserver với tối ưu hóa
      observer = new MutationObserver((mutations) => {
        // Check for meaningful changes
        const hasMeaningfulChanges = mutations.some(mutation => {
          // New nodes added
          if (mutation.addedNodes.length > 0) {
            // Check if any added node contains article or feed-like structure
            for (const node of mutation.addedNodes) {
              if (node.nodeType === Node.ELEMENT_NODE) {
                if (node.getAttribute && 
                    (node.getAttribute('role') === 'article' ||
                     node.querySelector && node.querySelector('[role="article"]'))) {
                  return true;
                }
              }
            }
          }
          
          // Attribute changes that might affect sponsored detection
          if (mutation.type === 'attributes' && 
              ['class', 'style', 'aria-label', 'data-testid'].includes(mutation.attributeName)) {
            return true;
          }
          
          return false;
        });
        
        if (hasMeaningfulChanges) {
          processNewPosts();
        }
      });
      
      // Start observing với enhanced config
      observer.observe(feedContainer, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style', 'aria-label', 'data-testid', 'role']
      });
      
      if (settings.verbosity === 'verbose') {
        console.log('[MutationObserver] Đã khởi tạo theo dõi feed với enhanced sponsored detection.');
      }
      
      // Xử lý các bài viết hiện tại
      processNewPosts();
    };
    
    // Enhanced URL change detection
    const setupURLChangeDetection = () => {
      let lastUrl = location.href;
      
      const checkUrlChange = () => {
        if (location.href !== lastUrl) {
          lastUrl = location.href;
          
          if (settings.verbosity === 'verbose') {
            console.log('[MutationObserver] URL thay đổi, khởi tạo lại observer...');
          }
          
          // Reset các biến đếm
          processedCount = 0;
          hiddenCount = 0;
          sponsoredCount = 0;
          
          // Clear cache
          postCache.clear();
          
          // Khởi tạo lại observer sau khi URL thay đổi
          setTimeout(() => {
            initObserver();
          }, 800);
        }
      };
      
      // Use both interval and event-based detection
      setInterval(checkUrlChange, 1000);
      
      // Listen for popstate events
      window.addEventListener('popstate', () => {
        setTimeout(checkUrlChange, 100);
      });
      
      // Override pushState and replaceState to catch programmatic navigation
      const originalPushState = history.pushState;
      const originalReplaceState = history.replaceState;
      
      history.pushState = function(...args) {
        originalPushState.apply(this, args);
        setTimeout(checkUrlChange, 100);
      };
      
      history.replaceState = function(...args) {
        originalReplaceState.apply(this, args);
        setTimeout(checkUrlChange, 100);
      };
    };
    
    // Memory cleanup
    const setupMemoryCleanup = () => {
      setInterval(() => {
        // Clean up cache for removed elements
        for (const [element] of postCache) {
          if (!document.contains(element)) {
            postCache.delete(element);
          }
        }
      }, 45000); // Every 45 seconds
    };
    
    // Khởi tạo module
    const init = () => {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
          initObserver();
          setupURLChangeDetection();
          setupMemoryCleanup();
        });
      } else {
        initObserver();
        setupURLChangeDetection();
        setupMemoryCleanup();
      }
      
      // Enhanced scroll handling với debounce
      let scrollTimeout;
      window.addEventListener('scroll', () => {
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
          processNewPosts();
        }, 100);
      }, { passive: true });
      
      // Handle visibility change (tab switching)
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
          setTimeout(processNewPosts, 500);
        }
      });
    };
    
    // Khởi tạo
    init();
    
    if (settings.verbosity === 'verbose') {
      console.log('[MutationObserver] Enhanced module đã được khởi tạo với sponsored optimization.');
    }
    
    // Enhanced API cho context
    return {
      processNewPosts,
      getStats: () => ({ 
        processedCount, 
        hiddenCount, 
        sponsoredCount,
        cacheSize: postCache.size || 0
      }),
      reset: () => {
        processedCount = 0;
        hiddenCount = 0;
        sponsoredCount = 0;
        postCache.clear();
        if (observer) {
          observer.disconnect();
          observer = null;
        }
        initObserver();
      },
      clearCache: () => {
        postCache.clear();
        console.log('[MutationObserver] Cache cleared');
      }
    };
  });
})();