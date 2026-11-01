/*
 * The time line (doc/moments.md "The line"): one component, at the bottom of the top menu and of charts. A line of a few pixels: at
 * rest what there is to say of the time (data, the moment shown, holes) and the moments of one telemetry; open, a track per
 * telemetry above it. It opens over what is above it and never moves anything. The host gives what to draw (draw), which is done
 * again only when something changed.
 *
 * TELEPLOT.timeLine.map() places a period on a width: the periods covered end to end, and a long period without any data (an old
 * file next to live data: longer than 10 s and 5 % of it all) folded to FOLD_PX. segments: [{t0, t1, px0, px1}], null without data.
 */
TELEPLOT.timeLine = {
    FOLD_PX: 6,
    ROW: 5,        // Height of a track
    ROW_GAP: 1,
    BLOCK_GAP: 4,  // Between telemetries
    LAYER: 0.34,   // What each level adds to a moment on the line (stacked opacities)

    map(intervals, width, left = 0) {
        if(!intervals.length || !(width > 0)) return null;
        const FOLD = TELEPLOT.timeLine.FOLD_PX;
        intervals.sort((a, b) => a[0] - b[0]);
        let total = Math.max(0, intervals.reduce((m, i) => Math.max(m, i[1]), -Infinity) - intervals[0][0]);
        let fold = Math.max(10, total * 0.05), merged = [];
        for(let [t0, t1] of intervals) {
            let last = merged[merged.length - 1];
            if(last && t0 - last[1] <= fold) last[1] = Math.max(last[1], t1);
            else merged.push([t0, t1]);
        }
        let duration = merged.reduce((sum, [t0, t1]) => sum + (t1 - t0), 0);
        let usable = Math.max(1, width - FOLD * (merged.length - 1));
        let segments = [], px = left;
        for(let [t0, t1] of merged) {
            let w = duration > 0 ? usable * (t1 - t0) / duration : usable / merged.length;
            segments.push({ t0, t1, px0: px, px1: px + w });
            px += w + FOLD;
        }
        return { segments, from: merged[0][0], to: merged[merged.length - 1][1], width };
    },
    // A plain window of time on a width (a chart): nothing folded
    window(from, to, width, left = 0) {
        if(!(to > from) || !(width > 0)) return null;
        return { segments: [{ t0: from, t1: to, px0: left, px1: left + width }], from, to, width };
    },
    px(map, t) {
        let s = map.segments;
        if(t <= s[0].t0) return s[0].px0;
        for(let i = 0; i < s.length; i++) {
            if(t <= s[i].t1) return s[i].t1 > s[i].t0 ? s[i].px0 + (s[i].px1 - s[i].px0) * (t - s[i].t0) / (s[i].t1 - s[i].t0) : s[i].px1;
            if(i + 1 < s.length && t < s[i + 1].t0) return s[i].px1 + TELEPLOT.timeLine.FOLD_PX / 2; // (in a folded period)
        }
        return s[s.length - 1].px1;
    },
    time(map, px) {
        let s = map.segments, half = TELEPLOT.timeLine.FOLD_PX / 2;
        for(let i = 0; i < s.length; i++) {
            if(px <= s[i].px1 || i == s.length - 1) {
                if(px <= s[i].px0) return i > 0 && px > s[i].px0 - half ? s[i].t0 : (i > 0 ? s[i - 1].t1 : s[i].t0);
                return s[i].px1 > s[i].px0 ? Math.min(s[i].t1, s[i].t0 + (s[i].t1 - s[i].t0) * (px - s[i].px0) / (s[i].px1 - s[i].px0)) : s[i].t1;
            }
        }
        return s[s.length - 1].t1;
    },

    // What opens: per telemetry, a block of rows (depth first). No canvas: tested. [{telem, top, rows: [{top, moments}]}], height
    layout(telemetries, height = TELEPLOT.timeLine.ROW) {
        let TL = TELEPLOT.timeLine, blocks = [], y = 0;
        for(let telem of telemetries) {
            let rows = [], top = y;
            for(let level of TELEPLOT.moments.of(telem).rows) {
                for(let row of level) { rows.push({ top: y, moments: row }); y += height + TL.ROW_GAP; }
            }
            if(rows.length) { blocks.push({ telem, top, rows }); y += TL.BLOCK_GAP; }
        }
        return { blocks, height: blocks.length ? y - TL.BLOCK_GAP : 0 };
    },
    // The moment of a row at a pixel: on it, or the nearest within 2 px (a very short one)
    hit(map, moments, x) {
        let best = undefined, distance = 3;
        for(let moment of moments) {
            let a = TELEPLOT.timeLine.px(map, moment.from), b = TELEPLOT.timeLine.px(map, TELEPLOT.moments.end(moment));
            let d = x < a ? a - x : x > b ? x - b : 0;
            if(d < distance) { distance = d; best = moment; }
        }
        return best;
    },
    // What the line shows at rest for a period: the moments of one telemetry, at the level that has several of them in that period (so
    // that zooming on a moment shows what is inside it), and the failures of the others
    rest(telemetries, map) {
        let main = TELEPLOT.moments.primaryOf(telemetries);
        if(main === undefined) return { moments: [], failures: [] };
        let inView = (moment) => !map || (TELEPLOT.moments.end(moment) >= map.from && moment.from <= map.to);
        let depth = TELEPLOT.moments.restLevel(main, map ? map.from : undefined, map ? map.to : undefined);
        let moments = TELEPLOT.moments.level(main, depth).filter(inView), failures = [];
        for(let telem of telemetries) {
            for(let moment of TELEPLOT.moments.of(telem).moments) if(moment.failed && inView(moment) && (telem !== main || moment.depth !== depth)) failures.push(moment);
        }
        return { moments, failures };
    },
};

