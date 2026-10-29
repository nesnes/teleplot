/*
 * Graph view (doc/graph.md): a state machine, a nested state machine or a behavior tree, and what runs in it at the time shown.
 * One look for every graph: the view does not know what kind of graph it draws, every difference comes from what was sent.
 *   - Its structure: the "enum" structure of the telemetry (nodes, paths with "/" between levels, an optional "#kind") and its
 *     "edges" (from>to=event), the ones in force at the time shown (Telemetry.getEnum / getEdges).
 *   - What runs: its text at the time shown (the last sample at or before it). A stack: several paths with their statuses
 *     (TELEPLOT.stackStates); a state: one path.
 * Drawing rules:
 *   - a node: a rectangle, its name in it, its kind above (left, muted), its status below (right, in its color);
 *   - color comes from the status only: blue (primary) on a running path, the color of its words for a status (ViewLog.getLevel:
 *     failure red, warning yellow, success green), muted for a word not known; the active path is emphasized (fill, thick outline,
 *     bold name), a result off the active path is quieter;
 *   - edges sent: arrows with their event, the hierarchy as nested boxes (a transition can leave or enter a state that holds others);
 *     no edges: the hierarchy as links from parent to child (a tree, top-down);
 *   - the last change: the edges from a node of the previous sample (or a state that held it) to a node of the current one, all of
 *     them when several match (the view does not pick an event);
 *   - a path that is not in the structure is drawn dashed, never hidden;
 *   - the recent path (option "trail"): the last runs under the drawing, oldest first, how long each lasted and the event between
 *     them; pointing at one moves the cursor of the time group there.
 * Zoom with the wheel, pan by dragging, double click to fit again. What is drawn is first computed without any canvas (model,
 * layout, trail): that part is tested.
 */
class ViewGraph extends ViewTelemetries {
    constructor(divId, telemetryIdOrNameList, group="default") {
        super(divId, group);
        this.name = "graph";
        this.type = "teleplot-graph";
        this.telemetryIdOrNameList = telemetryIdOrNameList;
        this.supportedDataTypes = [""+TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_TEXT, ""+TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_ENUM, ""+TELEPLOT.protocol.SECTION_TYPE_TELEM_DATA_EDGES];
        this.supportedLabel = "state machine or tree";
        this.options.trail = true;  // The recent path, under the drawing
        this.options.events = true; // The events of the edges
        this.options.kinds = true;  // The kinds of the nodes
        this.layout.width = 2;
        this.layout.height = 3;
        // What is drawn (raw: read on every draw)
        this.drawn = TELEPLOT.Vue.markRaw({ model: undefined, layout: undefined, layoutKey: "", trail: [] });
        this.lastKey = "";
        this.page = undefined; // Canvas and listeners, once mounted
        this.camera = TELEPLOT.Vue.markRaw({ zoom: 1, x: 0, y: 0, user: false }); // Zoom and pan the user chose (user false: fitted)
        this.tip = TELEPLOT.Vue.reactive({ shown: false, left: 0, top: 0, flip: false, name: "", desc: "", text: "", detail: "" });
    }

    init() {
        super.init();
        let self = this;
        this.vue.component(this.type, {
            name: this.type,
            data() { return { self, options: self.options, layout: self.layout, dragContext: self.dragContext, emptyState: self.emptyState, tip: self.tip }; },
            methods: { onDragEnter: self.onDragEnter, onDragLeave: self.onDragLeave, onDragDrop: self.onDragDrop },
            template: ViewGraph.vueHTML,
        });
        let element = document.getElementById(this.divId);
        if(element == null) { throw new Error(`Cannot create ${this.type} as #${this.divId} doesn't exists`); return; }
        element.append(document.createElement(this.type));
        this.vue.mount(`#${this.divId}`);
        this.__attach(element);
    }

    dispose() {
        this.__detach();
        this.lastKey = "";
        super.dispose();
    }

    getOptionsSchema() {
        return [{ key: "trail", label: "Recent path", type: "bool" },
            { key: "events", label: "Events on edges", type: "bool" },
            { key: "kinds", label: "Kinds", type: "bool" }];
    }

    // The telemetry the view draws: the first of its list that has a text or a structure
    getTelemetry() {
        const P = TELEPLOT.protocol;
        for(let entry of this.telemetryIdOrNameList) {
            let telem = TELEPLOT.datastore.getTelemetry(entry);
            if(telem !== undefined && (telem.data[P.SECTION_TYPE_TELEM_DATA_TEXT] !== undefined || telem.hasStructure())) return telem;
        }
        return undefined;
    }

    // ------------------------------------------------------------------ What is drawn (no canvas here)

    // Index of the last sample at or before a time (the latest without time), -1 when there is none
    static indexAt(entry, time) {
        if(entry === undefined || !entry.timestamps.length) return -1;
        if(!(time >= 0)) return entry.timestamps.length - 1;
        let stamps = entry.timestamps, lo = 0, hi = stamps.length;
        while(lo < hi) { let mid = (lo + hi) >> 1; if(stamps[mid] <= time) lo = mid + 1; else hi = mid; }
        return lo - 1;
    }

    // What a text says of each node: Map path -> "" (runs) or its status. A stack: its paths (TELEPLOT.stackStates); a state: one path.
    static statesOf(text, isStack) {
        if(isStack) return TELEPLOT.stackStates(text);
        let states = new Map();
        let parts = String(text).split("/").map((part) => part.trim()).filter((part) => part !== "");
        for(let depth = 1; depth <= parts.length; depth++) states.set(parts.slice(0, depth).join("/"), "");
        return states;
    }

