/*
 * Sources panel: is the data arriving, and where does it come from ?
 * - Summary on top: the total rate (samples per second, like the top menu) with its last minute, the bytes received per second, how
 *   many telemetries, when the last data came, and what is wrong (sources that are down, lines that could not be understood).
 * - One card per source, colored by its state:
 *     - Teleplot server (UDP relayed through a WebSocket): state, next automatic try, clients seen on it, retry / remove.
 *     - Serial port, opened by the browser itself (Web Serial): baud rate, connect / disconnect, and a console with what the port sends
 *       and a box to send text. Lines starting with ">" are telemetry: they are hidden in the console until asked for (the ones that
 *       could not be understood are always shown).
 *     - The robot sample (see sample-controls.js).
 * - "Add a source": a server (address and port) or a serial port (the browser asks which one).
 * Everything about connections is in the library (TP.connection); this file only displays it. Rates and the console are not reactive
 * (raw data, updated on every message): the panel refreshes on a timer.
 */
const SOURCES_BAUD_RATES = [9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600, 1000000, 2000000];
const SOURCES_LINE_ENDINGS = [["\n", "\\n"], ["\r\n", "\\r\\n"], ["\r", "\\r"], ["", "none"]];
const SOURCES_CONSOLE_LINES = 300; // Lines of a console on display (the library keeps more)

// Samples per second of the telemetries of a source (every telemetry when no source is given), from their latest timestamps
function sourcesRate(TP, sourceId) {
    let total = 0;
    for (const id in TP.datastore.telemetries) {
        const telem = TP.datastore.telemetries[id];
        if (sourceId !== undefined && telem.sourceId !== sourceId) continue;
        for (const type in telem.data) {
            const rate = estimateRate(telem.data[type]);
            if (rate > 0) total += rate;
        }
    }
    return total;
}

// Sampled once per second from the start of the application (the panel may be opened later): the total rate over the last minute,
// and the bytes per second of each connection (how much its byte counter grew since the previous sample).
const sourcesMonitor = { history: [], timer: null, byteRates: {}, counters: {}, time: 0 };
function startSourcesMonitor(TP) {
    if (sourcesMonitor.timer !== null) return;
    sourcesMonitor.timer = setInterval(() => {
        sourcesMonitor.history.push(sourcesRate(TP));
        if (sourcesMonitor.history.length > 60) sourcesMonitor.history.shift();
        const now = Date.now(), elapsed = (now - sourcesMonitor.time) / 1000;
        const rates = {}, counters = {};
        for (const conn of TP.connection.connections) {
            counters[conn.id] = conn.stats.bytes;
            if (conn.id in sourcesMonitor.counters && elapsed > 0) rates[conn.id] = Math.max(0, conn.stats.bytes - sourcesMonitor.counters[conn.id]) / elapsed;
        }
        Object.assign(sourcesMonitor, { byteRates: rates, counters, time: now }); // (connections that are gone are forgotten)
    }, 1000);
}

function sourcesFormatRate(rate) {
    if (rate >= 1000) return (rate / 1000).toFixed(rate >= 10000 ? 0 : 1) + "k/s";
    return Math.round(rate) + "/s";
}

// "850 B/s", "12.4 kB/s", "1.2 MB/s"
function sourcesFormatBytes(rate) {
    if (rate >= 1e6) return (rate / 1e6).toFixed(rate >= 1e7 ? 0 : 1) + " MB/s";
    if (rate >= 1000) return (rate / 1000).toFixed(rate >= 1e5 ? 0 : 1) + " kB/s";
    return Math.round(rate) + " B/s";
}

// "0.02 s", "8 s", "3 min", "2 h": how long ago
function sourcesFormatAge(ms) {
    const s = Math.max(0, ms) / 1000;
    if (s < 1) return s.toFixed(2) + " s";
    if (s < 10) return s.toFixed(1) + " s";
    if (s < 120) return Math.round(s) + " s";
    if (s < 7200) return Math.round(s / 60) + " min";
    return Math.round(s / 3600) + " h";
}

