/*
 * Top menu: a floating island at the top of the workspace.
 * [logo] [dashboard switcher] [pause/resume | data rate] [panels: Telemetries, Sources, Export, Help] [Edit]
 * - The four side panels are exclusive (ctx.sidePanel): they are one segmented control, icon only, with a hint of their content next to the icon.
 * - Pause/resume is the library's own TP.state.isPaused (incoming data is ignored while paused: the displays freeze).
 * - Shortcuts (not while typing): Space pause/resume, T / S / H panels, E edit. Esc is handled in main.js.
 * - The island floats over the dashboard and fades out when the mouse rests (IDLE_MS), to leave the whole stage to the data. It stays while a popup
 *   is open, while the band above the dashboard is scrolled into view (ctx.bandVisible), while editing, while there is no dashboard, and while the pointer
 *   or the keyboard focus is on it. Paused: a small amber chip remains.
 * - Look: an outlined, solid island while it is clear of the data (band scrolled into view, or no dashboard). Over the dashboard ("over") it turns
 *   to glass (translucent, blurs what is behind) and casts a shadow. Popups stay solid.
 * - ctx.topPanel is the open popup: "dashboard" (dashboard list) or "rate" (data flow options).
 * - Deleting a dashboard is confirmed in place: its row of the list turns into "Delete "name"? [Cancel] [Delete]" (confirmDelete). The auto dashboard
 *   cannot be deleted.
 */
const IDLE_MS = 3000; // Without mouse or keyboard activity for this long, the island fades out
const ACTIVITY_EVENTS = ["pointermove", "pointerdown", "keydown", "touchstart"];

