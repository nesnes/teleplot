/*
 * Help panel (left): how to send data, the shortcuts, the sample data.
 * The first screen a newcomer sees (nothing displayed yet) is welcome.js.
 */

// Every message format worth knowing. `code` is exactly what to send (checked against the library's parser in tests/help.test.js).
const HELP_EXAMPLES = [
    { title: "A number", code: "temperature:25.3", note: "Stamped with the time it arrives.", expect: { name: "temperature", type: "number" } },
    { title: "With your own timestamp", code: "temperature:1627551892437:25.3", note: "The timestamp is in milliseconds.", expect: { name: "temperature", type: "number" } },
    { title: "Several samples at once", code: "speed:1000:1.2;1010:1.3;1020:1.4", note: "Separate the samples with a semicolon.", expect: { name: "speed", type: "number", samples: 3 } },
    { title: "A position", code: "position:12.5:4.2|xy", note: "Two numbers make an XY point.", expect: { name: "position", type: "2d" } },
    { title: "A point in space", code: "drone:1.5:0.2:3|xyz", note: "Three numbers make an XYZ point, shown in a 3D view with its trail.", expect: { name: "drone", type: "3d" } },
    { title: "A 3D shape", code: "3D|box:S:cube:P:1:0:0.5:W:1:D:1:H:1:C:orange", note: "S: cube, sphere, cylinder or stl. P: position. Also R or Q (rotation), C (color), O (opacity).", expect: { name: "box", shape: true } },
    { title: "A camera for an image", code: "3D|camera:K:554:554:320:240:640:480:P:0:0:1", note: "Sent to the name of an image telemetry: fx, fy, cx, cy, width, height in pixels, and where the camera is. 3D shapes can then be drawn over its images.", expect: { name: "camera", camera: true } },
    { title: "Some text", code: "state:forward|t", note: "Text is shown as a value, or in a log.", expect: { name: "state", type: "text" } },
    { title: "A unit", code: "temperature:25.3§°C", note: "Displayed next to the value.", expect: { name: "temperature", type: "number", unit: "°C" } },
    { title: "A log line", code: ">:Motors armed", note: "Lines starting with > go to the log.", expect: { log: true } },
    { title: "Not charted automatically", code: "debug:42|np", note: "Keeps it out of the Live dashboard; add it yourself in Edit mode.", expect: { name: "debug", type: "number", autoplot: false } },
];

const HELP_SHORTCUTS = [
    { keys: "Space", label: "Pause or resume" },
    { keys: "T", label: "Telemetries" },
    { keys: "S", label: "Sources" },
    { keys: "H", label: "This help" },
    { keys: "E", label: "Edit the dashboard" },
    { keys: "Esc", label: "Close a panel, leave Edit" },
];

const HELP_TERMINAL_EXAMPLE = 'echo "myData:4" | nc -u -w0 127.0.0.1 47269';

