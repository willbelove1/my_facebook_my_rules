// ==UserScript==
// @name         FBCMF UIManager (Enhanced + GM Storage Fix + Reload)
// @namespace    http://tampermonkey.net/
// @version      2.2.0
// @description  Manages UI, uses SettingsManager context for GM storage, reloads on save.
// @match        *://*.facebook.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @require      https://cdn.jsdelivr.net/npm/@google/generative-ai@0.1.3/dist/index.js 
// ==/UserScript==

/**
 * Module: UIManager (Nâng cấp + Fix GM Storage + Reload)
 * Mục đích: Quản lý giao diện người dùng, sử dụng ctx.saveSettings (async) để lưu, tự động tải lại trang sau khi lưu.
 * Phiên bản: 2.2.0 (Thêm reload on save)
 */
(function() {
  "use strict";

  // Đảm bảo namespace FBCMF đã được khởi tạo
  window.FBCMF = window.FBCMF || {};

  FBCMF.registerModule = FBCMF.registerModule || function(name, initFn) {
    if (!FBCMF.modules) FBCMF.modules = new Map(); // Use Map consistently
    FBCMF.modules.set(name, initFn);
  };

  FBCMF.registerModule("UIManager", async (ctx) => {
    // Check if context and settings are available
    if (!ctx || !ctx.settings || !ctx.saveSettings || !ctx.loadSettings) {
        console.error("[UIManager] Critical Error: Context (ctx), ctx.settings, ctx.saveSettings, or ctx.loadSettings is missing. Cannot initialize UI.");
        return; 
    }

    // Tối ưu log dựa trên verbosity
    function log(message, level = "verbose") {
      // Use optional chaining as settings might not be fully loaded initially
      if (ctx.settings?.verbosity === "verbose" || level === "error") {
        console[level === "error" ? "error" : "log"](`[UIManager] ${message}`);
      }
    }

    log("Initializing with context keys: " + Object.keys(ctx).join(", "));
    log("Initial settings from context: " + JSON.stringify(ctx.settings));

    // Tham chiếu đến các phần tử UI
    let settingsPopup = null;
    let settingsButton = null;
    let advancedSettingsButton = null;
    let themeSelector = null;
    // Use theme from context, fallback to light if undefined
    let currentTheme = ctx.settings?.theme || "light"; 

    // --- Language Labels (No changes needed) --- 
    const LABELS = {
      en: {
        settings: "Settings",
        cleanNow: "Clean Feed Now",
        advancedSettings: "Advanced Settings",
        saveSettings: "Save Settings",
        enableAll: "Enable All",
        disableAll: "Disable All",
        blockSponsored: "Block sponsored posts",
        blockSuggested: "Block suggested posts",
        blockReels: "Block Reels videos",
        blockGIFs: "Block GIFs",
        blockKeywords: "Block posts with keywords",
        expandNewsFeed: "Expand news feed width",
        hideAnonymous: "Hide anonymous members",
        autoSortChrono: "Auto sort by chronological order",
        showAllComments: "Show all comments by default",
        autoDetectComments: "Auto detect comments",
        notifyComments: "Notify after comment action",
        scrollComments: "Enable scroll effect for comments",
        autoSuggestKeywords: "Auto suggest keywords with AI",
        keywordsToBlock: "Keywords to block (comma separated)",
        language: "Language",
        theme: "Theme",
        dark: "Dark",
        light: "Light",
        verbosity: "Log level",
        minimal: "Minimal",
        verbose: "Verbose",
        geminiApiKey: "Gemini API Key",
        suggestKeywords: "Suggest Keywords with AI",
        settingsSaved: "✅ Settings saved successfully!",
        settingsSavedReloading: "✅ Settings saved! Reloading page...", // New label for reloading
        settingsSaveError: "❌ Error saving settings. Check console.", // Changed label
        settingsError: "❌ Error saving settings: ", // Keep for potential direct error display
        aiUnavailable: "❌ AI feature unavailable",
        importSettings: "Import Settings",
        exportSettings: "Export Settings",
        importSuccess: "✅ Settings imported successfully. Reloading page...",
        importError: "❌ Error importing settings. Check JSON format and console.",
        exportInstructions: "Copy the JSON below to back up your settings."
      },
      vi: {
        settings: "Cài đặt",
        cleanNow: "Dọn bảng tin ngay",
        advancedSettings: "Cài đặt nâng cao",
        saveSettings: "Lưu cài đặt",
        enableAll: "Bật tất cả",
        disableAll: "Tắt tất cả",
        blockSponsored: "Chặn bài được tài trợ",
        blockSuggested: "Chặn bài gợi ý",
        blockReels: "Chặn video Reels",
        blockGIFs: "Chặn GIFs",
        blockKeywords: "Chặn bài có từ khóa",
        expandNewsFeed: "Mở rộng khung bài viết",
        hideAnonymous: "Ẩn thành viên ẩn danh",
        autoSortChrono: "Tự động sắp xếp theo thời gian",
        showAllComments: "Hiện tất cả bình luận mặc định",
        autoDetectComments: "Tự động phát hiện bình luận",
        notifyComments: "Thông báo sau thao tác bình luận",
        scrollComments: "Bật hiệu ứng cuộn cho bình luận",
        autoSuggestKeywords: "Tự động gợi ý từ khóa bằng AI",
        keywordsToBlock: "Từ khóa chặn (phân cách bằng dấu phẩy)",
        language: "Ngôn ngữ",
        theme: "Giao diện",
        dark: "Tối",
        light: "Sáng",
        verbosity: "Mức độ log",
        minimal: "Tối thiểu",
        verbose: "Chi tiết",
        geminiApiKey: "API Key Gemini",
        suggestKeywords: "Gợi ý từ khóa bằng AI",
        settingsSaved: "✅ Cài đặt đã được lưu thành công!",
        settingsSavedReloading: "✅ Đã lưu! Đang tải lại trang...", // New label for reloading
        settingsSaveError: "❌ Lỗi khi lưu cài đặt. Kiểm tra console.", // Changed label
        settingsError: "❌ Lỗi khi lưu cài đặt: ", // Keep for potential direct error display
        aiUnavailable: "❌ Tính năng AI không khả dụng",
        importSettings: "Nhập Cài đặt",
        exportSettings: "Xuất Cài đặt",
        importSuccess: "✅ Nhập cài đặt thành công. Đang tải lại trang...",
        importError: "❌ Lỗi khi nhập cài đặt. Kiểm tra định dạng JSON và console.",
        exportInstructions: "Sao chép đoạn JSON dưới đây để sao lưu cài đặt của bạn."
      }
    };

    // Lấy chuỗi ngôn ngữ
    function getLabel(key) {
      // Ensure settings are loaded before accessing language
      const lang = ctx.settings?.language || "vi";
      return LABELS[lang]?.[key] || LABELS["en"][key] || key;
    }

    // --- CSS (No changes needed, assuming theme is correctly read) --- 
    const darkThemeCSS = `
      #fbcmf-settings-popup {
        position: fixed;
        bottom: 20px;
        right: 20px;
        background-color: #242526;
        color: #e4e6eb;
        border-radius: 8px;
        padding: 15px;
        max-width: 350px; /* Slightly wider */
        min-width: 300px;
        max-height: 85vh; /* Slightly taller */
        overflow-y: auto;
        z-index: 9999;
        font-family: Segoe UI, Arial, sans-serif; /* Better font */
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.6);
        border: 1px solid #3e4042;
        font-size: 14px;
      }
      #fbcmf-settings-popup h3 {
        margin-top: 0;
        margin-bottom: 15px;
        font-size: 18px;
        border-bottom: 1px solid #3e4042;
        padding-bottom: 8px;
        color: #e4e6eb;
      }
      #fbcmf-settings-popup label {
        display: flex; /* Use flex for alignment */
        align-items: center; /* Vertically align checkbox and text */
        margin-bottom: 12px; /* Increased spacing */
        font-size: 14px;
        cursor: pointer; /* Make label clickable */
      }
       #fbcmf-settings-popup label input[type="checkbox"] {
        margin-right: 10px; /* Increased spacing */
        vertical-align: middle; /* Keep for fallback */
        width: 16px; /* Explicit size */
        height: 16px;
        accent-color: #4267b2; /* Theme checkbox */
      }
      #fbcmf-settings-popup input[type="text"],
      #fbcmf-settings-popup select,
      #fbcmf-settings-popup textarea { /* Added textarea */
        width: 100%;
        padding: 8px 10px; /* Increased padding */
        margin-top: 5px;
        margin-bottom: 10px;
        border-radius: 4px;
        border: 1px solid #555; /* Slightly lighter border */
        background-color: #3a3b3c;
        color: #e4e6eb;
        box-sizing: border-box; /* Include padding in width */
        font-size: 14px;
      }
      #fbcmf-settings-popup select {
         background-image: url("data:image/svg+xml,%3csvg xmlns=\'http://www.w3.org/2000/svg\'%3e%3cpath fill='none' stroke='%23e4e6eb' stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M2 5l6 6 6-6'/%3e%3c/svg%3e");
         background-repeat: no-repeat;
         background-position: right .7em top 50%;
         background-size: .8em auto;
         -webkit-appearance: none;
         -moz-appearance: none;
         appearance: none;
      }
      #fbcmf-settings-popup button {
        background-color: #4267b2;
        color: white;
        border: none;
        padding: 8px 15px; /* Adjusted padding */
        border-radius: 4px;
        cursor: pointer;
        margin-right: 8px;
        margin-top: 10px;
        font-size: 14px;
        transition: background-color 0.2s ease;
      }
      #fbcmf-settings-popup button:hover {
        background-color: #365899;
      }
       #fbcmf-settings-popup button.secondary {
         background-color: #4e4f50;
       }
       #fbcmf-settings-popup button.secondary:hover {
         background-color: #606162;
       }
      #fbcmf-settings-popup .fbcmf-button-row {
        display: flex;
        justify-content: space-between; /* Space out buttons */
        flex-wrap: wrap; /* Allow wrapping on small screens */
        gap: 8px; /* Add gap between buttons */
        margin-top: 15px;
      }
      #fbcmf-settings-popup .fbcmf-section {
        margin-bottom: 20px; /* Increased spacing */
        padding-bottom: 15px;
        border-bottom: 1px solid #3e4042;
      }
      #fbcmf-settings-popup .fbcmf-section:last-child {
          border-bottom: none; /* No border for the last section */
          margin-bottom: 0;
          padding-bottom: 0;
      }
      #fbcmf-settings-popup .fbcmf-section-title {
        font-weight: bold;
        margin-bottom: 12px;
        font-size: 15px;
        color: #aaa; /* Subtler title color */
      }
      #fbcmf-settings-popup .fbcmf-advanced-panel {
        display: none;
        margin-top: 15px;
        padding-top: 15px;
        border-top: 1px solid #3e4042;
      }
      #fbcmf-settings-popup .fbcmf-advanced-panel.active {
        display: block;
      }
      #fbcmf-suggestedKeywords {
        display: flex;
        flex-wrap: wrap;
        gap: 5px;
        margin-top: 10px;
      }
      #fbcmf-suggestedKeywords button {
        margin: 0;
        padding: 4px 8px;
        font-size: 12px;
        background-color: #3a3b3c;
        border: 1px solid #555;
      }
      #fbcmf-suggestedKeywords button:hover {
        background-color: #4e4f50;
      }
      #fbcmf-clean-button {
        position: fixed;
        bottom: 20px;
        right: 20px;
        background-color: #4267b2;
        color: white;
        border: none;
        padding: 10px 15px;
        border-radius: 50%; /* Make it round */
        cursor: pointer;
        font-size: 18px; /* Larger icon/text */
        z-index: 9998;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
        width: 50px; /* Fixed size */
        height: 50px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background-color 0.2s ease;
      }
      #fbcmf-clean-button:hover {
        background-color: #365899;
      }
      #fbcmf-status-message {
        margin-top: 15px;
        padding: 8px;
        border-radius: 4px;
        font-size: 13px;
        text-align: center;
        display: none; /* Hidden by default */
      }
      #fbcmf-status-message.success {
        background-color: #2e7d32; /* Green */
        color: white;
        display: block;
      }
      #fbcmf-status-message.error {
        background-color: #c62828; /* Red */
        color: white;
        display: block;
      }
      #fbcmf-export-area {
          width: 100%;
          min-height: 100px;
          font-family: monospace;
          font-size: 12px;
          resize: vertical;
      }
      #fbcmf-import-area {
          width: 100%;
          min-height: 100px;
          font-family: monospace;
          font-size: 12px;
          resize: vertical;
      }
    `;

    const lightThemeCSS = `
      #fbcmf-settings-popup {
        position: fixed;
        bottom: 20px;
        right: 20px;
        background-color: #ffffff;
        color: #1c1e21;
        border-radius: 8px;
        padding: 15px;
        max-width: 350px;
        min-width: 300px;
        max-height: 85vh;
        overflow-y: auto;
        z-index: 9999;
        font-family: Segoe UI, Arial, sans-serif;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        border: 1px solid #dddfe2;
        font-size: 14px;
      }
      #fbcmf-settings-popup h3 {
        margin-top: 0;
        margin-bottom: 15px;
        font-size: 18px;
        border-bottom: 1px solid #dddfe2;
        padding-bottom: 8px;
        color: #1c1e21;
      }
      #fbcmf-settings-popup label {
        display: flex;
        align-items: center;
        margin-bottom: 12px;
        font-size: 14px;
        cursor: pointer;
      }
      #fbcmf-settings-popup label input[type="checkbox"] {
        margin-right: 10px;
        vertical-align: middle;
        width: 16px;
        height: 16px;
        accent-color: #1877f2; /* FB Blue */
      }
      #fbcmf-settings-popup input[type="text"],
      #fbcmf-settings-popup select,
      #fbcmf-settings-popup textarea { /* Added textarea */
        width: 100%;
        padding: 8px 10px;
        margin-top: 5px;
        margin-bottom: 10px;
        border-radius: 4px;
        border: 1px solid #ccd0d5;
        background-color: #f0f2f5;
        color: #1c1e21;
        box-sizing: border-box;
        font-size: 14px;
      }
       #fbcmf-settings-popup select {
         background-image: url("data:image/svg+xml,%3csvg xmlns=\'http://www.w3.org/2000/svg\'%3e%3cpath fill='none' stroke='%231c1e21' stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M2 5l6 6 6-6'/%3e%3c/svg%3e");
         background-repeat: no-repeat;
         background-position: right .7em top 50%;
         background-size: .8em auto;
         -webkit-appearance: none;
         -moz-appearance: none;
         appearance: none;
      }
      #fbcmf-settings-popup button {
        background-color: #1877f2; /* FB Blue */
        color: white;
        border: none;
        padding: 8px 15px;
        border-radius: 4px;
        cursor: pointer;
        margin-right: 8px;
        margin-top: 10px;
        font-size: 14px;
        font-weight: bold;
        transition: background-color 0.2s ease;
      }
      #fbcmf-settings-popup button:hover {
        background-color: #166fe5;
      }
      #fbcmf-settings-popup button.secondary {
         background-color: #e4e6eb;
         color: #1c1e21;
       }
       #fbcmf-settings-popup button.secondary:hover {
         background-color: #d8dade;
       }
      #fbcmf-settings-popup .fbcmf-button-row {
        display: flex;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 15px;
      }
      #fbcmf-settings-popup .fbcmf-section {
        margin-bottom: 20px;
        padding-bottom: 15px;
        border-bottom: 1px solid #dddfe2;
      }
      #fbcmf-settings-popup .fbcmf-section:last-child {
          border-bottom: none;
          margin-bottom: 0;
          padding-bottom: 0;
      }
      #fbcmf-settings-popup .fbcmf-section-title {
        font-weight: bold;
        margin-bottom: 12px;
        font-size: 15px;
        color: #606770;
      }
      #fbcmf-settings-popup .fbcmf-advanced-panel {
        display: none;
        margin-top: 15px;
        padding-top: 15px;
        border-top: 1px solid #dddfe2;
      }
      #fbcmf-settings-popup .fbcmf-advanced-panel.active {
        display: block;
      }
      #fbcmf-suggestedKeywords {
        display: flex;
        flex-wrap: wrap;
        gap: 5px;
        margin-top: 10px;
      }
      #fbcmf-suggestedKeywords button {
        margin: 0;
        padding: 4px 8px;
        font-size: 12px;
        background-color: #e4e6eb;
        border: 1px solid #ccd0d5;
        color: #1c1e21;
      }
      #fbcmf-suggestedKeywords button:hover {
        background-color: #d8dade;
      }
      #fbcmf-clean-button {
        position: fixed;
        bottom: 20px;
        right: 20px;
        background-color: #1877f2;
        color: white;
        border: none;
        padding: 10px 15px;
        border-radius: 50%;
        cursor: pointer;
        font-size: 18px;
        z-index: 9998;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
        width: 50px;
        height: 50px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background-color 0.2s ease;
      }
      #fbcmf-clean-button:hover {
        background-color: #166fe5;
      }
      #fbcmf-status-message {
        margin-top: 15px;
        padding: 8px;
        border-radius: 4px;
        font-size: 13px;
        text-align: center;
        display: none; /* Hidden by default */
      }
      #fbcmf-status-message.success {
        background-color: #e8f5e9; /* Light Green */
        color: #1b5e20;
        border: 1px solid #a5d6a7;
        display: block;
      }
      #fbcmf-status-message.error {
        background-color: #ffebee; /* Light Red */
        color: #b71c1c;
        border: 1px solid #ef9a9a;
        display: block;
      }
       #fbcmf-export-area {
          width: 100%;
          min-height: 100px;
          font-family: monospace;
          font-size: 12px;
          resize: vertical;
          border-color: #ccd0d5;
          background-color: #f0f2f5;
      }
      #fbcmf-import-area {
          width: 100%;
          min-height: 100px;
          font-family: monospace;
          font-size: 12px;
          resize: vertical;
          border-color: #ccd0d5;
          background-color: #f0f2f5;
      }
    `;

    // Thêm CSS vào trang
    function addCSS() {
      const styleId = "fbcmf-style";
      let style = document.getElementById(styleId);
      if (!style) {
          style = document.createElement("style");
          style.id = styleId;
          document.head.appendChild(style);
      }
      // Use currentTheme which is initialized from ctx.settings
      style.textContent = currentTheme === "dark" ? darkThemeCSS : lightThemeCSS;
      log("Applied CSS for theme: " + currentTheme);
    }

    // Cập nhật theme (Called when theme changes in settings)
    function updateTheme(newTheme) {
        if (newTheme && newTheme !== currentTheme) {
            log(`Theme changed to: ${newTheme}`);
            currentTheme = newTheme;
            addCSS(); // Re-apply CSS with the new theme
        } else {
            addCSS(); // Ensure CSS is present on initial load
        }
    }

    // Tạo popup cài đặt
    function createSettingsPopup() {
      if (settingsPopup) return; // Prevent creating multiple popups

      settingsPopup = ctx.DOMUtils.createElement("div", { id: "fbcmf-settings-popup", style: { display: "none" } }, [
        ctx.DOMUtils.createElement("h3", {}, getLabel("settings")),
        // --- Basic Settings --- 
        ctx.DOMUtils.createElement("div", { className: "fbcmf-section" }, [
          ctx.DOMUtils.createElement("div", { className: "fbcmf-section-title" }, getLabel("settings")),
          createCheckbox("blockSponsored", getLabel("blockSponsored")),
          createCheckbox("blockSuggested", getLabel("blockSuggested")),
          createCheckbox("blockReels", getLabel("blockReels")),
          createCheckbox("blockGIFs", getLabel("blockGIFs")),
          createCheckbox("blockKeywords", getLabel("blockKeywords")),
          createInput("text", "keywordInput", getLabel("keywordsToBlock")),
          createCheckbox("expandNewsFeed", getLabel("expandNewsFeed"))
        ]),
        // --- Bulk Actions --- 
        ctx.DOMUtils.createElement("div", { className: "fbcmf-section" }, [
           ctx.DOMUtils.createElement("div", { className: "fbcmf-button-row" }, [
               ctx.DOMUtils.createElement("button", { id: "fbcmf-enable-all", className: "secondary" }, getLabel("enableAll")),
               ctx.DOMUtils.createElement("button", { id: "fbcmf-disable-all", className: "secondary" }, getLabel("disableAll"))
           ])
        ]),
        // --- General Settings --- 
        ctx.DOMUtils.createElement("div", { className: "fbcmf-section" }, [
          createSelect("language", getLabel("language"), [ {value: "vi", text: "Tiếng Việt"}, {value: "en", text: "English"} ]),
          createSelect("theme", getLabel("theme"), [ {value: "light", text: getLabel("light")}, {value: "dark", text: getLabel("dark")} ]),
          createSelect("verbosity", getLabel("verbosity"), [ {value: "minimal", text: getLabel("minimal")}, {value: "verbose", text: getLabel("verbose")} ])
        ]),
        // --- Advanced Settings Panel (Initially Hidden) --- 
        ctx.DOMUtils.createElement("div", { id: "fbcmf-advanced-panel", className: "fbcmf-advanced-panel" }, [
            // Reels & Video Section
            ctx.DOMUtils.createElement("div", { className: "fbcmf-section" }, [
              ctx.DOMUtils.createElement("div", { className: "fbcmf-section-title" }, "Reels & Video"),
              createCheckbox("videoAdBlocker", "Block video advertisements")
            ]),
            // Comments Section
            ctx.DOMUtils.createElement("div", { className: "fbcmf-section" }, [
              ctx.DOMUtils.createElement("div", { className: "fbcmf-section-title" }, "Comments"),
              createCheckbox("showAllComments", getLabel("showAllComments")),
              createCheckbox("autoDetectComments", getLabel("autoDetectComments")),
              createCheckbox("notifyComments", getLabel("notifyComments")),
              createCheckbox("scrollComments", getLabel("scrollComments"))
            ]),
            // Feed & Content Section
            ctx.DOMUtils.createElement("div", { className: "fbcmf-section" }, [
              ctx.DOMUtils.createElement("div", { className: "fbcmf-section-title" }, "Feed & Content"),
              createCheckbox("hideAnonymous", getLabel("hideAnonymous")),
              createCheckbox("autoSortChrono", getLabel("autoSortChrono"))
            ]),
            // AI Features Section
            ctx.DOMUtils.createElement("div", { className: "fbcmf-section" }, [
              ctx.DOMUtils.createElement("div", { className: "fbcmf-section-title" }, "AI Features"),
              createCheckbox("autoSuggestKeywords", getLabel("autoSuggestKeywords")),
              createInput("text", "gemini-key", getLabel("geminiApiKey"), "AIza..."),
              ctx.DOMUtils.createElement("button", { id: "fbcmf-suggest-btn", className: "secondary" }, getLabel("suggestKeywords")),
              ctx.DOMUtils.createElement("div", { id: "fbcmf-suggestedKeywords" })
            ]),
            // Import / Export Section
            ctx.DOMUtils.createElement("div", { className: "fbcmf-section" }, [
                ctx.DOMUtils.createElement("div", { className: "fbcmf-section-title" }, "Import / Export"),
                ctx.DOMUtils.createElement("label", {}, getLabel("exportInstructions")),
                ctx.DOMUtils.createElement("textarea", { id: "fbcmf-export-area", readOnly: true }),
                ctx.DOMUtils.createElement("button", { id: "fbcmf-export-btn", className: "secondary" }, getLabel("exportSettings")),
                ctx.DOMUtils.createElement("br"),
                ctx.DOMUtils.createElement("label", {}, "Paste settings JSON here to import:"),
                ctx.DOMUtils.createElement("textarea", { id: "fbcmf-import-area" }),
                ctx.DOMUtils.createElement("button", { id: "fbcmf-import-btn" }, getLabel("importSettings"))
            ])
        ]),
        // --- Action Buttons & Status --- 
        ctx.DOMUtils.createElement("div", { className: "fbcmf-section fbcmf-button-row" }, [
            ctx.DOMUtils.createElement("button", { id: "fbcmf-advanced-settings-btn", className: "secondary" }, getLabel("advancedSettings")),
            ctx.DOMUtils.createElement("button", { id: "fbcmf-save-btn" }, getLabel("saveSettings"))
        ]),
        ctx.DOMUtils.createElement("div", { id: "fbcmf-status-message" })
      ]);

      document.body.appendChild(settingsPopup);
      log("Settings popup created and added to body.");

      // Add event listeners after creating the popup
      addPopupEventListeners();
    }

    // Helper to create checkbox label structure
    function createCheckbox(idSuffix, labelText) {
        const id = `fbcmf-${idSuffix}`;
        return ctx.DOMUtils.createElement("label", { htmlFor: id }, [
            ctx.DOMUtils.createElement("input", { type: "checkbox", id: id }),
            labelText
        ]);
    }

    // Helper to create text input label structure
    function createInput(type, idSuffix, labelText, placeholder = "") {
        const id = `fbcmf-${idSuffix}`;
        return ctx.DOMUtils.createElement("label", {}, [
            labelText,
            ctx.DOMUtils.createElement("input", { type: type, id: id, placeholder: placeholder })
        ]);
    }

    // Helper to create select dropdown label structure
    function createSelect(idSuffix, labelText, options) {
        const id = `fbcmf-${idSuffix}`;
        return ctx.DOMUtils.createElement("label", {}, [
            labelText,
            ctx.DOMUtils.createElement("select", { id: id }, 
                options.map(opt => ctx.DOMUtils.createElement("option", { value: opt.value }, opt.text))
            )
        ]);
    }

    // Populate form fields with current settings
    function populateSettingsForm() {
      if (!settingsPopup || !ctx.settings) {
        log("Cannot populate form: Popup or settings not ready.", "error");
        return;
      }
      log("Populating settings form with: " + JSON.stringify(ctx.settings));
      
      // Checkboxes
      const checkboxes = [
          "blockSponsored", "blockSuggested", "blockReels", "blockGIFs", 
          "blockKeywords", "expandNewsFeed", "videoAdBlocker", "showAllComments",
          "autoDetectComments", "notifyComments", "scrollComments", "hideAnonymous",
          "autoSortChrono", "autoSuggestKeywords"
      ];
      checkboxes.forEach(key => {
          const element = settingsPopup.querySelector(`#fbcmf-${key}`);
          if (element) {
              element.checked = !!ctx.settings[key]; // Use boolean conversion
          }
      });

      // Text Inputs
      const textInputs = { "keywordInput": "blockedKeywords", "gemini-key": "geminiApiKey" };
      for (const [idSuffix, settingKey] of Object.entries(textInputs)) {
          const element = settingsPopup.querySelector(`#fbcmf-${idSuffix}`);
          if (element) {
              // Handle array keywords specifically
              if (settingKey === "blockedKeywords" && Array.isArray(ctx.settings[settingKey])) {
                  element.value = ctx.settings[settingKey].join(", ");
              } else {
                  element.value = ctx.settings[settingKey] || "";
              }
          }
      }
      
      // Selects
      const selects = ["language", "theme", "verbosity"];
      selects.forEach(key => {
          const element = settingsPopup.querySelector(`#fbcmf-${key}`);
          if (element) {
              element.value = ctx.settings[key] || ""; // Use default from select if setting is missing
          }
      });

      log("Settings form populated.");
    }

    // Show/Hide Status Message
    function showStatusMessage(message, type = "success", duration = 3000) {
        const statusElement = settingsPopup?.querySelector("#fbcmf-status-message");
        if (!statusElement) return;

        statusElement.textContent = message;
        statusElement.className = `fbcmf-status-message ${type}`;
        statusElement.style.display = "block";

        // Clear previous timeout if exists
        if (statusElement.timeoutId) {
            clearTimeout(statusElement.timeoutId);
        }

        // Auto-hide after duration, unless duration is 0 or less
        if (duration > 0) {
            statusElement.timeoutId = setTimeout(() => {
                statusElement.style.display = "none";
                statusElement.timeoutId = null; // Clear the stored ID
            }, duration);
        }
    }

    // --- Event Handlers --- 

    // ASYNC Save Settings Handler (with Reload)
    async function saveSettingsHandler() {
      if (!ctx.saveSettings) {
          log("Save function not available in context.", "error");
          showStatusMessage(getLabel("settingsSaveError"), "error");
          return;
      }

      log("Save button clicked. Collecting settings...");
      const newSettings = {};

      // Collect Checkboxes
      const checkboxes = [
          "blockSponsored", "blockSuggested", "blockReels", "blockGIFs", 
          "blockKeywords", "expandNewsFeed", "videoAdBlocker", "showAllComments",
          "autoDetectComments", "notifyComments", "scrollComments", "hideAnonymous",
          "autoSortChrono", "autoSuggestKeywords"
      ];
      checkboxes.forEach(key => {
          const element = settingsPopup.querySelector(`#fbcmf-${key}`);
          if (element) newSettings[key] = element.checked;
      });

      // Collect Text Inputs
      const textInputs = { "keywordInput": "blockedKeywords", "gemini-key": "geminiApiKey" };
       for (const [idSuffix, settingKey] of Object.entries(textInputs)) {
          const element = settingsPopup.querySelector(`#fbcmf-${idSuffix}`);
          if (element) {
              if (settingKey === "blockedKeywords") {
                  // Split keywords, trim whitespace, remove empty strings
                  newSettings[settingKey] = element.value.split(",")
                                                .map(k => k.trim())
                                                .filter(k => k.length > 0);
              } else {
                  newSettings[settingKey] = element.value;
              }
          }
      }

      // Collect Selects
      const selects = ["language", "theme", "verbosity"];
      selects.forEach(key => {
          const element = settingsPopup.querySelector(`#fbcmf-${key}`);
          if (element) newSettings[key] = element.value;
      });

      log("Collected settings to save: " + JSON.stringify(newSettings));

      try {
        // Call the ASYNC saveSettings from context (provided by SettingsManager)
        const success = await ctx.saveSettings(newSettings);
        
        if (success) {
          log("Settings saved successfully via context.");
          // --- RELOAD IMPLEMENTATION --- 
          // Show reloading message (won't stay long)
          showStatusMessage(getLabel("settingsSavedReloading"), "success", 2000); // Show message briefly
          // Reload the page after a short delay
          setTimeout(() => {
              location.reload();
          }, 1500); // Reload after 1.5 seconds
          // --- END RELOAD IMPLEMENTATION ---
        } else {
          log("Saving settings via context failed.", "error");
          showStatusMessage(getLabel("settingsSaveError"), "error");
        }
      } catch (error) {
        log("Error during saveSettings call: " + error, "error");
        console.error("Save Settings Error:", error);
        showStatusMessage(getLabel("settingsSaveError"), "error");
      }
    }
    
    // Toggle Advanced Settings Panel
    function toggleAdvancedSettings() {
        const panel = settingsPopup?.querySelector("#fbcmf-advanced-panel");
        const button = settingsPopup?.querySelector("#fbcmf-advanced-settings-btn");
        if (panel && button) {
            const isActive = panel.classList.toggle("active");
            button.textContent = isActive ? "Hide Advanced" : getLabel("advancedSettings");
            log(`Advanced settings panel ${isActive ? 'shown' : 'hidden'}`);
        }
    }

    // Enable/Disable All Basic Toggles
    function setAllToggles(enable) {
        const basicToggles = ["blockSponsored", "blockSuggested", "blockReels", "blockGIFs", "blockKeywords", "expandNewsFeed"];
        basicToggles.forEach(key => {
            const element = settingsPopup?.querySelector(`#fbcmf-${key}`);
            if (element) element.checked = enable;
        });
        log(`Set all basic toggles to: ${enable}`);
    }

    // Export Settings Handler
    function exportSettingsHandler() {
        if (ctx.exportSettings) {
            const settingsJson = ctx.exportSettings();
            const exportArea = settingsPopup?.querySelector("#fbcmf-export-area");
            if (exportArea) {
                exportArea.value = settingsJson;
                exportArea.select(); // Select text for easy copying
                log("Settings exported to textarea.");
            } else {
                log("Export textarea not found.", "error");
            }
        } else {
            log("Export function not available in context.", "error");
        }
    }

    // ASYNC Import Settings Handler
    async function importSettingsHandler() {
        const importArea = settingsPopup?.querySelector("#fbcmf-import-area");
        if (!importArea) {
            log("Import textarea not found.", "error");
            return;
        }
        const jsonStr = importArea.value.trim();
        if (!jsonStr) {
            alert("Please paste settings JSON into the import area first.");
            return;
        }

        if (ctx.importSettings) {
            log("Attempting to import settings...");
            try {
                // importSettings in SettingsManager is now async
                await ctx.importSettings(jsonStr);
                // SettingsManager handles alert and reload on success
                log("Import process initiated via context.");
                // Show import success message briefly before reload (handled by SettingsManager's import)
                // showStatusMessage(getLabel("importSuccess"), "success", 2000);
            } catch (error) {
                // SettingsManager should ideally handle its own errors/alerts
                log("Error during importSettings call: " + error, "error");
                console.error("Import Error:", error);
                alert(getLabel("importError"));
            }
        } else {
            log("Import function not available in context.", "error");
            alert("Import feature is currently unavailable.");
        }
    }

    // Add event listeners for popup elements
    function addPopupEventListeners() {
      if (!settingsPopup) return;
      log("Adding event listeners to popup elements.");

      // Save Button (now async)
      settingsPopup.querySelector("#fbcmf-save-btn")?.addEventListener("click", saveSettingsHandler); // No async keyword here, it's added to the function definition
      
      // Advanced Settings Toggle
      settingsPopup.querySelector("#fbcmf-advanced-settings-btn")?.addEventListener("click", toggleAdvancedSettings);

      // Enable/Disable All
      settingsPopup.querySelector("#fbcmf-enable-all")?.addEventListener("click", () => setAllToggles(true));
      settingsPopup.querySelector("#fbcmf-disable-all")?.addEventListener("click", () => setAllToggles(false));

      // Export Button
      settingsPopup.querySelector("#fbcmf-export-btn")?.addEventListener("click", exportSettingsHandler);

      // Import Button (now async)
      settingsPopup.querySelector("#fbcmf-import-btn")?.addEventListener("click", importSettingsHandler);

      // AI Suggest Keywords (Example - requires AI module implementation)
      const suggestBtn = settingsPopup.querySelector("#fbcmf-suggest-btn");
      if (suggestBtn) {
          suggestBtn.addEventListener("click", async () => {
              if (ctx.AI && typeof ctx.AI.suggestKeywords === 'function') {
                  const apiKey = settingsPopup.querySelector("#fbcmf-gemini-key")?.value;
                  if (!apiKey) {
                      alert("Please enter your Gemini API Key first.");
                      return;
                  }
                  suggestBtn.textContent = "Suggesting...";
                  suggestBtn.disabled = true;
                  try {
                      const suggestions = await ctx.AI.suggestKeywords(apiKey);
                      const container = settingsPopup.querySelector("#fbcmf-suggestedKeywords");
                      if (container) {
                          container.innerHTML = ""; // Clear previous
                          suggestions.forEach(kw => {
                              const btn = ctx.DOMUtils.createElement("button", { type: "button", className: "secondary" }, kw);
                              btn.addEventListener("click", () => {
                                  const input = settingsPopup.querySelector("#fbcmf-keywordInput");
                                  if (input) {
                                      const currentKeywords = input.value.split(",").map(k => k.trim()).filter(Boolean);
                                      if (!currentKeywords.includes(kw)) {
                                          currentKeywords.push(kw);
                                          input.value = currentKeywords.join(", ");
                                      }
                                  }
                              });
                              container.appendChild(btn);
                          });
                      }
                  } catch (error) {
                      console.error("AI Suggestion Error:", error);
                      alert(getLabel("aiUnavailable"));
                  } finally {
                      suggestBtn.textContent = getLabel("suggestKeywords");
                      suggestBtn.disabled = false;
                  }
              } else {
                  alert(getLabel("aiUnavailable"));
              }
          });
      }
    }

    // Tạo button chính để mở popup
    function createMainButton() {
      if (settingsButton) return; // Avoid duplicate buttons

      settingsButton = ctx.DOMUtils.createElement("button", {
          id: "fbcmf-clean-button",
          title: getLabel("settings"),
          // Use an SVG icon for better visuals
          innerHTML: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M19.46 8.11a7.3 7.3 0 0 1-1.1 5.14 7.3 7.3 0 0 1-4.66 3.96l.86 1.71a1 1 0 0 1-1.78.9l-.86-1.71a7.3 7.3 0 0 1-5.14-1.1 7.3 7.3 0 0 1-3.96-4.66l-1.71-.86a1 1 0 0 1 .9-1.78l1.71.86a7.3 7.3 0 0 1 1.1-5.14 7.3 7.3 0 0 1 4.66-3.96l-.86-1.71a1 1 0 1 1 1.78-.9l.86 1.71a7.3 7.3 0 0 1 5.14 1.1 7.3 7.3 0 0 1 3.96 4.66l1.71.86a1 1 0 0 1-.9 1.78l-1.71-.86Zm-7.47 8.45a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11Zm0-2a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z"/></svg>`
      });

      settingsButton.addEventListener("click", () => {
        if (!settingsPopup) {
          createSettingsPopup();
        }
        if (settingsPopup) {
            const isVisible = settingsPopup.style.display === "block";
            if (!isVisible) {
                populateSettingsForm(); // Populate/Repopulate before showing
            }
            settingsPopup.style.display = isVisible ? "none" : "block";
            log(`Settings popup ${isVisible ? 'hidden' : 'shown'}`);
        } else {
            log("Failed to create or find settings popup.", "error");
        }
      });

      document.body.appendChild(settingsButton);
      log("Main settings button created.");
    }

    // --- Initialization Logic --- 

    // Apply theme and CSS immediately
    updateTheme(currentTheme);

    // Create the main button to open the settings
    // Use a small delay to ensure the body is fully available
    setTimeout(createMainButton, 500);

    // Listen for external settings changes (e.g., from import)
    document.addEventListener('fbcmf:settings-saved', (event) => {
        log('Received settings-saved event.');
        if (event.detail) {
            ctx.settings = event.detail; // Update local context reference
            // Re-populate form if it's currently open
            if (settingsPopup && settingsPopup.style.display === 'block') {
                populateSettingsForm();
            }
            // Update theme if necessary
            updateTheme(ctx.settings.theme);
        }
    });

    console.log("[UIManager] ✅ Đã sẵn sàng (sử dụng Context API + Reload on Save).");
  });
})();

