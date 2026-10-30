TELEPLOT.state = {
    // What the sources send is stored (false: it is lost). Changed with TELEPLOT.setReceiving, which says why in receivingOff
    // ({by: "user" | "memory", at: ms}) and remembers the periods not received (TELEPLOT.datastore.offPeriods). See doc/time.md
    receiving: true,
    receivingOff: null,
    get isPaused() { return !this.receiving; }, // (the older name of "not receiving")
    set isPaused(paused) { TELEPLOT.setReceiving(!paused); },
    commands: false, // The page may send commands to the devices (the CMD button, off at every start): see 025-commands.js
    dataTimeout: 0, // seconds of data kept per telemetry (0, the default: everything, up to the memory limit)
    // bytes the stored data may take (estimated, see TELEPLOT.datastore.getMemoryUsage), 0: no limit. 1 GB, half of it on a device
    // that says it has little memory (navigator.deviceMemory, Chromium only): see doc/performance.md, "Memory"
    memoryLimit: (typeof navigator !== "undefined" && navigator.deviceMemory <= 4) ? 500e6 : 1e9,
    memoryPolicy: "thin", // What is done when the limit is reached: "thin" (thin out the oldest data), "forget" (drop the oldest data), "stop" (stop receiving; "pause" is its older name)
    updateIntervalMs: 33, //ms
}

// An id unique in the page, for views, connections and their DOM elements. Not crypto.randomUUID: browsers only give it to secure pages
// (https or localhost), and a phone opens the page of a computer at its address on the network (http://192.168.x.x).
TELEPLOT.uid = (() => {
    let count = 0;
    const session = Math.floor(Math.random() * 0x100000000).toString(36);
    return () => session + "-" + (++count).toString(36);
})();
