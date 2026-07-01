// Function opened in 000-init.js and closed in 999-export.js
(function (global) {
    global.Teleplot = {};
    let TELEPLOT = global.Teleplot;

    let _defaultTextLogName = "_text_logs";
    let _defaultUpdateInterval = 1000 / 30; // 30 fps