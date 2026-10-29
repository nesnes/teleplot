/*
 * Joystick: drives one continuous setting (TELEM_ATTR_WRITE with rate and hold, doc/telecmd.md) while it is held.
 *   xy        a pad: right = +x, up = +y
 *   number    a rocker that springs back (option orientation: horizontal, right = +; vertical, up = +)
 *   pose2d    velocities of a robot (vx, vy, wz in its frame: x forward, y left): a pad (up = +x, left = +y) and a rotation rocker
 *             (left = +wz). With axes=x,yaw (a base that cannot go sideways): one stick, up = forward, left = turn left.
 * It is a display too: a ring shows what the device reports, CMD on or off. CMD on adds the knob: what the page sends. Released,
 * it springs back to rest (TELEPLOT.commands.release). Option keyboard: "off" (default), "arrows" or "wasd", read by key position,
 * only while the view has the focus (the page's own shortcuts are told to keep quiet: TELEPLOT.commands.keyboardCaptured).
 */
class ViewJoystick extends ViewTelemetries {
    constructor(divId, telemetryIdOrNameList, group="default") {
        super(divId, group);
        this.name = "joystick";
        this.type = "teleplot-joystick";
        this.telemetryIdOrNameList = telemetryIdOrNameList;
        this.supportedLabel = "continuous settings";
        this.options.keyboard = "off";
        this.options.orientation = "horizontal"; // Of the rocker of a number
        this.layout.width = 1;
        this.layout.height = 3;
        this.input = TELEPLOT.Vue.markRaw({ pad: [0, 0], rocker: 0, padHeld: false, rockerHeld: false, keys: new Set() }); // What the user holds (-1 to 1)
        this.state = TELEPLOT.Vue.reactive({ name: "", tip: "", mode: "", on: false, editable: false, why: "", held: false, knob: [0, 0], rocker: 0, reported: [0, 0], reportedRocker: 0, text: "", hasReport: false, keyboard: "off", focused: false, offNotice: false, refused: "" });
        this.telem = undefined;
    }

    init() {
        super.init();
        let self = this;
        this.vue.component(this.type, {
            name: this.type,
            data() { return { self, options: self.options, layout: self.layout, dragContext: self.dragContext, emptyState: self.emptyState, state: self.state, notLive: TELEPLOT.commands.NOT_LIVE }; },
            methods: {
                padDown: (e) => self.__press("pad", e),
                switchOn: () => { TELEPLOT.commands.setEnabled(true); self.state.offNotice = false; },
                goLive: () => TELEPLOT.view.backToLive(self.group),
                rockerDown: (e) => self.__press("rocker", e),
                onKey: (e) => self.__key(e, true),
                onKeyUp: (e) => self.__key(e, false),
                onFocus: () => { self.state.focused = true; TELEPLOT.commands.keyboardCaptured = self.state.editable && self.options.keyboard !== "off"; },
                onBlur: () => { self.state.focused = false; TELEPLOT.commands.keyboardCaptured = false; self.input.keys.clear(); self.__apply(); },
                onDragEnter: self.onDragEnter,
                onDragLeave: self.onDragLeave,
                onDragDrop: self.onDragDrop
            },
            template: ViewJoystick.vueHTML,
        });
        let element = document.getElementById(this.divId);
        if(element == null) { throw new Error(`Cannot create ${this.type} as #${this.divId} doesn't exists`); return; }
        element.append(document.createElement(this.type));
        this.vue.mount(`#${this.divId}`);
    }

    dispose() {
        if(this.__releasePress) this.__releasePress();
        clearTimeout(this.__offTimer);
        if(this.telem && TELEPLOT.commands.isHeld(this.telem)) TELEPLOT.commands.release(this.telem);
        TELEPLOT.commands.keyboardCaptured = false;
        super.dispose();
    }