    /*
     * The graph at a time: { time (of the sample shown, undefined when none), nodes: Map path -> node, order: [paths], roots: [paths],
     * edges: [{from, to, event, last}], hasEdges, structureKey (what the layout depends on) }.
     * A node: { path, name, kind, parent, children: [paths], declared, state (undefined: nothing said, "": runs, else its status),
     * active (on a running path) }. Names, kinds, statuses and events are decoded (%XX).
     */
    static model(telem, time=-1) {
        const P = TELEPLOT.protocol, decode = P.decodeName;
        let isStack = telem.getAttribute(P.TELEM_ATTR_STACK) === true;
        let entry = telem.data[P.SECTION_TYPE_TELEM_DATA_TEXT];
        let index = ViewGraph.indexAt(entry, time);
        let text = index >= 0 ? String(entry.data[0][index]) : "";
        let states = index >= 0 ? ViewGraph.statesOf(text, isStack) : new Map();
        // The sample before it that says something else: where the last change came from
        let previous = new Map();
        for(let i = index - 1; i >= 0; i--) if(String(entry.data[0][i]) !== text) { previous = ViewGraph.statesOf(String(entry.data[0][i]), isStack); break; }
        let at = index >= 0 ? entry.timestamps[index] : time;
        let structure = telem.getEnum(at >= 0 ? at : -1), edgeList = telem.getEdges(at >= 0 ? at : -1);

        let nodes = new Map(), order = [];
        let add = (path, declared, kind) => {
            let node = nodes.get(path);
            if(node !== undefined) { if(declared) node.declared = true; return node; }
            let cut = path.lastIndexOf("/");
            let parent = cut < 0 ? "" : path.slice(0, cut);
            if(parent !== "") add(parent, declared, undefined); // (its parents first)
            node = { path, name: decode(path.slice(cut + 1)), kind: kind ? decode(kind) : "", parent, children: [], declared, state: undefined, active: false };
            nodes.set(path, node);
            order.push(path);
            if(parent !== "") nodes.get(parent).children.push(path);
            return node;
        };
        if(structure !== undefined) for(let item of structure.items) add(item.path, true, item.kind);
        for(let [path, state] of states) { let node = add(path, false); node.state = state; node.active = state === ""; }
        let edges = [];
        if(edgeList !== undefined) for(let edge of edgeList.edges) {
            let from = edge.from.split("/").filter((p) => p !== "").join("/"), to = edge.to.split("/").filter((p) => p !== "").join("/");
            if(from === "" || to === "") continue;
            add(from, false); add(to, false);
            // The last change: from what ran before to what runs now (a change: it was not already so)
            let last = previous.get(from) === "" && states.get(to) === "" && (previous.get(to) !== "" || states.get(from) !== "");
            edges.push({ from, to, event: decode(edge.event), last });
        }
        let roots = order.filter((path) => nodes.get(path).parent === "");
        let structureKey = (structure ? structure.timestamp : "") + "|" + (edgeList ? edgeList.timestamp : "") + "|" + order.join("\n") + "|" + order.map((path) => nodes.get(path).kind).join("\n");
        return { time: index >= 0 ? at : undefined, nodes, order, roots, edges, hasEdges: edges.length > 0, structureKey };
    }

    // Width of a text in pixels: measured on a canvas when there is one, else estimated (tests)
    static measureWith(context) {
        if(!context || typeof context.measureText !== "function") return (text, mono) => String(text).length * (mono ? 6.1 : 6.4);
        return (text, mono) => { context.font = mono ? ViewGraph.MONO_FONT : ViewGraph.FONT; return context.measureText(String(text)).width; };
    }
    static FONT = "11px system-ui, -apple-system, 'Segoe UI', sans-serif";
    static BOLD_FONT = "650 11px system-ui, -apple-system, 'Segoe UI', sans-serif";
    static MONO_FONT = "10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    static NODE_H = 24;
    static PAD = 12;       // Inside a box, around what it holds
    static HEADER = 18;    // Top of a box: its name
    static LANE_GAP = 74;  // Between two layers of a graph (room for the events of the edges)
    static ROW_GAP = 34;   // Between two nodes of a layer (room for the kind above and the status below)
    static TREE_GAP_X = 18;
    static TREE_GAP_Y = 50;
    static LAYER_GAP_DOWN = 44; // Between two layers laid out top to bottom (inside a box)