class TimeLine {
    // options: { hoverOpens (the pointer on the line opens the tracks; the host says otherwise), pickOnLine (a click on the line picks
    // a moment; the host handles it otherwise), onPick(moment), rowHeight (of the tracks: from 12 px they are named), onPan(seconds),
    // onZoom(scale, at) (the line moves through time: drag, wheel, fingers) }
    constructor(options = {}) {
        this.options = options;
        this.element = document.createElement("div");
        this.element.className = "teleplot-js-timebar";
        this.tracks = document.createElement("canvas");
        this.tracks.className = "teleplot-js-timebar-tracks";
        this.line = document.createElement("canvas");
        this.line.className = "teleplot-js-timebar-line";
        this.tip = document.createElement("div");
        this.tip.className = "teleplot-js-timebar-tip";
        this.tip.hidden = true;
        this.caption = document.createElement("div");
        this.caption.className = "teleplot-js-timebar-caption";
        this.caption.hidden = true;
        this.element.append(this.tracks, this.tip, this.caption, this.line);
        this.state = undefined;
        this.layout = undefined;
        this.key = "";
        this.over = undefined;
        this.hovered = false;
        // A mouse opens the tracks by pointing; a finger has no hover: a tap opens them, they stay until a tap elsewhere, and what the
        // finger does here is not for the view around (its gestures, a press that would select it)
        this.finger = false;
        if(options.onPan) this.__listenToMoves();
        this.element.addEventListener("pointerenter", (event) => { if(event.pointerType === "touch") return; this.hovered = true; if(this.options.hoverOpens) this.redraw(); });
        this.element.addEventListener("pointerleave", (event) => { if(event.pointerType === "touch") return; this.hovered = false; this.setOver(undefined); if(this.options.hoverOpens) this.redraw(); });
        this.element.addEventListener("pointermove", (event) => this.pointer(event));
        this.element.addEventListener("pointerdown", (event) => {
            this.finger = event.pointerType === "touch";
            if(this.finger && this.options.hoverOpens) event.stopPropagation();
        });
        this.element.addEventListener("touchstart", (event) => { if(this.options.hoverOpens) event.stopPropagation(); }, { passive: true });
        this.element.addEventListener("contextmenu", (event) => { if(this.finger) event.preventDefault(); });
        this.element.addEventListener("click", (event) => {
            if(this.dragged) { this.dragged = false; event.stopPropagation(); return; } // (the end of a drag)
            if(this.finger && this.options.hoverOpens && !this.hovered) {
                event.stopPropagation();
                this.openByFinger();
                return;
            }
            let moment = this.pointer(event);
            if(moment && this.options.onPick) { event.stopPropagation(); this.options.onPick(moment); }
        });
    }