    getOptionsSchema() {
        return [{ key: "keyboard", label: "Keyboard", type: "choice", choices: [["off", "Off"], ["arrows", "Arrows"], ["wasd", "WASD"]] },
            { key: "orientation", label: "Rocker", type: "choice", choices: [["horizontal", "Horizontal"], ["vertical", "Vertical"]] }];
    }

    // ------------------------------------------------------------------ What it does (no DOM: tested)

    // How a setting is driven: "pad" (xy), "pad+rocker" (pose2d), "stick" (pose2d without vy), "rocker" (a number); "" when it cannot be
    static modeOf(declaration) {
        if(!declaration || declaration.kind !== "setting") return "";
        if(declaration.type === "xy") return "pad";
        if(declaration.type === "pose2d") return declaration.axes && !declaration.axes.includes("y") ? "stick" : "pad+rocker";
        if(declaration.type === "number") return "rocker";
        return "";
    }

    // -1..1 to a value of the range (min..0..max, one side each; no range: -1..1), and back
    static scale(n, range) {
        let max = range && range.max !== undefined ? range.max : 1, min = range && range.min !== undefined ? range.min : -1;
        return n >= 0 ? n * max : -n * min;
    }
    static unscale(v, range) {
        let max = range && range.max !== undefined ? range.max : 1, min = range && range.min !== undefined ? range.min : -1;
        let n = v >= 0 ? (max !== 0 ? v / max : 0) : (min !== 0 ? -v / min : 0);
        return Math.max(-1, Math.min(1, n));
    }

    // The value sent for what is held: pad [right, up] and rocker (right or up = +), all -1..1
    static toValue(mode, pad, rocker, range) {
        let s = (n) => Math.round(ViewJoystick.scale(n, range) * 1000) / 1000 + 0; // (+0: no -0)
        if(mode === "pad") return [s(pad[0]), s(pad[1])];
        if(mode === "pad+rocker") return [s(pad[1]), s(-pad[0]), s(-rocker)];
        if(mode === "stick") return [s(pad[1]), 0, s(-pad[0])];
        if(mode === "rocker") return s(rocker);
        return undefined;
    }

    // Where a value is drawn: {pad: [right, up], rocker}, -1..1
    static toPlace(mode, value, range) {
        let u = (v) => ViewJoystick.unscale(Number(v) || 0, range);
        let v = Array.isArray(value) ? value : [value];
        if(mode === "pad") return { pad: [u(v[0]), u(v[1])], rocker: 0 };
        if(mode === "pad+rocker") return { pad: [-u(v[1]), u(v[0])], rocker: -u(v[2]) };
        if(mode === "stick") return { pad: [-u(v[2]), u(v[0])], rocker: 0 };
        if(mode === "rocker") return { pad: [0, 0], rocker: u(v[0]) };
        return { pad: [0, 0], rocker: 0 };
    }

    // A point in a pad (-1..1 each way, up = +) kept inside its circle
    static inCircle(x, y) {
        let length = Math.hypot(x, y);
        return length > 1 ? [x / length, y / length] : [x, y];
    }

    // What the keys held give: {pad, rocker}. keys: event.code values; layout "arrows" or "wasd"
    static fromKeys(mode, keys, layout) {
        let has = (code) => keys.has(code);
        let up = layout === "wasd" ? "KeyW" : "ArrowUp", down = layout === "wasd" ? "KeyS" : "ArrowDown";
        let left = layout === "wasd" ? "KeyA" : "ArrowLeft", right = layout === "wasd" ? "KeyD" : "ArrowRight";
        let forward = (has(up) ? 1 : 0) - (has(down) ? 1 : 0), side = (has(right) ? 1 : 0) - (has(left) ? 1 : 0);
        let strafe = layout === "wasd" ? (has("KeyE") ? 1 : 0) - (has("KeyQ") ? 1 : 0) : 0; // (Q / E: sideways, for a base that can)
        if(mode === "rocker") return { pad: [0, 0], rocker: side || forward };
        if(mode === "pad+rocker") return { pad: ViewJoystick.inCircle(strafe, forward), rocker: side }; // Left / right turn, as when driving
        return { pad: ViewJoystick.inCircle(side, forward), rocker: 0 };
    }