    /*
     * Where everything goes: { boxes: Map path -> {x, y, w, h, composite}, width, height, tree (true: links, top-down; false:
     * nested boxes) }. With edges: each level of the hierarchy is layered on the edges between its nodes (an edge between nodes of
     * two boxes counts for the boxes that hold them), left to right at the top level, top to bottom inside a box, and so on: cycles broken by reversing the edges that go back in a
     * depth-first walk in the order of the structure, a layer per longest path, nodes ordered in their layer by where their
     * neighbours are. Without edges: a tidy tree, parents over their children.
     */
    static layout(model, measure=ViewGraph.measureWith(undefined)) {
        let boxes = new Map();
        let nodeWidth = (node) => Math.max(44, Math.ceil(measure(node.name, false)) + 22);
        if(!model.hasEdges) {
            // A tree: leaves side by side, a parent centered over its children
            let x = 0, top = 16, depthMax = 0;
            let place = (path, depth) => {
                let node = model.nodes.get(path), w = nodeWidth(node);
                depthMax = Math.max(depthMax, depth);
                let y = top + depth * (ViewGraph.NODE_H + ViewGraph.TREE_GAP_Y);
                if(!node.children.length) { boxes.set(path, { x, y, w, h: ViewGraph.NODE_H, composite: false }); x += w + ViewGraph.TREE_GAP_X; return; }
                let start = x;
                for(let child of node.children) place(child, depth + 1);
                let first = boxes.get(node.children[0]), last = boxes.get(node.children[node.children.length - 1]);
                let center = (first.x + last.x + last.w) / 2;
                let bx = Math.max(start, center - w / 2);
                boxes.set(path, { x: bx, y, w, h: ViewGraph.NODE_H, composite: false });
                if(bx + w + ViewGraph.TREE_GAP_X > x) x = bx + w + ViewGraph.TREE_GAP_X; // (a parent wider than its children takes its room)
            };
            for(let root of model.roots) place(root, 0);
            return { boxes, width: Math.max(0, x - ViewGraph.TREE_GAP_X), height: top + (depthMax + 1) * ViewGraph.NODE_H + depthMax * ViewGraph.TREE_GAP_Y + 18, tree: true };
        }
        let rank = new Map(model.order.map((path, i) => [path, i]));
        // The edges between siblings: an edge counts for the siblings that hold its ends
        let among = (path, siblings) => {
            for(let p = path; ; p = p.slice(0, p.lastIndexOf("/"))) { if(siblings.has(p)) return p; if(!p.includes("/")) return undefined; }
        };
        // Lays out siblings (relative to their top left corner): { w, h, at: Map path -> {x, y} }, sizes in boxes. across: layers
        // go left to right (else top to bottom)
        let level = (paths, across) => {
            let set = new Set(paths);
            for(let path of paths) { // Sizes first: a box holds the layout of its children
                let node = model.nodes.get(path);
                if(!node.children.length) { boxes.set(path, { x: 0, y: 0, w: nodeWidth(node), h: ViewGraph.NODE_H, composite: false }); continue; }
                let inner = level(node.children, !across);
                let w = Math.max(inner.w + 2 * ViewGraph.PAD, Math.ceil(measure(node.name, false)) + 2 * ViewGraph.PAD);
                boxes.set(path, { x: 0, y: 0, w, h: inner.h + ViewGraph.HEADER + ViewGraph.PAD, composite: true, inner });
            }
            let out = new Map(paths.map((path) => [path, []]));
            for(let edge of model.edges) {
                let a = among(edge.from, set), b = among(edge.to, set);
                if(a !== undefined && b !== undefined && a !== b && !out.get(a).includes(b)) out.get(a).push(b);
            }
            // Cycles: a depth-first walk in the order of the structure; an edge to a node of the walk goes back
            let sorted = paths.slice().sort((a, b) => rank.get(a) - rank.get(b));
            let state = new Map(), forward = new Map(paths.map((path) => [path, []]));
            let walk = (path) => {
                state.set(path, 1);
                for(let next of out.get(path)) {
                    if(state.get(next) === 1) continue; // (back: not used to make layers)
                    forward.get(path).push(next);
                    if(!state.has(next)) walk(next);
                }
                state.set(path, 2);
            };
            for(let path of sorted) if(!state.has(path)) walk(path);
            // A layer per longest path
            let layer = new Map(), visiting = new Set();
            let depthOf = (path) => {
                if(layer.has(path)) return layer.get(path);
                visiting.add(path);
                let deepest = 0;
                for(let [from, list] of forward) if(list.includes(path) && !visiting.has(from)) deepest = Math.max(deepest, depthOf(from) + 1);
                visiting.delete(path);
                layer.set(path, deepest);
                return deepest;
            };
            let layers = [];
            for(let path of sorted) { let d = depthOf(path); (layers[d] = layers[d] || []).push(path); }
            layers = layers.filter((list) => list && list.length);
            // Order in a layer: where the neighbours of the layer before are (two sweeps)
            let position = new Map();
            let index = () => layers.forEach((list) => list.forEach((path, i) => position.set(path, i)));
            index();
            for(let sweep = 0; sweep < 2; sweep++) {
                for(let l = 1; l < layers.length; l++) {
                    let center = (path) => {
                        let from = layers[l - 1].filter((other) => out.get(other).includes(path) || out.get(path).includes(other));
                        return from.length ? from.reduce((sum, other) => sum + position.get(other), 0) / from.length : position.get(path);
                    };
                    let centers = new Map(layers[l].map((path) => [path, center(path)]));
                    layers[l].sort((a, b) => centers.get(a) - centers.get(b) || rank.get(a) - rank.get(b));
                    index();
                }
            }
            // Places: a column per layer (a row when top to bottom), the nodes of a layer one after the other, centered on the longest layer
            let along = across ? "h" : "w", side = across ? "w" : "h";
            let gapIn = across ? ViewGraph.ROW_GAP : ViewGraph.TREE_GAP_X + 10, gapOut = across ? ViewGraph.LANE_GAP : ViewGraph.LAYER_GAP_DOWN;
            let lengths = layers.map((list) => list.reduce((sum, path) => sum + boxes.get(path)[along], 0) + (list.length - 1) * gapIn);
            let longest = Math.max(0, ...lengths), at = new Map(), offset = 0;
            layers.forEach((list, l) => {
                let thick = Math.max(...list.map((path) => boxes.get(path)[side]));
                let place = (longest - lengths[l]) / 2;
                for(let path of list) {
                    let box = boxes.get(path), centered = offset + (thick - box[side]) / 2;
                    at.set(path, across ? { x: centered, y: place } : { x: place, y: centered });
                    place += box[along] + gapIn;
                }
                offset += thick + gapOut;
            });
            let total = Math.max(0, offset - gapOut);
            return across ? { w: total, h: longest, at } : { w: longest, h: total, at };
        };
        let top = level(model.roots, true);
        let MARGIN = 16; // (kinds above the top nodes, events above the edges)
        let settle = (result, ox, oy) => {
            for(let [path, place] of result.at) {
                let box = boxes.get(path);
                box.x = ox + place.x; box.y = oy + place.y;
                if(box.composite) { settle(box.inner, box.x + ViewGraph.PAD, box.y + ViewGraph.HEADER); delete box.inner; }
            }
        };
        settle(top, 0, MARGIN);
        return { boxes, width: top.w, height: top.h + 2 * MARGIN + 4, tree: false };
    }