function initComponent_panel_help(vue) {
    let name = "panel-help";

    const vueHTML = `
        <div class="help-layout">
            <p class="help-lead">Teleplot plots whatever you send it. There is nothing to set up: send a value and it appears.</p>

            <section>
                <h2>Send data</h2>
                <p>Write text to <b>UDP port 47269</b>, from any language. Pick a format:</p>
                <div v-for="ex in examples" :key="ex.code" class="help-example">
                    <div class="help-example-head">
                        <span>{{ex.title}}</span>
                        <button class="help-copy" :class="{done: copied == ex.code}" :title="'Copy ' + ex.code" :aria-label="'Copy ' + ex.title" @click="copy(ex.code)">
                            <i :class="copied == ex.code ? 'icofont-check' : 'icofont-copy'"></i>
                        </button>
                    </div>
                    <code>{{ex.code}}</code>
                    <small>{{ex.note}}</small>
                </div>
                <div class="help-example">
                    <div class="help-example-head">
                        <span>From a terminal</span>
                        <button class="help-copy" :class="{done: copied == terminal}" title="Copy the command" aria-label="Copy the command" @click="copy(terminal)">
                            <i :class="copied == terminal ? 'icofont-check' : 'icofont-copy'"></i>
                        </button>
                    </div>
                    <code>{{terminal}}</code>
                </div>
            </section>

            <section>
                <h2>Shortcuts</h2>
                <dl class="help-keys">
                    <template v-for="s in shortcuts" :key="s.keys"><dt><kbd>{{s.keys}}</kbd></dt><dd>{{s.label}}</dd></template>
                </dl>
            </section>

            <section>
                <h2>Sample data</h2>
                <p>A simulated robot sends every kind of telemetry (numbers, positions, text, an image). A quick way to look around.</p>
                <button class="help-sample" @click="ctx.sampleRunning ? stopSample() : startSample()">{{ctx.sampleRunning ? 'Stop sample data' : 'Preview sample data'}}</button>
            </section>

            <footer>
                <a href="https://github.com/nesnes/teleplot" target="_blank" rel="noopener">Documentation and source code</a>
            </footer>
        </div>
    `;

    const vueCSS = `
        .help-layout {
            display: flex;
            flex-direction: column;
            gap: 1rem;
            box-sizing: border-box;
            max-height: calc(100vh - 7rem);
            padding: 0.4rem 0.8rem 1rem 0.2rem;
            overflow-y: auto;
            scrollbar-width: thin;
            color: var(--color-text);
        }
        .help-layout p { margin: 0 0 0.4rem; }
        .help-lead { font-size: 1.15rem; line-height: 1.4; color: var(--color-text-muted); }
        .help-layout h2 {
            margin: 0 0 0.4rem;
            font-size: 0.9rem;
            font-weight: 600;
            letter-spacing: 0.06em;
            text-transform: uppercase;
            color: var(--color-text-muted);
        }
        .help-example { margin-bottom: 0.5rem; }
        .help-example-head { display: flex; align-items: center; justify-content: space-between; font-weight: 500; }
        .help-layout code {
            display: block;
            padding: 0.35rem 0.55rem;
            border-radius: 0.4rem;
            background: color-mix(in srgb, var(--color-text) 7%, transparent);
            font: 0.95rem ui-monospace, Consolas, monospace;
            overflow-x: auto;
            white-space: nowrap;
            scrollbar-width: thin;
        }
        .help-example small { display: block; margin-top: 0.15rem; color: var(--color-text-muted); }
        .help-copy {
            width: 1.8rem; height: 1.8rem;
            display: grid; place-items: center;
            border: none; border-radius: 0.45rem;
            background: transparent; color: var(--color-text-muted);
            cursor: pointer;
            transition: background var(--motion-fast), color var(--motion-fast);
        }
        .help-copy:hover, .help-copy:focus-visible { background: color-mix(in srgb, var(--color-text) 9%, transparent); color: var(--color-text); outline: none; }
        .help-copy.done { color: var(--color-success); }
        .help-keys { display: grid; grid-template-columns: max-content 1fr; gap: 0.35rem 0.8rem; align-items: center; margin: 0; }
        .help-keys dt, .help-keys dd { margin: 0; }
        .help-layout kbd {
            font: 0.9rem ui-monospace, Consolas, monospace;
            padding: 0.05rem 0.45rem;
            border: 1px solid var(--color-bg-dark);
            border-radius: 0.35rem;
            background: var(--color-bg-light);
        }
        .help-sample {
            padding: 0.5rem 1rem;
            border: 1px solid var(--color-primary);
            border-radius: 0.6rem;
            background: transparent;
            color: var(--color-primary);
            font: inherit; font-weight: 600;
            cursor: pointer;
            transition: background var(--motion-fast), color var(--motion-fast);
        }
        .help-sample:hover, .help-sample:focus-visible { background: var(--color-primary); color: #fff; outline: none; }
        .help-layout footer a { color: var(--color-primary); }
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
                examples: HELP_EXAMPLES,
                shortcuts: HELP_SHORTCUTS,
                terminal: HELP_TERMINAL_EXAMPLE,
                copied: "", // The text that was just copied (the button confirms for a moment)
            }
        },
        methods: {
            startSample() { startSampleData(this.TP, this.ctx); },
            stopSample() { stopSampleData(this.ctx); },
            copy(text) {
                if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {});
                this.copied = text;
                clearTimeout(this._copiedTimer);
                this._copiedTimer = setTimeout(() => { this.copied = ""; }, 1200);
            },
        },
        unmounted() { clearTimeout(this._copiedTimer); },
        template: vueHTML,
    });
}
