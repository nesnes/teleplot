/*
 * Start/stop of the sample data (see sample-robot.js), shared by the welcome screen and the Help panel.
 * ctx.sampleRunning tells whether it runs; starting it displays its dashboard. A start that fails says why (ctx.sampleError, shown on the
 * cards that start it): a button that does nothing tells nothing (it happened on an iPhone).
 */
let robotSample = null; // Created on first use (kept out of Vue data: no reactivity needed)

function startSampleData(TP, ctx) {
    ctx.sampleError = "";
    try {
        if (!robotSample) robotSample = createRobotSample(TP);
        robotSample.start();
    } catch (error) {
        console.error(error);
        const where = error && error.stack ? String(error.stack).split("\n").find((l) => /\d:\d/.test(l)) : ""; // (the first line that names a file and a line)
        ctx.sampleError = String(error && error.message || error) + (where ? " (" + where.trim() + ")" : "");
        if (robotSample) robotSample.stop();
        return;
    }
    ctx.sampleRunning = true;
    ctx.activeDashboard = robotSample.dashboard;
}

function stopSampleData(ctx) {
    if (robotSample) robotSample.stop();
    ctx.sampleRunning = false;
}