    /*
     * The recent path up to a time: the last runs, oldest first: [{time (its start), end (the next one, undefined: still now), leaves:
     * [names] (what runs at the deepest), results: [{name, status}], event (of an edge from the run before, "" when none)}].
     * For a tree, a run is the last level of the running path, with the results it came with.
     */
    static trail(telem, time=-1, count=8) {
        const P = TELEPLOT.protocol, decode = P.decodeName;
        let entry = telem.data[P.SECTION_TYPE_TELEM_DATA_TEXT];
        if(entry === undefined) return [];
        let isStack = telem.getAttribute(P.TELEM_ATTR_STACK) === true;
        let runs = TELEPLOT.textRuns(entry);
        let last = ViewGraph.indexAt(runs, time);
        if(last < 0) return [];
        let first = Math.max(0, last - count + 1);
        let edges = telem.getEdges(time);
        let name = (path) => decode(path.slice(path.lastIndexOf("/") + 1));
        let leavesOf = (states) => { let running = [...states].filter(([p, s]) => s === "").map(([p]) => p); return running.filter((p) => !running.some((o) => o.startsWith(p + "/"))); };
        let items = [], before = first > 0 ? leavesOf(ViewGraph.statesOf(String(runs.data[0][first - 1]), isStack)) : [];
        for(let i = first; i <= last; i++) {
            let states = ViewGraph.statesOf(String(runs.data[0][i]), isStack), leaves = leavesOf(states);
            let event = "";
            if(edges !== undefined) {
                let held = (paths) => { let all = new Set(); for(let p of paths) { let parts = p.split("/"); for(let d = 1; d <= parts.length; d++) all.add(parts.slice(0, d).join("/")); } return all; };
                let from = held(before), to = held(leaves);
                let edge = edges.edges.find((e) => from.has(e.from) && to.has(e.to) && !from.has(e.to));
                if(edge) event = decode(edge.event);
            }
            items.push({ time: runs.timestamps[i], end: i + 1 < runs.timestamps.length ? runs.timestamps[i + 1] : undefined, leaves: leaves.map(name),
                results: [...states].filter(([p, s]) => s !== "").map(([p, s]) => ({ name: name(p), status: decode(s) })), event });
            before = leaves;
        }
        return items;
    }

    // How long a node ran, for its tip: { count (runs in the data kept), last (duration of the latest one, s), running (still) }
    static runsOf(telem, path) {
        const P = TELEPLOT.protocol;
        let entry = telem.data[P.SECTION_TYPE_TELEM_DATA_TEXT];
        if(entry === undefined) return { count: 0, last: undefined, running: false };
        let node = TELEPLOT.stackRuns(entry).nodes.get(path);
        if(node === undefined && telem.getAttribute(P.TELEM_ATTR_STACK) !== true) { // A state: its runs whose text is that path (or under it)
            let runs = TELEPLOT.textRuns(entry), stamps = [], states = [];
            for(let i = 0; i < runs.timestamps.length; i++) {
                let text = String(runs.data[0][i]).split("/").map((p) => p.trim()).filter((p) => p !== "").join("/");
                let state = text === path || text.startsWith(path + "/") ? "" : null;
                if(states.length && states[states.length - 1] === state) continue;
                stamps.push(runs.timestamps[i]); states.push(state);
            }
            node = { timestamps: stamps, data: [states] };
        }
        if(node === undefined) return { count: 0, last: undefined, running: false };
        let count = 0, last = undefined, running = false;
        for(let i = 0; i < node.timestamps.length; i++) {
            if(node.data[0][i] !== "") continue;
            count++;
            running = i + 1 >= node.timestamps.length;
            last = running ? undefined : node.timestamps[i + 1] - node.timestamps[i];
        }
        return { count, last, running };
    }

    // Color of a node: undefined (nothing said), "primary" (runs) or the color of its status (see ViewTimeline.statusColor)
    static colorOf(node) {
        if(node.state === undefined) return undefined;
        return node.state === "" ? "primary" : TELEPLOT.view.ViewTimeline.statusColor(node.state);
    }

    // ------------------------------------------------------------------ Update and page

    // The time shown: the cursor of the group, else the latest
    __time() {
        let group = TELEPLOT.view.groups[this.group];
        return group && group.cursorTimestamp >= 0 ? group.cursorTimestamp : -1;
    }

    update() {
        if (!super.__before_update()) return;
        let telem = this.getTelemetry();
        const P = TELEPLOT.protocol;
        let time = this.__time();
        let key = (telem ? telem.id : "none") + "|" + time + "|" + TELEPLOT.theme.key() + "|" + (this.page ? this.page.width + "x" + this.page.height : "") + "|" + this.options.trail + this.options.events + this.options.kinds;
        if(telem) for(let type of [P.SECTION_TYPE_TELEM_DATA_TEXT, P.SECTION_TYPE_TELEM_DATA_ENUM, P.SECTION_TYPE_TELEM_DATA_EDGES]) {
            let entry = telem.data[type];
            if(entry !== undefined) key += `|${entry.lastUpdate}:${entry.timestamps.length}:${entry.lateInsertions}`;
        }
        if(key === this.lastKey) return;
        this.lastKey = key;
        let drawn = this.drawn;
        drawn.telem = telem;
        drawn.model = telem ? ViewGraph.model(telem, time) : undefined;
        let layoutKey = drawn.model ? drawn.model.structureKey + "|" + drawn.model.hasEdges : "";
        if(drawn.model && (layoutKey !== drawn.layoutKey || !drawn.layout)) {
            drawn.layout = ViewGraph.layout(drawn.model, ViewGraph.measureWith(this.page && this.page.context));
            drawn.layoutKey = layoutKey;
            if(!this.camera.user) this.__fit();
        }
        drawn.trail = telem && this.options.trail ? ViewGraph.trail(telem, time) : [];
        this.__draw();
    }