    // Moving through time from the line: a drag (the time follows the pointer), the wheel (with Ctrl, or a trackpad pinch: zoom), fingers
    __listenToMoves() {
        let perPixel = () => {
            let map = this.state && this.state.map;
            return map ? (map.to - map.from) / Math.max(1, map.segments[map.segments.length - 1].px1 - map.segments[0].px0) : 0;
        };
        let timeAt = (x) => TELEPLOT.timeLine.time(this.state.map, x);
        this.element.addEventListener("wheel", (event) => {
            if(!this.state || !this.state.map) return;
            event.preventDefault();
            let unit = event.deltaMode === 1 ? 33 : event.deltaMode === 2 ? 300 : 1;
            if(event.ctrlKey) this.options.onZoom(Math.exp(-event.deltaY * unit * 0.01), timeAt(event.clientX - this.element.getBoundingClientRect().left));
            else this.options.onPan((Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY) * unit * perPixel());
        }, { passive: false });
        let pressed = undefined;
        this.element.addEventListener("mousedown", (event) => event.preventDefault()); // (nothing gets selected on the page)
        this.element.addEventListener("pointerdown", (event) => { this.dragged = false; if(event.pointerType === "mouse" && event.button === 0) pressed = { x: event.clientX, start: event.clientX }; });
        this.element.addEventListener("pointermove", (event) => {
            if(!pressed) return;
            if(!this.dragged && Math.abs(event.clientX - pressed.start) <= 3) return;
            if(!this.dragged) { this.dragged = true; this.element.setPointerCapture(event.pointerId); this.element.classList.add("teleplot-js-timebar-dragging"); }
            this.options.onPan((pressed.x - event.clientX) * perPixel());
            pressed.x = event.clientX;
        });
        let released = () => { pressed = undefined; this.element.classList.remove("teleplot-js-timebar-dragging"); };
        this.element.addEventListener("pointerup", released);
        this.element.addEventListener("pointercancel", released);
        this.element.style.touchAction = "none"; // (fingers are for it: see touchGestures)
        TELEPLOT.view.touchGestures(this.element, {
            pinch: (step) => {
                if(!this.state || !this.state.map) return;
                this.options.onZoom(step.scale, timeAt(step.cx));
                this.options.onPan(-step.dx * perPixel());
            },
            swipe: (dx) => { if(Math.abs(dx) > 0) { this.dragged = true; this.options.onPan(-dx * perPixel()); } },
        });
    }

    // Open until a tap elsewhere
    openByFinger() {
        this.hovered = true;
        this.redraw();
        this.outside = (event) => {
            if(this.element.contains(event.target)) return;
            this.closeByFinger();
        };
        document.addEventListener("pointerdown", this.outside, true);
    }
    closeByFinger() {
        if(this.outside) document.removeEventListener("pointerdown", this.outside, true);
        this.outside = undefined;
        this.hovered = false;
        this.setOver(undefined);
        this.redraw();
    }

    get isOpen() { return !!this.state && this.state.moments.length > 0 && (this.state.open || (this.options.hoverOpens && this.hovered)); }
    redraw() { if(this.state) { this.key = ""; this.draw(this.state); } }

    // state: { map, width, height (of the line), mode, knob (px, < 0: none), gaps [{from, to}], data (the line shows the data covered),
    // show (draw it at all), moments (telemetries), open, selected (a moment), caption (a text over its left end) }
    draw(state) {
        this.state = state;
        let caption = !this.isOpen && state.caption ? state.caption : "";
        this.caption.hidden = caption === "";
        if(this.caption.textContent !== caption) this.caption.textContent = caption;
        if(caption !== "" && state.map) this.caption.style.left = Math.round(state.map.segments[0].px0) + "px";
        let list = state.moments, TL = TELEPLOT.timeLine, map = state.map;
        let count = 0, ends = "";
        for(let telem of list) { let found = TELEPLOT.moments.of(telem); count += found.count; if(found.moments.length && map) ends += Math.round(TL.px(map, TELEPLOT.moments.end(found.moments[found.moments.length - 1]))) + ","; }
        let selected = state.selected, primary = TELEPLOT.moments.primaryOf(list);
        let key = [state.width, state.height, state.mode, state.knob, state.show, state.data, this.isOpen, count, ends, primary ? primary.id : "", list.length, selected ? selected.path + selected.from : "", this.over ? this.over.path + this.over.from : "",
            map ? map.from + "-" + map.to + ":" + map.segments.map((s) => Math.round(s.px0) + ":" + Math.round(s.px1)).join(",") : "none", (state.gaps || []).map((g) => g.from + "-" + g.to).join(","), TELEPLOT.theme.key()].join("|");
        if(key === this.key) return;
        this.key = key;
        this.__drawLine(state);
        this.__drawTracks(state);
    }

