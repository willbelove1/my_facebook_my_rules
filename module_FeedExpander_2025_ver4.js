/**
 * Module: FeedExpander
 * Mục đích: Mở rộng các mục trong news feed của Facebook với hiệu suất cao
 * Phiên bản: 4.0.0
 * Tích hợp: FBCMF framework, kiểm tra ctx.settings.expandNewsFeed
 * Cải tiến: Dựa trên kỹ thuật từ facebook draft script
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
    let expandedCount = 0;
    let debounceTimer = null;
    let styleElement = null;

    // Tối ưu log dựa trên verbosity
    function log(message, level = 'verbose') {
      if (ctx.settings?.verbosity === 'verbose' || level === 'error') {
        console[level === 'error' ? 'error' : 'log'](`[FeedExpander v4.0] ${message}`);
      }
    }

    log('Khởi tạo với context: ' + Object.keys(ctx).join(', '));

    // Áp dụng CSS để mở rộng feed (phương pháp hiệu quả nhất)
    function applyCSSExpansion() {
      if (!ctx.settings?.expandNewsFeed) {
        log('Tính năng mở rộng news feed bị tắt, bỏ qua CSS');
        return;
      }

      if (styleElement) {
        log('CSS đã được áp dụng trước đó');
        return;
      }

      styleElement = document.createElement('style');
      styleElement.textContent = `
        /* Mở rộng container chính của news feed */
        div.x193iq5w.xvue9z.xq1tmr.x1ceravr {
          width: 100% !important;
          max-width: 1200px !important;
          margin-left: auto !important;
          margin-right: auto !important;
          box-sizing: border-box !important;
          transition: none !important;
          will-change: width !important;
        }
        
        /* Mở rộng story container */
        div.x193iq5w.xgmub6v.x1ceravr {
          width: 100% !important;
          max-width: 1200px !important;
          margin-left: auto !important;
          margin-right: auto !important;
        }
        
        /* Tối ưu sidebar trái */
        .xxc7z9f {
          max-width: 280px !important;
          min-width: 280px !important;
        }
        
        /* Đảm bảo responsive */
        @media (max-width: 1400px) {
          div.x193iq5w.xvue9z.xq1tmr.x1ceravr,
          div.x193iq5w.xgmub6v.x1ceravr {
            max-width: 90% !important;
          }
        }
      `;
      
      document.head.appendChild(styleElement);
      log('✅ Đã áp dụng CSS mở rộng news feed');
    }

    // Debounced function để xử lý DOM mutations
    function debouncedExpansion() {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        markExpandedElements();
      }, 200);
    }

    // Đánh dấu các phần tử đã được mở rộng (backup cho CSS)
    function markExpandedElements() {
      if (!ctx.settings?.expandNewsFeed) {
        return;
      }

      const feedItems = document.querySelectorAll('div.x193iq5w:not(.fbcmf-expanded)');
      let newCount = 0;

      feedItems.forEach(item => {
        if (!item.classList.contains('fbcmf-expanded')) {
          item.classList.add('fbcmf-expanded');
          newCount++;
        }
      });

      if (newCount > 0) {
        expandedCount += newCount;
        log(`Đã đánh dấu ${newCount} mục mới (tổng: ${expandedCount})`);
      }
    }

    // Thiết lập MutationObserver với hiệu suất cao
    function setupOptimizedObserver() {
      if (!ctx.settings?.expandNewsFeed) {
        log('Tính năng mở rộng news feed bị tắt, không thiết lập observer');
        return;
      }

      // Quan sát toàn bộ body với debounce để tối ưu hiệu suất
      mutationObserver = new MutationObserver(debouncedExpansion);
      
      mutationObserver.observe(document.body, {
        childList: true,
        subtree: true,
        // Không quan sát attributes để tăng hiệu suất
        attributes: false,
        characterData: false
      });

      log('✅ Đã thiết lập MutationObserver tối ưu cho toàn bộ body');
    }

    // Kiểm tra xem có phải trang Facebook chính không
    function isValidFacebookPage() {
      return location.hostname === 'www.facebook.com' && 
             (location.pathname === '/' || 
              location.pathname.startsWith('/home') ||
              location.pathname === '');
    }

    // Khởi tạo module với error handling
    function init() {
      try {
        // Kiểm tra trang hợp lệ
        if (!isValidFacebookPage()) {
          log('Không phải trang Facebook hợp lệ, không khởi tạo FeedExpander');
          return;
        }

        // Kiểm tra DOM ready
        if (!document.body) {
          log('DOM chưa sẵn sàng, thử lại sau 500ms');
          setTimeout(init, 500);
          return;
        }

        // Kiểm tra setting
        if (!ctx.settings?.expandNewsFeed) {
          log('Tính năng mở rộng news feed bị tắt, không khởi tạo');
          return;
        }

        // Áp dụng CSS ngay lập tức
        applyCSSExpansion();
        
        // Đánh dấu các phần tử hiện có
        setTimeout(() => {
          markExpandedElements();
        }, 100);

        // Thiết lập observer sau khi CSS đã được áp dụng
        setTimeout(() => {
          setupOptimizedObserver();
        }, 500);

        log('✅ FeedExpander v4.0 đã khởi tạo thành công');

      } catch (error) {
        log(`Lỗi khi khởi tạo: ${error.message}`, 'error');
      }
    }

    // Hủy module và clean up
    function destroy() {
      try {
        // Clear timers
        if (debounceTimer) {
          clearTimeout(debounceTimer);
          debounceTimer = null;
        }

        // Disconnect observer
        if (mutationObserver) {
          mutationObserver.disconnect();
          mutationObserver = null;
          log('Đã ngắt kết nối MutationObserver');
        }

        // Remove CSS
        if (styleElement && styleElement.parentNode) {
          styleElement.parentNode.removeChild(styleElement);
          styleElement = null;
          log('Đã gỡ bỏ CSS styles');
        }

        // Remove classes
        document.querySelectorAll('.fbcmf-expanded').forEach(el => {
          el.classList.remove('fbcmf-expanded');
        });

        expandedCount = 0;
        log('✅ FeedExpander đã được hủy hoàn toàn');

      } catch (error) {
        log(`Lỗi khi hủy module: ${error.message}`, 'error');
      }
    }

    // Force expand ngay lập tức
    function expandNow() {
      try {
        if (!ctx.settings?.expandNewsFeed) {
          log('Tính năng bị tắt, không thể mở rộng');
          return;
        }

        applyCSSExpansion();
        markExpandedElements();
        log('✅ Đã thực hiện mở rộng theo yêu cầu');

      } catch (error) {
        log(`Lỗi khi mở rộng: ${error.message}`, 'error');
      }
    }

    // Khởi tạo khi DOM ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      // DOM đã sẵn sàng, khởi tạo ngay
      setTimeout(init, 100);
    }

    // Trả về API cho context
    return {
      init,
      destroy,
      expandNow,
      getStats: () => ({
        expandedCount,
        isActive: !!mutationObserver,
        hasCSSApplied: !!styleElement
      })
    };
  });
})();