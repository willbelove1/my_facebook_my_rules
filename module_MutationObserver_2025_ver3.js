/**
 * Module: MutationObserver (Enhanced for Sponsored Content) - FIXED
 * Mục đích: Theo dõi động nội dung feed và tự động áp dụng bộ lọc với tối ưu hóa cho sponsored content
 * Phiên bản: 2.1.1 (Fixed iteration issues)
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
    const THROTTLE_TIME = 200;
    let processedCount = 0;
    let hiddenCount = 0;
    let sponsoredCount = 0;
    
    // FIX: Enhanced cache system với proper initialization và error handling
    const postCache = new WeakMap();
    const sponsoredCache = new Map(); // Changed to Map for better iteration support
    
    const sponsoredIndicators = [
      'sponsored', 'được tài trợ', 'tài trợ', 'quảng cáo',
      'paid partnership', 'advertisement', 'promoted'
    ];
    
    // FIX: Safe cache operations with error handling
    const safeGetFromCache = (cache, key) => {
      try {
        if (cache instanceof WeakMap) {
          return cache.has(key) ? cache.get(key) : null;
        } else if (cache instanceof Map) {
          return cache.get(key);
        }
        return null;
      } catch (error) {
        console.warn('[MutationObserver] Cache get error:', error);
        return null;
      }
    };
    
    const safeSetToCache = (cache, key, value) => {
      try {
        if (cache instanceof WeakMap || cache instanceof Map) {
          cache.set(key, value);
          return true;
        }
        return false;
      } catch (error) {
        console.warn('[MutationObserver] Cache set error:', error);
        return false;
      }
    };
    
    const safeClearCache = (cache) => {
      try {
        if (cache && typeof cache.clear === 'function') {
          cache.clear();
          return true;
        }
        return false;
      } catch (error) {
        console.warn('[MutationObserver] Cache clear error:', error);
        return false;
      }
    };
    
    // FIX: Safe iteration over caches
    const safeIterateCache = (cache, callback) => {
      try {
        if (cache instanceof Map) {
          for (const [key, value] of cache) {
            try {
              callback(key, value);
            } catch (error) {
              console.warn('[MutationObserver] Cache iteration callback error:', error);
            }
          }
        } else if (cache instanceof WeakMap) {
          // WeakMap cannot be iterated directly, skip or handle differently
          console.debug('[MutationObserver] WeakMap iteration skipped (not supported)');
        }
      } catch (error) {
        console.warn('[MutationObserver] Cache iteration error:', error);
      }
    };
    
    // Enhanced sponsored pre-check with better error handling
    const quickSponsoredCheck = (post) => {
      if (!post || !post.nodeType) {
        return false;
      }
      
      // Check WeakMap cache first
      const cachedResult = safeGetFromCache(postCache, post);
      if (cachedResult !== null) {
        return cachedResult;
      }
      
      try {
        // Quick DOM scan for obvious sponsored indicators
        const textContent = (post.textContent || '').toLowerCase();
        const hasObviousSponsored = sponsoredIndicators.some(indicator => 
          textContent.includes(indicator.toLowerCase())
        );
        
        // Check aria-labels (fastest method)
        const ariaElements = post.querySelectorAll && post.querySelectorAll('[aria-label*="Sponsored"], [aria-label*="Được tài trợ"], [aria-label*="quảng cáo"]');
        const hasAriaSponsored = ariaElements && ariaElements.length > 0;
        
        const isSponsored = hasObviousSponsored || hasAriaSponsored;
        
        // Store in both caches for different use cases
        safeSetToCache(postCache, post, isSponsored);
        if (post.id || post.getAttribute('data-testid')) {
          const identifier = post.id || post.getAttribute('data-testid');
          safeSetToCache(sponsoredCache, identifier, isSponsored);
        }
        
        return isSponsored;
      } catch (error) {
        console.warn('[MutationObserver] Quick sponsored check error:', error);
        safeSetToCache(postCache, post, false);
        return false;
      }
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
        }, 300);
      });
    };
    
    // Enhanced post processing với better error handling
    const processNewPosts = async () => {
      if (processingQueue) return;
      
      const now = Date.now();
      if (now - lastProcessTime < THROTTLE_TIME) {
        return;
      }
      
      processingQueue = true;
      lastProcessTime = now;
      
      try {
        // FIX: Better null checking for DOMUtils
        if (!DOMUtils || !DOMUtils.query) {
          console.warn('[MutationObserver] DOMUtils not available');
          return;
        }
        
        // Tìm các bài viết chưa xử lý với fallback selectors
        let posts = [];
        try {
          posts = DOMUtils.query('div[role="article"], div[role="feed"] > div').filter(
            post => post && !post.hasAttribute('data-fbcmf-processed')
          );
        } catch (error) {
          console.warn('[MutationObserver] Error querying posts:', error);
          // Fallback to basic document query
          const allPosts = document.querySelectorAll('div[role="article"], div[role="feed"] > div');
          posts = Array.from(allPosts).filter(
            post => post && !post.hasAttribute('data-fbcmf-processed')
          );
        }
        
        if (posts.length === 0) {
          return;
        }
        
        // Phase 1: Safe sponsored detection và ưu tiên xử lý
        const sponsoredPosts = [];
        const regularPosts = [];
        
        posts.forEach(post => {
          try {
            if (!post || !post.setAttribute) {
              return;
            }
            
            post.setAttribute('data-fbcmf-processed', 'true');
            processedCount++;
            
            if (settings && settings.blockSponsored && quickSponsoredCheck(post)) {
              sponsoredPosts.push(post);
            } else {
              regularPosts.push(post);
            }
          } catch (error) {
            console.warn('[MutationObserver] Error processing individual post:', error);
            if (post) {
              regularPosts.push(post); // Fallback to regular processing
            }
          }
        });
        
        // Phase 2: Safe sponsored posts processing
        let quickHiddenCount = 0;
        sponsoredPosts.forEach(post => {
          try {
            const container = findPostContainer(post);
            if (container && DOMUtils && DOMUtils.hideElement) {
              DOMUtils.hideElement(container, 'Sponsored Content (Quick Detection)');
              quickHiddenCount++;
              hiddenCount++;
              sponsoredCount++;
              
              if (settings && settings.verbosity === 'verbose') {
                console.log('[MutationObserver] Nhanh chóng ẩn sponsored post');
              }
            }
          } catch (error) {
            console.warn('[MutationObserver] Error hiding sponsored post:', error);
          }
        });
        
        // Phase 3: Safe regular posts processing với FilterRegistry
        if (regularPosts.length > 0) {
          try {
            const FilterRegistry = await waitForFilterRegistry().catch(err => {
              console.error('[MutationObserver]', err.message);
              return null;
            });
            
            if (FilterRegistry && FilterRegistry.apply) {
              let filterHiddenCount = 0;
              regularPosts.forEach(post => {
                try {
                  const reason = FilterRegistry.apply(post, settings);
                  if (reason) {
                    const container = findPostContainer(post);
                    if (container && DOMUtils && DOMUtils.hideElement) {
                      DOMUtils.hideElement(container, reason);
                      filterHiddenCount++;
                      hiddenCount++;
                      
                      if (reason.toLowerCase().includes('sponsored')) {
                        sponsoredCount++;
                      }
                      
                      if (settings && settings.verbosity === 'verbose') {
                        console.log(`[MutationObserver] Đã ẩn bài viết: ${reason}`);
                      }
                    }
                  }
                } catch (error) {
                  console.warn('[MutationObserver] Error applying filter to post:', error);
                }
              });
              
              if (settings && settings.verbosity === 'verbose' && filterHiddenCount > 0) {
                console.log(`[MutationObserver] FilterRegistry ẩn thêm ${filterHiddenCount} bài viết.`);
              }
            }
          } catch (error) {
            console.error('[MutationObserver] Error in FilterRegistry processing:', error);
          }
        }
        
        if (settings && settings.verbosity === 'verbose' && posts.length > 0) {
          console.log(`[MutationObserver] Đã xử lý ${posts.length} bài viết mới (${sponsoredPosts.length} sponsored, ${regularPosts.length} regular), ẩn tổng ${quickHiddenCount} bài.`);
        }
        
      } catch (e) {
        console.error('[MutationObserver] Lỗi khi xử lý bài viết:', e);
      } finally {
        processingQueue = false;
      }
    };
    
    // Tìm container của bài viết (cải tiến với error handling)
    const findPostContainer = (element) => {
      if (!element) return null;
      
      let current = element;
      let level = 0;
      const MAX_LEVELS = 12;
      
      try {
        while (current && level < MAX_LEVELS) {
          if (current.tagName === 'DIV') {
            // Check for article role
            if (current.getAttribute && current.getAttribute('role') === 'article') {
              return current;
            }
            
            // Check for common Facebook post container classes
            if (current.classList) {
              const classList = current.classList;
              if (classList.contains('x1yztbdb') || 
                  classList.contains('x1lliihq') ||
                  classList.contains('x1n2onr6') ||
                  classList.contains('x1qjc9v5')) {
                return current;
              }
            }
            
            // Check for data attributes that indicate post containers
            if (current.hasAttribute && current.hasAttribute('data-pagelet') && 
                current.getAttribute('data-pagelet').includes('FeedUnit')) {
              return current;
            }
          }
          
          current = current.parentElement;
          level++;
        }
      } catch (error) {
        console.warn('[MutationObserver] Error finding post container:', error);
      }
      
      return element;
    };
    
    // Enhanced observer initialization với better error handling
    const initObserver = () => {
      try {
        if (observer) {
          observer.disconnect();
          observer = null;
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
          if (settings && settings.verbosity === 'verbose') {
            console.warn('[MutationObserver] Không tìm thấy container feed, thử lại sau 1.5s...');
          }
          setTimeout(initObserver, 1500);
          return;
        }
        
        // Enhanced MutationObserver với error handling
        observer = new MutationObserver((mutations) => {
          try {
            // Check for meaningful changes
            const hasMeaningfulChanges = mutations.some(mutation => {
              try {
                // New nodes added
                if (mutation.addedNodes && mutation.addedNodes.length > 0) {
                  // Check if any added node contains article or feed-like structure
                  for (const node of mutation.addedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                      if (node.getAttribute && 
                          (node.getAttribute('role') === 'article' ||
                           (node.querySelector && node.querySelector('[role="article"]')))) {
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
              } catch (error) {
                console.warn('[MutationObserver] Error checking mutation:', error);
                return false;
              }
            });
            
            if (hasMeaningfulChanges) {
              processNewPosts();
            }
          } catch (error) {
            console.error('[MutationObserver] Error in mutation callback:', error);
          }
        });
        
        // Start observing với enhanced config
        observer.observe(feedContainer, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['class', 'style', 'aria-label', 'data-testid', 'role']
        });
        
        if (settings && settings.verbosity === 'verbose') {
          console.log('[MutationObserver] Đã khởi tạo theo dõi feed với enhanced sponsored detection.');
        }
        
        // Xử lý các bài viết hiện tại
        processNewPosts();
      } catch (error) {
        console.error('[MutationObserver] Error initializing observer:', error);
      }
    };
    
    // Enhanced URL change detection với error handling
    const setupURLChangeDetection = () => {
      let lastUrl = location.href;
      
      const checkUrlChange = () => {
        try {
          if (location.href !== lastUrl) {
            lastUrl = location.href;
            
            if (settings && settings.verbosity === 'verbose') {
              console.log('[MutationObserver] URL thay đổi, khởi tạo lại observer...');
            }
            
            // Reset các biến đếm
            processedCount = 0;
            hiddenCount = 0;
            sponsoredCount = 0;
            
            // Safe cache clearing
            safeClearCache(postCache);
            safeClearCache(sponsoredCache);
            
            // Khởi tạo lại observer sau khi URL thay đổi
            setTimeout(() => {
              initObserver();
            }, 800);
          }
        } catch (error) {
          console.warn('[MutationObserver] Error checking URL change:', error);
        }
      };
      
      // Use both interval and event-based detection
      setInterval(checkUrlChange, 1000);
      
      // Listen for popstate events
      window.addEventListener('popstate', () => {
        setTimeout(checkUrlChange, 100);
      });
      
      // Safe override of pushState and replaceState
      try {
        const originalPushState = history.pushState;
        const originalReplaceState = history.replaceState;
        
        history.pushState = function(...args) {
          try {
            originalPushState.apply(this, args);
            setTimeout(checkUrlChange, 100);
          } catch (error) {
            console.warn('[MutationObserver] Error in pushState override:', error);
            originalPushState.apply(this, args);
          }
        };
        
        history.replaceState = function(...args) {
          try {
            originalReplaceState.apply(this, args);
            setTimeout(checkUrlChange, 100);
          } catch (error) {
            console.warn('[MutationObserver] Error in replaceState override:', error);
            originalReplaceState.apply(this, args);
          }
        };
      } catch (error) {
        console.warn('[MutationObserver] Error setting up history overrides:', error);
      }
    };
    
    // FIX: Safe memory cleanup với proper iteration
    const setupMemoryCleanup = () => {
      setInterval(() => {
        try {
          // Clean up WeakMap cache for removed elements (limited cleanup since WeakMap auto-cleans)
          // WeakMap automatically handles garbage collection, so we don't need to manually clean it
          
          // Clean up Map cache for removed elements
          if (sponsoredCache instanceof Map) {
            const keysToDelete = [];
            safeIterateCache(sponsoredCache, (key, value) => {
              // If key is an element ID, check if element still exists
              if (typeof key === 'string') {
                const element = document.getElementById(key) || document.querySelector(`[data-testid="${key}"]`);
                if (!element) {
                  keysToDelete.push(key);
                }
              }
            });
            
            keysToDelete.forEach(key => {
              try {
                sponsoredCache.delete(key);
              } catch (error) {
                console.warn('[MutationObserver] Error deleting cache key:', error);
              }
            });
            
            if (keysToDelete.length > 0 && settings && settings.verbosity === 'verbose') {
              console.log(`[MutationObserver] Cleaned up ${keysToDelete.length} cache entries`);
            }
          }
        } catch (error) {
          console.error('[MutationObserver] Error in memory cleanup:', error);
        }
      }, 45000); // Every 45 seconds
    };
    
    // Khởi tạo module với error handling
    const init = () => {
      try {
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
          try {
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => {
              processNewPosts();
            }, 100);
          } catch (error) {
            console.warn('[MutationObserver] Error in scroll handler:', error);
          }
        }, { passive: true });
        
        // Handle visibility change (tab switching)
        document.addEventListener('visibilitychange', () => {
          try {
            if (!document.hidden) {
              setTimeout(processNewPosts, 500);
            }
          } catch (error) {
            console.warn('[MutationObserver] Error in visibility change handler:', error);
          }
        });
      } catch (error) {
        console.error('[MutationObserver] Error in initialization:', error);
      }
    };
    
    // Khởi tạo
    init();
    
    if (settings && settings.verbosity === 'verbose') {
      console.log('[MutationObserver] Enhanced module đã được khởi tạo với sponsored optimization và error handling.');
    }
    
    // FIX: Enhanced API cho context với safe operations
    return {
      processNewPosts,
      getStats: () => {
        try {
          return { 
            processedCount, 
            hiddenCount, 
            sponsoredCount,
            cacheSize: (postCache instanceof WeakMap ? 'WeakMap' : 0) + ', ' + (sponsoredCache instanceof Map ? sponsoredCache.size : 0)
          };
        } catch (error) {
          console.warn('[MutationObserver] Error getting stats:', error);
          return { processedCount: 0, hiddenCount: 0, sponsoredCount: 0, cacheSize: 'error' };
        }
      },
      reset: () => {
        try {
          processedCount = 0;
          hiddenCount = 0;
          sponsoredCount = 0;
          safeClearCache(postCache);
          safeClearCache(sponsoredCache);
          if (observer) {
            observer.disconnect();
            observer = null;
          }
          initObserver();
        } catch (error) {
          console.error('[MutationObserver] Error in reset:', error);
        }
      },
      clearCache: () => {
        try {
          safeClearCache(postCache);
          safeClearCache(sponsoredCache);
          console.log('[MutationObserver] Cache cleared safely');
        } catch (error) {
          console.error('[MutationObserver] Error clearing cache:', error);
        }
      }
    };
  });
})();