function initComponent_panel_sources(vue) {
    let name = "panel-sources";

    const vueHTML = `
        <div class="sources-layout">
          <!-- Is data arriving ? -->
          <div class="sources-hero" :class="'sources-' + health.state">
            <div class="sources-line">
              <span class="sources-big">{{health.rateText}}</span>
              <span v-if="health.bytesText" class="sources-bytes" :title="bytesTitle">{{health.bytesText}}</span>
              <span class="sources-grow"></span>
              <span class="sources-pill">{{health.label}}</span>
            </div>
            <svg class="sources-spark" viewBox="0 0 59 20" preserveAspectRatio="none" aria-hidden="true"><polyline :points="sparkPoints" fill="none" stroke="currentColor" stroke-width="1.5" vector-effect="non-scaling-stroke"/></svg>
            <div class="sources-sub">{{health.detail}}<span v-if="health.issues" class="sources-danger"> · {{health.issues}}</span></div>
            <div v-if="health.state == 'none'" class="sources-sub">Nothing arrives ? <a href="#" @click.prevent="ctx.sidePanel = 'help'">See how to send data</a>.</div>
          </div>

          <div class="sources-section">Sources</div>
          <div class="sources-stack">
            <div v-for="s in sources" :key="s.id" class="sources-card" :class="'sources-' + s.state">
              <div class="sources-line sources-head" :title="isOpen(s) ? 'Hide the details' : 'Show the details'" @click="toggle(s)">
                <i class="sources-dot"></i>
                <span class="sources-name">{{s.name}}</span>
                <span class="sources-badge" :class="'sources-badge-' + s.kind">{{s.badge}}</span>
                <span class="sources-grow"></span>
                <button v-if="s.kind == 'server' && !s.connected" class="sources-btn" @click.stop="s.conn.retry()">Retry now</button>
                <button v-else-if="s.kind == 'serial' && !s.connected" class="sources-btn sources-primary" @click.stop="s.conn.connect()">Reconnect</button>
                <template v-else><span v-if="s.bytesText" class="sources-bytes" :title="bytesTitle">{{s.bytesText}}</span><span class="sources-rate">{{s.rateText}}</span></template>
              </div>
              <div class="sources-sub">{{s.summary}}</div>

              <!-- Teleplot server: details -->
              <template v-if="s.kind == 'server' && isOpen(s)">
                <dl class="sources-kv">
                  <dt>Receives</dt><dd>UDP port {{s.conn.udp.port}}, relayed by the server</dd>
                  <dt>Clients</dt><dd>{{s.clients.length ? s.clients.join(', ') : 'none seen (clients name themselves with the binary protocol)'}}</dd>
                  <dt>Telemetries</dt><dd>{{s.telemetryCount}}</dd>
                  <dt>Problems</dt><dd :class="{'sources-danger': s.problems > 0}">{{s.problems ? s.problems + ' packets or lines not understood' : 'none'}}</dd>
                </dl>
                <div class="sources-line sources-actions">
                  <span class="sources-grow"></span>
                  <button class="sources-btn sources-ghost" @click="remove(s)">Remove</button>
                </div>
              </template>

              <!-- Serial port: settings, console, send -->
              <template v-if="s.kind == 'serial' && isOpen(s) && consoleUi[s.id]">
                <div class="sources-line sources-actions">
                  <label class="sources-sub">Baud
                    <select class="sources-field" :value="s.conn.baudRate" @change="s.conn.setBaudRate(Number($event.target.value))">
                      <option v-for="b in baudRates(s.conn.baudRate)" :key="b" :value="b">{{b}}</option>
                    </select>
                  </label>
                  <span class="sources-grow"></span>
                  <button v-if="s.connected" class="sources-btn" @click="s.conn.disconnect()">Disconnect</button>
                  <button class="sources-btn sources-ghost" @click="remove(s)">Remove</button>
                </div>
                <div class="sources-console" :ref="el => setConsole(s.id, el)" @scroll="onConsoleScroll(s.id, $event)">
                  <div v-for="line in s.lines" :key="line.key" :class="line.cls"><span v-if="ui(s.id).timestamps" class="sources-console-time">{{line.time}}</span>{{line.text}}</div>
                  <div v-if="!s.lines.length" class="sources-console-empty">{{s.hidden ? 'Only telemetry lines so far (hidden).' : 'Nothing received yet.'}}</div>
                </div>
                <div class="sources-line sources-actions">
                  <input class="sources-field sources-grow" type="text" placeholder="text to send" spellcheck="false" autocomplete="off" :disabled="!s.connected"
                    v-model="ui(s.id).text" @keydown.enter="send(s)">
                  <select class="sources-field" title="Line ending added to what is sent" v-model="ui(s.id).ending">
                    <option v-for="e in lineEndings" :key="e[1]" :value="e[0]">{{e[1]}}</option>
                  </select>
                  <button class="sources-btn sources-primary" :disabled="!s.connected" @click="send(s)">Send</button>
                </div>
                <div class="sources-line sources-actions sources-tools">
                  <button class="sources-pill" :class="{on: ui(s.id).follow}" title="Stay on the newest line" @click="setFollow(s.id, !ui(s.id).follow)">Follow</button>
                  <button class="sources-pill" :class="{on: ui(s.id).timestamps}" title="Show when each line came" @click="ui(s.id).timestamps = !ui(s.id).timestamps">Timestamps</button>
                  <button class="sources-pill" :class="{on: ui(s.id).showTelemetry}" :title="'Lines starting with > are telemetry: ' + s.hidden + ' hidden'" @click="ui(s.id).showTelemetry = !ui(s.id).showTelemetry">Telemetry lines</button>
                  <span class="sources-grow"></span>
                  <button class="sources-btn sources-ghost" title="Empties the console (the data is kept)" @click="s.conn.clearConsole()">Clear</button>
                </div>
              </template>
            </div>

            <!-- Sample data -->
            <div class="sources-card" :class="ctx.sampleRunning ? 'sources-ok' : 'sources-idle'">
              <div class="sources-line">
                <i class="sources-dot"></i>
                <span class="sources-name">Robot sample</span>
                <span class="sources-badge sources-badge-sample">SAMPLE</span>
                <span class="sources-grow"></span>
                <button class="sources-btn" @click="toggleSample()">{{ctx.sampleRunning ? 'Stop' : 'Start'}}</button>
              </div>
              <div class="sources-sub">A simulated robot, to try Teleplot without hardware</div>
            </div>

            <!-- Add a source -->
            <button v-if="!adding" class="sources-add" @click="startAdding()"><i class="icofont-plus"></i> Add a source</button>
            <div v-else class="sources-card sources-adding">
              <div class="sources-line"><b>Add a source</b><span class="sources-grow"></span><button class="sources-btn sources-ghost" @click="adding = false">Cancel</button></div>
              <div class="sources-tiles">
                <button class="sources-tile" :class="{on: addKind == 'server'}" @click="addKind = 'server'"><b>Teleplot server</b><span>UDP, from any language</span></button>
                <button class="sources-tile" :class="{on: addKind == 'serial'}" @click="addKind = 'serial'"><b>Serial port</b><span>Arduino, ESP32, USB devices</span></button>
              </div>
              <div v-if="addKind == 'server'" class="sources-line sources-actions">
                <input class="sources-field sources-grow" type="text" placeholder="address" spellcheck="false" v-model="addAddress" @keydown.enter="addServer()">
                <input class="sources-field sources-port" type="number" min="1" max="65535" placeholder="port" v-model.number="addPort" @keydown.enter="addServer()">
                <button class="sources-btn sources-primary" @click="addServer()">Connect</button>
              </div>
              <template v-if="addKind == 'serial'">
                <div v-if="!serialSupported" class="sources-hint"><b>Serial ports need Chrome, Edge or Opera on a computer.</b><br>This browser cannot open them. Data sent over the network (UDP, through a Teleplot server) works everywhere.</div>
                <template v-else>
                  <div class="sources-line sources-actions">
                    <label class="sources-sub">Baud
                      <select class="sources-field" v-model.number="addBaud"><option v-for="b in baudRates(addBaud)" :key="b" :value="b">{{b}}</option></select>
                    </label>
                    <span class="sources-grow"></span>
                    <button class="sources-btn sources-primary" @click="chooseSerial()">Choose a port…</button>
                  </div>
                  <div class="sources-sub">Your browser will ask which port to open.<template v-if="granted.length"> Used before:</template></div>
                  <div v-if="granted.length" class="sources-line sources-actions sources-tools">
                    <button v-for="(g, i) in granted" :key="i" class="sources-pill" @click="addGranted(g)">{{g.name}}</button>
                  </div>
                </template>
              </template>
              <div v-if="addError" class="sources-sub sources-danger">{{addError}}</div>
            </div>
          </div>

        </div>
    `;

    const vueCSS = `
        .sources-layout {
            --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
            box-sizing: border-box;
            max-height: calc(100vh - 7rem);
            padding: 0.2rem 0.8rem 1rem 0.2rem;
            overflow-y: auto;
            scrollbar-width: thin;
            color: var(--color-text);
        }
        .sources-ok { --sc: var(--color-success); } .sources-warn { --sc: var(--color-warning); } .sources-bad { --sc: var(--color-danger); }
        .sources-idle, .sources-none { --sc: var(--color-text-muted); } .sources-paused { --sc: var(--color-warning); }
        .sources-line { display: flex; align-items: center; gap: 0.45rem; min-width: 0; }
        .sources-grow { flex: 1 1 0; min-width: 0; }
        .sources-sub { color: var(--color-text-muted); font-size: 0.9rem; }
        .sources-sub a { color: var(--color-primary); }
        .sources-danger { color: var(--color-danger); }
        .sources-section { margin: 0.8rem 0 0.3rem; font-size: 0.85rem; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: var(--color-text-muted); }
        .sources-stack { display: flex; flex-direction: column; gap: 0.5rem; }

        /* Summary */
        .sources-hero { border-radius: 0.6rem; padding: 0.6rem 0.8rem; background: color-mix(in srgb, var(--sc) 13%, var(--color-bg-light)); border: 1px solid color-mix(in srgb, var(--sc) 45%, transparent); }
        .sources-big { font: 700 1.9rem var(--mono); font-variant-numeric: tabular-nums; }
        .sources-spark { display: block; width: 100%; height: 2.4rem; color: var(--sc); overflow: visible; }

        /* Cards */
        .sources-card { background: var(--color-bg-light); border-radius: 0.4rem; box-shadow: 0 0 3px var(--color-shadow); padding: 0.45rem 0.65rem; border-bottom: 2px solid var(--sc, var(--color-bg-dark)); }
        .sources-head { cursor: pointer; }
        .sources-dot { flex: none; width: 0.6rem; height: 0.6rem; border-radius: 50%; background: var(--sc, var(--color-text-muted)); }
        .sources-ok > .sources-line > .sources-dot { box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-success) 25%, transparent); }
        .sources-name { font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .sources-bytes { flex: none; font: 0.9rem var(--mono); font-variant-numeric: tabular-nums; color: var(--color-text-muted); white-space: nowrap; }
        .sources-hero .sources-bytes { font-size: 1.1rem; align-self: flex-end; padding-bottom: 0.25rem; }
        .sources-rate { font-family: var(--mono); font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
        .sources-badge { flex: none; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.03em; color: #fff; background: #7f8c8d; border-radius: 0.2rem; padding: 0 0.3rem; line-height: 1.4; }
        .sources-badge-serial { background: #b87500; } .sources-badge-sample { background: #16a085; }
        .sources-kv { display: grid; grid-template-columns: max-content 1fr; gap: 0.15rem 0.8rem; margin: 0.4rem 0 0; font-size: 0.9rem; }
        .sources-kv dt { color: var(--color-text-muted); } .sources-kv dd { margin: 0; overflow-wrap: anywhere; }
        .sources-actions { margin-top: 0.4rem; }
        .sources-tools { flex-wrap: wrap; row-gap: 0.3rem; }

        /* Controls */
        .sources-layout button { font: inherit; cursor: pointer; }
        .sources-btn { flex: none; font-weight: 600 !important; font-size: 0.9rem !important; padding: 0.15rem 0.6rem; border-radius: 0.5rem; border: 1px solid var(--color-bg-dark); background: var(--color-bg-light); color: var(--color-text); white-space: nowrap; }
        .sources-btn:hover { border-color: var(--color-primary); }
        .sources-btn:disabled { opacity: 0.5; cursor: default; }
        .sources-primary { background: var(--color-primary); border-color: var(--color-primary); color: #fff; }
        .sources-ghost { border-color: transparent; background: none; color: var(--color-text-muted); }
        .sources-ghost:hover { color: var(--color-danger); border-color: transparent; }
        .sources-pill { display: inline-flex; align-items: center; font-size: 0.85rem !important; font-weight: 600 !important; padding: 0.1rem 0.55rem; border-radius: 1rem; border: 1px solid var(--color-bg-dark); background: var(--color-bg-light); color: var(--color-text-muted); white-space: nowrap; }
        .sources-pill.on, .sources-hero .sources-pill { color: var(--sc, var(--color-primary)); border-color: var(--sc, var(--color-primary)); }
        .sources-card .sources-pill.on { color: var(--color-primary); border-color: var(--color-primary); }
        .sources-field { font: 0.9rem var(--mono); padding: 0.15rem 0.4rem; border-radius: 0.35rem; border: 1px solid var(--color-bg-dark); background: var(--color-bg); color: var(--color-text); min-width: 0; }
        .sources-field:focus { outline: none; border-color: var(--color-primary); }
        .sources-port { width: 5.5rem; }
        .sources-add { width: 100%; display: flex; align-items: center; justify-content: center; gap: 0.4rem; padding: 0.45rem; border-radius: 0.4rem; border: 1px dashed var(--color-text-muted); background: none; color: var(--color-primary); font-weight: 700 !important; }
        .sources-add:hover { border-color: var(--color-primary); background: color-mix(in srgb, var(--color-primary) 8%, transparent); }
        .sources-tiles { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-top: 0.4rem; }
        .sources-tile { display: flex; flex-direction: column; gap: 0.1rem; padding: 0.5rem; text-align: center; border-radius: 0.5rem; border: 1px solid var(--color-bg-dark); border-bottom: 2px solid var(--color-bg-dark); background: var(--color-bg); color: var(--color-text); }
        .sources-tile span { color: var(--color-text-muted); font-size: 0.85rem; font-weight: 400; }
        .sources-tile.on { border-color: var(--color-primary); background: color-mix(in srgb, var(--color-primary) 10%, var(--color-bg-light)); }
        .sources-hint { margin-top: 0.4rem; background: color-mix(in srgb, var(--color-warning) 14%, var(--color-bg-light)); border-left: 3px solid var(--color-warning); border-radius: 0.3rem; padding: 0.45rem 0.6rem; font-size: 0.95rem; }

        /* Serial console: a terminal, dark in both themes */
        .sources-console {
            margin-top: 0.4rem; height: 12rem; overflow: auto; scrollbar-width: thin;
            background: hsl(210 17% 9%); color: hsl(0 0% 80%); border-radius: 0.4rem; padding: 0.35rem 0.55rem;
            font: 0.88rem/1.5 var(--mono); white-space: pre;
        }
        .sources-console-time { color: hsl(0 0% 50%); margin-right: 0.6em; }
        .sources-console-sent { color: hsl(204 70% 66%); }
        .sources-console-sent::before { content: "\\2190  "; }
        .sources-console-telemetry { color: hsl(145 50% 60%); }
        .sources-console-problem { color: hsl(6 85% 68%); }
        .sources-console-problem::after { content: "   \\2014  not understood"; opacity: 0.8; }
        .sources-console-empty { color: hsl(0 0% 50%); white-space: normal; }
    `;
    // Add css to head
    {
        let elem = document.createElement('style');
        elem.textContent = vueCSS;
        document.head.appendChild(elem);
    }

    return vue.component(name, {
        name: name,
        setup() {
            const TP = Vue.inject("TP");
            const ctx = Vue.inject("ctx");
            return { TP, ctx };
        },
        data() {
            return {
                tick: 0,           // Rates, ages and consoles are not reactive: refreshed on a timer
                opened: {},        // Source id -> details shown ? (serial ports are open until closed, servers closed until opened)
                consoleUi: {},     // Serial source id -> {showTelemetry, timestamps, follow, text, ending}
                adding: false,
                addKind: "server",
                addAddress: "127.0.0.1",
                addPort: 8080,
                addBaud: 115200,
                addError: "",
                granted: [],       // Serial ports allowed before: [{port, name}]
                lineEndings: SOURCES_LINE_ENDINGS,
                bytesTitle: "Data received by this page per second: the content of packets and lines, without network or serial framing",
            }
        },
        computed: {
            serialSupported() { return this.TP.connection.serialSupported(); },
            // Every connection, described for display
            sources() {
                this.tick;
                const now = Date.now();
                const clients = Object.values(this.TP.clients.clients);
                const telemetries = Object.values(this.TP.datastore.telemetries);
                return this.TP.connection.connections.map((conn) => {
                    const serial = conn.type == "serial";
                    const rate = sourcesRate(this.TP, conn.id);
                    const last = conn.stats.lastMessage ? "last data " + sourcesFormatAge(now - conn.stats.lastMessage) + " ago" : "nothing received yet";
                    const silent = conn.stats.lastMessage > 0 && now - conn.stats.lastMessage > 5000;
                    const source = {
                        id: conn.id, conn, kind: serial ? "serial" : "server", badge: serial ? "SERIAL" : "SERVER", name: conn.name,
                        connected: conn.connected, rateText: sourcesFormatRate(rate), problems: conn.stats.problems,
                        bytesText: conn.id in sourcesMonitor.byteRates ? sourcesFormatBytes(sourcesMonitor.byteRates[conn.id]) : "",
                        state: conn.connected ? (silent ? "warn" : "ok") : "bad", summary: "", lines: [], hidden: 0, clients: [], telemetryCount: 0,
                    };
                    if (serial) {
                        if (conn.connected) source.summary = `This browser (Web Serial) · ${conn.baudRate} baud · ${last}`;
                        else if (conn.error) source.summary = conn.error;
                        else { source.summary = `Disconnected · ${conn.baudRate} baud · its data is kept`; source.state = "idle"; }
                        if (this.isOpen(source)) Object.assign(source, this.consoleLines(conn));
                    }
                    else {
                        const mine = clients.filter(c => c.sourceId === conn.id);
                        source.clients = mine.map(c => (c.name || "client") + " (" + c.id + ")");
                        source.telemetryCount = telemetries.filter(t => t.sourceId === conn.id).length;
                        if (conn.connected) source.summary = `Connected · UDP :${conn.udp.port} · ${mine.length} client${mine.length == 1 ? "" : "s"} · ${last}`;
                        else {
                            const wait = conn.nextRetryAt ? Math.max(0, Math.ceil((conn.nextRetryAt - now) / 1000)) : -1;
                            source.summary = (conn.everConnected ? "Connection lost" : "Cannot be reached") + (wait >= 0 ? ` · next try in ${wait} s` : "");
                        }
                    }
                    return source;
                });
            },
            // The summary on top
            health() {
                this.tick;
                const now = Date.now();
                const rate = sourcesRate(this.TP);
                const count = Object.keys(this.TP.datastore.telemetries).length;
                let last = 0;
                for (const id in this.TP.datastore.telemetries) {
                    const data = this.TP.datastore.telemetries[id].data;
                    for (const type in data) if (data[type].lastUpdate > last) last = data[type].lastUpdate;
                }
                const down = this.sources.filter(s => s.state == "bad").length;
                const problems = this.sources.reduce((sum, s) => sum + s.problems, 0);
                const issues = [];
                if (down) issues.push(down + (down == 1 ? " source down" : " sources down"));
                if (problems) issues.push(problems + (problems == 1 ? " line or packet not understood" : " lines or packets not understood"));
                const paused = !!this.TP.state.isPaused;
                const state = paused ? "paused" : (rate > 0 ? "ok" : (count ? "idle" : "none"));
                return {
                    state, rateText: sourcesFormatRate(rate),
                    bytesText: Object.keys(sourcesMonitor.byteRates).length ? sourcesFormatBytes(Object.values(sourcesMonitor.byteRates).reduce((a, b) => a + b, 0)) : "",
                    label: { paused: "Paused", ok: "Receiving", idle: "Idle", none: "No data yet" }[state],
                    detail: count + (count == 1 ? " telemetry" : " telemetries") + (last ? " · last data " + sourcesFormatAge(now - last) + " ago" : ""),
                    issues: issues.join(", "),
                };
            },
            // The total rate of the last minute, as the points of a line (newest at the right)
            sparkPoints() {
                this.tick;
                const history = sourcesMonitor.history;
                const max = Math.max(1, ...history);
                const offset = 60 - history.length;
                return history.map((v, i) => `${offset + i},${(19 - 17 * v / max).toFixed(1)}`).join(" ") || "0,19 59,19";
            },
        },
        methods: {
            isOpen(source) { return source.kind == "serial" ? this.opened[source.id] !== false : this.opened[source.id] === true; },
            toggle(source) { this.opened[source.id] = !this.isOpen(source); },
            // Settings of the console of a serial source (created by ensureUi, outside of any rendering)
            ui(id) { return this.consoleUi[id] || { showTelemetry: false, timestamps: false, follow: true, text: "", ending: "\n" }; },
            ensureUi() {
                for (const conn of this.TP.connection.connections) {
                    if (conn.type == "serial" && !this.consoleUi[conn.id]) this.consoleUi[conn.id] = { showTelemetry: false, timestamps: false, follow: true, text: "", ending: "\n" };
                }
            },
            baudRates(current) { return SOURCES_BAUD_RATES.includes(Number(current)) ? SOURCES_BAUD_RATES : SOURCES_BAUD_RATES.concat([Number(current)]).sort((a, b) => a - b); },
            // Lines of a console to display: the latest ones, without the telemetry lines unless asked (a telemetry line that could not be
            // understood is always shown: it is what one looks for)
            consoleLines(conn) {
                const ui = this.ui(conn.id);
                const all = conn.console.lines;
                const pad = (n, w = 2) => String(n).padStart(w, "0");
                const lines = [];
                let hidden = 0;
                for (let i = all.length - 1; i >= 0 && lines.length < SOURCES_CONSOLE_LINES; i--) {
                    const l = all[i];
                    if (l.telemetry && !l.problem && !ui.showTelemetry) { hidden++; continue; }
                    const d = new Date(l.t);
                    lines.push({
                        key: l.t + ":" + i, text: l.text,
                        time: `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`,
                        cls: l.sent ? "sources-console-sent" : (l.problem ? "sources-console-problem" : (l.telemetry ? "sources-console-telemetry" : "")),
                    });
                }
                return { lines: lines.reverse(), hidden };
            },
            setConsole(id, el) { if (el) this._consoles[id] = el; else delete this._consoles[id]; },
            // Scrolling up to read stops following the newest line; coming back to the bottom follows again
            onConsoleScroll(id, event) {
                const el = event.target;
                if (this.consoleUi[id]) this.consoleUi[id].follow = el.scrollHeight - el.scrollTop - el.clientHeight < 6;
            },
            setFollow(id, follow) {
                this.ui(id).follow = follow;
                if (follow && this._consoles[id]) this._consoles[id].scrollTop = this._consoles[id].scrollHeight;
            },
            async send(source) {
                const ui = this.ui(source.id);
                if (!source.connected) return;
                if (await source.conn.send(ui.text, ui.ending)) ui.text = "";
                this.tick++;
            },
            remove(source) {
                this.TP.connection.removeConnection(source.conn);
                delete this.opened[source.id];
                delete this.consoleUi[source.id];
            },
            toggleSample() { if (this.ctx.sampleRunning) stopSampleData(this.ctx); else startSampleData(this.TP, this.ctx); },
            async startAdding() {
                this.adding = true;
                this.addError = "";
                try { this.granted = (await this.TP.connection.getGrantedSerialPorts()).map(g => Vue.markRaw(g)); } catch (e) { this.granted = []; }
            },
            addServer() {
                const address = String(this.addAddress).trim(), port = Number(this.addPort);
                if (!address || !(port > 0 && port < 65536)) { this.addError = "An address and a port between 1 and 65535 are needed."; return; }
                if (this.TP.connection.connections.some(c => c.type != "serial" && c.address == address && c.port == port)) { this.addError = "This server is already in the list."; return; }
                this.TP.connection.addConnectionTeleplotServer(address, port);
                this.adding = false;
            },
            // The browser's own dialog: it has to be asked from this click
            async chooseSerial() {
                this.addError = "";
                try {
                    const conn = await this.TP.connection.requestSerialPort(this.addBaud);
                    if (conn) this.adding = false; // (nothing chosen: the form stays)
                }
                catch (e) { this.addError = (e && e.message) || "The port could not be opened."; }
            },
            addGranted(granted) {
                this.TP.connection.addConnectionSerial(granted.port, this.addBaud);
                this.adding = false;
            },
        },
        created() { this._consoles = {}; },
        mounted() {
            this.ensureUi();
            this._timer = setInterval(() => { this.ensureUi(); this.tick++; }, 250);
        },
        // New lines: the consoles that follow stay on the newest one
        updated() {
            for (const id in this._consoles) {
                const el = this._consoles[id];
                if (this.consoleUi[id] && this.consoleUi[id].follow && el.scrollHeight - el.scrollTop - el.clientHeight > 1) el.scrollTop = el.scrollHeight;
            }
        },
        unmounted() { clearInterval(this._timer); },
        template: vueHTML,
    });
}