    // ------------------------------------------------------------------ Update

    update() {
        if(!super.__before_update()) return;
        let telem = this.telemetryIdOrNameList.map((entry) => TELEPLOT.datastore.getTelemetry(entry)).find((t) => t !== undefined && TELEPLOT.commands.isWritable(t));
        if(this.telem && telem !== this.telem && TELEPLOT.commands.isHeld(this.telem)) TELEPLOT.commands.release(this.telem);
        this.telem = telem;
        let state = this.state;
        if(!telem) { if(state.mode !== "") Object.assign(state, { mode: "", name: "" }); return; }
        let declaration = TELEPLOT.commands.declaration(telem);
        let mode = this.options.orientation === "vertical" && ViewJoystick.modeOf(declaration) === "rocker" ? "vrocker" : ViewJoystick.modeOf(declaration);
        let range = telem.getRange();
        let on = TELEPLOT.state.commands === true;
        let why = on ? TELEPLOT.commands.whyNotIn(telem, this.group) || (TELEPLOT.commands.isContinuous(telem) ? "" : "Not continuous: declare rate and hold") : "";
        let reported = TELEPLOT.commands.reported(telem);
        let base = mode === "vrocker" ? "rocker" : mode;
        let place = ViewJoystick.toPlace(base, reported ? reported.value : 0, range);
        let held = TELEPLOT.commands.isHeld(telem);
        if(!on || why) { this.input.padHeld = this.input.rockerHeld = false; this.input.keys.clear(); }
        let refusal = on ? TELEPLOT.commands.refusal(telem) : undefined; // (the device answers err to what it cannot apply)
        let next = { name: telem.getAttribute(TELEPLOT.protocol.TELEM_ATTR_NAME) || String(telem.id), tip: TELEPLOT.view.telemetryTip(telem), mode, on, editable: on && why === "", why, held,
            refused: refusal ? refusal.reason : "",
            knob: held ? this.input.pad.slice() : [0, 0], rocker: held ? this.input.rocker : 0, reported: place.pad, reportedRocker: place.rocker, hasReport: reported !== undefined,
            text: reported ? TELEPLOT.commands.formatValue(declaration.type, reported.value) : "", keyboard: this.options.keyboard };
        for(let key in next) if(JSON.stringify(state[key]) !== JSON.stringify(next[key])) state[key] = next[key];
        if(state.focused && (!next.editable || next.keyboard === "off")) TELEPLOT.commands.keyboardCaptured = false;
    }

    // Starts or keeps driving with what is held, or releases when nothing is
    __apply() {
        let telem = this.telem;
        if(!telem) return;
        let base = this.state.mode === "vrocker" ? "rocker" : this.state.mode;
        let byKeys = this.input.keys.size ? ViewJoystick.fromKeys(base, this.input.keys, this.options.keyboard) : undefined;
        if(byKeys && !this.input.padHeld) this.input.pad = byKeys.pad;
        if(byKeys && !this.input.rockerHeld) this.input.rocker = byKeys.rocker;
        if(this.input.padHeld || this.input.rockerHeld || byKeys) {
            if(!byKeys && !this.input.padHeld) this.input.pad = [0, 0];
            if(!byKeys && !this.input.rockerHeld) this.input.rocker = 0;
            let range = telem.getRange();
            TELEPLOT.commands.hold(telem, () => ViewJoystick.toValue(base, this.input.pad, this.input.rocker, range));
        }
        else {
            this.input.pad = [0, 0];
            this.input.rocker = 0;
            if(TELEPLOT.commands.isHeld(telem)) TELEPLOT.commands.release(telem);
        }
        this.state.knob = this.input.pad.slice();
        this.state.rocker = this.input.rocker;
        this.state.held = TELEPLOT.commands.isHeld(telem);
    }

