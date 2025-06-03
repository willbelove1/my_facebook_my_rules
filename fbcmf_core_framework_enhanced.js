

/**
 * FBCMF - Facebook Cleaner Modular Framework (Core)
 * Kiến trúc mở rộng (Extensible Architecture) cho các module gắn thêm
 * Phiên bản: 1.3.0 (Delegates settings to SettingsManager using GM Storage)
 */
(function () {
  'use strict';

  // Khởi tạo namespace global
  window.FBCMF = window.FBCMF || {};
  
  // Đảm bảo các thuộc tính cơ bản tồn tại
  window.FBCMF.modules = window.FBCMF.modules || new Map();
  window.FBCMF.settings = window.FBCMF.settings || {}; // Will be populated by SettingsManager
  window.FBCMF.context = window.FBCMF.context || {};
  window.FBCMF.initialized = window.FBCMF.initialized || false;

  // Mở rộng namespace
  Object.assign(window.FBCMF, {
    // Đăng ký mô-đun mới
    registerModule(name, moduleFn) {
      if (typeof moduleFn !== 'function') {
        console.warn(`[FBCMF] Module "${name}" không hợp lệ.`);
        return;
      }
      this.modules.set(name, moduleFn);
      // Logging verbosity depends on settings loaded later
      // console.log(`[FBCMF] Module "${name}" đã đăng ký.`); 
    },

    // REMOVED: saveSettings - Now handled exclusively by SettingsManager via context
    // REMOVED: loadSettings - Now handled exclusively by SettingsManager via context

    // Khởi tạo framework chính (Asynchronous)
    async init() {
      // Kiểm tra DOM đã sẵn sàng chưa
      if (!document.head || !document.body) {
        console.warn('[FBCMF] DOM chưa sẵn sàng, thử lại sau 1s');
        setTimeout(() => this.init(), 1000);
        return;
      }
      
      // Kiểm tra đã khởi tạo chưa để tránh khởi tạo nhiều lần
      if (this.initialized) {
        console.log('[FBCMF] Framework đã được khởi tạo trước đó.');
        return;
      }
      
      console.log('[FBCMF] 🚀 Initializing Core Framework...');

      // 1. Khởi tạo ngữ cảnh chung ban đầu (settings sẽ được thêm sau bởi SettingsManager)
      this.context = {
        DOMUtils: this.DOMUtils,
        // settings: {}, // Placeholder, will be populated by SettingsManager
        // saveSettings: async () => { console.warn("SettingsManager not loaded yet"); return false; },
        // loadSettings: async () => { console.warn("SettingsManager not loaded yet"); return {}; },
      };
      console.log('[FBCMF] Context ban đầu đã khởi tạo.');

      // 2. Chạy SettingsManager TRƯỚC TIÊN để tải cài đặt và cung cấp API
      const settingsManagerName = 'SettingsManager';
      if (this.modules.has(settingsManagerName)) {
        try {
          console.log(`[FBCMF] Đang khởi tạo core module "${settingsManagerName}"...`);
          // SettingsManager is async, loads settings, and returns its API
          const settingsAPI = await this.modules.get(settingsManagerName)(this.context);
          
          // Cập nhật context với API và settings đã tải từ SettingsManager
          if (settingsAPI && typeof settingsAPI === 'object') {
            // Merge the returned API (load, save, export, import, getCurrentSettings) into context
            Object.assign(this.context, settingsAPI);
            // Crucially, update context.settings with the *actually loaded* settings
            this.context.settings = settingsAPI.getCurrentSettings ? settingsAPI.getCurrentSettings() : {}; 
            // Update the global FBCMF.settings as well for potential legacy access (though context is preferred)
            window.FBCMF.settings = this.context.settings;
            console.log(`[FBCMF] ✅ Core module "${settingsManagerName}" loaded. Context updated.`);
            if (this.context.settings?.verbosity === 'verbose') {
               console.log('[FBCMF] Verbose logging enabled.');
               console.log('[FBCMF] Context keys after SettingsManager:', Object.keys(this.context));
            }
          } else {
             console.error(`[FBCMF] ❌ Core module "${settingsManagerName}" did not return a valid API object.`);
             // Fallback or error handling needed if settings can't load
             this.context.settings = {}; // Ensure context.settings exists
          }
        } catch (e) {
          console.error(`[FBCMF] ❌ Core module "${settingsManagerName}" failed:`, e);
          this.context.settings = {}; // Ensure context.settings exists even on error
        }
      } else {
        console.error(`[FBCMF] ❌ Critical Error: Core module "${settingsManagerName}" không được tìm thấy. Cannot load settings.`);
        // Cannot proceed without settings manager
        return; 
      }

      // 3. Chạy các module core khác (trừ SettingsManager đã chạy)
      const coreModules = ['FilterRegistry', 'UIManager']; // Removed SettingsManager
      for (const coreName of coreModules) {
        if (this.modules.has(coreName)) {
          try {
            if (this.context.settings?.verbosity === 'verbose') {
               console.log(`[FBCMF] Đang khởi tạo core module "${coreName}"...`);
            }
            // Pass the now populated context (with settings and APIs)
            const result = await this.modules.get(coreName)(this.context);
            if (result && typeof result === 'object') {
              this.context[coreName] = result;
               if (this.context.settings?.verbosity === 'verbose') {
                  console.log(`[FBCMF] Đã thêm ${coreName} vào context`);
               }
            }
             if (this.context.settings?.verbosity === 'verbose') {
                console.log(`[FBCMF] ✅ Core module "${coreName}" loaded.`);
             }
          } catch (e) {
            console.error(`[FBCMF] ❌ Core module "${coreName}" failed:`, e);
          }
        } else {
          console.warn(`[FBCMF] Core module "${coreName}" không được tìm thấy.`);
        }
      }
      
      // 4. Sau đó chạy các module còn lại
      for (const [name, moduleFn] of this.modules.entries()) {
        // Skip core modules already loaded
        if (name !== settingsManagerName && !coreModules.includes(name)) {
          try {
             if (this.context.settings?.verbosity === 'verbose') {
                console.log(`[FBCMF] Đang khởi tạo module "${name}"...`);
             }
            const result = await moduleFn(this.context);
            if (result && typeof result === 'object') {
              this.context[name] = result;
               if (this.context.settings?.verbosity === 'verbose') {
                  console.log(`[FBCMF] Đã thêm ${name} vào context`);
               }
            }
             if (this.context.settings?.verbosity === 'verbose') {
                console.log(`[FBCMF] ✅ Module "${name}" loaded.`);
             }
          } catch (e) {
            console.error(`[FBCMF] ❌ Module "${name}" failed:`, e);
          }
        }
      }

      // Đánh dấu đã khởi tạo
      this.initialized = true;
      console.log('[FBCMF] ✅ All modules initialized.');
      
      // Kích hoạt sự kiện framework-initialized
      document.dispatchEvent(new CustomEvent('fbcmf:framework-initialized'));
    },

    // Tiện ích DOM (No changes needed here)
    DOMUtils: {
      query(selector, context = document) {
        return Array.from(context.querySelectorAll(selector));
      },
      hideElement(el, reason = 'hidden') {
        if (!el || el.dataset.fbcmfHidden) return;
        el.dataset.fbcmfHidden = reason;
        el.style.transition = 'opacity 0.3s';
        el.style.opacity = '0.2';
        // Consider making hiding immediate if transition causes issues
        // el.style.display = 'none'; 
        setTimeout(() => { if (el) el.style.display = 'none'; }, 300);
      },
      createElement(tag, attributes = {}, children = []) {
        const element = document.createElement(tag);
        for (const [key, value] of Object.entries(attributes)) {
          if (key === 'style' && typeof value === 'object') {
            Object.assign(element.style, value);
          } else if (key === 'className') {
            element.className = value;
          } else if (key === 'innerHTML') {
            element.innerHTML = value;
          } else if (key === 'textContent') {
            element.textContent = value;
          } else if (key.startsWith('on') && typeof value === 'function') {
            element.addEventListener(key.substring(2).toLowerCase(), value);
          } else {
            element.setAttribute(key, value);
          }
        }
        for (const child of children) {
          if (typeof child === 'string') {
            element.appendChild(document.createTextNode(child));
          } else if (child instanceof Node) {
            element.appendChild(child);
          }
        }
        return element;
      }
    },
    
    // Hàm dọn dẹp feed (Updated to use context reliably)
    cleanFeed() {
       if (this.context.settings?.verbosity === 'verbose') {
          console.log('[FBCMF] Attempting to clean feed...');
       }
      
      // Check if context and necessary modules/settings are loaded
      if (!this.context || !this.context.settings) {
          console.warn('[FBCMF] Cannot clean feed: Context or settings not available.');
          return false;
      }

      // Prioritize MutationObserver if available
      if (this.context.MutationObserver && typeof this.context.MutationObserver.processNewPosts === 'function') {
         if (this.context.settings?.verbosity === 'verbose') {
             console.log('[FBCMF] Using MutationObserver.processNewPosts()');
         }
        // Assuming processNewPosts uses context internally for settings
        this.context.MutationObserver.processNewPosts(); 
        return true;
      }
      
      // Fallback to manual cleaning with FilterRegistry
      if (this.context.FilterRegistry && typeof this.context.FilterRegistry.apply === 'function') {
         if (this.context.settings?.verbosity === 'verbose') {
             console.log('[FBCMF] Fallback: Cleaning manually with FilterRegistry');
         }
        // Ensure DOMUtils is available via context or this
        const domUtils = this.context.DOMUtils || this.DOMUtils;
        const posts = domUtils.query('div[role="article"], div[role="feed"] > div');
        let hiddenCount = 0;
        
        posts.forEach(post => {
          // Pass the current settings from the context
          const reason = this.context.FilterRegistry.apply(post, this.context.settings);
          if (reason) {
            domUtils.hideElement(post, reason);
            hiddenCount++;
          }
        });
        
         if (this.context.settings?.verbosity === 'verbose') {
            console.log(`[FBCMF] Manually hid ${hiddenCount} posts.`);
         }
        return hiddenCount > 0;
      }
      
      console.warn('[FBCMF] Cannot clean feed: Neither MutationObserver nor FilterRegistry seem properly initialized in context.');
      return false;
    }
  });

  // Tự khởi chạy nếu không phải module riêng lẻ
  if (!window.__FBCMF_SKIP_INIT__) {
    // Use appropriate event listener based on environment
    if (document.readyState === 'loading') {
      // DOMContentLoaded is generally reliable
      document.addEventListener('DOMContentLoaded', () => window.FBCMF.init());
    } else {
      // If DOM is already ready, init with a slight delay to ensure other scripts might load
      setTimeout(() => window.FBCMF.init(), 100); 
    }
  }

})();

