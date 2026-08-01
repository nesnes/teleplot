// Function opened in 000-init.js and closed in 999-export.js
function initTeleplot(TELEPLOT = typeof globalThis !== "undefined" ? globalThis.Teleplot = {} : window.Teleplot = {}) {
    let _defaultTextLogName = "_text_logs";
    let _defaultUpdateInterval = 1000 / 30; // 30 fps

    // For the embedded vuejs to work, we need to make a globally-accessible Teleplot instance (search for runtimeGlobalName in -lib-Vue.js)
    if(typeof globalThis !== "undefined" ) globalThis.__TeleplotJs4Vue = TELEPLOT;
    else window.__TeleplotJs4Vue = TELEPLOT;
