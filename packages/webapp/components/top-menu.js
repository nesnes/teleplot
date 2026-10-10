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
 * - ctx.topPanel is the open popup: "dashboard" (dashboard list) or "rate" (the data menu).
 * - Next to the rate, a ring shows how much of the memory allowed for the data is used (green, amber from 70 %, red from 90 %); a mark
 *   turns around it while data is flowing. The data menu (see doc/top-menu.md) sets how long data is kept, shows what takes the
 *   memory and what is done when it is full (the library does it: TP.state.memoryLimit / memoryPolicy), and clears data.
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
                        <button class="tm-btn tm-play tm-tipped" :aria-pressed="paused" :aria-label="zoomed ? 'Back to live' : (paused ? 'Resume' : 'Pause')" @click="zoomed ? backToLive($event) : togglePause($event);">
                            <svg v-if="paused || zoomed" class="tm-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5l12 7.5-12 7.5z" fill="currentColor"/></svg>
                            <svg v-else class="tm-svg" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor"/><rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor"/></svg>
                            <span class="tm-tip" role="tooltip"><span v-if="zoomed" class="tm-tip-head"><b>Back to live</b><kbd>Esc</kbd></span><span v-else class="tm-tip-head"><b>{{paused ? 'Resume' : 'Pause'}}</b><kbd>Space</kbd></span></span>
                        </button>
                        <button class="tm-rate" :class="{on: ctx.topPanel=='rate'}" aria-haspopup="dialog" :aria-expanded="ctx.topPanel=='rate'" aria-label="Data flow" @click="setTopPanel('rate', $event);">
                            <span class="tm-gauge" :class="['tm-gauge-' + memory.level, {flowing: flowing && !paused}]" :style="{'--p': memory.percent}" :title="memory.title"><i></i></span>
                            <span class="tm-rate-text"><span>{{paused ? 'paused' : rateText}}</span><span v-if="span.isThinned" class="tm-rate-thinned" :title="span.thinnedTitle">thinned</span></span>
                            <i class="icofont-simple-down tm-caret"></i>
                        </button>
                    </div>
                    <template v-if="ctx.topPanel=='rate'">
                        <div class="tm-popup tm-flow" role="dialog" aria-label="Data: window, memory, clearing">
                            <div v-if="memory.notice" class="tm-notice">{{memory.notice}}</div>

                            <h5>Data window</h5>
                            <div class="tm-line">
                                <div class="tm-choice tm-grow" role="group" aria-label="How long data is kept">
                                    <button v-for="w in windows" :key="w[0]" :class="{on: TP.state.dataTimeout == w[0]}" :aria-pressed="TP.state.dataTimeout == w[0]" @click="setWindow(w[0])">{{w[1]}}</button>
                                </div>
                                <label class="tm-field-label" title="Seconds of data kept per telemetry (0: everything)"><input class="tm-field" type="number" min="0" step="10" :value="windowDraft ?? TP.state.dataTimeout" @input="windowDraft = $event.target.value" @change="setWindow($event.target.value); windowDraft = null" @blur="windowDraft = null"> s</label>
                            </div>
                            <div class="tm-time" :title="span.title">
                                <i v-if="span.thinned" class="tm-time-thinned" :style="{width: span.thinned + '%'}"></i>
                                <i v-if="span.plain" class="tm-time-kept" :style="{width: span.plain + '%'}"></i>
                                <i v-if="span.gap" class="tm-time-gap" :style="{width: span.gap + '%'}"></i>
                            </div>
                            <div class="tm-time-ticks"><span>{{span.fromText}}</span><span class="tm-time-text">{{span.text}}<span v-if="span.thinnedText" class="tm-time-note"> · {{span.thinnedText}}</span></span><span>now</span></div>

                            <h5>Memory <span class="tm-h5-value">{{memory.usedText}} of</span>
                                <label class="tm-field-label" title="How much the stored data may take, in MB (0: no limit)"><input class="tm-field" type="number" min="0" step="50" :value="limitDraft ?? Math.round(TP.state.memoryLimit / 1e6)" @input="limitDraft = $event.target.value" @change="setLimit($event.target.value); limitDraft = null" @blur="limitDraft = null"> MB</label>
                            </h5>
                            <div class="tm-stack" :title="memory.title">
                                <i v-for="seg in memory.segments" :key="seg.key" :style="{width: seg.width + '%', background: seg.color}" :title="seg.title"></i>
                            </div>
                            <div class="tm-sub">{{memory.samplesText}}</div>
                            <div class="tm-sub tm-policy-title">When the limit is reached</div>
                            <button v-for="p in policies" :key="p.value" class="tm-radio" :class="{on: TP.state.memoryPolicy == p.value}" role="radio" :aria-checked="TP.state.memoryPolicy == p.value" @click="TP.state.memoryPolicy = p.value">
                                <span class="tm-knob"></span>
                                <span><b>{{p.label}}</b><span class="tm-sub">{{p.note}}</span></span>
                            </button>

                            <h5>Heaviest telemetries</h5>
                            <div v-if="!memory.heaviest.length" class="tm-sub">No data yet.</div>
                            <div v-for="t in memory.heaviest" :key="t.id" class="tm-heavy" :title="t.name">
                                <i class="tm-chip-color" :style="{background: t.color}"></i>
                                <span class="tm-heavy-name"><b>{{t.name}}</b> <span class="tm-sub">{{t.detail}}</span></span>
                                <span v-if="t.thinned" class="tm-heavy-thinned" title="Its oldest data was thinned out to fit in memory: real samples, fewer of them">thinned</span>
                                <span class="tm-heavy-size">{{t.sizeText}}</span>
                                <button class="tm-x" :title="'Clear the data of ' + t.name" :aria-label="'Clear the data of ' + t.name" @click="clearTelemetry(t.id)"><i class="icofont-close"></i></button>
                            </div>

                            <h5>Clear</h5>
                            <div v-if="confirmForget" class="tm-line tm-row-confirm" role="alertdialog" aria-label="Forget every telemetry ?" @keydown.esc.stop="confirmForget = false">
                                <span class="tm-row-question">Forget every telemetry and its data?</span>
                                <button class="tm-row-cancel" ref="forgetCancel" @click="confirmForget = false">Cancel</button>
                                <button class="tm-row-confirm-delete" @click="forgetEverything()">Forget</button>
                            </div>
                            <div v-else class="tm-line tm-clear">
                                <button class="tm-action" title="Empties every telemetry. Telemetries, dashboards and views stay." @click="clearAll()">Clear all data</button>
                                <button class="tm-action" :disabled="!ctx.activeDashboard" title="Empties the telemetries that the displayed dashboard does not show" @click="clearOffScreen()">Clear what is off screen</button>
                                <span class="tm-grow"></span>
                                <button class="tm-action tm-danger" title="Data and telemetries: a fresh start. Dashboards are kept." @click="askForget()">Forget everything</button>
                            </div>
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
        .tm-rate-text { display: flex; flex-direction: column; justify-content: center; gap: 0.12rem; line-height: 1; min-width: 4.8rem; text-align: left; }
        /* Some stored data was thinned out: said under the rate, in the color of the thinned part of the timeline of the data menu */
        :root { --tm-thinned: var(--color-warning); --tm-thinned-text: hsl(39, 100%, 27%); }
        :root[data-theme="dark"] { --tm-thinned-text: var(--color-warning); }
        .tm-rate-thinned { font-size: 0.75rem; font-weight: 700; letter-spacing: 0.02em; color: var(--tm-thinned-text); }
        .tm-split.paused .tm-rate-thinned { color: #2b2100; }
        .tm-rate.on { color: var(--color-primary); }
        /* Memory ring: fills clockwise with the share of the limit in use. While data flows, a mark turns around it. */
        .tm-gauge { position: relative; flex: none; width: 1.2rem; height: 1.2rem; margin: 0 0.2rem; --gc: var(--color-success); }
        .tm-gauge-warn { --gc: var(--color-warning); } .tm-gauge-bad { --gc: var(--color-danger); }
        .tm-gauge i { position: absolute; inset: 0; border-radius: 50%;
            background: conic-gradient(var(--gc) calc(var(--p) * 1%), color-mix(in srgb, currentColor 22%, transparent) 0);
            -webkit-mask: radial-gradient(farthest-side, transparent 50%, #000 54%); mask: radial-gradient(farthest-side, transparent 50%, #000 54%); }
        .tm-gauge.flowing::after { content: ""; position: absolute; inset: -0.3rem; border-radius: 50%;
            background: conic-gradient(from 0deg, transparent 0 62%, var(--color-success));
            -webkit-mask: radial-gradient(farthest-side, transparent 80%, #000 84%); mask: radial-gradient(farthest-side, transparent 80%, #000 84%);
            animation: tm-flow-turn 1.4s linear infinite; }
        @keyframes tm-flow-turn { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) { /* No motion: a still halo says "flowing" */
            .tm-gauge.flowing::after { animation: none; background: color-mix(in srgb, var(--color-success) 55%, transparent); }
        }
        .tm-split.paused .tm-gauge { --gc: #2b2100; }
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
        /* Data menu */
        .tm-flow { width: 31rem; padding: 0.8rem 0.9rem 0.9rem; font-size: 1rem; }
        .tm-flow h5 { display: flex; align-items: center; gap: 0.4rem; margin: 0.9rem 0 0.35rem; font-size: 0.85rem; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: var(--color-text-muted); }
        .tm-flow h5:first-of-type { margin-top: 0; }
        .tm-h5-value { margin-left: auto; text-transform: none; letter-spacing: 0; font-weight: 600; color: var(--color-text); }
        .tm-line { display: flex; align-items: center; gap: 0.45rem; min-width: 0; }
        .tm-grow { flex: 1 1 0; min-width: 0; }
        .tm-sub { display: block; color: var(--color-text-muted); font-size: 0.9rem; font-weight: 400; }
        .tm-choice { display: flex; gap: 0.15rem; padding: 0.2rem; border-radius: 0.9rem; background: color-mix(in srgb, var(--color-text) 6%, transparent); }
        .tm-popup .tm-choice button { flex: 1; text-align: center; padding: 0.25rem 0.2rem; border-radius: 0.7rem; font-weight: 600; color: var(--color-text-muted); white-space: nowrap; }
        .tm-popup .tm-choice button.on { background: var(--color-bg-light); color: var(--color-primary); box-shadow: 0 1px 3px var(--color-shadow); }
        .tm-field-label { display: inline-flex; align-items: center; gap: 0.25rem; text-transform: none; letter-spacing: 0; font-weight: 400; font-size: 0.9rem; color: var(--color-text-muted); white-space: nowrap; }
        .tm-field { width: 5rem; font: 0.9rem ui-monospace, Consolas, monospace; padding: 0.15rem 0.35rem; border-radius: 0.35rem; border: 1px solid var(--color-bg-dark); background: var(--color-bg); color: var(--color-text); }
        .tm-field:focus { outline: none; border-color: var(--color-primary); }
        /* How much of the window the data fills: a timeline ending at "now" (thinned part hatched, time spent paused in the pause color) */
        .tm-time { display: flex; justify-content: flex-end; height: 0.9rem; margin-top: 0.55rem; border-radius: 0.45rem; overflow: hidden; background: var(--color-bg-dark); }
        .tm-time i { display: block; flex: none; height: 100%; transition: width 0.4s linear; }
        .tm-time-kept { background: var(--color-primary); }
        .tm-time-thinned { background: repeating-linear-gradient(135deg, color-mix(in srgb, var(--tm-thinned) 75%, var(--color-bg-light)) 0 4px, color-mix(in srgb, var(--tm-thinned) 35%, var(--color-bg-light)) 4px 8px); }
        .tm-time-gap { background: var(--color-warning); }
        .tm-time-ticks { display: flex; justify-content: space-between; gap: 0.6rem; margin-top: 0.2rem; font-size: 0.9rem; color: var(--color-text-muted); white-space: nowrap; }
        .tm-time-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; color: var(--color-text); }
        .tm-time-note { color: var(--tm-thinned-text); font-weight: 600; }
        @media (prefers-reduced-motion: reduce) { .tm-time i { transition: none; } }
        .tm-stack { display: flex; height: 0.9rem; border-radius: 0.45rem; overflow: hidden; background: var(--color-bg-dark); }
        .tm-stack i { display: block; height: 100%; min-width: 1px; }
        .tm-policy-title { margin: 0.5rem 0 0.15rem; }
        .tm-popup .tm-radio { display: flex; gap: 0.55rem; align-items: flex-start; width: 100%; padding: 0.3rem 0.4rem; border-radius: 0.5rem; }
        .tm-popup .tm-radio:hover { background: color-mix(in srgb, var(--color-text) 6%, transparent); }
        .tm-popup .tm-radio.on { background: color-mix(in srgb, var(--color-primary) 10%, transparent); }
        .tm-knob { flex: none; width: 1rem; height: 1rem; margin-top: 0.15rem; box-sizing: border-box; border-radius: 50%; border: 2px solid var(--color-text-muted); }
        .tm-radio.on .tm-knob { border-color: var(--color-primary); background: radial-gradient(var(--color-primary) 45%, transparent 50%); }
        .tm-heavy { display: flex; align-items: center; gap: 0.45rem; padding: 0.15rem 0; min-width: 0; }
        .tm-chip-color { flex: none; width: 0.7rem; height: 0.7rem; border-radius: 0.2rem; }
        .tm-heavy-name { flex: 1 1 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .tm-heavy-name .tm-sub { display: inline; }
        .tm-heavy-thinned { flex: none; padding: 0.05rem 0.45rem; border-radius: 0.6rem; font-size: 0.8rem; font-weight: 700; letter-spacing: 0.02em; color: var(--tm-thinned-text); background: color-mix(in srgb, var(--tm-thinned) 22%, transparent); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tm-thinned) 60%, transparent); }
        .tm-heavy-size { flex: none; font: 0.9rem ui-monospace, Consolas, monospace; color: var(--color-text-muted); }
        .tm-popup .tm-x { flex: none; padding: 0.1rem 0.35rem; border-radius: 0.4rem; color: var(--color-text-muted); }
        .tm-popup .tm-x:hover { color: var(--color-danger); background: color-mix(in srgb, var(--color-danger) 12%, transparent); }
        .tm-clear { flex-wrap: wrap; row-gap: 0.35rem; }
        .tm-popup .tm-action { padding: 0.2rem 0.65rem; border-radius: 0.5rem; border: 1px solid var(--color-bg-dark); font-weight: 600; font-size: 0.92rem; white-space: nowrap; }
        .tm-popup .tm-action:hover { border-color: var(--color-primary); }
        .tm-popup .tm-action:disabled { opacity: 0.5; cursor: default; border-color: var(--color-bg-dark); }
        .tm-popup .tm-action.tm-danger { border-color: transparent; color: var(--color-danger); }
        .tm-notice { margin-bottom: 0.7rem; padding: 0.45rem 0.6rem; border-radius: 0.3rem; border-left: 3px solid var(--color-warning); background: color-mix(in srgb, var(--color-warning) 14%, var(--color-bg-light)); font-size: 0.95rem; }
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
                confirmForget: false, // "Forget everything" is being confirmed in the data menu
                usage: { bytes: 0, samples: 0, telemetries: [] }, // Memory taken by the data (TP.datastore.memory, refreshed by the timer)
                memoryEvent: { action: "", actedAt: 0, actedOn: [] }, // What the library last did about a full memory
                windowDraft: null, limitDraft: null, // What is being typed in the fields of the data menu (the menu redraws while data flows: it must not be overwritten)
                timeSpan: null, // How far back the data goes (TP.datastore.memory.span: the telemetry that covers the longest time)
                pausedAt: 0, pausedFor: 0, // When the pause started (ms), and for how long it has lasted (seconds, refreshed by the timer)
                windows: [[15, "15 s"], [60, "1 min"], [300, "5 min"], [3600, "1 h"], [0, "All"]], // Seconds of data kept
                policies: [
                    { value: "thin", label: "Thin out the oldest data", note: "Keep the lowest and highest samples of each moment: the shape of the history stays, with less detail." },
                    { value: "forget", label: "Forget the oldest data", note: "The window gets shorter for the telemetries that take the most room." },
                    { value: "pause", label: "Pause", note: "Stop taking new data and tell me." },
                ],
            }
        },
        computed: {
            paused() { return !!this.TP.state.isPaused; },
            // A chart is zoomed on a time range: the display no longer follows the latest data, the pause button becomes "back to live"
            zoomed() { return Object.values(this.TP.view.groups).some(g => g.cursorActive); },
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
            // Memory used by the data against its limit, ready to display: the ring of the button and the data menu
            memory() {
                const COLORS = ["#c0392b", "#16a085", "#d68910", "#2980b9", "#8e44ad"];
                const limit = this.TP.state.memoryLimit, usage = this.usage;
                const share = limit > 0 ? usage.bytes / limit : 0;
                const percent = Math.max(0, Math.min(100, share * 100));
                const size = (bytes) => bytes >= 1e9 ? (bytes / 1e9).toFixed(1) + " GB" : (bytes >= 1e6 ? Math.round(bytes / 1e6) + " MB" : (bytes >= 1000 ? Math.round(bytes / 1000) + " kB" : Math.round(bytes) + " B"));
                const count = (n) => n >= 1e6 ? (n / 1e6).toFixed(1) + " M" : (n >= 10000 ? Math.round(n / 1000) + " k" : String(n));
                // The heaviest telemetries: rows of the list and segments of the bar, in the same colors; the rest is one grey segment
                const top = usage.telemetries.filter(t => t.bytes > 0).slice(0, COLORS.length);
                const full = Math.max(limit > 0 ? limit : usage.bytes, usage.bytes, 1); // What the whole bar stands for
                const segments = top.map((t, i) => ({ key: t.id, color: COLORS[i], width: 100 * t.bytes / full, title: t.name + ": " + size(t.bytes) }));
                const others = usage.bytes - top.reduce((sum, t) => sum + t.bytes, 0);
                if (others > 0) segments.push({ key: "others", color: "#7f8c8d", width: 100 * others / full, title: (usage.telemetries.length - top.length) + " other telemetries: " + size(others) });
                const heaviest = top.slice(0, 4).map((t, i) => ({ id: t.id, name: t.name, color: COLORS[i], sizeText: size(t.bytes), detail: count(t.samples) + " samples", thinned: t.thinned }));
                // What the library did about a full memory, said for a moment (and for as long as it is paused for that reason)
                let notice = "";
                const event = this.memoryEvent, recent = Date.now() - event.actedAt < 15000;
                const names = event.actedOn.slice(0, 2).join(", ") + (event.actedOn.length > 2 ? " and " + (event.actedOn.length - 2) + " more" : "");
                if (event.action == "pause" && this.paused) notice = "Paused: the memory allowed for the data is full. Clear some data or shorten the window, then resume.";
                else if (event.action == "thin" && recent) notice = "Memory is full: the oldest data of " + names + " is being thinned out.";
                else if (event.action == "forget" && recent) notice = "Memory is full: the oldest data of " + names + " is being forgotten.";
                return {
                    percent, level: share >= 0.9 ? "bad" : (share >= 0.7 ? "warn" : "ok"), segments, heaviest, notice,
                    usedText: size(usage.bytes), samplesText: count(usage.samples) + " samples in " + usage.telemetries.length + (usage.telemetries.length == 1 ? " telemetry" : " telemetries"),
                    title: limit > 0 ? `Memory used by the data: ${size(usage.bytes)} of ${size(limit)} (${Math.round(share * 100)} %)` : `Memory used by the data: ${size(usage.bytes)} (no limit)`,
                };
            },
            // How much of the data window is filled, ready to display: a timeline whose right edge is now and whose width is the window
            span() {
                const window = this.TP.state.dataTimeout, span = this.timeSpan;
                const time = (seconds) => {
                    seconds = Math.round(seconds);
                    if (seconds < 60) return seconds + " s";
                    if (seconds < 3600) return Math.floor(seconds / 60) + " min" + (seconds % 60 ? " " + (seconds % 60) + " s" : "");
                    const minutes = Math.round(seconds / 60);
                    return Math.floor(minutes / 60) + " h" + (minutes % 60 ? " " + String(minutes % 60).padStart(2, "0") + " min" : "");
                };
                let kept = span ? span.duration : 0;
                if (window > 0 && kept > window && kept <= window * 1.02) kept = window; // (pruning lets a little more than the window build up)
                const gap = this.paused && span ? this.pausedFor : 0; // Time goes on while paused, data does not
                const full = window > 0 ? window : Math.max(kept + gap, 1e-9); // What the whole bar stands for (no window: the data itself)
                const share = (seconds) => Math.max(0, Math.min(100, 100 * seconds / full));
                const thinnedFor = span ? Math.max(0, kept - span.intact) : 0; // Before that, at least one telemetry was thinned out
                const names = span ? span.thinned.slice(0, 3).join(", ") + (span.thinned.length > 3 ? " and " + (span.thinned.length - 3) + " more" : "") : "";
                let text = span ? time(kept) + " kept" : "No data yet";
                if (span && !(window > 0)) text += ", no limit";
                if (gap >= 1) text += " · paused for " + time(gap);
                else if (span && window > 0 && kept < window * 0.9 && this.memoryEvent.action == "forget" && this.TP.state.memoryPolicy == "forget" && this.usage.bytes > this.TP.state.memoryLimit * 0.6) text += " · shortened by the memory limit";
                return {
                    isThinned: thinnedFor > 0, thinnedTitle: `Old data of ${names} was thinned out to fit in memory: real samples, fewer of them (see the data menu)`,
                    thinned: share(thinnedFor), plain: share(kept - thinnedFor), gap: share(gap), text,
                    thinnedText: thinnedFor > 0 ? (thinnedFor >= kept ? "all thinned" : "thinned before " + time(kept - thinnedFor + gap)) : "",
                    fromText: time(window > 0 ? window : kept + gap) + " ago",
                    title: span ? `"${span.name}" goes the furthest back: ${time(kept)}` + (window > 0 ? ` of the ${time(window)} kept` : "") + (thinnedFor > 0 ? `. Hatched: ${names} thinned out to save memory (real samples, fewer of them)` : "") : "How much of the data window is filled",
                };
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
            paused(paused) { this.pausedAt = paused ? Date.now() : 0; this.pausedFor = 0; },
            // When a reason to stay goes away, the island lingers for a moment
            pinned(value) { if (!value) this.wake(); },
            // A pending delete confirmation does not survive the list being closed
            "ctx.topPanel"() { this.confirmDelete = ""; this.confirmForget = false; },
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
            backToLive(event) { this.release(event); this.TP.view.backToLive(); this.TP.state.isPaused = false; },
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
                this.refreshMemory();
            },
            // The library measures its data once per second (TP.datastore.memory, not reactive): copy what is displayed
            refreshMemory() {
                const memory = this.TP.datastore.memory;
                if (this.pausedAt) this.pausedFor = (Date.now() - this.pausedAt) / 1000;
                if (memory.checkedAt === this._memoryCheckedAt && memory.actedAt === this.memoryEvent.actedAt) return;
                this._memoryCheckedAt = memory.checkedAt;
                const P = this.TP.protocol;
                this.usage = {
                    bytes: memory.usage.bytes, samples: memory.usage.samples,
                    telemetries: memory.usage.telemetries.map((t) => {
                        const telem = this.TP.datastore.telemetries[t.id];
                        return { id: t.id, name: t.name, bytes: t.bytes, samples: t.samples, thinned: !!telem && Object.values(telem.data).some(e => e.thinnedBefore > 0) };
                    }),
                };
                this.timeSpan = memory.span ? Object.assign({}, memory.span, { thinned: memory.span.thinned.slice() }) : null;
                this.memoryEvent = { action: memory.action, actedAt: memory.actedAt, actedOn: memory.actedOn.slice() };
            },
            // Data menu: how long data is kept (seconds, 0: everything) and how much it may take (MB, 0: no limit)
            setWindow(seconds) {
                seconds = Number(seconds);
                if (seconds >= 0) this.TP.state.dataTimeout = seconds;
            },
            setLimit(megabytes) {
                megabytes = Number(megabytes);
                if (megabytes >= 0) { this.TP.state.memoryLimit = megabytes * 1e6; this.measureNow(); }
            },
            measureNow() { this.TP.datastore.checkMemory(true); this.refreshMemory(); },
            // Clearing. Telemetries, dashboards and views stay (but for "Forget everything", which also forgets the telemetries).
            clearAll() { this.TP.datastore.clearData(); this.measureNow(); },
            clearTelemetry(id) {
                const telem = this.TP.datastore.telemetries[id];
                if (telem) telem.clearData();
                this.measureNow();
            },
            // Only the telemetries that the displayed dashboard does not show
            clearOffScreen() {
                if (!this.ctx.activeDashboard) return;
                const shown = new Set();
                const visit = (view) => {
                    if (!view) return;
                    if (Array.isArray(view.views)) { view.views.forEach(visit); return; }
                    for (const entry of (view.telemetryIdOrNameList || [])) {
                        const telem = this.TP.datastore.getTelemetry(entry);
                        if (telem) shown.add(telem.id);
                    }
                };
                visit(this.ctx.activeDashboard.getView());
                this.TP.datastore.clearData((telem) => shown.has(telem.id));
                this.measureNow();
            },
            askForget() {
                this.confirmForget = true;
                this.$nextTick(() => { if (this.$refs.forgetCancel) this.$refs.forgetCancel.focus(); }); // A stray Enter or Space is harmless
            },
            forgetEverything() {
                this.confirmForget = false;
                this.TP.datastore.forgetTelemetries();
                this.measureNow();
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
