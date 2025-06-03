

/**
 * Module: SettingsManager (Fixed for Violentmonkey)
 * Mục đích: Cung cấp API lưu trữ/lấy cài đặt sử dụng GM_setValue/GM_getValue, hỗ trợ import/export
 * Yêu cầu: @grant GM_setValue, @grant GM_getValue trong script chính.
 */
FBCMF.registerModule('SettingsManager', async (ctx) => {
  const storageKey = 'fbcmf-settings'; // Key for GM storage
  const defaults = {
    blockSponsored: true,
    blockSuggested: true,
    blockReels: true,
    blockGIFs: true,
    blockKeywords: false,
    expandNewsFeed: true,
    verbosity: 'normal',
    language: 'vi',
    blockedKeywords: [],
    // Add other potential default settings here if needed
    theme: 'light', // Default theme from UIManager
    videoAdBlocker: false,
    showAllComments: false,
    autoDetectComments: false,
    notifyComments: false,
    scrollComments: false,
    hideAnonymous: false,
    autoSortChrono: false,
    autoSuggestKeywords: false,
    geminiApiKey: '',
  };

  // Asynchronous function to load settings from GM storage
  async function load() {
    try {
      const raw = await GM_getValue(storageKey, null);
      const loadedSettings = raw ? JSON.parse(raw) : {};
      // Merge defaults with loaded settings to ensure all keys exist
      const finalSettings = { ...defaults, ...loadedSettings };
      if (ctx.settings?.verbosity === 'verbose') {
         console.log('[FBCMF Settings] Settings loaded:', finalSettings);
      }
      return finalSettings;
    } catch (e) {
      console.error('[FBCMF Settings] Error loading settings from GM_getValue:', e);
      // Return defaults in case of error
      return { ...defaults };
    }
  }

  // Asynchronous function to save settings to GM storage
  async function save(newSettings) {
    try {
      // Merge with current settings and ensure defaults are considered
      // Important: Load current settings first to not lose unrelated keys
      const currentSettings = FBCMF.settings || defaults; 
      const dataToSave = { ...currentSettings, ...newSettings };
      
      // Ensure we don't save undefined values that might come from checkboxes
      for (const key in dataToSave) {
        if (dataToSave[key] === undefined) {
           // Fallback to default if a key becomes undefined unexpectedly
           dataToSave[key] = defaults[key]; 
        }
      }

      await GM_setValue(storageKey, JSON.stringify(dataToSave));
      FBCMF.settings = dataToSave; // Update global settings object
      if (ctx.settings?.verbosity === 'verbose') {
        console.log('[FBCMF Settings] Settings saved:', dataToSave);
      }
      // Notify other modules if needed (optional, can be done via framework event)
      document.dispatchEvent(new CustomEvent('fbcmf:settings-saved', { detail: dataToSave }));
      return true; // Indicate success
    } catch (e) {
      console.error('[FBCMF Settings] Error saving settings with GM_setValue:', e);
      // Optionally notify user about the save failure
      // alert('❌ Error saving settings. Check browser console for details.');
      return false; // Indicate failure
    }
  }

  // Export settings (remains synchronous, exports current state)
  function exportSettings() {
    // Ensure FBCMF.settings is up-to-date before exporting
    return JSON.stringify(FBCMF.settings || defaults, null, 2);
  }

  // Import settings (becomes asynchronous due to save call)
  async function importSettings(jsonStr) {
    try {
      const obj = JSON.parse(jsonStr);
      const success = await save(obj); // Use the async save function
      if (success) {
        alert('✅ Nhập cài đặt thành công. Tải lại trang để áp dụng đầy đủ!');
        // Consider if reload is always necessary or if settings can be applied dynamically
        location.reload(); 
      } else {
         alert('❌ Lỗi khi lưu cài đặt đã nhập.');
      }
    } catch (e) {
      console.error('[FBCMF Settings] Error importing settings:', e);
      alert('❌ Lỗi khi nhập cài đặt. Kiểm tra định dạng JSON và console.');
    }
  }

  // --- Initialization within the module --- 
  console.log('[SettingsManager] Initializing and loading settings...');
  // Load settings asynchronously and update the global object
  FBCMF.settings = await load(); 
  console.log('[SettingsManager] Initial settings loaded:', FBCMF.settings);

  // Attach the updated async functions to the context
  // Note: load() returns the loaded settings directly now
  ctx.loadSettings = load; // Provides the async load function
  ctx.saveSettings = save; // Provides the async save function
  ctx.exportSettings = exportSettings; // Remains sync
  ctx.importSettings = importSettings; // Becomes async
  // Also provide direct access to the current settings state via context
  ctx.settings = FBCMF.settings; 

  console.log('[SettingsManager] ✅ Đã sẵn sàng (sử dụng GM Storage).');
  
  // Return the API for the framework to potentially add to context
  return {
      loadSettings: load,
      saveSettings: save,
      exportSettings: exportSettings,
      importSettings: importSettings,
      getCurrentSettings: () => FBCMF.settings // Function to get current state synchronously
  };
});

