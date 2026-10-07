/*
 * Telemetries panel: every telemetry as a draggable tile, grouped in a tree on the first part of its name (robot.wheel.left -> group "robot").
 * - The name is the key element: dimmed path + bold rest, never truncated (it wraps). Type badge(s) and the last value are a quiet second line.
 * - Search: words separated by spaces must all be in the name (case-insensitive), matches are highlighted, groups stay a tree (opened on the matches).
 * - Type selectors: toggle data types, the counts follow the search.
 * - Tiles and group headers are draggable (a group adds all its telemetries to the view it is dropped on).
 */
function initComponent_panel_telemetries(vue) {
    let name = "panel-telemetries";

    const vueHTML = `
        <div class="telemetries-layout">
            <div class="telemetries-toolbar">
                <div class="telemetries-search">
                    <input type="search" v-model="query" placeholder="Search by name...  (space = AND)" spellcheck="false" autocomplete="off" />
                </div>
                <div class="telemetries-pills">
                    <span v-for="t in typeList" :key="t.code" class="telemetries-pill" :class="['telemetries-type-'+t.code, {'on': selectedTypes.includes(t.code), 'off': selectedTypes.length && !selectedTypes.includes(t.code), 'zero': !typeCounts[t.code]}]"
                        :title="t.label" @click="toggleType(t.code)">{{t.badge}} <b>{{typeCounts[t.code]}}</b></span>
                    <span class="telemetries-count">{{shownCount}} / {{allCount}}</span>
                </div>
            </div>

            <div class="telemetries-list">
                <div v-if="!shownCount" class="telemetries-empty">
                    <template v-if="!allCount">No telemetry yet.<br>Send some data or start the sample from the Help panel.</template>
                    <template v-else>No telemetry matches.<br><small>Try fewer words or enable more types.</small></template>
                </div>

                <div v-for="section in sections" :key="section.id">
                    <div v-if="section.title" class="telemetries-client">{{section.title}}</div>

                    <div v-if="section.ungrouped.length" class="telemetries-tiles">
                        <div v-for="item in section.ungrouped" :key="item.id" class="telemetries-tile" :class="'telemetries-type-'+item.mainType"
                            draggable="true" :title="item.tooltip" @dragstart.stop="onDragStart($event, [item.id])" @dragover.stop.prevent>
                            <span class="telemetries-name"><template v-for="seg in segments(item, 0)"><mark v-if="seg.m">{{seg.t}}</mark><template v-else>{{seg.t}}</template></template></span>
                            <span class="telemetries-value-line">
                                <span v-for="t in item.types" :key="t" class="telemetries-badge" :class="'telemetries-type-'+t">{{badge(t)}}</span>
                                <span class="telemetries-val">{{item.valueText}}<span v-if="item.unit" class="telemetries-unit">{{item.unit}}</span></span>
                                <span v-if="item.rateText" class="telemetries-rate">{{item.rateText}}</span>
                            </span>
                        </div>
                    </div>

                    <details v-for="group in section.groups" :key="group.key" :open="isOpen(group.key)" @toggle="onToggle(group.key, $event)">
                        <summary draggable="true" :title="'Drag to add the ' + group.items.length + ' telemetries of this group'"
                            @dragstart.stop="onDragStart($event, group.items.map(i => i.id))" @dragover.stop.prevent>
                            <span><template v-for="seg in segmentsOf(group.label)"><mark v-if="seg.m">{{seg.t}}</mark><template v-else>{{seg.t}}</template></template></span>
                            <span class="telemetries-group-count">{{group.items.length}}</span>
                            <span class="telemetries-grow"></span>
                            <span class="telemetries-dots"><i v-for="t in group.types" :key="t" :class="'telemetries-type-'+t" :title="typeLabel(t)"></i></span>
                        </summary>
                        <div class="telemetries-tiles">
                            <div v-for="item in group.items" :key="item.id" class="telemetries-tile" :class="'telemetries-type-'+item.mainType"
                                draggable="true" :title="item.tooltip" @dragstart.stop="onDragStart($event, [item.id])" @dragover.stop.prevent>
                                <span class="telemetries-name">
                                    <span class="telemetries-dim"><template v-for="seg in segments(item, 0, item.dimLength)"><mark v-if="seg.m">{{seg.t}}</mark><template v-else>{{seg.t}}</template></template></span><template v-for="seg in segments(item, item.dimLength)"><mark v-if="seg.m">{{seg.t}}</mark><template v-else>{{seg.t}}</template></template>
                                </span>
                                <span class="telemetries-value-line">
                                    <span v-for="t in item.types" :key="t" class="telemetries-badge" :class="'telemetries-type-'+t">{{badge(t)}}</span>
                                    <span class="telemetries-val">{{item.valueText}}<span v-if="item.unit" class="telemetries-unit">{{item.unit}}</span></span>
                                <span v-if="item.rateText" class="telemetries-rate">{{item.rateText}}</span>
                                </span>
                            </div>
                        </div>
                    </details>
                </div>
            </div>
        </div>
    `;

    const vueCSS = `
        .telemetries-layout {
            --t-20: #2980b9; --t-21: #16a085; --t-22: #8e44ad; --t-23: #d68910; --t-24: #c0392b; --t-other: #7f8c8d;
            --mark: hsl(48 100% 70%);
            color: var(--color-text);
            width: 100%;
            max-height: calc(100vh - 11rem);
            display: flex;
            flex-direction: column;
            padding: 0.4rem;
            box-sizing: border-box;
            min-height: 0;
        }
        :root[data-theme="dark"] .telemetries-layout { --mark: hsl(48 90% 32%); }

        .telemetries-type-20 { --tc: var(--t-20); } .telemetries-type-21 { --tc: var(--t-21); } .telemetries-type-22 { --tc: var(--t-22); }
        .telemetries-type-23 { --tc: var(--t-23); } .telemetries-type-24 { --tc: var(--t-24); } .telemetries-type-other { --tc: var(--t-other); }

        .telemetries-toolbar {
            padding-bottom: 0.4rem;
            margin-bottom: 0.2rem;
            border-bottom: 1px solid var(--color-bg-dark);
        }
        .telemetries-search input {
            width: 100%;
            box-sizing: border-box;
            padding: 0.35rem 0.6rem;
            border-radius: 0.4rem;
            border: 1px solid var(--color-bg-dark);
            background: var(--color-bg-light);
            color: var(--color-text);
            font: inherit;
        }
        .telemetries-search input:focus { outline: 2px solid var(--color-primary); outline-offset: -1px; }
        .telemetries-pills { display: flex; flex-wrap: wrap; gap: 0.25rem; align-items: center; margin-top: 0.35rem; }
        .telemetries-pill {
            display: inline-flex; gap: 0.3rem; align-items: center;
            font-size: 0.85rem; font-weight: 600;
            padding: 0.1rem 0.5rem 0.1rem 0.35rem;
            border-radius: 1rem;
            border: 1px solid var(--color-bg-dark);
            background: var(--color-bg-light);
            color: var(--color-text-muted);
            cursor: pointer; user-select: none;
        }
        .telemetries-pill::before { content: ""; width: 0.6rem; height: 0.6rem; border-radius: 0.15rem; background: var(--tc); }
        .telemetries-pill b { font-weight: 400; opacity: 0.8; }
        .telemetries-pill.on { color: var(--color-text); border-color: var(--tc); background: var(--color-bg-dark); }
        .telemetries-pill.off { opacity: 0.5; }
        .telemetries-pill.zero { opacity: 0.35; }
        .telemetries-count { margin-left: auto; font-size: 0.85rem; color: var(--color-text-muted); }

        .telemetries-list { overflow-y: auto; overflow-x: hidden; scrollbar-width: thin; min-height: 0; flex: 1 1 auto; padding-right: 0.15rem; }
        .telemetries-empty { text-align: center; color: var(--color-text-muted); padding: 1.5rem 0.5rem; }
        .telemetries-client { font-weight: 700; color: var(--color-text-muted); margin: 0.4rem 0 0.15rem; text-transform: uppercase; font-size: 0.85rem; letter-spacing: 0.04em; }

        .telemetries-layout details { margin-bottom: 0.2rem; }
        .telemetries-layout summary {
            cursor: grab; font-weight: 700; padding: 0.15rem 0.3rem 0.15rem 1.1rem;
            display: flex; align-items: center; gap: 0.4rem; list-style: none; border-radius: 0.25rem; position: relative; user-select: none;
        }
        .telemetries-layout summary::-webkit-details-marker { display: none; }
        .telemetries-layout summary::before { content: "\\25B8"; position: absolute; left: 0.2rem; color: var(--color-text-muted); transition: transform 0.12s; }
        .telemetries-layout details[open] > summary::before { transform: rotate(90deg); }
        .telemetries-layout summary:hover { background: var(--color-bg-dark); }
        .telemetries-group-count { font-weight: 400; font-size: 0.85rem; color: var(--color-text-muted); }
        .telemetries-grow { flex: 1; }
        .telemetries-dots { display: inline-flex; gap: 0.15rem; }
        .telemetries-dots i { width: 0.6rem; height: 0.6rem; border-radius: 0.15rem; background: var(--tc); display: block; }

        .telemetries-tiles { display: flex; flex-wrap: wrap; gap: 0.5rem; padding: 0.3rem 0.1rem 0.6rem; }
        .telemetries-tile {
            flex: 1 1 9.5rem; min-width: 0; max-width: 100%;
            display: flex; flex-direction: column; gap: 0.1rem;
            padding: 0.35rem 0.6rem 0.3rem;
            border-radius: 0.4rem;
            background: var(--color-bg-light);
            box-shadow: 0 0 3px var(--color-shadow);
            border-bottom: 2px solid var(--tc);
            cursor: grab; user-select: none;
        }
        .telemetries-tile:hover { background: var(--color-bg); }
        .telemetries-tile:active { cursor: grabbing; }
        .telemetries-name { font-size: 1rem; font-weight: 700; overflow-wrap: anywhere; line-height: 1.25; }
        .telemetries-dim { font-weight: 400; color: var(--color-text-muted); }
        .telemetries-value-line { display: flex; align-items: center; gap: 0.3rem; font-size: 0.85rem; color: var(--color-text-muted); min-width: 0; }
        .telemetries-unit { margin-left: 0.25em; }
        .telemetries-val { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-variant-numeric: tabular-nums; }
        .telemetries-rate { flex: none; margin-left: auto; padding-left: 0.4rem; font-size: 0.8rem; opacity: 0.65; white-space: nowrap; font-variant-numeric: tabular-nums; }
        .telemetries-badge {
            flex: none; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.03em; color: #fff; background: var(--tc);
            border-radius: 0.2rem; padding: 0 0.3rem; line-height: 1.3; min-width: 2.6em; text-align: center;
        }
        .telemetries-layout mark { background: var(--mark); color: inherit; border-radius: 2px; padding: 0 1px; }
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
            const P = this.TP.protocol;
            return {
                query: "",
                selectedTypes: [],   // Data type codes to keep (none selected = all)
                openGroups: {},      // Group key -> open ? (default: open)
                tick: 0,             // Values are not reactive (raw datastore): refreshed on a timer
                timer: null,
                typeList: [
                    { code: P.SECTION_TYPE_TELEM_DATA_NUMBER,    badge: "NUM", label: "Number" },
                    { code: P.SECTION_TYPE_TELEM_DATA_NUMBER_2D, badge: "2D",  label: "Number 2D" },
                    { code: P.SECTION_TYPE_TELEM_DATA_NUMBER_3D, badge: "3D",  label: "Number 3D" },
                    { code: P.SECTION_TYPE_TELEM_DATA_TEXT,      badge: "TXT", label: "Text" },
                    { code: P.SECTION_TYPE_TELEM_DATA_IMAGE,     badge: "IMG", label: "Image" },
                ],
            }
        },
        mounted() { this.timer = setInterval(() => { this.tick++; }, 250); },
        beforeUnmount() { clearInterval(this.timer); },
        computed: {
            tokens() { return this.query.toLowerCase().split(/\s+/).filter(Boolean); },
            searching() { return this.tokens.length > 0 || this.selectedTypes.length > 0; },
            // All telemetries, described for display
            items() {
                this.tick; // Refresh values
                const P = this.TP.protocol;
                const known = this.typeList.map(t => t.code);
                const list = [];
                for (const id in this.TP.datastore.telemetries) {
                    const telem = this.TP.datastore.telemetries[id];
                    const name = String(telem.attributes[P.TELEM_ATTR_NAME] ?? ("telemetry " + telem.id));
                    const unit = telem.attributes[P.TELEM_ATTR_UNIT] || "";
                    const types = Object.keys(telem.data).map(Number).filter(t => known.includes(t));
                    const sep = name.startsWith("/") ? "/" : ".";
                    const path = (name.startsWith("/") ? name.slice(1) : name).split(sep);
                    const rest = path.slice(1).join(sep);
                    const mainType = types.length ? types[0] : "other";
                    const rate = this.rateText(telem, types);
                    list.push({
                        id: telem.id, name, unit, types, mainType, clientId: telem.clientId,
                        group: path.length > 1 ? path[0] : null,
                        dimLength: path.length > 1 ? name.length - rest.length : 0, // The group and its separator are dimmed
                        valueText: this.valueText(telem, types),
                        rateText: this.rateText(telem, types),
                        tooltip: name + "\n" + (types.length ? types.map(t => this.typeLabel(t)).join(", ") : "No data yet") + (unit ? "\nUnit: " + unit : "") + (rate ? "\nUpdate rate: " + rate : ""),
                        lower: name.toLowerCase(),
                    });
                }
                return list;
            },
            matchingName() { return this.items.filter(i => this.tokens.every(t => i.lower.includes(t))); },
            shown() { return this.selectedTypes.length ? this.matchingName.filter(i => i.types.some(t => this.selectedTypes.includes(t))) : this.matchingName; },
            allCount() { return this.items.length; },
            shownCount() { return this.shown.length; },
            typeCounts() {
                const counts = {};
                for (const t of this.typeList) counts[t.code] = this.matchingName.filter(i => i.types.includes(t.code)).length;
                return counts;
            },
            // Clients (only titled when there are some), then groups on the first part of the name
            sections() {
                const clients = this.TP.clients.clients;
                const titled = Object.keys(clients).length > 0;
                const byClient = {};
                for (const item of this.shown) (byClient[item.clientId] = byClient[item.clientId] || []).push(item);
                return Object.entries(byClient).map(([clientId, list]) => {
                    const groups = {};
                    const ungrouped = [];
                    for (const item of list) {
                        if (item.group === null) ungrouped.push(item);
                        else (groups[item.group] = groups[item.group] || []).push(item);
                    }
                    return {
                        id: clientId,
                        title: titled ? (clients[clientId] ? clients[clientId].name : "") : "",
                        ungrouped,
                        groups: Object.entries(groups).map(([label, items]) => ({
                            key: clientId + "/" + label, label, items,
                            types: [...new Set(items.flatMap(i => i.types))],
                        })),
                    };
                });
            },
        },
        methods:{
            valueText(telem, types) {
                const P = this.TP.protocol;
                if (!types.length) return "—";
                const type = types[0];
                const entry = telem.data[type];
                if (!entry || !entry.timestamps.length) return "—";
                const last = entry.data.map(channel => channel.at(-1));
                if (type == P.SECTION_TYPE_TELEM_DATA_IMAGE) return "image";
                if (type == P.SECTION_TYPE_TELEM_DATA_TEXT) return String(last[0]);
                return last.map(v => (typeof v === "number") ? String(+v.toFixed(Math.abs(v) >= 1000 ? 0 : 3)) : String(v)).join(", ");
            },
            // Estimated update rate from the timestamps of the latest samples ("" until 2 samples, "idle" when the data stopped coming)
            rateText(telem, types) {
                const rate = estimateRate(types.length ? telem.data[types[0]] : undefined);
                if (rate == 0) return "";
                if (rate < 0) return "idle";
                if (rate >= 1000) return (rate / 1000).toFixed(rate >= 10000 ? 0 : 1) + " kHz";
                if (rate >= 10) return Math.round(rate) + " Hz";
                if (rate >= 1) return rate.toFixed(1) + " Hz";
                return rate.toFixed(2) + " Hz";
            },
            badge(code) { const t = this.typeList.find(t => t.code == code); return t ? t.badge : "?"; },
            typeLabel(code) { const t = this.typeList.find(t => t.code == code); return t ? t.label : "Other"; },
            toggleType(code) {
                const idx = this.selectedTypes.indexOf(code);
                if (idx >= 0) this.selectedTypes.splice(idx, 1); else this.selectedTypes.push(code);
            },
            isOpen(key) { return this.searching || this.openGroups[key] !== false; },
            onToggle(key, event) { if (!this.searching) this.openGroups[key] = event.target.open; },
            // Cut text in {t, m} pieces, m = matches a search word. Matches are found in the whole name, [from, to) is the part displayed.
            segmentsOf(text, from = 0, to = text.length) {
                const mask = new Array(text.length).fill(false);
                const low = text.toLowerCase();
                for (const t of this.tokens) {
                    let i = -1;
                    while ((i = low.indexOf(t, i + 1)) >= 0) for (let k = 0; k < t.length; k++) mask[i + k] = true;
                }
                const out = [];
                for (let i = from; i < to; i++) {
                    if (out.length && out.at(-1).m === mask[i]) out.at(-1).t += text[i];
                    else out.push({ t: text[i], m: mask[i] });
                }
                return out;
            },
            segments(item, from, to) { return this.segmentsOf(item.name, from, to === undefined ? item.name.length : to); },
            onDragStart(event, ids) {
                event.dataTransfer.setData("text/x-teleplot-drag-type-telemetry", "");
                event.dataTransfer.setData("text/x-teleplot-drag-id", ids[0]);
                if (ids.length > 1) event.dataTransfer.setData("text/x-teleplot-drag-ids", ids.join(","));
                return true;
            },
        },
        template: vueHTML,
    });
}
