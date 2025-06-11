/**
 * Module: blockReels (Filter Registry) - Improved Version
 * Mục đích: Đăng ký bộ lọc video Reels vào FilterRegistry với hiệu suất tối ưu
 */
(function() {
  'use strict';
  
  // Đảm bảo namespace FBCMF đã được khởi tạo
  window.FBCMF = window.FBCMF || {};
  
  FBCMF.registerModule('blockReels', async ({ DOMUtils, settings, FilterRegistry }) => {
    if (!settings.blockReels) return;

    // Cache các selector để tăng hiệu suất
    const SELECTORS = {
      video: 'video',
      videoId: '[data-video-id]',
      reelLink: 'a[href*="/reel/"], a[href*="/reels/"]',
      reelText: 'span, div[role="button"], [aria-label*="Reel"]'
    };

    // Regex patterns được compile sẵn
    const PATTERNS = {
      reelUrl: /\/reels?\//i,
      reelText: /\b(reels?|reel)\b/i,
      profileUrl: /facebook\.com\/profile/i,
      pageUrl: /facebook\.com\/[^\/]+$/i
    };

    // Kiểm tra xem có phải trang profile/page không
    const isProfileOrPage = () => {
      const currentUrl = window.location.href;
      return PATTERNS.profileUrl.test(currentUrl) || PATTERNS.pageUrl.test(currentUrl);
    };

    // Optimized function để kiểm tra Reels
    const isReelPost = (post) => {
      try {
        // Nếu đang ở trang profile/page, chỉ block Reels rõ ràng
        const onProfilePage = isProfileOrPage();
        
        // 1. Kiểm tra nhanh: có video element không
        const hasVideo = post.querySelector(SELECTORS.video) !== null;
        
        // 2. Kiểm tra data-video-id
        const hasVideoId = post.querySelector(SELECTORS.videoId) !== null;
        
        // 3. Kiểm tra link Reels (chính xác nhất)
        const hasReelLink = post.querySelector(SELECTORS.reelLink) !== null;
        
        // Nếu có link Reels rõ ràng, chắc chắn là Reel
        if (hasReelLink) {
          return true;
        }
        
        // Nếu đang ở trang profile/page, cần kiểm tra kỹ hơn
        if (onProfilePage) {
          // Chỉ block nếu có cả video và các dấu hiệu rõ ràng của Reels
          if (hasVideo || hasVideoId) {
            // Kiểm tra innerHTML một cách an toàn
            const postHTML = post.innerHTML;
            if (PATTERNS.reelUrl.test(postHTML)) {
              return true;
            }
            
            // Kiểm tra text content một cách selective
            const reelElements = post.querySelectorAll(SELECTORS.reelText);
            for (let element of reelElements) {
              const text = element.textContent || element.getAttribute('aria-label') || '';
              if (PATTERNS.reelText.test(text)) {
                // Double-check: đảm bảo không phải là text thông thường
                const parent = element.closest('[role="article"], [data-pagelet]');
                if (parent && (hasVideo || hasVideoId)) {
                  return true;
                }
              }
            }
          }
          return false;
        }
        
        // Ở trang chính (newsfeed), áp dụng logic detection mạnh hơn
        if (hasVideo || hasVideoId) {
          // Kiểm tra URL trong post
          const postHTML = post.innerHTML;
          if (PATTERNS.reelUrl.test(postHTML)) {
            return true;
          }
          
          // Kiểm tra text indicators
          const textElements = post.querySelectorAll(SELECTORS.reelText);
          for (let element of textElements) {
            const text = element.textContent || element.getAttribute('aria-label') || '';
            if (PATTERNS.reelText.test(text)) {
              return true;
            }
          }
        }
        
        return false;
      } catch (error) {
        // Fallback: nếu có lỗi, không block để tránh mất content
        if (settings.verbosity === 'verbose') {
          console.warn('[blockReels] Error detecting reel:', error);
        }
        return false;
      }
    };

    // Đăng ký filter với performance optimization
    FilterRegistry.register('blockReels', (post) => {
      // Quick exit nếu post không hợp lệ
      if (!post || !post.nodeType) {
        return '';
      }
      
      // Sử dụng optimized detection
      if (isReelPost(post)) {
        return 'Reels';
      }
      
      return '';
    });

    // URL change detection để reset cache khi cần
    let lastUrl = window.location.href;
    const urlChangeObserver = new MutationObserver(() => {
      const currentUrl = window.location.href;
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        // Clear any cached data if needed
        if (settings.verbosity === 'verbose') {
          console.log('[blockReels] URL changed, adapting filter behavior');
        }
      }
    });

    // Observe URL changes
    urlChangeObserver.observe(document.querySelector('title'), {
      childList: true,
      subtree: true
    });

    if (settings.verbosity === 'verbose') {
      console.log('[blockReels] Bộ lọc cải tiến đã được đăng ký với tối ưu hiệu suất.');
    }
  });
})();