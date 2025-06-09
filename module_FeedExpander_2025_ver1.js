/**
 * Module: FeedExpander
 * Mục đích: Mở rộng các mục trong news feed của Facebook (width: 100%) - CHỈ TRÊN TRANG CHỦ
 * Phiên bản: 3.1.0
 * Tích hợp: FBCMF framework, kiểm tra ctx.settings.expandNewsFeed
 * Cập nhật: Chỉ hoạt động trên facebook.com (trang chủ), tự động tắt trên các trang con
 */
(function() {
  'use strict';

  // Đảm bảo namespace FBCMF đã được khởi tạo
  window.FBCMF = window.FBCMF || {};

  FBCMF.registerModule = FBCMF.registerModule || function(name, initFn) {
    if (!FBCMF.modules) FBCMF.modules = {};
    FBCMF.modules[name] = initFn;
  };

  FBCMF.registerModule('FeedExpander', async (ctx) => {
    let mutationObserver = null;
    let urlObserver = null;
    let timer = null;
    let expandedCount = 0;
    let isActive = false;

    // Tối ưu log dựa trên verbosity
    function log(message, level = 'verbose') {
      if (ctx.settings?.verbosity === 'verbose' || level === 'error') {
        console[level === 'error' ? 'error' : 'log'](`[FeedExpander] ${message}`);
      }
    }

    log('Khởi tạo với context: ' + Object.keys(ctx).join(', '));

    // Kiểm tra xem có phải trang chủ Facebook không
    function isHomePage() {
      const url = new URL(window.location.href);
      // Chỉ chấp nhận:
      // - facebook.com/
      // - facebook.com/?sk=h_chr (trang chủ với tham số)
      // - facebook.com (không có path)
      return url.hostname === 'www.facebook.com' && 
             (url.pathname === '/' || url.pathname === '') &&
             !url.pathname.includes('/profile/') &&
             !url.pathname.includes('/groups/') &&
             !url.pathname.includes('/pages/') &&
             !url.searchParams.has('id'); // Loại bỏ các URL có tham số id (profile)
    }

    // Hàm mở rộng các mục trong news feed
    function expandNewsFeed() {
      if (!ctx.settings?.expandNewsFeed || !isActive) {
        return;
      }

      if (!isHomePage()) {
        log('Không phải trang chủ Facebook, tạm dừng mở rộng');
        pauseModule();
        return;
      }

      const feedItems = document.querySelectorAll('.x193iq5w');
      let currentCount = 0;
      
      feedItems.forEach(item => {
        if (item.style.width !== '100%') {
          item.style.width = '100%';
          currentCount++;
          expandedCount++;
        }
      });

      if (currentCount > 0) {
        log(`Đã mở rộng ${currentCount} mục news feed (tổng: ${expandedCount})`);
      }
    }

    // Thiết lập MutationObserver cho container
    function setupFeedObserver(retryCount = 0, maxRetries = 5) {
      if (!ctx.settings?.expandNewsFeed || !isActive) {
        return;
      }

      if (!isHomePage()) {
        log('Không phải trang chủ Facebook, không thiết lập feed observer');
        return;
      }

      const feedContainer = document.querySelector('.xxzkxad');
      if (feedContainer) {
        if (mutationObserver) {
          mutationObserver.disconnect();
        }
        
        mutationObserver = new MutationObserver(() => {
          expandNewsFeed();
        });
        mutationObserver.observe(feedContainer, { childList: true, subtree: true });
        log('Đã thiết lập MutationObserver cho container .xxzkxad');
      } else {
        if (retryCount < maxRetries) {
          log(`Không tìm thấy container .xxzkxad, thử lại lần ${retryCount + 1} sau 1s`);
          timer = setTimeout(() => setupFeedObserver(retryCount + 1, maxRetries), 1000);
        } else {
          log('Không tìm thấy container .xxzkxad sau nhiều lần thử', 'error');
        }
      }
    }

    // Thiết lập observer để theo dõi thay đổi URL
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

    // Xử lý thay đổi URL
    function handleUrlChange() {
      const wasActive = isActive;
      const shouldBeActive = isHomePage() && ctx.settings?.expandNewsFeed;
      
      if (shouldBeActive && !wasActive) {
        log('Chuyển đến trang chủ - Kích hoạt FeedExpander');
        activateModule();
      } else if (!shouldBeActive && wasActive) {
        log('Rời khỏi trang chủ - Tạm dừng FeedExpander');
        pauseModule();
      }
    }

    // Kích hoạt module
    function activateModule() {
      if (isActive) return;
      
      isActive = true;
      expandNewsFeed();
      
      // Delay để đảm bảo DOM đã load
      timer = setTimeout(() => {
        setupFeedObserver();
      }, 2000);
      
      log('✅ Đã kích hoạt FeedExpander');
    }

    // Tạm dừng module (không hủy hoàn toàn)
    function pauseModule() {
      if (!isActive) return;
      
      isActive = false;
      
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }

      if (mutationObserver) {
        mutationObserver.disconnect();
        mutationObserver = null;
      }
      
      log('⏸️ Đã tạm dừng FeedExpander');
    }

    // Khởi tạo module
    function init() {
      if (!document.body) {
        log('DOM chưa sẵn sàng, thử lại sau 1s');
        setTimeout(init, 1000);
        return;
      }

      if (!ctx.settings?.expandNewsFeed) {
        log('Tính năng mở rộng news feed bị tắt, không khởi tạo');
        return;
      }

      // Thiết lập URL observer ngay từ đầu
      setupUrlObserver();

      // Kiểm tra và kích hoạt nếu đang ở trang chủ
      if (isHomePage()) {
        activateModule();
      } else {
        log('Không phải trang chủ Facebook, FeedExpander ở chế độ chờ');
      }

      log('🚀 Đã khởi tạo FeedExpander với URL monitoring');
    }

    // Hủy module hoàn toàn
    function destroy() {
      pauseModule();
      
      if (urlObserver) {
        urlObserver.disconnect();
        urlObserver = null;
      }
      
      window.removeEventListener('popstate', handleUrlChange);

      // Khôi phục style gốc
      const feedItems = document.querySelectorAll('.x193iq5w');
      feedItems.forEach(item => {
        if (item.style.width === '100%') {
          item.style.width = '';
        }
      });

      expandedCount = 0;
      isActive = false;
      log('🗑️ Đã hủy FeedExpander hoàn toàn');
    }

    // Mở rộng ngay lập tức (chỉ khi active)
    function expandNow() {
      if (isActive && isHomePage()) {
        expandNewsFeed();
        log('Đã chạy mở rộng news feed theo yêu cầu');
      } else {
        log('FeedExpander không active hoặc không ở trang chủ, bỏ qua yêu cầu expandNow');
      }
    }

    // Khởi tạo
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }

    // Trả về API cho context
    return {
      init,
      destroy,
      expandNow,
      isActive: () => isActive,
      isHomePage
    };
  });
})();