    __canvas(canvas, width, height) {
        let ratio = window.devicePixelRatio || 1;
        if(canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) { canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio); }
        let c = canvas.getContext("2d");
        c.setTransform(ratio, 0, 0, ratio, 0, 0);
        c.clearRect(0, 0, width, height);
        return c;
    }

    // A moment on the line: a layer, and one more for each level inside it, so that it is darker where something runs inside it
    __layers(c, moment, map, height, color, selected) {
        let TL = TELEPLOT.timeLine;
        let a = TL.px(map, moment.from), b = Math.max(a + 1, TL.px(map, TELEPLOT.moments.end(moment)));
        c.fillStyle = moment.failed ? color("--teleplot-error") : moment === selected ? color("--teleplot-primary") : color("--teleplot-muted");
        c.globalAlpha = moment.failed || moment === selected ? 0.9 : TL.LAYER;
        c.fillRect(a, 0, b - a, height);
        for(let child of moment.children) this.__layers(c, child, map, height, color, selected);
    }

    __drawLine(state) {
        let { map, width, height, mode, knob } = state, TL = TELEPLOT.timeLine;
        let c = this.__canvas(this.line, width, height);
        if(!map || !state.show) return;
        let css = getComputedStyle(this.line), color = (name) => css.getPropertyValue(name).trim();
        let held = color(mode == "replay" ? "--teleplot-replay" : "--teleplot-primary");
        if(state.data) { // Covered by data, in grey; not live, in the color of the mode up to the moment shown (the data after it stays grey)
            c.fillStyle = color("--teleplot-line");
            c.fillRect(0, 0, width, height);
            c.globalAlpha = 0.45;
            c.fillStyle = color("--teleplot-muted");
            for(let s of map.segments) c.fillRect(s.px0, 0, s.px1 - s.px0, height);
            c.globalAlpha = 1;
            if(mode != "live") {
                c.globalAlpha = 0.85;
                c.fillStyle = held;
                for(let s of map.segments) if(s.px0 < knob) c.fillRect(s.px0, 0, Math.min(s.px1, knob) - s.px0, height);
                c.globalAlpha = 1;
            }
        }
        let rest = TL.rest(state.moments, map);
        if(rest.moments.length) {
            let last = -1;
            for(let moment of rest.moments) {
                let a = TL.px(map, moment.from);
                if(a - last < 0.5 && !moment.failed) continue; // (several in a pixel)
                last = a;
                this.__layers(c, moment, map, height, color, state.selected);
            }
            c.globalAlpha = 1;
            for(let moment of rest.moments) { // The cuts between them
                let a = TL.px(map, moment.from);
                if(a > 1) c.clearRect(a - 0.5, 0, 1, height);
            }
        }
        for(let moment of rest.failures) {
            c.fillStyle = color("--teleplot-error");
            c.globalAlpha = 0.9;
            let a = TL.px(map, moment.from);
            c.fillRect(a, 0, Math.max(1, TL.px(map, TELEPLOT.moments.end(moment)) - a), height);
        }
        c.globalAlpha = 1;
        if((state.gaps || []).length) { // Holes: hatched
            c.fillStyle = color("--teleplot-warn");
            for(let gap of state.gaps) {
                let a = Math.round(TL.px(map, gap.from)), b = Math.round(TL.px(map, gap.to));
                for(let x = a; x < Math.max(a + 2, b); x += 4) c.fillRect(x, 0, 2, height);
            }
        }
        if(state.data) { // Folded periods without data: a notch
            for(let i = 1; i < map.segments.length; i++) c.clearRect(map.segments[i - 1].px1 + 1, 0, TL.FOLD_PX - 2, height);
            let knobAt = (x, fill) => { // (round when the line is thick enough for it)
                c.fillStyle = fill;
                if(height >= 5) { c.beginPath(); c.arc(Math.min(width - height / 2, Math.max(height / 2, x)), height / 2, height / 2, 0, 2 * Math.PI); c.fill(); }
                else c.fillRect(Math.min(width - 3, Math.max(0, x - 1.5)), 0, 3, height);
            };
            if(mode != "live") knobAt(knob, held);
            else knobAt(width, color("--teleplot-error")); // (the newest end)
        }
    }

    __drawTracks(state) {
        let TL = TELEPLOT.timeLine, open = this.isOpen && state.map;
        let rowHeight = this.options.rowHeight || TL.ROW;
        this.layout = open ? TL.layout(state.moments, rowHeight) : undefined;
        let height = open ? this.layout.height + 4 : 0;
        this.tracks.style.height = height + "px";
        this.tracks.style.display = open ? "block" : "none";
        if(!open) return;
        let c = this.__canvas(this.tracks, state.width, height), map = state.map;
        let css = getComputedStyle(this.tracks), color = (name) => css.getPropertyValue(name).trim();
        let muted = color("--teleplot-muted"), error = color("--teleplot-error"), primary = color("--teleplot-primary"), surface = color("--teleplot-surface");
        for(let block of this.layout.blocks) {
            let dim = this.over && this.over.telem !== block.telem;
            for(let row of block.rows) {
                let last = -1;
                for(let moment of row.moments) {
                    let a = TL.px(map, moment.from), b = TL.px(map, TELEPLOT.moments.end(moment));
                    let mine = moment === this.over || moment === state.selected;
                    if(b < 0 || (b - last < 0.5 && !moment.failed && !mine)) continue;
                    last = b;
                    c.globalAlpha = dim ? 0.25 : mine || moment.failed ? 0.95 : 0.6;
                    c.fillStyle = mine ? primary : moment.failed ? error : muted;
                    c.fillRect(a, row.top + 2, Math.max(1, b - a - 1), rowHeight);
                    if(rowHeight >= 12 && b - a > 30) { // Named, as far as it fits
                        let from = Math.max(a, 0), width = Math.min(b, state.width) - from - 6;
                        c.save();
                        c.globalAlpha = dim ? 0.4 : 1;
                        c.beginPath();
                        c.rect(from, row.top + 2, Math.max(0, width + 3), rowHeight);
                        c.clip();
                        c.fillStyle = surface;
                        c.font = "10px system-ui, sans-serif";
                        c.fillText(TELEPLOT.moments.label(moment) + " " + TELEPLOT.moments.mark(moment), from + 3, row.top + 2 + rowHeight - 3);
                        c.restore();
                    }
                }
            }
        }
        c.globalAlpha = 1;
    }

    setOver(moment) {
        if(moment === this.over) return;
        this.over = moment;
        this.tip.hidden = !moment;
        if(moment) {
            let map = this.state.map, x = TELEPLOT.timeLine.px(map, moment.from), name = this.state.moments.length > 1 ? this.state && moment.telem.getName() + " · " : "";
            this.tip.textContent = name + TELEPLOT.moments.pathText(moment);
            this.tip.style.left = Math.round(Math.min(x, Math.max(0, this.state.width - this.tip.offsetWidth - 2))) + "px";
        }
        this.redraw();
    }

    // The moment under the pointer
    pointer(event) {
        let state = this.state;
        if(!state || !state.map) return undefined;
        let box = this.element.getBoundingClientRect(), x = event.clientX - box.left, moment = undefined;
        if(this.layout && event.target === this.tracks) {
            let y = event.clientY - this.tracks.getBoundingClientRect().top - 2;
            for(let block of this.layout.blocks) for(let row of block.rows) {
                if(y >= row.top - 0.5 && y < row.top + (this.options.rowHeight || TELEPLOT.timeLine.ROW) + 1) moment = TELEPLOT.timeLine.hit(state.map, row.moments, x);
            }
        }
        else if(this.options.pickOnLine && state.moments.length) {
            let rest = TELEPLOT.timeLine.rest(state.moments, state.map);
            moment = TELEPLOT.timeLine.hit(state.map, rest.moments.concat(rest.failures), x);
        }
        this.setOver(moment);
        return moment;
    }

    dispose() {
        if(this.outside) document.removeEventListener("pointerdown", this.outside, true);
        this.element.remove();
    }

    static vueCSS = `
        .teleplot-js-timebar { position: relative; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
        .teleplot-js-timebar canvas { display: block; width: 100%; }
        .teleplot-js-timebar-tracks { display: none; background: var(--teleplot-surface); }
        .teleplot-js-timebar-tip {
            position: absolute; bottom: 100%; margin-bottom: 3px; z-index: 5; pointer-events: none; white-space: nowrap;
            font: 0.75rem/1.3 system-ui, sans-serif; padding: 0.1em 0.5em; border-radius: 0.35em;
            background: var(--teleplot-text); color: var(--teleplot-surface);
        }
        .teleplot-js-timebar-tip[hidden] { display: none; }
        .teleplot-js-timebar-caption {
            position: absolute; bottom: 100%; z-index: 4; max-width: 90%; overflow: hidden; text-overflow: ellipsis; pointer-events: none; white-space: nowrap;
            font: 0.7rem/1.3 system-ui, sans-serif; padding: 0 0.4em; border-radius: 0.3em; background: var(--teleplot-surface); color: var(--teleplot-muted);
        }
        .teleplot-js-timebar-caption[hidden] { display: none; }
        .teleplot-js-timebar-dragging { cursor: grabbing !important; }
    `;
}
TELEPLOT.TimeLine = TimeLine;

// Add css to head
{
    let elem = document.createElement('style');
    elem.textContent = TimeLine.vueCSS;
    document.head.appendChild(elem);
}