    __press(which, event) {
        if(event.button !== 0) return;
        if(TELEPLOT.commands.blockedWhileOff(this.telem)) { // Nothing is sent: the view says why for a while
            this.state.offNotice = true;
            clearTimeout(this.__offTimer);
            this.__offTimer = setTimeout(() => { this.state.offNotice = false; }, TELEPLOT.commands.OFF_NOTICE_TIME);
            return;
        }
        if(!this.state.editable) return;
        event.preventDefault();
        let target = event.currentTarget;
        let vertical = which === "rocker" && this.state.mode === "vrocker";
        let read = (e) => {
            let box = target.getBoundingClientRect();
            if(which === "pad") {
                let r = Math.min(box.width, box.height) / 2;
                this.input.pad = ViewJoystick.inCircle((e.clientX - box.left - box.width / 2) / r, -(e.clientY - box.top - box.height / 2) / r);
            }
            else {
                let n = vertical ? -(e.clientY - box.top - box.height / 2) / (box.height / 2) : (e.clientX - box.left - box.width / 2) / (box.width / 2);
                this.input.rocker = Math.max(-1, Math.min(1, n));
            }
            this.__apply();
        };
        if(this.__releasePress) this.__releasePress(); // (a press that was never released: let it go first)
        if(which === "pad") this.input.padHeld = true; else this.input.rockerHeld = true;
        try { target.setPointerCapture(event.pointerId); } catch(e) {}
        read(event);
        // Followed on the window, not on the control: released anywhere (outside the pad, outside the view), it is released. Losing
        // the pointer capture or the focus of the window releases it too: a joystick must never stay held by itself.
        let pointerId = event.pointerId;
        let move = (e) => { if(e.pointerId === pointerId) read(e); };
        let up = (e) => {
            if(e && e.pointerId !== undefined && e.pointerId !== pointerId) return;
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
            window.removeEventListener("pointercancel", up);
            window.removeEventListener("blur", up);
            target.removeEventListener("lostpointercapture", up);
            this.__releasePress = undefined;
            if(which === "pad") this.input.padHeld = false; else this.input.rockerHeld = false;
            this.__apply();
        };
        this.__releasePress = up;
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
        window.addEventListener("pointercancel", up);
        window.addEventListener("blur", up);
        target.addEventListener("lostpointercapture", up);
    }

