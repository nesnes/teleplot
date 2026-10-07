/*
 * Start/stop of the sample data (see sample-robot.js), shared by the welcome screen and the Help panel.
 * ctx.sampleRunning tells whether it runs; starting it displays its dashboard.
 */
let robotSample = null; // Created on first use (kept out of Vue data: no reactivity needed)

function startSampleData(TP, ctx) {
    if (!robotSample) robotSample = createRobotSample(TP);
    robotSample.start();
    ctx.sampleRunning = true;
    ctx.activeDashboard = robotSample.dashboard;
}

function stopSampleData(ctx) {
    if (robotSample) robotSample.stop();
    ctx.sampleRunning = false;
}