function initComponent_top_menu(vue) {
    let name = "top-menu";

    const vueHTML = `
        <div class="tm" :class="{away: away, over: over}" role="toolbar" aria-label="Teleplot">
            <button v-if="away && paused" class="tm-chip" title="Resume (Space)" @click="togglePause($event);">
                <svg class="tm-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5l12 7.5-12 7.5z" fill="currentColor"/></svg>
                Paused
            </button>
            <div class="tm-island" @pointerenter="hovered = true" @pointerleave="hovered = false" @focusin="focused = true" @focusout="focused = false">
                <img src="media/logo-color.svg" class="tm-logo" alt="Teleplot"/>

                <div class="tm-anchor tm-anchor-dashboard">
                    <button class="tm-btn" :class="{on: ctx.topPanel=='dashboard'}" aria-haspopup="menu" :aria-expanded="ctx.topPanel=='dashboard'" @click="setTopPanel('dashboard', $event);">
                        <span v-if="editor.state.enabled" class="tm-crumb">Editing</span>
                        <span class="tm-dashboard-name">{{ctx.activeDashboard ? ctx.activeDashboard.name : 'Dashboard'}}</span>
                        <i class="icofont-simple-down tm-caret"></i>
                    </button>
                    <template v-if="ctx.topPanel=='dashboard'">
                        <div class="tm-popup tm-dashboards" role="menu">
                            <template v-for="dashboard in dashboardList()" :key="dashboard.name">
                                <div v-if="confirmDelete == dashboard.name" class="tm-row tm-row-confirm" role="alertdialog" :aria-label="'Delete ' + dashboard.name + '?'" @keydown.esc.stop="confirmDelete = ''">
                                    <span class="tm-row-question">Delete "{{dashboard.name}}"?</span>
                                    <button class="tm-row-cancel" @click="confirmDelete = ''">Cancel</button>
                                    <button class="tm-row-confirm-delete" @click="deleteDashboard(dashboard);">Delete</button>
                                </div>
                                <div v-else class="tm-row" :class="{current: dashboard === ctx.activeDashboard}">
                                    <button class="tm-row-main" role="menuitem" @click="selectDashboard(dashboard);">
                                        <span class="tm-row-name">
                                            <span><span v-if="dashboard.isAuto" class="tm-live"></span>{{dashboard.name}}</span>
                                            <span class="tm-row-sub">{{dashboardSummary(dashboard)}}</span>
                                        </span>
                                        <i v-if="dashboard === ctx.activeDashboard" class="icofont-check tm-row-check"></i>
                                    </button>
                                    <button class="tm-row-edit" title="Edit dashboard" aria-label="Edit dashboard" @click="editDashboard(dashboard);">
                                        <i class="icofont-duotone icofont-pencil"></i>
                                    </button>
                                    <button v-if="!dashboard.isAuto" class="tm-row-edit tm-row-delete" title="Delete dashboard" aria-label="Delete dashboard" @click="askDelete(dashboard, $event);">
                                        <i class="icofont-trash"></i>
                                    </button>
                                </div>
                                <div v-if="dashboard.isAuto" class="tm-sep-h"></div>
                            </template>
                            <div v-if="!dashboardList().length" class="tm-empty">No dashboard yet. Send some data, or create one.</div>
                            <div class="tm-sep-h"></div>
                            <button class="tm-new" role="menuitem" @click="newDashboard();">
                                <i class="icofont-plus"></i> New dashboard
                            </button>
                        </div>
                    </template>
                </div>

                <span class="tm-sep"></span>

                <div class="tm-anchor">
                    <div class="tm-split" :class="{paused: paused}">
                        <button class="tm-btn tm-play tm-tipped" :aria-pressed="paused" :aria-label="paused ? 'Resume' : 'Pause'" @click="togglePause($event);">
                            <svg v-if="paused" class="tm-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5l12 7.5-12 7.5z" fill="currentColor"/></svg>
                            <svg v-else class="tm-svg" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor"/><rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor"/></svg>
                            <span class="tm-tip" role="tooltip"><span class="tm-tip-head"><b>{{paused ? 'Resume' : 'Pause'}}</b><kbd>Space</kbd></span></span>
                        </button>
                        <button class="tm-rate" :class="{on: ctx.topPanel=='rate'}" aria-haspopup="dialog" :aria-expanded="ctx.topPanel=='rate'" aria-label="Data flow" @click="setTopPanel('rate', $event);">
                            <i v-if="!paused" class="tm-dot" :class="{flowing: flowing}"></i>
                            <span class="tm-rate-text">{{paused ? 'paused' : rateText}}</span>
                            <i class="icofont-simple-down tm-caret"></i>
                        </button>
                    </div>
                    <template v-if="ctx.topPanel=='rate'">
                        <div class="tm-popup tm-flow" role="dialog" aria-label="Data flow">
                            <span class="tm-empty">Display options will come here.</span>
                        </div>
                    </template>
                </div>

                <span class="tm-sep"></span>

                <div class="tm-seg" role="group" aria-label="Panels">
                    <button v-for="p in panels" :key="p.name" class="tm-btn tm-tipped" :class="{on: ctx.sidePanel==p.name}" :disabled="p.soon" :aria-pressed="ctx.sidePanel==p.name" :aria-label="p.label + (countOf(p) === null ? '' : ', ' + countOf(p))" @click="toggleSidePanel(p.name, $event);">
                        <i :class="p.icon"></i>
                        <span v-if="countOf(p) !== null" class="tm-count">{{countOf(p)}}</span>
                        <i v-if="p.name=='sources' && sourcesStatus" class="tm-status" :class="sourcesStatus"></i>
                        <span class="tm-tip" role="tooltip">
                            <span class="tm-tip-head"><b>{{p.label}}</b><kbd v-if="!p.soon">{{p.key}}</kbd></span>
                            <span v-for="line in tipLines(p)" :key="line.text" class="tm-tip-line"><i v-if="line.status" class="tm-status" :class="line.status"></i>{{line.text}}</span>
                        </span>
                    </button>
                </div>

                <span class="tm-sep"></span>

                <button class="tm-btn tm-edit" :class="{done: editor.state.enabled}" :disabled="!ctx.activeDashboard" :aria-pressed="editor.state.enabled" @click="toggleEdit($event);">
                    <i :class="editor.state.enabled ? 'icofont-check' : 'icofont-duotone icofont-pencil'"></i>
                    <span>{{editor.state.enabled ? 'Done' : 'Edit'}}</span>
                    <kbd>{{editor.state.enabled ? 'Esc' : 'E'}}</kbd>
                </button>
            </div>
        </div>
    `;

    const vueCSS = `
        .tm {
            position: sticky; /* Stays at the top of the workspace while the dashboard scrolls under it; no height of its own (the band is in style.css) */
            top: 0;
            flex: none;
            height: 0;
            z-index: 20;
            display: flex;
            justify-content: center;
            padding: 0 0.8rem;
            pointer-events: none; /* Only the island takes the mouse: the dashboard stays reachable around it */
            container-type: inline-size; /* The island adapts to the room it has: the side panels and the edit panel take some */
        }
        .tm-island {
            pointer-events: auto;
            display: flex;
            align-items: center;
            gap: 0.3rem;
            height: 3.8rem;
            margin-top: 0.6rem;
            box-sizing: border-box;
            padding: 0.4rem;
            max-width: 100%;
            white-space: nowrap;
            font-size: 1.05rem;
            color: var(--color-text);
            background: var(--color-bg-light);
            border: 1px solid color-mix(in srgb, var(--color-bg-dark), var(--color-text) 10%); /* The outline alone holds the island together while it is clear of the data */
            border-radius: 1.25rem;
            box-shadow: 0 0 0 transparent;
            transition: opacity var(--motion-fast) ease-out, transform var(--motion-fast) var(--ease-out), visibility 0s, background-color 0.2s ease-out, box-shadow 0.2s ease-out;
        }
        /* Over the dashboard: glass and a shadow */
        .tm.over .tm-island {
            background: color-mix(in srgb, var(--color-bg-light) 50%, transparent);
            -webkit-backdrop-filter: blur(10px);
            backdrop-filter: blur(10px);
            box-shadow: 0 10px 26px var(--color-shadow);
        }
        /* Resting mouse: the island slips away (a little slower than it comes back), out of reach and out of the tab order */
        .tm.away .tm-island {
            opacity: 0;
            transform: translateY(-0.8rem);
            visibility: hidden;
            pointer-events: none;
            transition: opacity 0.22s ease-in, transform 0.22s ease-in, visibility 0s 0.22s;
        }
        /* The paused state must not go unnoticed while the island is away */
        .tm .tm-chip {
            position: absolute;
            top: 0.8rem;
            left: 50%;
            translate: -50% 0;
            pointer-events: auto;
            display: inline-flex;
            align-items: center;
            gap: 0.4rem;
            height: 2rem;
            padding: 0 0.9rem 0 0.7rem;
            border: none;
            border-radius: 1rem;
            background: var(--color-warning);
            color: #2b2100;
            font: inherit;
            font-weight: 600;
            cursor: pointer;
            box-shadow: 0 4px 14px var(--color-shadow);
            transition: opacity var(--motion-fast) ease-out;
            @starting-style { opacity: 0; }
        }
        .tm .tm-chip:focus-visible { outline: 2px solid var(--color-text); outline-offset: 2px; }
        .tm button { font: inherit; color: inherit; border: none; background: transparent; }
        .tm kbd {
            font: 0.85rem ui-monospace, Consolas, monospace;
            padding: 0 0.35rem;
            line-height: 1.3rem;
            border: 1px solid var(--color-bg-dark);
            border-radius: 0.35rem;
            color: var(--color-text-muted);
        }
        .tm-logo { height: 1.7rem; width: auto; margin: 0 0.6rem 0 0.4rem; flex: none; }
        .tm-anchor { position: relative; display: flex; }
        .tm-anchor-dashboard { min-width: 0; }
        .tm-anchor-dashboard .tm-btn { min-width: 0; }
        .tm-dashboard-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
        .tm-sep { width: 1px; height: 1.8rem; margin: 0 0.3rem; background: var(--color-bg-dark); flex: none; }
        .tm-svg { width: 1.2rem; height: 1.2rem; flex: none; }
        .tm-caret { font-size: 0.7em; opacity: 0.6; }

        /* Buttons */
        .tm-btn {
            position: relative;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 0.5rem;
            height: 3rem;
            padding: 0 0.9rem;
            border-radius: 0.85rem;
            font-weight: 500;
            cursor: pointer;
        }
        .tm-btn:hover { background: color-mix(in srgb, var(--color-text) 8%, transparent); }
        .tm-btn:focus { outline: none; }
        .tm-btn:focus-visible { box-shadow: 0 0 0 2px var(--color-primary); }
        .tm-btn.on { background: color-mix(in srgb, var(--color-primary) 16%, transparent); color: var(--color-primary); }
        .tm-btn:disabled { opacity: 0.45; cursor: default; background: transparent; }
        .tm-crumb { color: var(--color-text-muted); font-weight: 400; }

        /* Panels: one segmented control, icon + hint of the content */
        .tm-seg { display: flex; gap: 0.15rem; padding: 0.25rem; border-radius: 1rem; background: color-mix(in srgb, var(--color-text) 6%, transparent); }
        .tm-seg .tm-btn { height: 2.65rem; min-width: 2.65rem; padding: 0 0.7rem; gap: 0.35rem; border-radius: 0.75rem; }
        .tm-seg .tm-btn.on { background: var(--color-bg-light); box-shadow: 0 1px 3px var(--color-shadow); }
        .tm-count { font-size: 0.95rem; font-weight: 600; font-variant-numeric: tabular-nums; color: var(--color-text-muted); }
        .tm-btn.on .tm-count { color: var(--color-primary); }
        .tm-status { display: inline-block; width: 0.55rem; height: 0.55rem; border-radius: 50%; background: var(--color-text-muted); flex: none; }
        .tm-status.ok { background: var(--color-success); }
        .tm-status.warn { background: var(--color-warning); }
        .tm-status.bad { background: var(--color-danger); }
        .tm-seg .tm-btn > .tm-status { position: absolute; top: 0.45rem; right: 0.4rem; box-shadow: 0 0 0 2px var(--color-bg-light); }
        .tm-seg .tm-btn.on > .tm-status { box-shadow: 0 0 0 2px var(--color-bg-light); }

        /* Pause/resume + data rate */
        .tm-split { display: flex; align-items: center; height: 3rem; border-radius: 0.85rem; background: color-mix(in srgb, var(--color-text) 6%, transparent); }
        .tm-split .tm-btn { border-radius: 0.85rem; }
        .tm-play { width: 3rem; padding: 0; }
        .tm-rate { display: flex; align-items: center; gap: 0.4rem; height: 1.8rem; padding: 0 0.7rem 0 0.5rem; margin: 0; border-left: 1px solid var(--color-bg-dark) !important; border-radius: 0 !important; font-weight: 600; font-variant-numeric: tabular-nums; cursor: pointer; }
        .tm-rate-text { min-width: 4.8rem; text-align: left; }
        .tm-rate.on { color: var(--color-primary); }
        .tm-dot { width: 0.6rem; height: 0.6rem; border-radius: 50%; background: var(--color-text-muted); flex: none; }
        .tm-dot.flowing { background: var(--color-success); box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-success) 25%, transparent); }
        .tm-split.paused { background: var(--color-warning); color: #2b2100; }
        .tm-split.paused .tm-btn:hover { background: rgba(0, 0, 0, 0.1); }
        .tm-split.paused .tm-rate { border-left-color: rgba(0, 0, 0, 0.2) !important; }

        /* Edit */
        .tm-edit { background: var(--color-text); color: var(--color-bg-light); font-weight: 600; }
        .tm-edit:hover { background: color-mix(in srgb, var(--color-text) 82%, var(--color-bg-light)); }
        .tm-edit kbd { border-color: transparent; background: color-mix(in srgb, var(--color-bg-light) 18%, transparent); color: inherit; }
        .tm-edit.done { background: var(--tp-edit-container, #e67e22); color: #fff; }
        .tm-edit.done:hover { background: color-mix(in srgb, var(--tp-edit-container, #e67e22) 85%, black); }
        .tm-edit:disabled { background: color-mix(in srgb, var(--color-text) 15%, transparent); color: var(--color-text-muted); }

        /* Tooltips: name + shortcut (+ a summary), on hover and on keyboard focus */
        .tm-tip {
            position: absolute;
            top: calc(100% + 0.7rem);
            left: 50%;
            transform: translateX(-50%);
            z-index: 30;
            display: flex;
            flex-direction: column;
            gap: 0.15rem;
            padding: 0.4rem 0.6rem;
            border-radius: 0.55rem;
            background: var(--color-text);
            color: var(--color-bg-light);
            font-size: 0.95rem;
            font-weight: 400;
            text-align: left;
            pointer-events: none;
            visibility: hidden;
            opacity: 0;
            transition: opacity var(--motion-fast), visibility 0s;
        }
        .tm-tipped:hover .tm-tip, .tm-tipped:focus-visible .tm-tip { visibility: visible; opacity: 1; transition: opacity var(--motion-fast) 0.35s, visibility 0s 0.35s; }
        .tm-tip::before { content: ""; position: absolute; top: -0.25rem; left: 50%; width: 0.5rem; height: 0.5rem; margin-left: -0.25rem; background: inherit; transform: rotate(45deg); }
        .tm-tip-head { display: flex; align-items: center; gap: 0.6rem; }
        .tm-tip-head b { font-weight: 600; }
        .tm-tip kbd { margin-left: auto; border-color: transparent; background: color-mix(in srgb, var(--color-bg-light) 20%, transparent); color: inherit; }
        .tm-tip-line { display: flex; align-items: center; gap: 0.4rem; opacity: 0.8; font-size: 0.9rem; }
        @media (hover: none) { .tm-tip { display: none; } }

        /* Popups: dashboards, data flow */
        .tm-popup {
            position: absolute;
            top: calc(100% + 0.7rem);
            left: 0;
            z-index: 20;
            min-width: 18rem;
            max-width: 90vw;
            max-height: 70vh;
            overflow-y: auto;
            box-sizing: border-box;
            padding: 0.4rem;
            white-space: normal;
            background: var(--color-bg-light);
            color: var(--color-text);
            border: 1px solid var(--color-bg-dark);
            border-radius: 1rem;
            box-shadow: 0 14px 34px var(--color-shadow);
            transition: opacity var(--motion-fast) ease-out, transform var(--motion-fast) var(--ease-out);
            @starting-style { transform: translate(0, -0.5rem); opacity: 0; }
        }
        .tm-flow { min-width: 14rem; }
        .tm-row { display: flex; align-items: stretch; border-radius: 0.7rem; }
        .tm-row:hover, .tm-row:focus-within { background: color-mix(in srgb, var(--color-text) 7%, transparent); }
        .tm-row.current { background: color-mix(in srgb, var(--color-primary) 14%, transparent); }
        .tm-popup button { font: inherit; color: inherit; background: transparent; border: none; cursor: pointer; text-align: left; }
        .tm-row-main { flex: 1; display: flex; align-items: center; gap: 0.5rem; min-width: 0; padding: 0.5rem 0.7rem; font-weight: 500; border-radius: 0.7rem; }
        .tm-row-name { flex: 1; display: flex; flex-direction: column; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .tm-row-sub { color: var(--color-text-muted); font-size: 0.85em; font-weight: 400; }
        .tm-row-check { color: var(--color-primary); }
        .tm-live { display: inline-block; width: 0.55rem; height: 0.55rem; margin-right: 0.45rem; border-radius: 50%; background: var(--color-success); }
        .tm-row-edit { padding: 0 0.6rem; color: var(--color-text-muted); opacity: 0; border-radius: 0.7rem; }
        .tm-row:hover .tm-row-edit, .tm-row-edit:focus-visible { opacity: 1; }
        .tm-row-edit:hover { color: var(--color-primary); }
        .tm-row-delete:hover { color: var(--color-danger); }
        @media (hover: none) { .tm-row-edit { opacity: 1; } }
        /* Delete confirmation, in place of the row */
        .tm-row-confirm, .tm-row-confirm:hover { align-items: center; gap: 0.3rem; padding: 0.35rem 0.35rem 0.35rem 0.7rem; background: color-mix(in srgb, var(--color-danger) 12%, transparent); }
        .tm-row-question { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
        .tm-row-confirm button { padding: 0.35rem 0.7rem; border-radius: 0.55rem; font-weight: 600; }
        .tm-row-cancel:hover { background: color-mix(in srgb, var(--color-text) 10%, transparent); }
        .tm-popup .tm-row-confirm-delete { background: var(--color-danger); color: #fff; }
        .tm-popup .tm-row-confirm-delete:hover { background: color-mix(in srgb, var(--color-danger) 85%, black); }
        .tm-sep-h { height: 1px; margin: 0.3rem 0.3rem; background: var(--color-bg-dark); }
        .tm-empty { display: block; padding: 0.5rem 0.7rem; color: var(--color-text-muted); }
        .tm-new { width: 100%; padding: 0.55rem 0.7rem; border-radius: 0.7rem; font-weight: 600; color: var(--color-primary) !important; }
        .tm-new:hover { background: color-mix(in srgb, var(--color-text) 7%, transparent); }
        .tm-popup button:focus-visible { outline: none; box-shadow: inset 0 0 0 2px var(--color-primary); }

        /* Tighter islands: logo and shortcut hints first, then the "Editing" prefix */
        @container (max-width: 860px) {
            .tm-logo, .tm-edit kbd { display: none; }
        }
        @container (max-width: 700px) {
            .tm-crumb { display: none; }
            .tm-rate-text { min-width: 3.6rem; }
        }
    `;
    // Add css to head
    {
        let elem = document.createElement('style');
        elem.textContent = vueCSS;
        document.head.appendChild(elem);
    }

    // Rate shown beside the pause button: samples received per second, all telemetries together
    function formatPerSecond(rate) {
        if (rate >= 1000) return (rate / 1000).toFixed(rate >= 10000 ? 0 : 1) + "k/s";
        return Math.round(rate) + "/s";
    }

    return vue.component(name, {
        name: name,
        setup() {
            const TP = Vue.inject("TP");
            const ctx = Vue.inject("ctx");
            const editor = Vue.inject("editor");
            return { TP, ctx, editor };
        },
        data() {
            return {
                panels: [
                    { name: "telemetries", label: "Telemetries", key: "T", icon: "icofont-duotone icofont-chart" },
                    { name: "sources", label: "Sources", key: "S", icon: "icofont-link" },
                    { name: "export", label: "Export", key: "X", icon: "icofont-share-alt", soon: true },
                    { name: "help", label: "Help", key: "H", icon: "icofont-info" },
                ],
                awake: true,    // Recent activity of the mouse or keyboard
                hovered: false, // The pointer is on the island
                focused: false, // The keyboard focus is in the island
                totalRate: 0, // Hz, refreshed by a timer
                streams: 0,   // data streams seen (a telemetry has one per data type)
                confirmDelete: "", // Name of the dashboard whose deletion is being confirmed in the list
            }
        },
        computed: {
            paused() { return !!this.TP.state.isPaused; },
            // Reasons to stay on screen even when nothing moves
            pinned() { return !!(this.ctx.topPanel || this.ctx.bandVisible || this.editor.state.enabled || !this.ctx.activeDashboard || this.hovered || this.focused); },
            away() { return !(this.awake || this.pinned); },
            // The island floats over the dashboard (not over the free band above it)
            over() { return !!this.ctx.activeDashboard && !this.ctx.bandVisible; },
            flowing() { return this.totalRate > 0; },
            rateText() {
                if (this.totalRate > 0) return formatPerSecond(this.totalRate);
                return this.streams ? "idle" : "no data";
            },
            telemetryCount() { return Object.keys(this.TP.datastore.telemetries).length; },
            sourceCount() { return this.TP.connection.connections.length; },
            // Every source receiving: ok, some lost: warn, all lost: bad, none configured: no dot
            sourcesStatus() {
                const connections = this.TP.connection.connections;
                if (!connections.length) return "";
                const up = connections.filter(c => c.connected).length;
                return up == connections.length ? "ok" : (up ? "warn" : "bad");
            },
        },
        watch: {
            // When a reason to stay goes away, the island lingers for a moment
            pinned(value) { if (!value) this.wake(); },
            // A pending delete confirmation does not survive the list being closed
            "ctx.topPanel"() { this.confirmDelete = ""; },
        },
        methods: {
            // Activity: show the island, and hide it again after IDLE_MS without any
            wake() {
                this.awake = true;
                clearTimeout(this._idleTimer);
                this._idleTimer = setTimeout(() => { this.awake = false; }, IDLE_MS);
            },
            onActivity(event) {
                if (event.type == "pointermove") { // Frequent: do not reschedule on every event
                    const now = performance.now();
                    if (this.awake && now - (this._lastMove || 0) < 100) return;
                    this._lastMove = now;
                }
                if (event.type == "keydown" && event.key.length == 1) { // Typing in a field is not a call for the menu
                    const t = event.target;
                    if (t && (t.isContentEditable || (t.closest && t.closest("input, textarea, select")))) return;
                }
                this.wake();
            },
            // A click leaves the focus on the button: drop it so that the Space shortcut keeps working
            release(event) { if (event && event.detail && event.currentTarget) event.currentTarget.blur(); },
            countOf(panel) {
                if (panel.name == "telemetries") return this.telemetryCount;
                if (panel.name == "sources") return this.sourceCount;
                return null;
            },
            tipLines(panel) {
                if (panel.name == "telemetries") return [{ text: this.telemetryCount + (this.telemetryCount == 1 ? " telemetry" : " telemetries") }];
                if (panel.soon) return [{ text: "Coming soon" }];
                if (panel.name != "sources") return [];
                const connections = this.TP.connection.connections;
                if (!connections.length) return [{ text: "No source" }];
                return connections.map(c => ({ text: c.type + " " + c.name + (c.connected ? "" : " (lost)"), status: c.connected ? "ok" : "bad" }));
            },
            togglePause(event) { this.release(event); this.TP.state.isPaused = !this.TP.state.isPaused; },
            toggleSidePanel(name, event) {
                this.release(event);
                this.ctx.sidePanel = (this.ctx.sidePanel == name) ? "" : name;
                this.ctx.topPanel = "";
            },
            setTopPanel(name, event) {
                this.release(event);
                this.ctx.topPanel = (this.ctx.topPanel == name) ? "" : name;
            },
            // Dashboards in the order they are listed: the auto one first, then the others by creation
            dashboardList() {
                const all = Object.values(this.TP.dashboards.dashboards);
                return all.filter(d => d.isAuto).concat(all.filter(d => !d.isAuto));
            },
            dashboardSummary(dashboard) {
                const s = dashboard.getStats();
                const telemetries = s.telemetryCount + (s.telemetryCount == 1 ? " telemetry" : " telemetries");
                if (dashboard.isAuto) return "auto · " + telemetries;
                return s.viewCount + (s.viewCount == 1 ? " view" : " views") + " · " + telemetries;
            },
            selectDashboard(dashboard) {
                this.ctx.activeDashboard = dashboard;
                this.ctx.topPanel = "";
            },
            editDashboard(dashboard) {
                this.ctx.activeDashboard = dashboard;
                this.ctx.topPanel = "";
                this.editor.setRoot(dashboard.getView());
                this.editor.setEnabled(true);
            },
            // Deleting asks first, in the row itself; the focus goes to Cancel, so that a stray Enter or Space is harmless
            askDelete(dashboard, event) {
                const popup = event.currentTarget.closest(".tm-popup");
                this.confirmDelete = dashboard.name;
                this.$nextTick(() => { const cancel = popup.querySelector(".tm-row-cancel"); if (cancel) cancel.focus(); });
            },
            // The list stays open (to delete several); a deleted dashboard that was displayed gives its place to the first of the list
            deleteDashboard(dashboard) {
                this.confirmDelete = "";
                const wasActive = dashboard === this.ctx.activeDashboard;
                if (!this.TP.dashboards.removeDashboard(dashboard.name)) return;
                if (wasActive) this.ctx.activeDashboard = this.dashboardList()[0] || null;
            },
            newDashboard() {
                this.editDashboard(this.TP.dashboards.createDashboard());
            },
            toggleEdit(event) {
                this.release(event);
                if (!this.ctx.activeDashboard) return;
                this.editor.setRoot(this.ctx.activeDashboard.getView());
                this.editor.setEnabled(!this.editor.state.enabled);
            },
            refreshRate() {
                let total = 0, streams = 0;
                for (const id in this.TP.datastore.telemetries) {
                    const data = this.TP.datastore.telemetries[id].data;
                    for (const type in data) {
                        streams++;
                        const rate = estimateRate(data[type]);
                        if (rate > 0) total += rate;
                    }
                }
                this.totalRate = total;
                this.streams = streams;
            },
            // A click anywhere else closes the open popup (the buttons of the menu toggle it themselves)
            onPointerDown(event) {
                if (!this.ctx.topPanel) return;
                if (event.target.closest && event.target.closest(".tm-popup, .tm-anchor > button, .tm-split")) return;
                this.ctx.topPanel = "";
            },
            onKeyDown(event) {
                if (event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented) return;
                const t = event.target;
                if (t && (t.isContentEditable || (t.closest && t.closest("input, textarea, select")))) return; // Typing
                if (event.key == " " && t && t.closest && t.closest("button, summary, a")) return; // Space activates a focused control, as usual
                if (event.key == " ") { event.preventDefault(); this.togglePause(); return; }
                const key = event.key.toLowerCase();
                if (key == "e") { event.preventDefault(); this.toggleEdit(); return; }
                const panel = this.panels.find(p => !p.soon && (p.key.toLowerCase() == key || (p.name == "help" && key == "?")));
                if (panel) { event.preventDefault(); this.toggleSidePanel(panel.name); }
            },
        },
        created() {
            this._onKeyDown = (e) => this.onKeyDown(e);
            this._onPointerDown = (e) => this.onPointerDown(e);
            this._onActivity = (e) => this.onActivity(e);
            window.addEventListener("keydown", this._onKeyDown);
            window.addEventListener("pointerdown", this._onPointerDown, true);
            for (const type of ACTIVITY_EVENTS) window.addEventListener(type, this._onActivity, true);
        },
        mounted() {
            this.wake();
            this.refreshRate();
            this._rateTimer = setInterval(() => this.refreshRate(), 250);
        },
        unmounted() {
            window.removeEventListener("keydown", this._onKeyDown);
            window.removeEventListener("pointerdown", this._onPointerDown, true);
            for (const type of ACTIVITY_EVENTS) window.removeEventListener(type, this._onActivity, true);
            clearTimeout(this._idleTimer);
            clearInterval(this._rateTimer);
        },
        template: vueHTML,
    });
}
