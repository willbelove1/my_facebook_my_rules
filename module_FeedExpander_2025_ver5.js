/**
 * Module: FeedExpander
 * Mục đích: Mở rộng news feed và làm sạch giao diện Facebook
 * Phiên bản: 4.1.0
 * Tích hợp: FBCMF framework
 * Tính năng: Mở rộng feed + Ẩn Marketplace + Làm sạch sidebar
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
    let cleanupTimer = null;
    let styleElement = null;

    // Tối ưu log dựa trên verbosity
    function log(message, level = 'verbose') {
      if (ctx.settings?.verbosity === 'verbose' || level === 'error') {
        console[level === 'error' ? 'error' : 'log'](`[FeedExpander v4.1] ${message}`);
      }
    }

    log('Khởi tạo với context: ' + Object.keys(ctx).join(', '));

    // === PHẦN MỚI: CLEANUP FUNCTIONS ===
    
    // Danh sách các từ khóa cần ẩn trong sidebar trái (đa ngôn ngữ)
    const leftSidebarKeywords = [
      // Tiếng Việt
      'Marketplace', 'Chợ', 'Mua bán', 'Kỷ niệm', 'Đã lưu', 'Tin nhắn trẻ em',
      'Chơi game', 'Hoạt động quảng cáo gần đây', 'Đơn hàng và thanh toán',
      'Trung tâm khoa học khí hậu', 'Chiến dịch gây quỹ', 'Quản lý quảng cáo',
      // Tiếng Trung (Phồn thể)
      '動態回顧', '我的珍藏', '我的收藏', 'Marketplace', '兒童版 Messenger',
      '玩遊戲', '近期廣告動態', '訂單和付款', '氣候科學中心', '募款活動', '籌款活動',
      '廣告管理員', 'Meta Quest 3S',
      // Tiếng Trung (Giản thể)
      '那年今天', '收藏夹', '广告管理工具', '气候科学中心',
      '订单与支付', '玩游戏', '近期广告动态', '筹款活动', 'Messenger 少儿版',
      // Tiếng Anh
      'Memories', 'Saved', 'Messenger Kids', 'Gaming', 'Play games', 
      'Recent ad activity', 'Orders and payments', 'Climate Science Center', 
      'Fundraisers', 'Ads Manager'
    ];

    // Danh sách từ khóa sidebar phải
    const rightSidebarKeywords = [
      'Được tài trợ', 'Liên hệ', 'Cuộc trò chuyện nhóm',
      '贊助', '赞助内容', '聯絡人', '联系人', '群組聊天室', '群聊',
      'Sponsored', 'Contacts', 'Group conversations'
    ];

    // Ẩn các mục trong sidebar trái theo text content
    function hideLeftSidebarItems() {
      if (!ctx.settings?.expandNewsFeed) return;

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

    // Ẩn Marketplace button cụ thể
    function hideMarketplaceButton() {
      if (!ctx.settings?.expandNewsFeed) return;

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
          // Tìm element cha là LI để remove toàn bộ
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

    // Ẩn sidebar phải (contacts, sponsored)
    function hideRightSidebarItems() {
      if (!ctx.settings?.expandNewsFeed) return;

      // Ẩn theo tiêu đề
      document.querySelectorAll('h3').forEach(h3 => {
        if (h3.textContent) {
          const hasKeyword = rightSidebarKeywords.some(keyword => 
            h3.textContent.includes(keyword)
          );
          
          if (hasKeyword) {
            let parent = h3;
            // Tìm container parent phù hợp
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

      // Ẩn [role="complementary"] nếu chứa contacts
      const complementary = document.querySelector('[role="complementary"]');
      if (complementary && complementary.parentElement) {
        // Kiểm tra xem có phải trang post không
        const isPostPage = location.href.includes('/photo') ||
                          location.href.includes('fbid=') ||
                          location.href.includes('/posts/') ||
                          location.href.includes('/permalink/');
        
        if (!isPostPage) {
          const sidebarText = complementary.textContent || '';
          const isContactSidebar = rightSidebarKeywords.some(kw => sidebarText.includes(kw));
          
          if (isContactSidebar) {
            complementary.parentElement.removeChild(complementary);
            log('Đã xóa sidebar contacts/sponsored');
          }
        }
      }
    }

    // Ẩn footer và policy links
    function hideFooterAndPolicies() {
      if (!ctx.settings?.expandNewsFeed) return;

      const policyKeywords = [
        'Chính sách quyền riêng tư', 'Điều khoản dịch vụ', 'Quảng cáo',
        '隱私政策', '服務條款', '廣告', 'Privacy Policy', 'Terms', 
        'Ad Choices', 'Cookie', 'Meta © 2025'
      ];

      // Ẩn footer elements
      const footerSelectors = ['footer', 'div[role="contentinfo"]'];
      footerSelectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(el => {
          if (el.style.display !== 'none') {
            el.style.display = 'none';
          }
        });
      });

      // Ẩn policy containers
      document.querySelectorAll('footer, div[role="contentinfo"]').forEach(container => {
        const text = container.textContent;
        if (text && policyKeywords.some(keyword => text.includes(keyword))) {
          if (container.style.display !== 'none') {
            container.style.display = 'none';
          }
        }
      });
    }

    // Tổng hợp tất cả cleanup functions
    function performCleanup() {
      if (!ctx.settings?.expandNewsFeed) return;

      try {
        hideLeftSidebarItems();
        hideMarketplaceButton();
        hideRightSidebarItems();
        hideFooterAndPolicies();
      } catch (error) {
        log(`Lỗi khi cleanup: ${error.message}`, 'error');
      }
    }

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

    // Debounced cleanup function
    function debouncedCleanup() {
      clearTimeout(cleanupTimer);
      cleanupTimer = setTimeout(() => {
        performCleanup();
      }, 300);
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
      mutationObserver = new MutationObserver((mutations) => {
        // Kiểm tra có mutation liên quan đến feed expansion không
        let needsExpansion = false;
        let needsCleanup = false;

        mutations.forEach(mutation => {
          if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
            mutation.addedNodes.forEach(node => {
              if (node.nodeType === Node.ELEMENT_NODE) {
                // Kiểm tra có feed items mới không
                if (node.querySelector?.('.x193iq5w') || node.classList?.contains('x193iq5w')) {
                  needsExpansion = true;
                }
                // Kiểm tra có navigation/sidebar items mới không
                if (node.querySelector?.('nav, [role="navigation"], [role="complementary"]') || 
                    node.matches?.('nav, [role="navigation"], [role="complementary"]')) {
                  needsCleanup = true;
                }
              }
            });
          }
        });

        if (needsExpansion) {
          debouncedExpansion();
        }
        if (needsCleanup) {
          debouncedCleanup();
        }
      });
      
      mutationObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: false,
        characterData: false
      });

      log('✅ Đã thiết lập MutationObserver tối ưu với cleanup detection');
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
        
        // Cleanup sidebar ngay lập tức
        performCleanup();
        
        // Đánh dấu các phần tử hiện có
        setTimeout(() => {
          markExpandedElements();
        }, 100);

        // Thiết lập observer sau khi CSS đã được áp dụng
        setTimeout(() => {
          setupOptimizedObserver();
        }, 500);

        log('✅ FeedExpander v4.1 đã khởi tạo thành công (với cleanup)');

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

        if (cleanupTimer) {
          clearTimeout(cleanupTimer);
          cleanupTimer = null;
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
        performCleanup(); // Thêm cleanup khi expand now
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
        isActive: !!mutationObserver,
        hasCSSApplied: !!styleElement,
        version: '4.1.0'
      })
    };
  });
})();