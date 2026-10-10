TELEPLOT.state = {
    isPaused: false,
    dataTimeout: 300.0, // seconds of data kept per telemetry (0: everything)
    // bytes the stored data may take (estimated, see TELEPLOT.datastore.getMemoryUsage), 0: no limit. 1 GB, half of it on a device
    // that says it has little memory (navigator.deviceMemory, Chromium only): see doc/performance.md, "Memory"
    memoryLimit: (typeof navigator !== "undefined" && navigator.deviceMemory <= 4) ? 500e6 : 1e9,
    memoryPolicy: "thin", // What is done when the limit is reached: "thin" (thin out the oldest data), "forget" (drop the oldest data), "pause"
    updateIntervalMs: 33, //ms
}

