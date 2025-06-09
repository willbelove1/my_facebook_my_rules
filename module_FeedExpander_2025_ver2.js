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
      
      // Chỉ chấp nhận trang chủ thực sự
      if (url.hostname !== 'www.facebook.com') return false;
      
      const path = url.pathname;
      
      // Loại bỏ tất cả các trang con
      if (path.length > 1 && path !== '/') {
        // Bất kỳ path nào khác ngoài '/' đều không phải trang chủ
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

    // Hàm mở rộng các mục trong news feed
    function expandNewsFeed() {
      // Kiểm tra nghiêm ngặt trước khi thực hiện bất kỳ thay đổi CSS nào
      if (!ctx.settings?.expandNewsFeed || !isActive || !isHomePage()) {
        return;
      }

      const feedItems = document.querySelectorAll('.x193iq5w');
      let currentCount = 0;
      
      feedItems.forEach(item => {
        // Chỉ áp dụng CSS khi chắc chắn đang ở trang chủ
        if (item.style.width !== '100%') {
          item.style.width = '100%';
          // Thêm class để đánh dấu đã được modify
          item.classList.add('fbcmf-expanded');
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
      const currentlyHomePage = isHomePage();
      const shouldBeActive = currentlyHomePage && ctx.settings?.expandNewsFeed;
      
      if (shouldBeActive && !wasActive) {
        log('Chuyển đến trang chủ - Kích hoạt FeedExpander');
        activateModule();
      } else if (!currentlyHomePage && wasActive) {
        log('Rời khỏi trang chủ - Tạm dừng FeedExpander và khôi phục CSS');
        pauseModule();
      } else if (!shouldBeActive && wasActive) {
        log('Tính năng bị tắt - Tạm dừng FeedExpander');
        pauseModule();
      }
    }

    // Khôi phục CSS gốc cho tất cả elements đã được modify
    function restoreOriginalStyles() {
      const expandedItems = document.querySelectorAll('.x193iq5w.fbcmf-expanded');
      let restoredCount = 0;
      
      expandedItems.forEach(item => {
        item.style.width = '';
        item.classList.remove('fbcmf-expanded');
        restoredCount++;
      });
      
      // Fallback: khôi phục tất cả .x193iq5w có width 100%
      const allFeedItems = document.querySelectorAll('.x193iq5w');
      allFeedItems.forEach(item => {
        if (item.style.width === '100%') {
          item.style.width = '';
          restoredCount++;
        }
      });
      
      if (restoredCount > 0) {
        log(`Đã khôi phục CSS cho ${restoredCount} elements`);
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
      
      // QUAN TRỌNG: Khôi phục CSS ngay khi rời trang chủ
      restoreOriginalStyles();
      
      log('⏸️ Đã tạm dừng FeedExpander và khôi phục CSS');
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

      // Khôi phục tất cả CSS đã thay đổi
      restoreOriginalStyles();

      expandedCount = 0;
      isActive = false;
      log('🗑️ Đã hủy FeedExpander hoàn toàn và khôi phục CSS');
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