    __attach(element) {
        let host = element.querySelector(".teleplot-js-graph-canvas");
        if(!host || typeof host.appendChild !== "function") return;
        let canvas = document.createElement("canvas");
        host.appendChild(canvas);
        let page = TELEPLOT.Vue.markRaw({ host, canvas, context: canvas.getContext("2d"), width: 0, height: 0, ratio: 1, observer: undefined, listeners: [], trailBoxes: [] });
        this.page = page;
        this.lastKey = ""; // (a new canvas: drawn by the next update)
        let listen = (target, type, handler, options) => { target.addEventListener(type, handler, options); page.listeners.push([target, type, handler]); };
        let position = (event) => { let box = canvas.getBoundingClientRect(); return { x: event.clientX - box.left, y: event.clientY - box.top }; };
        let drag = undefined;
        listen(canvas, "pointerdown", (event) => {
            if(event.button !== 0) return;
            let at = position(event);
            if(at.y > page.height - ViewGraph.TRAIL_H && this.options.trail) return;
            drag = { x: at.x, y: at.y, cx: this.camera.x, cy: this.camera.y };
            try { canvas.setPointerCapture(event.pointerId); } catch(e) {}
        });
        listen(canvas, "pointermove", (event) => {
            let at = position(event);
            if(drag) { this.camera.x = drag.cx + at.x - drag.x; this.camera.y = drag.cy + at.y - drag.y; this.camera.user = true; this.tip.shown = false; this.__draw(); return; }
            this.__hover(at);
        });
        let release = (event) => { if(!drag) return; drag = undefined; try { canvas.releasePointerCapture(event.pointerId); } catch(e) {} };
        listen(canvas, "click", (event) => { // A chip of the recent path: its group is held at that run
            let at = position(event);
            let chip = this.options.trail && at.y > page.height - ViewGraph.TRAIL_H && page.trailBoxes ? page.trailBoxes.find((box) => at.x >= box.x && at.x <= box.x + box.w) : undefined;
            if(chip) TELEPLOT.view.seek(this.group, chip.run.time);
        });
        listen(canvas, "pointerup", release);
        listen(canvas, "pointercancel", release);
        listen(canvas, "pointerleave", () => {
            if(drag) return;
            this.tip.shown = false;
            if(this.__trailHover) { // (the cursor the recent path moved goes back, as when leaving a chart)
                this.__trailHover = false;
                TELEPLOT.view.hoveredGroup = "";
                TELEPLOT.view.pointerLeft(this.group);
            }
        });
        listen(canvas, "wheel", (event) => {
            event.preventDefault();
            let at = position(event), factor = Math.exp(-event.deltaY * 0.0015);
            let zoom = Math.max(0.15, Math.min(4, this.camera.zoom * factor));
            factor = zoom / this.camera.zoom;
            this.camera.x = at.x - (at.x - this.camera.x) * factor;
            this.camera.y = at.y - (at.y - this.camera.y) * factor;
            this.camera.zoom = zoom;
            this.camera.user = true;
            this.__draw();
        }, { passive: false });
        listen(canvas, "dblclick", () => { this.camera.user = false; this.__fit(); this.__draw(); });
        if(typeof ResizeObserver === "function") { page.observer = new ResizeObserver(() => this.__resize()); page.observer.observe(host); }
        this.__resize();
    }

    __detach() {
        let page = this.page;
        if(!page) return;
        for(let [target, type, handler] of page.listeners) target.removeEventListener(type, handler);
        if(page.observer) page.observer.disconnect();
        page.canvas.remove();
        this.page = undefined;
    }

    __resize() {
        let page = this.page;
        if(!page) return;
        let width = page.host.clientWidth, height = page.host.clientHeight;
        if(!width || !height) return;
        let ratio = Math.min((typeof devicePixelRatio === "number" && devicePixelRatio) || 1, 2);
        page.width = width; page.height = height; page.ratio = ratio;
        page.canvas.width = Math.max(1, Math.floor(width * ratio));
        page.canvas.height = Math.max(1, Math.floor(height * ratio));
        page.canvas.style.width = width + "px";
        page.canvas.style.height = height + "px";
        if(!this.camera.user) this.__fit();
        this.lastKey = ""; // Drawn again by the next update
    }

    static TRAIL_H = 24;

    // Zoom and pan that show the whole drawing in the view (not larger than 1.4 times its size)
    __fit() {
        let page = this.page, layout = this.drawn.layout;
        if(!page || !page.width || !layout) return;
        let roomH = page.height - (this.options.trail ? ViewGraph.TRAIL_H : 0) - 8, roomW = page.width - 16;
        let zoom = Math.min(1.4, roomW / Math.max(1, layout.width), roomH / Math.max(1, layout.height));
        this.camera.zoom = Math.max(0.15, zoom);
        this.camera.x = (page.width - layout.width * this.camera.zoom) / 2;
        this.camera.y = Math.max(4, (roomH - layout.height * this.camera.zoom) / 2);
    }

    // The node under a point of the canvas (the deepest one), undefined when none
    __nodeAt(at) {
        let layout = this.drawn.layout, model = this.drawn.model;
        if(!layout || !model) return undefined;
        let x = (at.x - this.camera.x) / this.camera.zoom, y = (at.y - this.camera.y) / this.camera.zoom;
        let found = undefined;
        for(let [path, box] of layout.boxes) {
            if(x < box.x || x > box.x + box.w || y < box.y || y > box.y + (box.composite ? ViewGraph.HEADER : box.h)) continue;
            if(found === undefined || path.length > found.length) found = path;
        }
        return found === undefined ? undefined : model.nodes.get(found);
    }

