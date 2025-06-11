/**
 * Module: FeedExpander
 * Mục đích: Mở rộng news feed và làm sạch giao diện Facebook
 * Phiên bản: 4.3.0 - Fixed
 * Tích hợp: FBCMF framework
 * Tính năng: Mở rộng feed + Ẩn Marketplace + Làm sạch sidebar
 * Cải tiến: Sửa lỗi phá vỡ cấu trúc - học từ draft.txt
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
    let cleanupObserver = null;
    let expandedCount = 0;
    let debounceTimer = null;
    let cleanupTimer = null;
    let styleElement = null;
    let currentPath = '';
    let isActive = false;

    // Tối ưu log dựa trên verbosity
    function log(message, level = 'verbose') {
      if (ctx.settings?.verbosity === 'verbose' || level === 'error') {
        console[level === 'error' ? 'error' : 'log'](`[FeedExpander v4.3] ${message}`);
      }
    }

    log('Khởi tạo với context: ' + Object.keys(ctx).join(', '));

    // === KIỂM TRA TRANG HỢP LỆ ===
    
    // Kiểm tra xem có phải trang chủ Facebook không
    function isHomePage() {
      const pathname = location.pathname;
      const isHome = pathname === '/' || 
                     pathname === '/home' || 
                     pathname === '/home.php' ||
                     pathname.startsWith('/home/') ||
                     (pathname === '' && location.search === '');
      
      log(`Kiểm tra trang chủ: ${pathname} -> ${isHome}`);
      return isHome;
    }

    // Kiểm tra xem có phải trang có sidebar chính không (từ draft.txt)
    function isMainSidebarPage() {
      return !!document.querySelector('nav[role="navigation"], [role=navigation]');
    }

    // Kiểm tra xem có phải trang Facebook chính không
    function isValidFacebookPage() {
      return location.hostname === 'www.facebook.com';
    }

    // Kiểm tra URL có thay đổi không
    function checkUrlChange() {
      const newPath = location.pathname + location.search;
      if (newPath !== currentPath) {
        const oldPath = currentPath;
        currentPath = newPath;
        log(`URL thay đổi: ${oldPath} -> ${newPath}`);
        
        // Nếu không còn ở trang chủ, tắt module
        if (isActive && !isHomePage()) {
          log('Rời khỏi trang chủ, tắt FeedExpander');
          deactivateModule();
        }
        // Nếu vào trang chủ, bật module
        else if (!isActive && isHomePage()) {
          log('Vào trang chủ, bật FeedExpander');
          activateModule();
        }
      }
    }

    // === CSS VÀ EXPANSION (Sửa lỗi dựa trên draft.txt) ===
    
    // Áp dụng CSS mở rộng feed - Học từ draft.txt với cách tiếp cận ổn định hơn
    function applyCSSExpansion() {
      if (!isHomePage() || !ctx.settings?.expandNewsFeed) {
        log('Không áp dụng CSS: không ở trang chủ hoặc tính năng tắt');
        return;
      }

      if (styleElement) {
        log('CSS đã được áp dụng trước đó');
        return;
      }

      styleElement = document.createElement('style');
      // Sử dụng approach từ draft.txt - cố định width thay vì dynamic
      styleElement.textContent = `
        /* CSS mở rộng feed - Fixed approach từ draft.txt */
        div.x193iq5w.xvue9z.xq1tmr.x1ceravr {
          width: 1200px !important;
          max-width: 1200px !important;
          margin-left: -60px !important;
          box-sizing: border-box !important;
          transition: none !important;
          will-change: width !important;
        }
        
        /* Mở rộng story container */
        div.x193iq5w.xgmub6v.x1ceravr {
          width: 1200px !important;
          max-width: 1200px !important;
        }
        
        /* Thu nhỏ sidebar trái để tạo không gian */
        .xxc7z9f {
          max-width: 280px !important;
          min-width: 280px !important;
        }
        
        /* Đảm bảo responsive cho màn hình nhỏ */
        @media (max-width: 1400px) {
          div.x193iq5w.xvue9z.xq1tmr.x1ceravr,
          div.x193iq5w.xgmub6v.x1ceravr {
            width: 90vw !important;
            max-width: 90vw !important;
            margin-left: -30px !important;
          }
        }
        
        @media (max-width: 768px) {
          div.x193iq5w.xvue9z.xq1tmr.x1ceravr,
          div.x193iq5w.xgmub6v.x1ceravr {
            width: 100% !important;
            max-width: 100% !important;
            margin-left: 0 !important;
          }
        }
      `;
      
      document.head.appendChild(styleElement);
      log('✅ Đã áp dụng CSS mở rộng news feed (fixed approach)');
    }

    // Gỡ bỏ CSS expansion
    function removeCSSExpansion() {
      if (styleElement && styleElement.parentNode) {
        styleElement.parentNode.removeChild(styleElement);
        styleElement = null;
        log('✅ Đã gỡ bỏ CSS expansion');
      }
    }

    // === CLEANUP FUNCTIONS (Cải tiến từ draft.txt) ===
    
    // Danh sách các từ khóa cần ẩn trong sidebar trái (đa ngôn ngữ) - từ draft.txt
    const leftSidebarKeywords = [
      // Tiếng Việt
      'Marketplace', 'Chợ', 'Mua bán', 'Kỷ niệm', 'Đã lưu', 'Tin nhắn trẻ em',
      'Chơi game', 'Hoạt động quảng cáo gần đây', 'Đơn hàng và thanh toán',
      'Trung tâm khoa học khí hậu', 'Chiến dịch gây quỹ', 'Quản lý quảng cáo',
      // Tiếng Trung (Phồn thể) - từ draft.txt
      '動態回顧', '我的珍藏', '我的收藏', 'Marketplace', '兒童版 Messenger',
      '玩遊戲', '近期廣告動態', '訂單和付款', '氣候科學中心', '募款活動', '籌款活動',
      '廣告管理員', 'Meta Quest 3S',
      // Tiếng Trung (Giản thể) - từ draft.txt
      '那年今天', '收藏夹', '广告管理工具', '气候科学中心',
      '订单与支付', '玩游戏', '近期广告动态', '筹款活动', 'Messenger 少儿版',
      // Tiếng Anh - từ draft.txt
      'Memories', 'Saved', 'Messenger Kids', 'Gaming', 'Play games', 
      'Recent ad activity', 'Orders and payments', 'Climate Science Center', 
      'Fundraisers', 'Ads Manager'
    ];

    // Keywords cho "Hiển thị thêm/ít" - từ draft.txt
    const moreKeywords = ['顯示更多', '更多', '展开', 'See more', 'More', 'Show more', 'See More', 'MORE', 'SHOW MORE', 'Hiển thị thêm', 'Xem thêm'];
    const lessKeywords = ['顯示較少', '收起', 'Show less', 'Show Less', 'Less', 'LESS', 'Hiển thị ít hơn', 'Thu gọn'];

    // Danh sách từ khóa sidebar phải - từ draft.txt
    const rightSidebarKeywords = [
      'Được tài trợ', 'Liên hệ', 'Cuộc trò chuyện nhóm',
      '贊助', '赞助内容', '聯絡人', '联系人', '群組聊天室', '群聊',
      'Sponsored', 'Contacts', 'Group conversations'
    ];

    // Ẩn các mục trong sidebar trái theo text content - cải tiến từ draft.txt
    function hideLeftSidebarItems() {
      if (!isHomePage() || !ctx.settings?.expandNewsFeed) return;

      const navLinks = document.querySelectorAll('nav a[role="link"], [role=navigation] a[role="link"]');
      let hiddenCount = 0;

      navLinks.forEach(link => {
        let shouldHide = false;
        const spans = link.querySelectorAll('span.x1lliihq');
        
        spans.forEach(span => {
          if (span.textContent && span.children.length === 0) {
            const text = span.textContent.trim();
            if (leftSidebarKeywords.includes(text)) {
              shouldHide = true;
            }
          }
        });

        if (shouldHide && link.style.display !== 'none') {
          link.style.display = 'none';
          hiddenCount++;
        }
      });

      if (hiddenCount > 0) {
        log(`Đã ẩn ${hiddenCount} mục sidebar trái`);
      }
    }

    // Ẩn Marketplace button cụ thể - từ draft.txt
    function hideMarketplaceButton() {
      if (!isHomePage() || !ctx.settings?.expandNewsFeed) return;

      const marketplaceSelectors = [
        'a[aria-label="Marketplace"]',
        'a[href="/marketplace/?ref=app_tab"]',
        'a[href="/marketplace/"]',
        'a[href*="/marketplace"]'
      ];

      let removedCount = 0;
      marketplaceSelectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(link => {
          let parent = link;
          // Tìm element cha là LI để remove toàn bộ - từ draft.txt
          for (let i = 0; i < 5; i++) {
            if (parent.parentElement && parent.parentElement.tagName === 'LI') {
              parent = parent.parentElement;
              break;
            }
            if (parent.parentElement) {
              parent = parent.parentElement;
            }
          }
          
          if (parent.tagName === 'LI' && parent.parentNode) {
            parent.remove();
            removedCount++;
          } else if (link.style.display !== 'none') {
            link.style.display = 'none';
            removedCount++;
          }
        });
      });

      if (removedCount > 0) {
        log(`Đã ẩn ${removedCount} nút Marketplace`);
      }
    }

    // Ẩn sidebar phải (contacts, sponsored) - cải tiến từ draft.txt
    function hideRightSidebarItems() {
      if (!isHomePage() || !ctx.settings?.expandNewsFeed) return;

      // Ẩn theo tiêu đề - từ draft.txt
      document.querySelectorAll('h3').forEach(h3 => {
        if (h3.textContent) {
          const hasKeyword = rightSidebarKeywords.some(keyword => 
            h3.textContent.includes(keyword)
          );
          
          if (hasKeyword) {
            let parent = h3;
            // Tìm container parent phù hợp - từ draft.txt
            for (let i = 0; i < 6; i++) {
              if (parent.parentElement) {
                parent = parent.parentElement;
              }
            }
            
            if (parent && parent.offsetWidth > 200 && parent.style.display !== 'none') {
              parent.style.display = 'none';
              log('Đã ẩn section sidebar phải: ' + h3.textContent.substring(0, 30));
            }
          }
        }
      });

      // Ẩn [role="complementary"] cải tiến từ draft.txt
      const complementary = document.querySelector('[role="complementary"]');
      if (complementary && complementary.parentElement && isHomePage()) {
        // Kiểm tra không phải trang post - từ draft.txt
        const isPostPage = location.href.includes('/photo') ||
                          location.href.includes('fbid=') ||
                          location.href.includes('/posts/') ||
                          location.href.includes('/permalink/');
        
        if (isPostPage) return; // Không xóa ở trang post
        
        const sidebarText = complementary.textContent || '';
        const contactKeywords = ['聯絡人', '联系人', '群組聊天室', '群聊', 'Contacts', 'Group conversations'];
        const isContactSidebar = contactKeywords.some(kw => sidebarText.includes(kw));
        
        if (isContactSidebar) {
          complementary.parentElement.removeChild(complementary);
          log('Đã xóa sidebar contacts/sponsored');
        }
      }
    }

    // Ẩn footer và policy links - từ draft.txt
    function hideFooterAndPolicies() {
      if (!isHomePage() || !ctx.settings?.expandNewsFeed) return;

      const policyKeywords = [
        'Chính sách quyền riêng tư', 'Điều khoản dịch vụ', 'Quảng cáo',
        '隱私政策', '服務條款', '廣告', 'Privacy Policy', 'Terms', 
        'Ad Choices', 'Cookie', 'Meta © 2025'
      ];

      // Ẩn footer elements - từ draft.txt
      const footerSelectors = ['footer', 'div[role="contentinfo"]'];
      footerSelectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(el => {
          if (el.style.display !== 'none') {
            el.style.display = 'none';
          }
        });
      });

      // Ẩn policy containers - từ draft.txt
      document.querySelectorAll('footer, div[role="contentinfo"]').forEach(container => {
        const text = container.textContent;
        if (text && policyKeywords.some(keyword => text.includes(keyword))) {
          if (container.style.display !== 'none') {
            container.style.display = 'none';
          }
        }
      });
    }

    // Ẩn nút "Hiển thị thêm/ít" - từ draft.txt
    function removeMoreAndLessButtons() {
      if (!isHomePage() || !ctx.settings?.expandNewsFeed) return;

      document.querySelectorAll('[role="button"]').forEach(btn => {
        const spans = btn.querySelectorAll('span');
        for (const span of spans) {
          const text = span.textContent.trim().toLowerCase();
          if (moreKeywords.some(kw => text === kw.toLowerCase() || text.includes(kw.toLowerCase()))) {
            btn.style.display = 'none';
            break;
          }
          if (lessKeywords.some(kw => text === kw.toLowerCase() || text.includes(kw.toLowerCase()))) {
            btn.style.display = 'none';
            break;
          }
        }
      });
    }

    // Tự động expand "Hiển thị thêm" left sidebar - từ draft.txt
    function tryExpandLeftSidebar() {
      if (!isMainSidebarPage()) return;
      
      let found = false;
      const btns = Array.from(document.querySelectorAll('nav[role="navigation"] [role="button"], [role=navigation] [role="button"]'));
      
      for (const btn of btns) {
        if (btn.offsetParent === null) continue;
        const spans = btn.querySelectorAll('span');
        
        for (const span of spans) {
          const text = span.textContent.trim().toLowerCase();
          if (moreKeywords.some(kw => text === kw.toLowerCase() || text.includes(kw.toLowerCase()))) {
            btn.click(); // Mô phỏng click expand
            found = true;
            // Sau khi expand, ẩn nút "Hiển thị ít"
            setTimeout(removeMoreAndLessButtons, 800);
            log('Đã tự động expand left sidebar');
            break;
          }
        }
        if (found) break;
      }
    }

    // Tổng hợp tất cả cleanup functions
    function performCleanup() {
      if (!isHomePage() || !ctx.settings?.expandNewsFeed) return;

      try {
        hideLeftSidebarItems();
        hideMarketplaceButton();
        hideRightSidebarItems();
        hideFooterAndPolicies();
        removeMoreAndLessButtons();
        tryExpandLeftSidebar();
      } catch (error) {
        log(`Lỗi khi cleanup: ${error.message}`, 'error');
      }
    }

    // === DEBOUNCED FUNCTIONS ===

    // Debounced cleanup function - từ draft.txt
    function debouncedCleanup() {
      clearTimeout(cleanupTimer);
      cleanupTimer = setTimeout(() => {
        if (isHomePage()) {
          performCleanup();
        }
      }, 300);
    }

    // Đánh dấu các phần tử đã được mở rộng - đơn giản hóa
    function markExpandedElements() {
      if (!isHomePage() || !ctx.settings?.expandNewsFeed) {
        return;
      }

      const feedItems = document.querySelectorAll('div.x193iq5w.xvue9z.xq1tmr.x1ceravr:not(.fbcmf-expanded)');
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

    // === OBSERVER SETUP ===

    // Thiết lập MutationObserver cho cleanup - từ draft.txt
    function setupCleanupObserver() {
      if (!isHomePage() || !ctx.settings?.expandNewsFeed) {
        log('Không thiết lập cleanup observer: không ở trang chủ hoặc tính năng tắt');
        return;
      }

      cleanupObserver = new MutationObserver(debouncedCleanup);
      cleanupObserver.observe(document.body, { 
        childList: true, 
        subtree: true 
      });

      log('✅ Đã thiết lập cleanup observer');
    }

    // Thiết lập MutationObserver cho expansion - đơn giản hóa
    function setupExpansionObserver() {
      if (!isHomePage() || !ctx.settings?.expandNewsFeed) {
        return;
      }

      mutationObserver = new MutationObserver(() => {
        if (!isHomePage()) return;
        
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(markExpandedElements, 200);
      });
      
      mutationObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: false,
        characterData: false
      });

      log('✅ Đã thiết lập expansion observer');
    }

    // Hủy Observers
    function disconnectObservers() {
      if (mutationObserver) {
        mutationObserver.disconnect();
        mutationObserver = null;
        log('Đã ngắt kết nối expansion observer');
      }
      
      if (cleanupObserver) {
        cleanupObserver.disconnect();
        cleanupObserver = null;
        log('Đã ngắt kết nối cleanup observer');
      }
    }

    // === MODULE ACTIVATION/DEACTIVATION ===

    // Kích hoạt module
    function activateModule() {
      if (isActive || !isHomePage()) {
        return;
      }

      try {
        isActive = true;
        
        // Áp dụng CSS expansion
        applyCSSExpansion();
        
        // Thực hiện cleanup
        performCleanup();
        
        // Đánh dấu elements hiện tại
        setTimeout(() => {
          markExpandedElements();
        }, 100);

        // Thiết lập observers
        setTimeout(() => {
          setupExpansionObserver();
          setupCleanupObserver();
        }, 200);

        log('✅ FeedExpander đã được kích hoạt');
      } catch (error) {
        log(`Lỗi khi kích hoạt module: ${error.message}`, 'error');
      }
    }

    // Hủy kích hoạt module
    function deactivateModule() {
      if (!isActive) {
        return;
      }

      try {
        isActive = false;
        
        // Clear timers
        if (debounceTimer) {
          clearTimeout(debounceTimer);
          debounceTimer = null;
        }

        if (cleanupTimer) {
          clearTimeout(cleanupTimer);
          cleanupTimer = null;
        }

        // Disconnect observers
        disconnectObservers();

        // Remove CSS
        removeCSSExpansion();

        // Remove classes
        document.querySelectorAll('.fbcmf-expanded').forEach(el => {
          el.classList.remove('fbcmf-expanded');
        });

        expandedCount = 0;
        log('✅ FeedExpander đã được hủy kích hoạt');

      } catch (error) {
        log(`Lỗi khi hủy kích hoạt module: ${error.message}`, 'error');
      }
    }

    // === URL MONITORING ===

    // Monitor URL changes
    function startUrlMonitoring() {
      currentPath = location.pathname + location.search;
      
      // Sử dụng popstate để detect navigation
      window.addEventListener('popstate', checkUrlChange);
      
      // Sử dụng pushState/replaceState override để detect programmatic navigation
      const originalPushState = history.pushState;
      const originalReplaceState = history.replaceState;
      
      history.pushState = function(...args) {
        originalPushState.apply(history, args);
        setTimeout(checkUrlChange, 100);
      };
      
      history.replaceState = function(...args) {
        originalReplaceState.apply(history, args);
        setTimeout(checkUrlChange, 100);
      };
      
      // Backup: periodic check mỗi 2 giây
      setInterval(checkUrlChange, 2000);
      
      log('✅ Đã bắt đầu monitor URL changes');
    }

    // === MAIN FUNCTIONS ===

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

        // Bắt đầu monitor URL
        startUrlMonitoring();

        // Chỉ kích hoạt nếu đang ở trang chủ
        if (isHomePage()) {
          activateModule();
        }

        log('✅ FeedExpander v4.3 đã khởi tạo thành công (fixed version)');

      } catch (error) {
        log(`Lỗi khi khởi tạo: ${error.message}`, 'error');
      }
    }

    // Hủy module và clean up
    function destroy() {
      try {
        deactivateModule();
        
        // Remove event listeners
        window.removeEventListener('popstate', checkUrlChange);
        
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

        if (!isHomePage()) {
          log('Không ở trang chủ, không thể mở rộng');
          return;
        }

        activateModule();
        log('✅ Đã thực hiện mở rộng và cleanup theo yêu cầu');

      } catch (error) {
        log(`Lỗi khi mở rộng: ${error.message}`, 'error');
      }
    }

    // Force cleanup ngay lập tức
    function cleanupNow() {
      try {
        if (!ctx.settings?.expandNewsFeed) {
          log('Tính năng bị tắt, không thể cleanup');
          return;
        }

        if (!isHomePage()) {
          log('Không ở trang chủ, không thể cleanup');
          return;
        }

        performCleanup();
        log('✅ Đã thực hiện cleanup theo yêu cầu');

      } catch (error) {
        log(`Lỗi khi cleanup: ${error.message}`, 'error');
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
      cleanupNow,
      getStats: () => ({
        expandedCount,
        isActive,
        hasCSSApplied: !!styleElement,
        currentPath,
        isHomePage: isHomePage(),
        version: '4.3.0'
      })
    };
  });
})();