    static KEYS = { arrows: ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"], wasd: ["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE"] };
    __key(event, down) {
        let layout = this.options.keyboard;
        if(layout === "off" || !this.state.editable) return;
        if(event.key === "Escape") { this.input.keys.clear(); this.__apply(); event.target.blur(); return; }
        if(!(ViewJoystick.KEYS[layout] || []).includes(event.code)) return;
        event.preventDefault();
        event.stopPropagation(); // (the page's own shortcuts: not while driving)
        if(down) this.input.keys.add(event.code); else this.input.keys.delete(event.code);
        this.__apply();
    }

    static vueHTML = `
        <div class="teleplot-js-joystick-container teleplot-js-telemetry-card" v-bind:tabindex="state.keyboard != 'off' && state.editable ? 0 : undefined"
        :style=" { '--layout-width': layout.width, '--layout-height': layout.height }"
        v-bind:class="{'teleplot-js-joystick-off': !state.editable, 'teleplot-js-joystick-focus': state.focused && state.keyboard != 'off' && state.editable}"
        v-on:keydown="onKey" v-on:keyup="onKeyUp" v-on:focus="onFocus" v-on:blur="onBlur"
        ${ViewTelemetries.dragDropHtml}>
            <div v-if="emptyState.text" class="teleplot-js-empty">
                <div class="teleplot-js-empty-title">{{emptyState.text}}</div>
                <div v-if="emptyState.hint" class="teleplot-js-empty-hint">{{emptyState.hint}}</div>
            </div>
            <template v-else-if="state.mode">
                <div class="teleplot-js-joystick-name" v-bind:title="state.why ? state.tip + '\\n' + state.why : state.tip">{{state.name}}<span v-if="state.on" class="teleplot-js-cmd-pen">✎</span></div>
                <div class="teleplot-js-joystick-controls" v-bind:class="{'teleplot-js-joystick-vertical': state.mode == 'vrocker'}">
                    <div v-if="state.mode != 'rocker' && state.mode != 'vrocker'" class="teleplot-js-joystick-pad" v-bind:class="{'teleplot-js-joystick-held': state.held, 'teleplot-js-joystick-refusing': state.held && state.refused}"
                        v-on:pointerdown="padDown" v-bind:title="state.why || ''">
                        <div v-if="state.on" class="teleplot-js-joystick-knob" v-bind:style="{left: (50 + state.knob[0] * 50) + '%', top: (50 - state.knob[1] * 50) + '%'}"></div>
                        <div v-if="state.hasReport" class="teleplot-js-joystick-report" v-bind:style="{left: (50 + state.reported[0] * 50) + '%', top: (50 - state.reported[1] * 50) + '%'}" title="What the device reports"></div>
                    </div>
                    <div v-if="state.mode == 'pad+rocker' || state.mode == 'rocker' || state.mode == 'vrocker'" class="teleplot-js-joystick-rocker"
                        v-bind:class="{'teleplot-js-joystick-held': state.held, 'teleplot-js-joystick-refusing': state.held && state.refused}" v-on:pointerdown="rockerDown" v-bind:title="state.mode == 'pad+rocker' ? 'Rotation' : ''">
                        <div v-if="state.on" class="teleplot-js-joystick-rocker-knob" v-bind:style="state.mode == 'vrocker' ? {top: (50 - state.rocker * 50) + '%'} : {left: (50 + state.rocker * 50) + '%'}"></div>
                        <div v-if="state.hasReport" class="teleplot-js-joystick-rocker-report" v-bind:style="state.mode == 'vrocker' ? {top: (50 - state.reportedRocker * 50) + '%'} : {left: (50 + state.reportedRocker * 50) + '%'}"></div>
                    </div>
                </div>
                <div class="teleplot-js-joystick-value">{{state.text}}</div>
                <div v-if="state.on && state.refused" class="teleplot-js-joystick-keys teleplot-js-joystick-refused" role="status" v-bind:title="'The device refuses: ' + state.refused">✕ {{state.refused}}</div>
                <div v-else-if="state.on && state.keyboard != 'off' && state.editable" class="teleplot-js-joystick-keys">{{state.focused ? 'Keys drive · Esc' : 'Click to drive with the ' + (state.keyboard == 'wasd' ? 'WASD keys' : 'arrow keys')}}</div>
                <div v-else-if="state.on && state.why === notLive" class="teleplot-js-cmd-offnote" role="status" v-on:click.stop v-on:pointerdown.stop><span>Not live: nothing is sent.</span><button class="teleplot-js-cmd-button" v-on:click.stop="goLive">Go live</button></div>
                <div v-else-if="state.on && state.why" class="teleplot-js-joystick-keys">{{state.why}}</div>
                <div v-else-if="!state.on && !state.offNotice" class="teleplot-js-joystick-keys">Commands are off</div>
                <div v-if="!state.on && state.offNotice" class="teleplot-js-cmd-offnote" role="status" v-on:click.stop v-on:pointerdown.stop><span>Commands are off: nothing is sent.</span><button class="teleplot-js-cmd-button" v-on:click.stop="switchOn">Switch on</button></div>
            </template>
        </div>
    `;

    static vueCSS = `
        @scope (.teleplot-js-style)
        {
            .teleplot-js-joystick-container { position: relative; width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.3em; padding: 0.4em; box-sizing: border-box; outline: none; overflow: hidden; }
            .teleplot-js-joystick-focus { box-shadow: inset 0 0 0 2px var(--teleplot-primary); }
            .teleplot-js-joystick-name { font-size: 0.85em; color: var(--teleplot-muted); max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .teleplot-js-joystick-controls { display: flex; flex-direction: column; align-items: center; gap: 0.5em; width: 100%; flex: 1 1 auto; min-height: 0; justify-content: center; }
            .teleplot-js-joystick-vertical { flex-direction: row; }
            .teleplot-js-joystick-pad { position: relative; width: min(100%, 14em); aspect-ratio: 1; max-height: 100%; border-radius: 50%; touch-action: none; cursor: grab;
                background: radial-gradient(circle, color-mix(in srgb, var(--teleplot-text) 7%, transparent) 0 30%, transparent 31%), var(--teleplot-bg); border: 2px solid var(--teleplot-line); box-sizing: border-box; }
            .teleplot-js-joystick-pad::before, .teleplot-js-joystick-pad::after { content: ""; position: absolute; background: var(--teleplot-line); pointer-events: none; }
            .teleplot-js-joystick-pad::before { left: 50%; top: 8%; bottom: 8%; width: 1px; }
            .teleplot-js-joystick-pad::after { top: 50%; left: 8%; right: 8%; height: 1px; }
            .teleplot-js-joystick-knob { position: absolute; width: 28%; aspect-ratio: 1; transform: translate(-50%, -50%); border-radius: 50%; background: var(--teleplot-primary); box-shadow: 0 3px 10px rgba(0,0,0,.4); pointer-events: none; z-index: 1; }
            .teleplot-js-joystick-report, .teleplot-js-joystick-rocker-report { position: absolute; width: 0.75em; height: 0.75em; transform: translate(-50%, -50%); border-radius: 50%; border: 2px solid #1e9e5a; pointer-events: none; z-index: 2; }
            .teleplot-js-joystick-rocker { position: relative; width: min(100%, 14em); height: 1.8em; border-radius: 1em; background: var(--teleplot-bg); border: 2px solid var(--teleplot-line); touch-action: none; cursor: grab; box-sizing: border-box; flex: none; }
            .teleplot-js-joystick-vertical .teleplot-js-joystick-rocker { width: 1.8em; height: min(100%, 14em); }
            .teleplot-js-joystick-rocker::after { content: ""; position: absolute; left: 50%; top: 15%; bottom: 15%; width: 1px; background: var(--teleplot-line); }
            .teleplot-js-joystick-vertical .teleplot-js-joystick-rocker::after { top: 50%; left: 15%; right: 15%; width: auto; height: 1px; }
            .teleplot-js-joystick-rocker-knob { position: absolute; top: 50%; left: 50%; width: 1.7em; height: 1.7em; transform: translate(-50%, -50%); border-radius: 50%; background: var(--teleplot-primary); pointer-events: none; z-index: 1; }
            .teleplot-js-joystick-rocker-report { top: 50%; left: 50%; }
            .teleplot-js-joystick-held { border-color: #1e9e5a; box-shadow: 0 0 0 3px color-mix(in srgb, #1e9e5a 25%, transparent); }
            .teleplot-js-joystick-off .teleplot-js-joystick-pad, .teleplot-js-joystick-off .teleplot-js-joystick-rocker { cursor: default; opacity: 0.7; }
            .teleplot-js-joystick-value { font: 0.8em var(--teleplot-mono); color: var(--teleplot-muted); white-space: nowrap; }
            .teleplot-js-joystick-keys { font-size: 0.75em; color: var(--teleplot-muted); text-align: center; }
            .teleplot-js-joystick-refused { color: var(--teleplot-error); font-weight: 600; }
            .teleplot-js-joystick-held.teleplot-js-joystick-refusing { border-color: var(--teleplot-error); box-shadow: 0 0 0 3px color-mix(in srgb, var(--teleplot-error) 25%, transparent); }
        }
    `;
}

TELEPLOT.view.ViewJoystick = ViewJoystick;

{
    let elem = document.createElement('style');
    elem.textContent = ViewJoystick.vueCSS;
    document.head.appendChild(elem);
}