    __hover(at) {
        let page = this.page, tip = this.tip, telem = this.drawn.telem;
        if(!page || !telem) { tip.shown = false; return; }
        let place = () => { tip.flip = at.x > page.width * 0.6; tip.left = Math.round(at.x + page.host.offsetLeft); tip.top = Math.round(at.y + page.host.offsetTop); tip.shown = true; };
        // The recent path: the cursor of the group goes to the run under the pointer
        let chip = at.y > page.height - ViewGraph.TRAIL_H ? page.trailBoxes.find((box) => at.x >= box.x && at.x <= box.x + box.w) : undefined;
        if(chip) {
            let group = TELEPLOT.view.groups[this.group];
            this.__trailHover = true;
            TELEPLOT.view.hoveredGroup = this.group;
            group.cursorTimestamp = chip.run.time;
            Object.assign(tip, { name: TELEPLOT.view.telemetryTip(telem).split("\n")[0], desc: "", text: chip.run.leaves.join(", ") || chip.run.results.map((r) => r.name + " " + r.status).join(", "),
                detail: "from " + TELEPLOT.view.ViewLog.formatTime(chip.run.time) + (chip.run.end !== undefined ? ", for " + TELEPLOT.view.ViewTimeline.formatDuration(chip.run.end - chip.run.time) : ", still the latest") });
            place();
            return;
        }
        let node = this.__nodeAt(at);
        if(!node) { tip.shown = false; return; }
        let runs = ViewGraph.runsOf(telem, node.path);
        let name = telem.getAttribute(TELEPLOT.protocol.TELEM_ATTR_NAME) || String(telem.id);
        Object.assign(tip, {
            name: name + (node.kind ? " · " + node.kind : ""), desc: node.declared ? "" : "not in the structure",
            text: node.path.split("/").map(TELEPLOT.protocol.decodeName).join(" / ") + (node.state === undefined ? "" : node.state === "" ? ": runs" : ": " + node.state),
            detail: runs.count ? "ran " + runs.count + (runs.count > 1 ? " times" : " time") + (runs.running ? ", still running" : (runs.last !== undefined ? " · last for " + TELEPLOT.view.ViewTimeline.formatDuration(runs.last) : "")) : "did not run in the data kept"
        });
        place();
    }

    __draw() {
        let page = this.page;
        if(!page || !page.width || !page.height) return;
        let context = page.context, ratio = page.ratio;
        let color = (name, fallback) => TELEPLOT.theme.color(name, page.host, fallback);
        let style = { text: color("--teleplot-text", "black"), muted: color("--teleplot-muted", "gray"), line: color("--teleplot-line", "#ccc"), grid: color("--teleplot-grid", "rgba(128,128,128,0.2)"),
            surface: color("--teleplot-surface", "white"), primary: color("--teleplot-primary", "blue"), error: color("--teleplot-error", "red"), warn: color("--teleplot-warn", "orange"), ok: color("--teleplot-ok", "green") };
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        context.clearRect(0, 0, page.width, page.height);
        let model = this.drawn.model, layout = this.drawn.layout;
        page.trailBoxes = [];
        if(!model || !layout) return;
        let zoom = this.camera.zoom;
        context.save();
        context.beginPath();
        context.rect(0, 0, page.width, page.height - (this.options.trail ? ViewGraph.TRAIL_H : 0));
        context.clip();
        context.setTransform(ratio * zoom, 0, 0, ratio * zoom, ratio * this.camera.x, ratio * this.camera.y);
        let boxes = layout.boxes;
        let paint = (name) => style[name] || style.muted;
        let roundRect = (x, y, w, h, r) => { context.beginPath(); if(context.roundRect) context.roundRect(x, y, w, h, r); else context.rect(x, y, w, h); };
        let activeHolds = (path) => model.nodes.get(path).active;

        // Boxes (states that hold others), the outermost first
        for(let [path, box] of boxes) {
            if(!box.composite) continue;
            let node = model.nodes.get(path), active = activeHolds(path), c = ViewGraph.colorOf(node);
            roundRect(box.x, box.y, box.w, box.h, 10);
            if(active || c) { context.globalAlpha = 0.06; context.fillStyle = paint(c || "primary"); context.fill(); context.globalAlpha = 1; }
            context.lineWidth = active ? 2 : 1.2;
            context.strokeStyle = active || c ? paint(c || "primary") : style.line;
            if(!node.declared) context.setLineDash([3, 3]);
            context.stroke();
            context.setLineDash([]);
            context.font = ViewGraph.BOLD_FONT;
            context.fillStyle = active ? style.primary : style.muted;
            context.textAlign = "left"; context.textBaseline = "middle";
            context.fillText(node.name, box.x + 9, box.y + ViewGraph.HEADER / 2 + 2);
            this.__decorations(context, node, box, style, paint);
        }

        // Links of a tree, edges of a graph
        if(layout.tree) {
            for(let [path, box] of boxes) {
                let node = model.nodes.get(path);
                if(node.parent === "" || !boxes.has(node.parent)) continue;
                let parent = boxes.get(node.parent), on = node.active && model.nodes.get(node.parent).active;
                context.beginPath();
                context.moveTo(parent.x + parent.w * 0.35, parent.y + parent.h);
                context.lineTo(box.x + box.w * 0.72, box.y);
                context.strokeStyle = on ? style.primary : style.line;
                context.lineWidth = on ? 2.4 : 1.2;
                context.stroke();
            }
        }
        else {
            let anchors = ViewGraph.anchors(model.edges, boxes);
            for(let last of [false, true]) model.edges.forEach((edge, i) => { // (the last change over the others)
                if(edge.last !== last || !boxes.has(edge.from) || !boxes.has(edge.to)) return;
                this.__edge(context, boxes.get(edge.from), boxes.get(edge.to), edge, style, edge.from === edge.to, anchors[i]);
            });
        }

        // Nodes
        for(let [path, box] of boxes) {
            if(box.composite) continue;
            let node = model.nodes.get(path), c = ViewGraph.colorOf(node);
            roundRect(box.x, box.y, box.w, box.h, 6);
            context.fillStyle = style.surface;
            context.fill();
            if(c) { context.globalAlpha = node.active ? 0.32 : 0.18; context.fillStyle = paint(c); context.fill(); context.globalAlpha = 1; }
            context.lineWidth = c ? (node.active ? 2 : 1.2) : 1.2;
            context.strokeStyle = c ? paint(c) : style.line;
            if(!node.declared) context.setLineDash([3, 3]);
            context.stroke();
            context.setLineDash([]);
            context.font = node.active ? ViewGraph.BOLD_FONT : ViewGraph.FONT;
            context.fillStyle = node.declared ? style.text : style.muted;
            context.textAlign = "center"; context.textBaseline = "middle";
            context.fillText(node.name, box.x + box.w / 2, box.y + box.h / 2 + 0.5);
            this.__decorations(context, node, box, style, paint);
        }
        context.restore();
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        if(this.options.trail) this.__drawTrail(context, style);
    }

