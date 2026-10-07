/*
 * Update rate of the data of a telemetry, estimated from the timestamps of its latest samples (shared by the Telemetries panel and the top menu).
 * entry: one data type of a telemetry ({timestamps, lastUpdate, ...}).
 * Returns the rate in Hz, 0 when it is unknown (less than 2 samples), -1 when the data stopped coming ("idle").
 */
function estimateRate(entry) {
    if (!entry || entry.timestamps.length < 2) return 0;
    const ts = entry.timestamps;
    const count = Math.min(ts.length, 32);
    const span = ts[ts.length - 1] - ts[ts.length - count];
    if (!(span > 0)) return 0;
    const rate = (count - 1) / span;
    const silence = Date.now() - entry.lastUpdate; // Wall clock of the last arrival: sample timestamps may come from the device's own clock
    if (silence > Math.max(2000, 3000 / rate)) return -1;
    return rate;
}
