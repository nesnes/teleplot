/*
 * Welcome: what the main area shows until there is a dashboard to display (nothing received yet, nothing created).
 * See doc/webapp-layout.md "Welcome".
 * The logo heads the page, as it is (the file, never redrawn): its center point, the red ring where its blue traces meet, is at the
 * center of the page, and a line goes down from just under it between two columns. Send, under the blue part (the sources: from your
 * code with the line to send in the language chosen in the Help, a serial port, a file, the sample), and See, under the red part:
 * what can be seen, as the Help's gallery: its tiles and pictures (HELP_TILES, helpPicture),
 * each with a line that makes it, a click opens the Help on it. They are drawings, never data: "Waiting for data" stays written above. Each source has its icon; a help button next to
 * the languages opens the Help written for the chosen one (ctx.helpRequest). Code and serial cards draw the path of their data:
 * places as icons (names in tooltips), words on the links, no "this page" at the
 * end (every path ends here), muted until there is a state: dashed = nothing came yet, solid green = data passed, red = cut (only a
 * link the page can see: from the server to here). The path is the status: a sentence only when it is cut. On a narrow page (its own width: a dock may narrow it) the columns wrap, one
 * under the other, without the line. The first telemetry brings the Live dashboard, which takes the place of this page.
 */
function initComponent_welcome(vue) {
    let name = "welcome";
    const SENDER_KEY = "teleplot.help.sender"; // (the choice of the Help panel: one language for the whole page)
    // The center point of the logo, measured on its shapes (fractions of its width and height), and the size of that ring
    const LOGO = { junctionX: 0.604, junctionY: 0.558, ring: 0.059, ratio: 24.068 / 10.490 };

    const vueHTML = `
        <section class="welcome">
            <div class="welcome-head"><img src="./media/logo-color.svg" class="welcome-logo" alt="Teleplot"/></div>
            <div class="welcome-cols">
                <div class="welcome-col">
                    <h2 class="welcome-h welcome-h-send">Send</h2>

                    <div class="welcome-src" :class="{bad: codePath.problem}">
                        <i class="welcome-icon icofont-code" :class="{bad: codePath.problem}" aria-hidden="true"></i>
                        <div class="welcome-src-main">
                            <b>From your code</b>
                            <div class="welcome-path" role="img" :aria-label="codePath.label">
                                <span class="welcome-node" title="Your code"><svg viewBox="0 0 24 24"><polyline points="8 6 2 12 8 18"/><polyline points="16 6 22 12 16 18"/></svg><span v-if="codePath.from" class="welcome-addr">{{codePath.from}}</span></span>
                                <span class="welcome-hop" :class="codePath.udp" title="UDP port 47269 of this computer (from another one, its address instead of 127.0.0.1)"><span>UDP 47269</span></span>
                                <span class="welcome-node" title="The Teleplot server"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="7" rx="1.5"/><rect x="3" y="13" width="18" height="7" rx="1.5"/><path d="M7 7.5h.01M7 16.5h.01"/></svg></span>
                                <span class="welcome-hop" :class="codePath.ws" title="WebSocket from the server to this page"><span>WebSocket</span><i v-if="codePath.ws == 'bad'" class="welcome-cut">✕</i></span>
                            </div>
                            <div class="welcome-langs">
                                <div class="welcome-seg" role="radiogroup" aria-label="How your code sends data">
                                    <button v-for="s in senders" :key="s.id" role="radio" :aria-checked="sender == s.id" :class="{on: sender == s.id}" :title="s.sub" @click="setSender(s.id)">{{s.name}}</button>
                                </div>
                                <button class="welcome-help" :title="'How to send data from ' + senderName + ': the Help'" :aria-label="'Help for ' + senderName" @click="openHelp()"><i class="icofont-question-circle"></i></button>
                            </div>
                            <div class="welcome-cmd"><code>{{command.text}}</code>
                                <button class="welcome-copy" :class="{done: copied == 'code'}" :title="copied == 'code' ? 'Copied' : 'Copy this line'" @click="copy('code', command.text)"><i :class="copied == 'code' ? 'icofont-check' : 'icofont-copy'"></i></button>
                            </div>
                            <span v-if="command.note" class="welcome-sub">{{command.note}}</span>
                            <p v-if="codePath.problem" class="welcome-sub welcome-error" role="status">{{codePath.problem}}</p>
                        </div>
                    </div>

                    <div class="welcome-src" :class="{off: !serialSupported, bad: serialPath.problem}">
                        <i class="welcome-icon icofont-usb" :class="{off: !serialSupported, bad: serialPath.problem}" aria-hidden="true"></i>
                        <div class="welcome-src-main">
                            <div class="welcome-title"><b>A serial port</b>
                                <button v-if="serialSupported && serialPath.open" class="welcome-btn" :title="'Close ' + serialPath.port" @click="closeSerial()">Close</button>
                                <button v-else-if="serialSupported" class="welcome-btn" @click="chooseSerial()">Choose a port…</button>
                            </div>
                            <template v-if="serialSupported">
                                <div class="welcome-path" role="img" :aria-label="serialPath.label">
                                    <span class="welcome-node" title="Your board"><svg viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14" rx="2"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/></svg><span v-if="serialPath.open" class="welcome-addr">{{serialPath.port}}</span></span>
                                    <span class="welcome-hop" :class="serialPath.link" :title="'A USB serial port at ' + baudRate + ' baud, read by this page (no server)'"><span>USB serial</span><i v-if="serialPath.link == 'bad'" class="welcome-cut">✕</i></span>
                                </div>
                                <div class="welcome-cmd"><code>{{serialSample}}</code>
                                    <button class="welcome-copy" :class="{done: copied == 'serial'}" :title="copied == 'serial' ? 'Copied' : 'Copy these lines'" @click="copy('serial', serialSample)"><i :class="copied == 'serial' ? 'icofont-check' : 'icofont-copy'"></i></button>
                                </div>
                                <span v-if="serialPath.problem" class="welcome-sub welcome-error" role="status">{{serialPath.problem}}</span>
                                <span v-else class="welcome-sub">{{serialPath.open ? 'Open: the first line that starts with > is drawn. The others are logs.' : 'Arduino, ESP32…: a line that starts with > is telemetry, the others are logs.'}}</span>
                            </template>
                            <span v-else class="welcome-sub">Needs Chrome, Edge or Opera on a computer.</span>
                        </div>
                    </div>

                    <div class="welcome-src">
                        <i class="welcome-icon icofont-folder-open" aria-hidden="true"></i>
                        <div class="welcome-src-main">
                            <b>A file</b>
                            <span class="welcome-sub">.teleplot, .txt or .csv: or drop it on the page</span>
                        </div>
                        <button class="welcome-btn" @click="$refs.file.click()">Open a file…</button>
                        <input ref="file" type="file" hidden @change="openFile($event)">
                    </div>

                    <div class="welcome-src welcome-sample">
                        <i class="welcome-icon icofont-robot" aria-hidden="true"></i>
                        <div class="welcome-src-main">
                            <b>The robot sample <span class="welcome-tryme">Try me</span></b>
                            <span class="welcome-sub">A simulated robot: curves, gauges, a map, 3D, a camera, buttons. Nothing to install.</span>
                        </div>
                        <button class="welcome-btn welcome-primary" @click="startSample()"><i class="icofont-ui-play"></i> Start</button>
                    </div>
                </div>

                <div class="welcome-col welcome-see">
                    <h2 class="welcome-h welcome-h-see">See</h2>
                    <p class="welcome-waiting" role="status"><i></i>Waiting for data: what you send picks the view.</p>
                    <template v-for="family in gallery" :key="family.title">
                        <h3 class="welcome-family">{{family.title}}</h3>
                        <div class="welcome-tiles">
                            <button v-for="tile in family.tiles" :key="tile.id" class="welcome-tile" :title="tile.title + ', ' + tile.sub + ': ' + tile.line + '. Click: how, in the Help'" @click="openHelp(tile.id)">
                                <span class="welcome-pic" v-html="tile.picture"></span>
                                <b>{{tile.title}}</b>
                                <code>{{tile.line}}</code>
                            </button>
                        </div>
                    </template>
                    <p class="welcome-more">All of them, with how to send them: <button class="welcome-link" @click="openHelp()">Help</button> <kbd>H</kbd></p>
                </div>
            </div>
        </section>
    `;

    const vueCSS = `
        .welcome {
            --logo-w: min(22rem, 72vw);
            --logo-h: calc(var(--logo-w) / ${LOGO.ratio});
            width: min(90rem, 100%); /* (wide enough for the gallery of See to have pictures that can be read) */
            margin: 0 auto;
            padding: 4.5rem 1.2rem 2rem; /* (room for the top menu) */
            box-sizing: border-box;
            color: var(--color-text);
            container-type: inline-size; /* (the columns wrap on the room the page has, not on the window: a dock open next to it narrows it) */
        }
        /* The logo, as it is: its center point at the center of the page */
        .welcome-head { position: relative; }
        .welcome-logo { display: block; width: var(--logo-w); height: auto; margin-left: calc(50% - var(--logo-w) * ${LOGO.junctionX}); }
        /* Kept as it is, on a dark page it sits on a light plate (its outlines are white, its name slate) */
        :root[data-theme="dark"] .welcome-logo { background: hsl(192 15% 96%); border-radius: 0.8rem; outline: 0.6rem solid hsl(192 15% 96%); }
        .welcome-cols { position: relative; display: grid; grid-template-columns: 1fr 1fr; column-gap: 3rem; margin-top: 1.4rem; }
        /* The line: from just under the center ring of the logo, down between the columns */
        .welcome-cols::before {
            content: ""; position: absolute; left: 50%; bottom: 0; width: 0;
            top: calc(var(--logo-h) * ${(LOGO.junctionY - 1).toFixed(3)} + var(--logo-w) * ${(LOGO.ring / 2).toFixed(4)} + 0.4rem - 1.4rem);
            border-left: 1.5px solid color-mix(in srgb, var(--color-text) 22%, transparent);
        }
        .welcome-col { display: flex; flex-direction: column; gap: 0.6rem; min-width: 0; }
        .welcome-h { margin: 0 0 0.1rem; font-size: 0.85rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
        .welcome-h-send { color: #2980b9; } .welcome-h-see { color: #e74c3c; }
        :root[data-theme="dark"] .welcome-h-send { color: #5dade2; } :root[data-theme="dark"] .welcome-h-see { color: #ff7b6b; }

        /* Send: the sources */
        .welcome-src { display: flex; align-items: flex-start; gap: 0.7rem; padding: 0.7rem 0.8rem; border-radius: 0.8rem; background: var(--color-bg-light); border: 1px solid var(--color-bg-dark); }
        .welcome-src.bad { border-color: color-mix(in srgb, var(--color-danger) 55%, var(--color-bg-dark)); }
        .welcome-src.off b { color: var(--color-text-muted); }
        /* What each source is: an icon in the blue of the sources (red when it cannot work, grey when it is not available here) */
        .welcome { --ic-src: #2980b9; } :root[data-theme="dark"] .welcome { --ic-src: #5dade2; }
        .welcome-icon { --ic: #2980b9; flex: none; display: grid; place-items: center; width: 2.2rem; height: 2.2rem; border-radius: 0.6rem; font-size: 1.25rem; color: var(--ic); background: color-mix(in srgb, var(--ic) 13%, transparent); }
        :root[data-theme="dark"] .welcome-icon { --ic: #5dade2; }
        .welcome-icon.bad { --ic: var(--color-danger); } .welcome-icon.off { --ic: var(--color-text-muted); }
        .welcome-sample .welcome-icon { --ic: var(--try); }
        .welcome-langs { display: flex; align-items: center; gap: 0.3rem; margin-top: 0.2rem; }
        .welcome-langs .welcome-seg { flex: 1; margin-top: 0; }
        .welcome-help { flex: none; border: none; background: none; color: var(--color-primary); font-size: 1.25rem; cursor: pointer; padding: 0 0.1rem; line-height: 1; }
        .welcome-help:hover { color: color-mix(in srgb, var(--color-primary) 75%, var(--color-text)); }
        .welcome-src-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.3rem; }
        .welcome-src-main > b, .welcome-title > b { font-size: 1.05rem; }
        .welcome-title { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
        .welcome-title .welcome-btn { padding: 0.2rem 0.75rem; }
        .welcome-sub { color: var(--color-text-muted); font-size: 0.9rem; line-height: 1.35; }
        .welcome-sub > b { color: var(--color-text); }
        .welcome-error { color: var(--color-danger); }
        .welcome-seg { display: flex; padding: 0.15rem; margin-top: 0.2rem; border-radius: 0.55rem; background: color-mix(in srgb, var(--color-text) 7%, transparent); }
        .welcome-seg button { flex: 1; padding: 0.2rem 0; border: none; border-radius: 0.45rem; background: none; color: var(--color-text-muted); font: inherit; font-size: 0.9rem; font-weight: 600; cursor: pointer; }
        .welcome-seg button.on { background: var(--color-bg-light); color: var(--color-text); box-shadow: 0 1px 3px var(--color-shadow); }
        .welcome-cmd { display: flex; align-items: flex-start; gap: 0.4rem; padding: 0.45rem 0.55rem; border-radius: 0.5rem; background: var(--color-bg); border: 1px solid var(--color-bg-dark); }
        .welcome-cmd code { flex: 1; min-width: 0; font: 0.88rem/1.4 ui-monospace, Consolas, monospace; overflow-wrap: anywhere; white-space: pre-wrap; color: var(--color-text); }
        .welcome-copy { flex: none; border: none; background: none; color: var(--color-primary); cursor: pointer; font-size: 1rem; padding: 0 0.1rem; }
        .welcome-copy.done { color: var(--color-success); }
        /* The path of the data: icons for the places, words on the links, muted until there is a state */
        .welcome-path { display: flex; align-items: center; gap: 0.2rem; width: 100%; font-size: 0.72rem; color: var(--color-text-muted); white-space: nowrap; }
        .welcome-node { flex: none; display: inline-flex; align-items: center; gap: 0.2rem; }
        .welcome-node svg { width: 1.05rem; height: 1.05rem; fill: none; stroke: color-mix(in srgb, var(--ic-src) 70%, var(--color-text-muted)); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
        .welcome-addr { font: 0.72rem ui-monospace, Consolas, monospace; color: var(--color-success); }
        /* (a link: its line on the middle of the icons, the arrowhead a triangle centered on it, the word above) */
        .welcome-hop { --lc: color-mix(in srgb, var(--color-text) 35%, transparent); position: relative; flex: 1; min-width: 3.5rem; height: 1.9rem; }
        .welcome-hop::before { content: ""; position: absolute; left: 0.1rem; right: 0.4rem; top: 50%; margin-top: -1px; border-top: 2px dashed var(--lc); }
        .welcome-hop::after { content: ""; position: absolute; right: 0; top: 50%; width: 0.6rem; height: 0.6rem; transform: translateY(-50%); background: var(--lc); clip-path: polygon(0 0, 100% 50%, 0 100%); }
        .welcome-hop > span { position: absolute; bottom: calc(50% + 0.15rem); left: 50%; transform: translateX(-50%); line-height: 1; }
        .welcome-hop.ok { --lc: var(--color-success); } .welcome-hop.bad { --lc: var(--color-danger); }
        .welcome-hop.ok::before, .welcome-hop.bad::before { border-top-style: solid; }
        .welcome-hop.bad > span { color: var(--color-danger); font-weight: 700; }
        .welcome-cut { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 0.95rem; height: 0.95rem; box-sizing: border-box; border-radius: 50%; border: 1.5px solid var(--color-danger); background: var(--color-bg-light); color: var(--color-danger); font: 700 0.6rem/1 sans-serif; font-style: normal; display: grid; place-items: center; }
        .welcome-btn { flex: none; align-self: center; padding: 0.35rem 0.9rem; border-radius: 0.6rem; border: 1px solid var(--color-bg-dark); background: var(--color-bg-light); color: var(--color-text); font: inherit; font-size: 0.95rem; font-weight: 600; cursor: pointer; white-space: nowrap; }
        .welcome-btn:hover { background: color-mix(in srgb, var(--color-text) 7%, var(--color-bg-light)); }
        .welcome-btn:focus-visible, .welcome-seg button:focus-visible, .welcome-help:focus-visible, .welcome-copy:focus-visible, .welcome-link:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 1px; }
        .welcome-primary { border-color: var(--color-primary); background: var(--color-primary); color: #fff; }
        .welcome-primary:hover { background: color-mix(in srgb, var(--color-primary) 85%, black); }
        /* The sample: the one that catches the eye (nothing to set up to see what Teleplot does) */
        /* (its accent is violet: red would read as an error, and red and blue already mean the two halves of the logo) */
        .welcome { --try: #8e44ad; } :root[data-theme="dark"] .welcome { --try: #b07cd8; }
        .welcome-sample { position: relative; border: 2px solid transparent;
            background: linear-gradient(var(--color-bg-light), var(--color-bg-light)) padding-box, linear-gradient(120deg, #2980b9, var(--try), #16a085, #2980b9) border-box;
            background-size: 100% 100%, 300% 300%; animation: welcome-shine 6s ease-in-out infinite; box-shadow: 0 4px 18px color-mix(in srgb, var(--try) 22%, transparent); }
        .welcome-tryme { display: inline-block; margin-left: 0.4rem; padding: 0.05rem 0.55rem; border-radius: 1rem; background: var(--try); color: #fff; font-size: 0.75rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; vertical-align: 0.12rem; animation: welcome-bounce 2.4s ease-in-out infinite; }
        .welcome-sample .welcome-primary { background: var(--try); border-color: var(--try); }
        .welcome-sample .welcome-primary:hover { background: color-mix(in srgb, var(--try) 85%, black); }

        /* See: what can be seen, the Help's gallery (its pictures take the colors the Help gives them) */
        .welcome {
            --hp-1: rgb(52, 152, 219); --hp-2: rgb(46, 204, 113); --hp-3: rgb(155, 89, 182); --hp-4: rgb(230, 126, 34); --hp-5: rgb(231, 76, 60);
            --hp-text: var(--color-text); --hp-muted: var(--color-text-muted); --hp-bg: var(--color-bg-light); --hp-line: var(--color-bg-dark);
            --hp-grid: color-mix(in srgb, var(--color-text) 9%, transparent); --hp-warn: var(--teleplot-warn, var(--color-warning)); --hp-ok: var(--color-success);
        }
        .welcome-waiting { display: flex; align-items: center; gap: 0.5rem; margin: 0; font-weight: 700; }
        .welcome-waiting i { flex: none; width: 0.6rem; height: 0.6rem; border-radius: 50%; border: 2px solid var(--color-text-muted); box-sizing: border-box; }
        .welcome-family { margin: 0.4rem 0 -0.1rem; font-size: 0.8rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--color-text-muted); }
        .welcome-see { container-type: inline-size; } /* (four tiles a family: in a row, or two by two when the column is narrow) */
        .welcome-tiles { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.6rem; }
        @container (min-width: 38rem) { .welcome-tiles { grid-template-columns: repeat(4, 1fr); } }
        .welcome-tile { display: flex; flex-direction: column; align-items: stretch; gap: 0.3rem; min-width: 0; padding: 0.5rem; border-radius: 0.7rem; border: 1px solid var(--color-bg-dark); background: var(--color-bg-light); color: var(--color-text); font: inherit; text-align: left; cursor: pointer; transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s; }
        .welcome-tile:hover { border-color: var(--color-primary); box-shadow: 0 4px 14px var(--color-shadow); transform: translateY(-1px); }
        .welcome-tile:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 1px; }
        .welcome-pic { display: block; padding: 0.3rem; border-radius: 0.4rem; background: var(--color-bg); }
        .welcome-pic svg { display: block; width: 100%; height: auto; aspect-ratio: 12 / 5; } /* (all as wide: a joystick picture is narrower) */
        .welcome-tile b { font-size: 1.05rem; line-height: 1.2; }
        .welcome-tile code { font: 0.82rem ui-monospace, Consolas, monospace; color: var(--color-text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .welcome-more { margin: 0.2rem 0 0; color: var(--color-text-muted); }
        .welcome-link { padding: 0; border: none; background: none; color: var(--color-primary); font: inherit; font-weight: 600; cursor: pointer; }
        .welcome kbd { padding: 0 0.35rem; border-radius: 0.3rem; border: 1px solid var(--color-bg-dark); font: 600 0.8rem ui-monospace, Consolas, monospace; color: var(--color-text-muted); }

        @keyframes welcome-shine { 0%, 100% { background-position: 0 0, 0% 50%; } 50% { background-position: 0 0, 100% 50%; } }
        @keyframes welcome-bounce { 0%, 80%, 100% { transform: none; } 88% { transform: translateY(-0.18rem) rotate(-3deg); } 94% { transform: translateY(0) rotate(2deg); } }
        @media (prefers-reduced-motion: reduce) { .welcome-sample, .welcome-tryme { animation: none; } }

        /* Narrow: the columns wrap, one under the other, without the line; the logo centered */
        @container (max-width: 46rem) {
            .welcome-cols { grid-template-columns: 1fr; row-gap: 1.6rem; }
            .welcome-cols::before { display: none; }
            .welcome-logo { margin: 0 auto; }
        }
    `;
    // Add css to head
    {
        let elem = document.createElement('style');
        elem.textContent = vueCSS;
        document.head.appendChild(elem);
    }

    // The gallery of the See column: tiles of the Help, by family, each with one line that makes it
    const GALLERY = [["Numbers", ["curve", "gauge", "together", "marks"]], ["Text over time", ["state", "log", "timeline", "stack"]],
        ["Space", ["map", "scene", "cloud", "mesh"]], ["Pictures and control", ["camera", "pixels", "settings", "joystick"]]];
    // The line of a tile: its first message that is data (not a dashboard, an attribute or a picture, which say less on their own)
    const tileLine = (tile) => {
        const codes = (tile.examples || []).map((e) => e.code);
        const code = codes.find((c) => !/^(DASH|ATTR|TH|PNG|JPG)\|/.test(c)) || codes[0] || "";
        return helpShort(helpFill(code), 60);
    };
    const galleryOf = () => GALLERY.map(([title, ids]) => ({ title, tiles: ids.map((id) => HELP_TILES.find((t) => t.id == id)).filter(Boolean)
        .map((t) => ({ id: t.id, title: t.title, sub: t.sub, picture: helpPicture(t.picture), line: tileLine(t) })) }));

    const remembered = () => { try { return localStorage.getItem(SENDER_KEY); } catch (e) { return null; } };

    return vue.component(name, {
        name: name,
        setup() {
            const TP = Vue.inject("TP");
            const ctx = Vue.inject("ctx");
            return { TP, ctx, senders: HELP_SENDERS, gallery: galleryOf() };
        },
        data() {
            const id = remembered();
            return { sender: HELP_SENDERS.some((s) => s.id == id) ? id : HELP_SENDERS[0].id, copied: "", serialError: "", tick: 0, baudRate: 115200 };
        },
        computed: {
            // The path from your code: the page cannot see whether a device sends (dashed until data came), it sees the server
            codePath() {
                this.tick; // (what came is counted in raw stats: read again twice a second)
                const servers = this.TP.connection.connections.filter((c) => c.type == "teleplot-server");
                const connected = servers.filter((c) => c.connected);
                const fed = connected.find((c) => c.stats.messages > 0);
                const sender = fed && Object.values(fed.senders || {})[0];
                const from = sender ? String(sender).replace(/:\d+$/, "") : "";
                let problem = "";
                if (!servers.length) problem = "No Teleplot server configured: add one in the Sources panel (or use a serial port, a file).";
                else if (!connected.length) problem = "The Teleplot server at " + servers[0].name + " does not answer: start it (or use a serial port, a file).";
                const udp = fed ? "ok" : "wait", ws = problem ? "bad" : "ok";
                const label = "Your code, UDP 47269, the server, WebSocket, this page: " + (problem ? "the server does not answer" : (fed ? "data came" + (from ? " from " + from : "") : "the server is listening, nothing came yet"));
                return { udp, ws, from, problem, label };
            },
            // The path from a board: solid once a port that is open has given something
            // The path from a board: the page sees the port, so it is green once a port is open (like the WebSocket of the server), red when it was lost
            serialPath() {
                const ports = this.TP.connection.connections.filter((c) => c.type == "serial");
                const open = ports.find((c) => c.connected);
                const last = ports[ports.length - 1], failed = !open && last && last.error ? last : null; // (a port closed after another was lost: the last one tells)
                const problem = this.serialError || (failed ? failed.error + "." : "");
                const link = open ? "ok" : (problem ? "bad" : "wait");
                const label = "Your board, USB serial, this page: " + (open ? open.name + " is open" : (problem ? problem : "no port open yet"));
                return { open: !!open, port: open ? open.name : "", link, problem, label, connection: open };
            },
            // What a board sends: the Help's line for an Arduino, after its set-up
            serialSample() {
                const line = helpLine("ino", { code: "temperature:25.3" });
                return "Serial.begin(" + this.baudRate + ");\n" + line.parts.map((p) => p.text).join("");
            },
            // The line that sends one number, for the chosen way (the same line as the Help's first tile)
            command() {
                const line = helpLine(this.sender, { code: "temperature:25.3" });
                const note = this.sender == "ino" ? "An Arduino sends on its serial port: open it below." : (this.sender == "cpp" ? "With clients/cpp/Teleplot.h (the Help has its set-up)." : "");
                return { text: line.parts.map((p) => p.text).join(""), note };
            },
            serialSupported() { return this.TP.connection.serialSupported(); },
            senderName() { const s = HELP_SENDERS.find((s) => s.id == this.sender); return s ? s.name : ""; },
        },
        methods: {
            setSender(id) {
                this.sender = id;
                try { localStorage.setItem(SENDER_KEY, id); } catch (e) { /* (private browsing...: not remembered) */ }
            },
            copy(what, text) {
                if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {});
                this.copied = what;
                clearTimeout(this._copiedTimer);
                this._copiedTimer = setTimeout(() => { this.copied = ""; }, 1500);
            },
            // The browser's own dialog: it has to be asked from this click
            async chooseSerial() {
                this.serialError = "";
                try { await this.TP.connection.requestSerialPort(this.baudRate); }
                catch (e) { this.serialError = (e && e.message) || "The port could not be opened."; } // (closing the picker is not an error: nothing is thrown)
            },
            closeSerial() {
                const c = this.serialPath.connection;
                if (c) c.disconnect();
            },
            // A file goes to the Export and import panel, the only place where files are opened
            openFile(event) {
                const input = event.target;
                if (input.files.length) { this.ctx.droppedFiles = Vue.markRaw(Array.from(input.files)); this.ctx.exportOpen = true; }
                input.value = "";
            },
            startSample() { startSampleData(this.TP, this.ctx); },
            // The Help, written for this language, on a tile (by default its first: one number, the same message as here, and how to set the language up)
            openHelp(tile = "curve") {
                this.ctx.helpRequest = { sender: this.sender, tile };
                this.ctx.exportOpen = false;
                this.ctx.helpOpen = true;
            },
        },
        mounted() { this._tickTimer = setInterval(() => { this.tick++; }, 500); },
        unmounted() { clearTimeout(this._copiedTimer); clearInterval(this._tickTimer); },
        template: vueHTML,
    });
}