    // The kind above a node (left), its status below (right)
    __decorations(context, node, box, style, paint) {
        context.font = ViewGraph.MONO_FONT;
        context.textBaseline = "alphabetic";
        if(this.options.kinds && node.kind) { context.fillStyle = style.muted; context.textAlign = "left"; context.fillText(node.kind, box.x + 1, box.y - 4); }
        if(node.state !== undefined && node.state !== "") { context.fillStyle = paint(ViewGraph.colorOf(node)); context.textAlign = "right"; context.fillText(node.state, box.x + box.w - 1, box.y + box.h + 11); }
    }

    // Where the edges that go from side to side (a box on the right of another) leave and reach their boxes: the edges of a side are
    // spread along it, in the order of where their other end is, so that they and their events do not all start from one point.
    // [{from, to}] (y of each end) per edge, undefined for the others.
    static anchors(edges, boxes) {
        let sides = new Map(), anchors = [];
        let add = (key, box, other, i, end) => { if(!sides.has(key)) sides.set(key, { box, list: [] }); sides.get(key).list.push({ i, end, y: other.y + other.h / 2 }); };
        edges.forEach((edge, i) => {
            let a = boxes.get(edge.from), b = boxes.get(edge.to);
            if(!a || !b || edge.from === edge.to || !(b.x >= a.x + a.w - 1)) return;
            add(edge.from + ">", a, b, i, "from");
            add(">" + edge.to, b, a, i, "to");
        });
        for(let { box, list } of sides.values()) {
            list.sort((p, q) => p.y - q.y);
            let span = box.composite ? Math.min(box.h - 16, 18 * list.length) : Math.min(box.h - 6, 5 * (list.length - 1));
            let top = box.y + (box.composite ? Math.min(box.h, 2 * ViewGraph.NODE_H) / 2 : box.h / 2) - span / 2;
            list.forEach((anchor, k) => {
                anchors[anchor.i] = anchors[anchor.i] || {};
                anchors[anchor.i][anchor.end] = list.length === 1 ? top + span / 2 : top + span * k / (list.length - 1);
            });
        }
        return anchors;
    }

    // An edge between two boxes: forward (to a box on the right) as a curve from side to side, back as an arc under them
    __edge(context, a, b, edge, style, self, anchor) {
        let color = edge.last ? style.primary : style.muted;
        context.strokeStyle = color;
        context.fillStyle = color;
        context.lineWidth = edge.last ? 2.2 : 1;
        context.globalAlpha = edge.last ? 1 : 0.6;
        let p0, p1, c0, c1;
        if(self) { // A loop on the node itself
            p0 = { x: a.x + a.w * 0.65, y: a.y }; p1 = { x: a.x + a.w * 0.35, y: a.y };
            c0 = { x: p0.x + 14, y: a.y - 30 }; c1 = { x: p1.x - 14, y: a.y - 30 };
        }
        else if(b.x >= a.x + a.w - 1) { // Forward
            p0 = { x: a.x + a.w, y: anchor && anchor.from !== undefined ? anchor.from : a.y + Math.min(a.h, 2 * ViewGraph.NODE_H) / 2 };
            p1 = { x: b.x, y: anchor && anchor.to !== undefined ? anchor.to : b.y + Math.min(b.h, 2 * ViewGraph.NODE_H) / 2 };
            let dx = Math.max(30, (p1.x - p0.x) / 2);
            c0 = { x: p0.x + dx, y: p0.y }; c1 = { x: p1.x - dx, y: p1.y };
        }
        else if(a.x >= b.x + b.w - 1) { // Back: under both
            p0 = { x: a.x + a.w / 2, y: a.y + a.h }; p1 = { x: b.x + b.w / 2, y: b.y + b.h };
            let low = Math.max(p0.y, p1.y) + 40 + Math.abs(p0.x - p1.x) * 0.08;
            c0 = { x: p0.x, y: low }; c1 = { x: p1.x, y: low };
        }
        else if(b.y >= a.y + a.h - 1) { // The same column, down
            p0 = { x: a.x + a.w / 2, y: a.y + a.h }; p1 = { x: b.x + b.w / 2, y: b.y };
            if(Math.abs(p0.x - p1.x) < 2) { c0 = { x: p0.x, y: (p0.y + p1.y) / 2 }; c1 = c0; }
            else { c0 = { x: p0.x, y: (p0.y * 2 + p1.y) / 3 }; c1 = { x: p1.x, y: (p0.y + p1.y * 2) / 3 }; }
        }
        else { // The same column, back up (or one holds the other): an arc on the right
            p0 = { x: a.x + a.w, y: a.y + Math.min(a.h, ViewGraph.NODE_H) / 2 }; p1 = { x: b.x + b.w, y: b.y + Math.min(b.h, ViewGraph.NODE_H) / 2 };
            let right = Math.max(p0.x, p1.x) + 30;
            c0 = { x: right, y: p0.y }; c1 = { x: right, y: p1.y };
        }
        context.beginPath();
        context.moveTo(p0.x, p0.y);
        context.bezierCurveTo(c0.x, c0.y, c1.x, c1.y, p1.x, p1.y);
        context.stroke();
        // Arrow head along the end of the curve
        let angle = Math.atan2(p1.y - c1.y, p1.x - c1.x), size = edge.last ? 7 : 6;
        if(c1.x === p1.x && c1.y === p1.y) angle = Math.atan2(p1.y - p0.y, p1.x - p0.x);
        context.beginPath();
        context.moveTo(p1.x, p1.y);
        context.lineTo(p1.x - size * Math.cos(angle - 0.4), p1.y - size * Math.sin(angle - 0.4));
        context.lineTo(p1.x - size * Math.cos(angle + 0.4), p1.y - size * Math.sin(angle + 0.4));
        context.closePath();
        context.fill();
        if(this.options.events && edge.event) { // The event at the middle of the curve
            let mid = (k) => 0.125 * p0[k] + 0.375 * c0[k] + 0.375 * c1[k] + 0.125 * p1[k];
            context.font = edge.last ? "700 " + ViewGraph.MONO_FONT : ViewGraph.MONO_FONT;
            context.textAlign = "center"; context.textBaseline = "alphabetic";
            context.globalAlpha = 1;
            context.fillStyle = edge.last ? style.primary : style.muted;
            context.fillText(edge.event, mid("x"), mid("y") - 5);
        }
        context.globalAlpha = 1;
    }

    // The recent path: a line at the bottom, the newest on the right (what does not fit goes on the left)
    __drawTrail(context, style) {
        let page = this.page, trail = this.drawn.trail;
        let y = page.height - ViewGraph.TRAIL_H / 2;
        context.fillStyle = style.grid;
        context.fillRect(0, page.height - ViewGraph.TRAIL_H, page.width, 1);
        if(!trail.length) return;
        let measure = ViewGraph.measureWith(context);
        let pieces = trail.map((run, i) => {
            let current = i === trail.length - 1;
            let duration = run.end !== undefined ? TELEPLOT.view.ViewTimeline.formatDuration(run.end - run.time) : (current ? "now" : "");
            let parts = [];
            if(run.event) parts.push({ text: "› " + run.event + " ›", mono: true, color: style.muted });
            for(let result of run.results) parts.push({ text: result.name, color: style.muted }, { text: result.status, mono: true, color: style[TELEPLOT.view.ViewTimeline.statusColor(result.status)] || style.muted });
            if(run.leaves.length) parts.push({ text: run.leaves.join(", "), bold: current, color: current ? style.text : style.muted });
            if(duration) parts.push({ text: duration, mono: true, color: style.muted });
            let width = parts.reduce((sum, part) => sum + measure(part.text, part.mono) + 5, 0) + 8;
            return { run, parts, width };
        });
        let total = 6, from = pieces.length;
        while(from > 0 && total + pieces[from - 1].width < page.width) { total += pieces[from - 1].width; from--; }
        let x = 8;
        context.textBaseline = "middle"; context.textAlign = "left";
        for(let piece of pieces.slice(from)) {
            page.trailBoxes.push({ x: x - 4, w: piece.width, run: piece.run });
            for(let part of piece.parts) {
                context.font = part.mono ? ViewGraph.MONO_FONT : (part.bold ? ViewGraph.BOLD_FONT : ViewGraph.FONT);
                context.fillStyle = part.color;
                context.fillText(part.text, x, y);
                x += measure(part.text, part.mono) + 5;
            }
            x += 8;
        }
    }

    static vueHTML = `
        <div class="teleplot-js-graph-container teleplot-js-telemetry-card"
        :style=" { '--layout-width': layout.width, '--layout-height': layout.height }"
        ${ViewTelemetries.dragDropHtml}>
            <div class="teleplot-js-graph-canvas"></div>
            <div v-if="tip.shown" class="teleplot-js-timeline-tip" v-bind:class="{'teleplot-js-timeline-tip-flip': tip.flip}" v-bind:style="{ left: tip.left + 'px', top: tip.top + 'px' }">
                <div class="teleplot-js-timeline-tip-name">{{tip.name}}</div>
                <div v-if="tip.desc" class="teleplot-js-timeline-tip-desc">{{tip.desc}}</div>
                <div class="teleplot-js-timeline-tip-text">{{tip.text}}</div>
                <div class="teleplot-js-timeline-tip-detail">{{tip.detail}}</div>
            </div>
            <div v-if="emptyState.text" class="teleplot-js-empty">
                <div class="teleplot-js-empty-title">{{emptyState.text}}</div>
                <div v-if="emptyState.hint" class="teleplot-js-empty-hint">{{emptyState.hint}}</div>
            </div>
        </div>
    `;

    static vueCSS = `
        @scope (.teleplot-js-style)
        {
            .teleplot-js-graph-container {
                position: relative;
                width: 100%;
                height: 100%;
                min-height: calc(4em * var(--layout-height, 1));
                padding: 0;
                overflow: hidden;
            }
            .teleplot-js-graph-canvas { position: absolute; inset: 0.4em 0.6em 0.2em 0.6em; overflow: hidden; }
            .teleplot-js-has-title .teleplot-js-graph-canvas { top: 2.2em; }
            .teleplot-js-graph-canvas canvas { display: block; cursor: grab; touch-action: none; }
            .teleplot-js-graph-canvas canvas:active { cursor: grabbing; }
        }
    `;
}

TELEPLOT.view.ViewGraph = ViewGraph;

// Add css to head
{
    let elem = document.createElement('style');
    elem.textContent = ViewGraph.vueCSS;
    document.head.appendChild(elem);
}
