/*
 * Top menu: a floating island at the top of the workspace.
 * [logo] [dashboard switcher] [record switch | data rate] [panels: Telemetries, Sources, Export] [CMD] [Edit] [Help]
 * and along its bottom edge the time line: the time shown by a time group of the dashboard over the stored data (doc/time.md)
 * - CMD (commands, doc/telecmd.md): only when a device declared something the page can write or call. Off at every start: nothing is
 *   sent and the views draw no control. Its tooltip counts what can be commanded, per device.
 * - The panels are one segmented control, icon only, with a hint of their content next to the icon. Telemetries and Sources share the left
 *   dock (ctx.sidePanel, one at a time); Help has its own dock on the right (ctx.helpOpen), so it can stay open next to one of them; Export and import opens on the right too (ctx.exportOpen), in place of Help.
 * - Reception: the dot of the rate chip is the library's TP.state.receiving (TP.setReceiving). Off, what the sources send is lost: the
 *   chip turns amber and a tab under the island says so.
 * - Time line (doc/time.md "The top menu"): a line on the bottom edge of the island, the stored data from the oldest sample (left) to the
 *   newest (right), in the color of the mode of the chosen time group (live, held, replay). The pointer on the island (or the keyboard
 *   focus in it) opens a row above it: play/pause, the time shown, LIVE, and "⋯" (speed, step, time group). Click or drag the line: held
 *   there. While it is open, the arrows and the wheel move the time shown. The chosen group (ctx.timeGroup, "" = the dashboard's) changes
 *   from "⋯" or when a view of another group is clicked.
 * - Shortcuts (not while typing; keys every keyboard layout types without Shift or AltGr): Space hold/resume the chosen time group,
 *   arrows previous/next sample (Shift: 1 % of the line), "-" "+" (or "=") slower/faster, R
 *   reception, T / S / H panels, E edit, C commands. Esc is handled in main.js. None while a joystick view drives with the keyboard
 *   (TP.commands.keyboardCaptured).
 * - The island floats over the dashboard and fades out when the mouse rests (IDLE_MS), to leave the whole stage to the data. It stays while a popup
 *   is open, while the band above the dashboard is scrolled into view (ctx.bandVisible), while editing, while there is no dashboard, and while the pointer
 *   or the keyboard focus is on it. Nothing stays while it is away: its time line hides with it.
 * - Look: an outlined, solid island while it is clear of the data (band scrolled into view, or no dashboard). Over the dashboard ("over") it turns
 *   to glass (translucent, blurs what is behind) and casts a shadow. Popups stay solid.
 * - ctx.topPanel is the open popup: "dashboard" (dashboard list), "rate" (the data menu) or "time" (the "⋯" of the time line).
 * - Next to the rate, a ring shows how much of the memory allowed for the data is used (green, amber from 70 %, red from 90 %); a mark
 *   turns around it while data is flowing. The data menu (see doc/top-menu.md) sets how long data is kept, shows what takes the
 *   memory and what is done when it is full (the library does it: TP.state.memoryLimit / memoryPolicy), and clears data.
 * - Deleting a dashboard is confirmed in place: its row of the list turns into "Delete "name"? [Cancel] [Delete]" (confirmDelete). The auto dashboard
 *   cannot be deleted.
 */
const IDLE_MS = 3000; // Without mouse or keyboard activity for this long, the island fades out
const ACTIVITY_EVENTS = ["pointermove", "pointerdown", "keydown", "touchstart"];
// The choices of the data menu (data window, memory limit, policy) are kept by the browser: a reload does not reset them
const DATA_SETTINGS_KEY = "teleplot.dataSettings";
const DATA_POLICIES = ["thin", "forget", "stop"];

// Dashboards as text files: one "DASH|..." line per view (the library writes and reads them, see doc/dashboard-text.md)
function dashboardFileName(name) {
    return (String(name).replace(/[\\/:*?"<>|\x00-\x1f]+/g, "_").trim() || "dashboard") + ".teleplot.txt"; // The extension of text files: lines of the text protocol, here DASH lines only
}
function exportDashboardFile(TP, dashboard) {
    const url = URL.createObjectURL(new Blob([TP.dashboards.exportText(dashboard.name) + "\n"], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = dashboardFileName(dashboard.name);
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function initComponent_top_menu(vue) {
    let name = "top-menu";

    const vueHTML = `
        <div class="tm" :class="{away: away, over: over}" role="toolbar" aria-label="Teleplot">
            <div class="tm-island" ref="island" :class="{'tl-open': timelineOpen}" @pointerenter="hovered = true" @pointerleave="hovered = false" @focusin="focused = true" @focusout="focused = false">
              <div class="tm-bar">
                <img src="media/logo-color.svg" class="tm-logo" alt="Teleplot"/>

                <div class="tm-anchor tm-anchor-dashboard">
                    <button class="tm-btn" :class="{on: ctx.topPanel=='dashboard'}" aria-haspopup="menu" :aria-expanded="ctx.topPanel=='dashboard'" @click="setTopPanel('dashboard', $event);">
                        <span v-if="editor.state.enabled" class="tm-crumb">Editing</span>
                        <span class="tm-dashboard-label">
                            <span class="tm-dashboard-name">{{ctx.activeDashboard ? ctx.activeDashboard.name : 'Dashboard'}}</span>
                            <span v-if="dashboardList().length > 1" class="tm-dashboard-count">{{dashboardList().length}} dashboards</span>
                        </span>
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
                                    <button class="tm-row-edit" title="Export dashboard (a text file, one line per view)" aria-label="Export dashboard" @click="exportDashboard(dashboard);">
                                        <i class="icofont-download"></i>
                                    </button>
                                    <button v-if="!dashboard.isAuto" class="tm-row-edit tm-row-delete" title="Delete dashboard" aria-label="Delete dashboard" @click="askDelete(dashboard, $event);">
                                        <i class="icofont-trash"></i>
                                    </button>
                                </div>
                                <div v-if="dashboard.isAuto" class="tm-sep-h"></div>
                            </template>
                            <div v-if="!dashboardList().length" class="tm-empty">No dashboard yet. Send some data, or create one.</div>
                            <div class="tm-sep-h"></div>
                            <div class="tm-new-row">
                                <button class="tm-new" role="menuitem" @click="newDashboard();">
                                    <i class="icofont-plus"></i> New dashboard
                                </button>
                                <button class="tm-new tm-import" role="menuitem" title="Opens a file in the Import panel: it says what the file holds (dashboards, data) and lets you choose what to take" @click="$refs.importFile.click();">
                                    <i class="icofont-upload"></i> Import…
                                </button>
                                <input ref="importFile" type="file" multiple hidden @change="importDashboards($event);">
                            </div>
                        </div>
                    </template>
                </div>

                <span class="tm-sep"></span>

                <div class="tm-anchor">
                    <div class="tm-split" :class="{paused: paused}">
                        <button class="tm-btn tm-rec tm-tipped" role="switch" :aria-checked="!paused" :aria-label="paused ? 'Receive again' : 'Stop receiving'" @click="toggleReceiving($event);">
                            <i class="tm-rec-dot"></i>
                            <span class="tm-tip" role="tooltip"><span class="tm-tip-head"><b>{{paused ? 'Receive again' : 'Stop receiving'}}</b><kbd>R</kbd></span><span class="tm-tip-line">{{paused ? 'What the devices send now is lost' : 'What the devices send is stored'}}</span></span>
                        </button>
                        <button class="tm-rate" :class="{on: ctx.topPanel=='rate'}" aria-haspopup="dialog" :aria-expanded="ctx.topPanel=='rate'" aria-label="Data flow" @click="setTopPanel('rate', $event);">
                            <span class="tm-gauge" :class="['tm-gauge-' + memory.level, {flowing: flowing && !paused}]" :style="{'--p': memory.percent}" :title="memory.title"><i></i></span>
                            <span class="tm-rate-text"><span>{{paused ? (receivingOffBy == 'memory' ? 'memory full' : 'not receiving') : rateText}}</span><span v-if="span.isThinned" class="tm-rate-thinned" :title="span.thinnedTitle">thinned</span></span>
                            <i class="icofont-simple-down tm-caret"></i>
                        </button>
                    </div>
                    <template v-if="ctx.topPanel=='rate'">
                        <div class="tm-popup tm-flow" role="dialog" aria-label="Data: window, memory, clearing">
                            <div v-if="memory.notice" class="tm-notice">{{memory.notice}}</div>

                            <button class="tm-receive" role="switch" :aria-checked="!paused" @click="toggleReceiving()">
                                <span><b>Receiving</b><span class="tm-sub">{{receivingText}}</span></span>
                                <span class="tm-switch" :class="{on: !paused}"></span>
                            </button>

                            <h5>Data window</h5>
                            <div class="tm-line">
                                <div class="tm-choice tm-grow" role="group" aria-label="How long data is kept">
                                    <button v-for="w in windows" :key="w[0]" :class="{on: TP.state.dataTimeout == w[0]}" :aria-pressed="TP.state.dataTimeout == w[0]" @click="setWindow(w[0])">{{w[1]}}</button>
                                </div>
                                <label class="tm-field-label" title="Seconds of data kept per telemetry (0: everything)"><input class="tm-field" type="number" min="0" step="10" v-value="TP.state.dataTimeout" @change="setWindow($event.target.value)"> s</label>
                            </div>
                            <div class="tm-time" :title="span.title">
                                <i v-if="span.thinned" class="tm-time-thinned" :style="{width: span.thinned + '%'}"></i>
                                <i v-if="span.plain" class="tm-time-kept" :style="{width: span.plain + '%'}"></i>
                                <i v-if="span.gap" class="tm-time-gap" :style="{width: span.gap + '%'}"></i>
                            </div>
                            <div class="tm-time-ticks"><span>{{span.fromText}}</span><span class="tm-time-text">{{span.text}}<span v-if="span.thinnedText" class="tm-time-note"> · {{span.thinnedText}}</span></span><span>now</span></div>

                            <h5>Memory <span class="tm-h5-value">{{memory.usedText}} of</span>
                                <label class="tm-field-label" title="How much the stored data may take, in MB (0: no limit)"><input class="tm-field" type="number" min="0" step="50" v-value="Math.round(TP.state.memoryLimit / 1e6)" @change="setLimit($event.target.value)"> MB</label>
                            </h5>
                            <div class="tm-stack" :title="memory.title">
                                <i v-for="seg in memory.segments" :key="seg.key" :style="{width: seg.width + '%', background: seg.color}" :title="seg.title"></i>
                            </div>
                            <div class="tm-sub">{{memory.samplesText}}</div>
                            <div class="tm-sub tm-policy-title">When the limit is reached</div>
                            <button v-for="p in policies" :key="p.value" class="tm-radio" :class="{on: TP.state.memoryPolicy == p.value}" role="radio" :aria-checked="TP.state.memoryPolicy == p.value" @click="setPolicy(p.value)">
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
                            <div v-if="confirmForget" class="tm-line tm-row-confirm" role="alertdialog" :aria-label="clearQuestion.text" @keydown.esc.stop="confirmForget = ''">
                                <span class="tm-row-question">{{clearQuestion.text}}</span>
                                <button class="tm-row-cancel" ref="forgetCancel" @click="confirmForget = ''">Cancel</button>
                                <button class="tm-row-confirm-delete" @click="confirmClear()">{{clearQuestion.action}}</button>
                            </div>
                            <div v-else class="tm-line tm-clear">
                                <button class="tm-action" title="Empties every telemetry. Telemetries, dashboards and views stay." @click="clearAll()">Clear all data</button>
                                <button class="tm-action" :disabled="!ctx.activeDashboard" title="Empties the telemetries that the displayed dashboard does not show" @click="clearOffScreen()">Clear what is off screen</button>
                                <span class="tm-grow"></span>
                                <button class="tm-action tm-danger" title="Data and telemetries: a fresh start. Dashboards are kept." @click="askForget('forget')">Forget everything</button>
                                <span class="tm-clear-break"></span>
                                <span class="tm-sub tm-clear-label">Dashboards</span>
                                <button class="tm-action" :disabled="!ctx.activeDashboard || !activeViewCount" :title="ctx.activeDashboard && ctx.activeDashboard.isAuto ? 'Removes every view of the displayed dashboard. Telemetries that show up afterwards are displayed again; data is kept.' : 'Removes every view of the displayed dashboard: an empty dashboard to arrange again. Data is kept.'" @click="askForget('layout')">Empty this dashboard</button>
                                <span class="tm-grow"></span>
                                <button class="tm-action tm-danger" :disabled="!dashboardList().length" title="Deletes every dashboard (the Live dashboard is emptied: it goes on displaying what arrives). Data is kept." @click="askForget('dashboards')">Delete all dashboards</button>
                            </div>
                        </div>
                    </template>
                </div>

                <span class="tm-sep"></span>

                <div class="tm-seg" role="group" aria-label="Panels">
                    <button v-for="p in leftPanels" :key="p.name" class="tm-btn tm-tipped" :class="{on: isPanelOpen(p)}" :disabled="p.soon" :aria-pressed="isPanelOpen(p)" :aria-label="p.label + (countOf(p) === null ? '' : ', ' + countOf(p))" @click="toggleSidePanel(p.name, $event);">
                        <i :class="p.icon"></i>
                        <span v-if="countOf(p) !== null" class="tm-count">{{countOf(p)}}</span>
                        <i v-if="p.name=='sources' && sourcesStatus" class="tm-status" :class="sourcesStatus"></i>
                        <span class="tm-tip" role="tooltip">
                            <span class="tm-tip-head"><b>{{p.label}}</b><kbd v-if="!p.soon">{{p.key}}</kbd></span>
                            <span v-for="line in tipLines(p)" :key="line.text" class="tm-tip-line"><i v-if="line.status" class="tm-status" :class="line.status"></i>{{line.text}}</span>
                        </span>
                    </button>
                </div>

                <template v-if="commandCount || commandsOn">
                    <span class="tm-sep"></span>
                    <button class="tm-btn tm-cmd tm-tipped" :class="{on: commandsOn, attention: cmdAttention}" :aria-pressed="commandsOn" :aria-label="'Commands ' + (commandsOn ? 'on' : 'off')" @click="toggleCommands($event);">
                        <b>CMD</b><small>{{commandsOn ? 'ON' : 'OFF'}}</small>
                        <span class="tm-tip" role="tooltip">
                            <span class="tm-tip-head"><b>Commands</b><kbd>C</kbd></span>
                            <span class="tm-tip-line">{{commandsOn ? 'On: the views can change settings and call actions.' : 'Off: nothing is sent, the views show no controls.'}}</span>
                            <span v-for="device in commands.devices" :key="device.name" class="tm-tip-line"><b>{{device.name}}</b>: {{plural(device.settings, 'setting')}}, {{plural(device.actions, 'action')}}</span>
                        </span>
                    </button>
                </template>

                <span class="tm-sep"></span>

                <button class="tm-btn tm-edit tm-tipped" :class="{done: editor.state.enabled}" :disabled="!ctx.activeDashboard" :aria-pressed="editor.state.enabled" @click="toggleEdit($event);">
                    <i :class="editor.state.enabled ? 'icofont-check' : 'icofont-duotone icofont-pencil'"></i>
                    <span>{{editor.state.enabled ? 'Done' : 'Edit'}}</span>
                    <span class="tm-tip" role="tooltip"><span class="tm-tip-head"><b>{{editor.state.enabled ? 'Leave edit mode' : 'Edit the dashboard'}}</b><kbd>{{editor.state.enabled ? 'Esc' : 'E'}}</kbd></span></span>
                </button>
                <!-- Help: a button of its own at the right end, the side where its panel opens (the panels of the group open on the left) -->
                <button class="tm-btn tm-help tm-tipped" :class="{on: ctx.helpOpen}" :aria-pressed="!!ctx.helpOpen" @click="toggleSidePanel('help', $event);">
                    <span>Help</span>
                    <span class="tm-tip" role="tooltip"><span class="tm-tip-head"><b>Help</b><kbd>H</kbd></span><span class="tm-tip-line">How to send data, shortcuts, sample data</span></span>
                </button>
              </div>

              <!-- The time line: always the bottom edge of the island; the row above it opens with the pointer or the keyboard focus -->
              <div class="tm-strip" :class="{open: timelineOpen, empty: !timeline.hasData}">
                <div class="tm-tl-row" :aria-hidden="!timelineOpen">
                    <button class="tm-tl-btn tm-tipped" :disabled="!timeline.hasData" :aria-label="timeline.mode == 'held' ? 'Resume' : 'Hold'" @click="togglePlay($event);">
                        <svg v-if="timeline.mode == 'held'" class="tm-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5l12 7.5-12 7.5z" fill="currentColor"/></svg>
                        <svg v-else class="tm-svg" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor"/><rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor"/></svg>
                        <span class="tm-tip" role="tooltip"><span class="tm-tip-head"><b>{{timeline.mode == 'held' ? (timeline.resumeLive ? 'Back to live' : 'Replay from here') : 'Hold the display'}}</b><kbd>Space</kbd></span><span class="tm-tip-line">Data keeps being received</span></span>
                    </button>
                    <span class="tm-tl-when">{{timeline.whenText}}<small v-if="timeline.behindText"> {{timeline.behindText}}</small></span>
                    <span v-if="timeline.groupLabel" class="tm-tl-group" :title="'Time group ' + timeline.groupLabel"><i :style="{background: timeline.groupColor}"></i>{{timeline.groupLabel}}</span>
                    <span class="tm-grow"></span>
                    <button class="tm-tl-live tm-tipped" :class="{is: timeline.mode == 'live'}" :disabled="!timeline.hasData" @click="goLive($event);">
                        <i></i>LIVE
                        <span class="tm-tip" role="tooltip"><span class="tm-tip-head"><b>{{timeline.mode == 'live' ? 'Live' : 'Go live'}}</b><kbd>Esc</kbd></span></span>
                    </button>
                    <div class="tm-anchor">
                        <button class="tm-tl-more tm-tipped" :class="{on: ctx.topPanel == 'time'}" aria-haspopup="dialog" :aria-expanded="ctx.topPanel == 'time'" aria-label="Speed, step, time group" @click="setTopPanel('time', $event);">⋯
                            <span class="tm-tip" role="tooltip"><span class="tm-tip-head"><b>Speed, step, time group</b></span></span>
                        </button>
                        <template v-if="ctx.topPanel == 'time'">
                            <div class="tm-popup tm-tl-pop" role="dialog" aria-label="Replay">
                                <h5>Speed <span class="tm-h5-value tm-sub"><kbd>-</kbd> <kbd>+</kbd></span></h5>
                                <div class="tm-choice" role="group" aria-label="Replay speed">
                                    <button v-for="s in speeds" :key="s" :class="{on: timeline.mode == 'replay' && timeline.speed == s}" :aria-pressed="timeline.mode == 'replay' && timeline.speed == s" @click="setSpeed(s)">{{s}}×</button>
                                </div>
                                <h5>Step <span class="tm-h5-value tm-sub"><kbd>←</kbd> <kbd>→</kbd></span></h5>
                                <div class="tm-line">
                                    <button class="tm-action tm-grow" :disabled="!timeline.hasData" @click="step(-1)">‹ Previous sample</button>
                                    <button class="tm-action tm-grow" :disabled="!timeline.hasData" @click="step(1)">Next sample ›</button>
                                </div>
                                <button v-if="!showGroups" class="tm-tl-disclose" @click="showGroups = true"><span>Time group: <b>{{timeline.groupName}}</b></span><i class="icofont-simple-right"></i></button>
                                <template v-else>
                                    <h5>Time group</h5>
                                    <button v-for="g in timeGroups" :key="g.key" class="tm-tl-gitem" :class="{on: g.key == chosenGroup}" @click="chooseGroup(g.key)" @pointerenter="TP.view.showTimeGroups = true" @pointerleave="TP.view.showTimeGroups = !!editor.state.enabled">
                                        <i :style="{background: g.color}"></i><span>{{g.name}} <span class="tm-sub">{{g.kind}}</span></span><span class="tm-tl-gstate">{{g.state}}</span>
                                    </button>
                                    <button class="tm-tl-gitem tm-tl-all" @click="allLive()"><span>All groups live</span><kbd>⇧ Esc</kbd></button>
                                </template>
                            </div>
                        </template>
                    </div>
                </div>
                <div class="tm-tl-line" ref="line" @pointerdown="lineDown($event)" @pointermove="lineMove($event)" @pointerup="lineUp($event)" @pointercancel="lineUp($event)" @pointerleave="hoverX = -1">
                    <canvas ref="lineCanvas" aria-hidden="true"></canvas>
                    <span v-if="timelineOpen && timeline.knob >= 0" class="tm-tl-knob" :class="timeline.mode" :style="{left: timeline.knob + 'px'}"></span>
                    <template v-if="timelineOpen && hoverX >= 0">
                        <span class="tm-tl-ghost" :style="{left: hoverX + 'px'}"></span>
                        <span class="tm-tl-tip" :class="{left: hoverX < 70}" :style="{left: hoverX + 'px'}">{{hoverText}}</span>
                    </template>
                </div>
              </div>
              <div v-if="paused" class="tm-tab" role="status">
                <template v-if="receivingOffBy == 'memory'"><b>Memory full</b> · not receiving <button @click="setTopPanel('rate', $event)">Data menu</button></template>
                <template v-else><b>Not receiving</b> since {{receivingSince}} · data sent now is lost <button @click="toggleReceiving($event)">Receive</button></template>
              </div>
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
            position: relative;
            pointer-events: auto;
            display: flex;
            flex-direction: column;
            align-self: flex-start; /* (its height is its content: the row of the time line opens under the bar) */
            margin-top: 0.6rem;
            box-sizing: border-box;
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
        .tm-bar { display: flex; align-items: center; gap: 0.3rem; height: 3.8rem; box-sizing: border-box; padding: 0.4rem; min-width: 0; }
        .tm button { font: inherit; color: inherit; border: none; background: transparent; }
        .tm kbd {
            font: 0.85rem ui-monospace, Consolas, monospace;
            padding: 0 0.35rem;
            line-height: 1.3rem;
            border: 1px solid var(--color-bg-dark);
            border-radius: 0.35rem;
            color: var(--color-text-muted);
        }
        .tm-logo { height: 2.7rem; width: auto; margin: 0 0.5rem 0 0.5rem; flex: none; } /* (the name is part of the drawing: under 2.5rem it cannot be read) */
        .tm-anchor { position: relative; display: flex; }
        .tm-anchor-dashboard { min-width: 0; }
        .tm-anchor-dashboard .tm-btn { min-width: 0; }
        .tm-dashboard-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
        /* Closed, the button also says that there are other dashboards: how many, under the name */
        .tm-dashboard-label { display: flex; flex-direction: column; justify-content: center; gap: 0.1rem; min-width: 0; line-height: 1.15; text-align: left; }
        .tm-dashboard-count { font-size: 0.75rem; font-weight: 600; line-height: 1; color: var(--color-text-muted); white-space: nowrap; }
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

        /* Record switch + data rate */
        .tm-split { display: flex; align-items: center; height: 3rem; border-radius: 0.85rem; background: color-mix(in srgb, var(--color-text) 6%, transparent); }
        .tm-split .tm-btn { border-radius: 0.85rem; }
        .tm-rec { width: 2.6rem; padding: 0; }
        .tm-rec-dot { width: 0.8rem; height: 0.8rem; border-radius: 50%; background: var(--color-success); box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-success) 22%, transparent); }
        .tm-split.paused .tm-rec-dot { background: transparent; box-shadow: inset 0 0 0 2.5px #2b2100; }
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
        .tm-cmd { flex-direction: column; justify-content: center; gap: 0; line-height: 1.05; min-width: 3.4rem; }
        .tm-cmd b { font-size: 0.92rem; letter-spacing: 0.06em; }
        .tm-cmd small { font-size: 0.66rem; font-weight: 700; letter-spacing: 0.08em; color: var(--color-text-muted); opacity: 0.75; }
        .tm-cmd.on { background: color-mix(in srgb, var(--color-success) 18%, transparent); box-shadow: inset 0 0 0 1.5px var(--color-success); }
        .tm-cmd.on b, .tm-cmd.on small { color: var(--color-success); opacity: 1; }
        /* A command was touched while commands are off: the button shows where to switch them on */
        .tm-cmd.attention { animation: tm-cmd-attention 0.5s ease-in-out 3; }
        @keyframes tm-cmd-attention { 50% { box-shadow: inset 0 0 0 2px var(--color-warning), 0 0 0 4px color-mix(in srgb, var(--color-warning) 35%, transparent); } }
        @media (prefers-reduced-motion: reduce) { .tm-cmd.attention { animation: none; box-shadow: inset 0 0 0 2px var(--color-warning); } }
        .tm-edit { background: var(--color-text); color: var(--color-bg-light); font-weight: 600; }
        .tm-edit:hover { background: color-mix(in srgb, var(--color-text) 82%, var(--color-bg-light)); }
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
        .tm-clear-break { flex-basis: 100%; height: 0; }
        .tm-clear-label { align-self: center; margin-right: 0.2rem; }
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
        .tm-new-row { display: flex; gap: 0.2rem; }
        .tm-new-row .tm-new { flex: 1; width: auto; text-align: left; }
        .tm-new-row .tm-import { width: auto; flex: none; color: var(--color-text-muted) !important; }
        .tm-new-row .tm-import:hover { color: var(--color-primary) !important; }
        .tm-popup button:focus-visible { outline: none; box-shadow: inset 0 0 0 2px var(--color-primary); }

        /* Reception in the data menu */
        .tm-popup .tm-receive { display: flex; align-items: center; justify-content: space-between; gap: 0.8rem; width: 100%; margin-bottom: 0.2rem; padding: 0.4rem 0.5rem; border-radius: 0.6rem; }
        .tm-popup .tm-receive:hover { background: color-mix(in srgb, var(--color-text) 6%, transparent); }
        .tm-switch { position: relative; flex: none; width: 2.3rem; height: 1.3rem; border-radius: 0.65rem; background: var(--color-bg-dark); transition: background var(--motion-fast); }
        .tm-switch::after { content: ""; position: absolute; top: 0.15rem; left: 0.15rem; width: 1rem; height: 1rem; border-radius: 50%; background: var(--color-bg-light); box-shadow: 0 1px 2px var(--color-shadow); transition: left var(--motion-fast) var(--ease-out); }
        .tm-switch.on { background: var(--color-success); }
        .tm-switch.on::after { left: 1.15rem; }

        /* Not receiving: said under the island (it hides with it) */
        .tm-tab { position: absolute; top: calc(100% - 1px); left: 50%; translate: -50% 0; z-index: -1; display: flex; align-items: center; gap: 0.45rem; padding: 0.45rem 0.9rem 0.4rem; border-radius: 0 0 0.8rem 0.8rem; white-space: nowrap; font-size: 0.92rem; background: color-mix(in srgb, var(--color-warning) 22%, var(--color-bg-light)); box-shadow: 0 6px 16px var(--color-shadow); }
        .tm-tab b { color: var(--tm-thinned-text); }
        .tm-tab button { padding: 0 0.2rem; font-weight: 600; color: var(--color-primary); cursor: pointer; }

        /* The time line: the bottom edge of the island. At rest only its line (3 px); the row above it opens with the pointer */
        :root { --tm-replay: hsl(268, 52%, 52%); --tm-held: var(--color-primary); }
        :root[data-theme="dark"] { --tm-replay: hsl(268, 70%, 72%); }
        .tm-strip { position: relative; padding: 0 1rem; }
        .tm-tl-row { display: flex; align-items: center; gap: 0.45rem; height: 0; overflow: hidden; visibility: hidden; font-size: 0.95rem; transition: height var(--motion-fast) var(--ease-out), visibility 0s var(--motion-fast); }
        .tm-strip.open .tm-tl-row { height: 2.3rem; overflow: visible; visibility: visible; transition: height var(--motion-fast) var(--ease-out); }
        .tm-tl-btn { display: inline-flex; align-items: center; justify-content: center; position: relative; width: 2rem; height: 1.9rem; border-radius: 0.6rem; cursor: pointer; }
        .tm-tl-btn:hover, .tm-tl-more:hover, .tm-tl-live:hover { background: color-mix(in srgb, var(--color-text) 8%, transparent); }
        .tm-tl-btn:disabled, .tm-tl-live:disabled { opacity: 0.4; cursor: default; background: transparent; }
        .tm-tl-btn .tm-svg { width: 1rem; height: 1rem; }
        .tm-tl-when { font: 0.95rem ui-monospace, Consolas, monospace; font-variant-numeric: tabular-nums; white-space: nowrap; }
        .tm-tl-when small { margin-left: 0.5em; color: var(--color-text-muted); font-size: 0.9em; }
        .tm-tl-group { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.05rem 0.45rem; border-radius: 0.4rem; font-size: 0.85rem; color: var(--color-text-muted); background: color-mix(in srgb, var(--color-text) 6%, transparent); }
        .tm-tl-group i, .tm-tl-gitem i { width: 0.6rem; height: 0.6rem; border-radius: 0.15rem; flex: none; }
        .tm-tl-live { position: relative; display: inline-flex; align-items: center; gap: 0.35rem; height: 1.7rem; padding: 0 0.45rem; border-radius: 0.45rem; font-size: 0.78rem; font-weight: 700; letter-spacing: 0.06em; color: var(--color-text-muted); cursor: pointer; }
        .tm-tl-live i { width: 0.5rem; height: 0.5rem; border-radius: 50%; background: currentColor; }
        .tm-tl-live.is { color: var(--color-danger); }
        .tm-tl-more { position: relative; height: 1.7rem; padding: 0 0.45rem; border-radius: 0.45rem; font-weight: 700; letter-spacing: 0.08em; color: var(--color-text-muted); cursor: pointer; }
        .tm-tl-more.on { background: color-mix(in srgb, var(--color-text) 10%, transparent); color: var(--color-text); }
        .tm-tl-btn:focus-visible, .tm-tl-live:focus-visible, .tm-tl-more:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--color-primary); }
        .tm-tl-line { position: relative; height: 3px; margin: 0 -0.2rem; padding: 4px 0 0; margin-top: -4px; cursor: pointer; touch-action: none; transition: height var(--motion-fast) var(--ease-out); } /* (4 px more above it to aim at) */
        .tm-strip.open .tm-tl-line { height: 6px; padding-top: 4px; margin-bottom: 0.25rem; }
        .tm-strip.empty .tm-tl-line { cursor: default; }
        .tm-tl-line canvas { position: absolute; left: 0; bottom: 0; display: block; width: 100%; height: 3px; border-radius: 3px; } /* (out of the flow: its pixels must not widen the island) */
        .tm-strip.open .tm-tl-line canvas { height: 6px; }
        .tm-tl-knob { position: absolute; bottom: 3px; width: 0.8rem; height: 0.8rem; margin: 0 0 -0.4rem -0.4rem; box-sizing: border-box; border-radius: 50%; border: 2.5px solid var(--tm-held); background: var(--color-bg-light); pointer-events: none; }
        .tm-tl-knob.replay { border-color: var(--tm-replay); }
        .tm-tl-ghost { position: absolute; top: 0; bottom: -2px; width: 1.5px; margin-left: -0.75px; background: var(--color-text); opacity: 0.5; pointer-events: none; }
        .tm-tl-tip { position: absolute; bottom: 0.9rem; translate: -50% 0; z-index: 31; padding: 0.2rem 0.45rem; border-radius: 0.4rem; background: var(--color-text); color: var(--color-bg-light); font: 0.85rem ui-monospace, Consolas, monospace; white-space: nowrap; pointer-events: none; }
        .tm-tl-tip.left { translate: 0 0; }
        .tm-tl-pop { left: auto; right: 0; width: 26rem; padding: 0.8rem 0.9rem 0.8rem; font-size: 1rem; }
        .tm-tl-more.on .tm-tip { display: none; } /* (its popup is open) */
        .tm-tl-pop h5 { display: flex; align-items: center; gap: 0.4rem; margin: 0.8rem 0 0.35rem; font-size: 0.85rem; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: var(--color-text-muted); }
        .tm-tl-pop h5:first-child { margin-top: 0; }
        .tm-tl-pop .tm-h5-value { text-transform: none; letter-spacing: 0; }
        .tm-tl-pop .tm-action { text-align: center !important; }
        .tm-popup .tm-tl-disclose { display: flex; justify-content: space-between; align-items: center; width: 100%; margin-top: 0.7rem; padding: 0.4rem 0.4rem; border-radius: 0.5rem; color: var(--color-text-muted); }
        .tm-popup .tm-tl-disclose b { color: var(--color-text); font-weight: 600; }
        .tm-popup .tm-tl-disclose:hover, .tm-popup .tm-tl-gitem:hover { background: color-mix(in srgb, var(--color-text) 6%, transparent); }
        .tm-popup .tm-tl-gitem { display: flex; align-items: center; gap: 0.5rem; width: 100%; padding: 0.35rem 0.45rem; border-radius: 0.5rem; }
        .tm-popup .tm-tl-gitem.on { background: color-mix(in srgb, var(--color-primary) 12%, transparent); }
        .tm-tl-gitem > span:nth-child(2) { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .tm-tl-gitem .tm-sub { display: inline; }
        .tm-tl-gstate { font: 0.85rem ui-monospace, Consolas, monospace; color: var(--color-text-muted); white-space: nowrap; }
        .tm-popup .tm-tl-all { justify-content: space-between; margin-top: 0.25rem; border-top: 1px solid var(--color-bg-dark); border-radius: 0 0 0.5rem 0.5rem; color: var(--color-text-muted); }

        /* Tighter islands: logo and shortcut hints first, then the "Editing" prefix */
        @container (max-width: 860px) {
            .tm-logo { display: none; }
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

    // A moment on the time line: hh:mm:ss.d (local time)
    function formatMoment(t) {
        const date = new Date(t * 1000);
        return [date.getHours(), date.getMinutes(), date.getSeconds()].map((n) => String(n).padStart(2, "0")).join(":") + "." + Math.floor(date.getMilliseconds() / 100);
    }
    // How far behind: "18 s", "3 min 12 s", "2 h 05 min"
    function formatBehind(seconds) {
        if (seconds < 10) return (Math.round(seconds * 10) / 10) + " s";
        seconds = Math.round(seconds);
        if (seconds < 60) return seconds + " s";
        if (seconds < 3600) return Math.floor(seconds / 60) + " min" + (seconds % 60 ? " " + (seconds % 60) + " s" : "");
        const minutes = Math.round(seconds / 60);
        return Math.floor(minutes / 60) + " h " + String(minutes % 60).padStart(2, "0") + " min";
    }
    /*
     * The time line maps the stored data of a time group on its width: the periods covered by its telemetries end to end, and a long
     * period without any data (an old file next to live data: longer than 10 s and 5 % of it all) folded to FOLD_PX. A replay jumps it.
     * segments: [{t0, t1, px0, px1}] in time order; null without data.
     */
    const FOLD_PX = 6;
    function timelineMap(intervals, width) {
        if (!intervals.length || !(width > 0)) return null;
        intervals.sort((a, b) => a[0] - b[0]);
        const total = Math.max(0, intervals.reduce((m, i) => Math.max(m, i[1]), -Infinity) - intervals[0][0]);
        const fold = Math.max(10, total * 0.05);
        const merged = [];
        for (const [t0, t1] of intervals) {
            const last = merged[merged.length - 1];
            if (last && t0 - last[1] <= fold) last[1] = Math.max(last[1], t1);
            else merged.push([t0, t1]);
        }
        const duration = merged.reduce((sum, [t0, t1]) => sum + (t1 - t0), 0);
        const usable = Math.max(1, width - FOLD_PX * (merged.length - 1));
        const segments = [];
        let px = 0;
        for (const [t0, t1] of merged) {
            const w = duration > 0 ? usable * (t1 - t0) / duration : usable / merged.length;
            segments.push({ t0, t1, px0: px, px1: px + w });
            px += w + FOLD_PX;
        }
        return { segments, from: merged[0][0], to: merged[merged.length - 1][1], width };
    }
    function timelinePx(map, t) {
        const s = map.segments;
        if (t <= s[0].t0) return s[0].px0;
        for (let i = 0; i < s.length; i++) {
            if (t <= s[i].t1) return s[i].t1 > s[i].t0 ? s[i].px0 + (s[i].px1 - s[i].px0) * (t - s[i].t0) / (s[i].t1 - s[i].t0) : s[i].px1;
            if (i + 1 < s.length && t < s[i + 1].t0) return s[i].px1 + FOLD_PX / 2; // (in a folded period)
        }
        return s[s.length - 1].px1;
    }
    function timelineTime(map, px) {
        const s = map.segments;
        for (let i = 0; i < s.length; i++) {
            if (px <= s[i].px1 || i == s.length - 1) {
                if (px <= s[i].px0) return i > 0 && px > s[i].px0 - FOLD_PX / 2 ? s[i].t0 : (i > 0 ? s[i - 1].t1 : s[i].t0);
                return s[i].px1 > s[i].px0 ? Math.min(s[i].t1, s[i].t0 + (s[i].t1 - s[i].t0) * (px - s[i].px0) / (s[i].px1 - s[i].px0)) : s[i].t1;
            }
        }
        return s[s.length - 1].t1;
    }

    // Rate shown beside the record switch: samples received per second, all telemetries together
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
                cmdAttention: false, // A command was touched while commands are off: the CMD button flashes (and the menu shows)
                panels: [
                    { name: "telemetries", label: "Telemetries", key: "T", icon: "icofont-duotone icofont-chart" },
                    { name: "sources", label: "Sources", key: "S", icon: "icofont-link" },
                    { name: "export", label: "Export and import", key: "X", icon: "icofont-share-alt" },
                    { name: "help", label: "Help", key: "H", icon: "icofont-info" },
                ],
                awake: true,    // Recent activity of the mouse or keyboard
                hovered: false, // The pointer is on the island
                focused: false, // The keyboard focus is in the island
                totalRate: 0, // Hz, refreshed by a timer
                streams: 0,   // data streams seen (a telemetry has one per data type)
                commands: { settings: 0, actions: 0, devices: [] }, // What can be commanded (TP.commands.summary, refreshed by the timer)
                confirmDelete: "", // Name of the dashboard whose deletion is being confirmed in the list
                confirmForget: "", // What is being confirmed in the data menu: "forget" (every telemetry), "layout" (empty the displayed dashboard), "dashboards" (delete them all), or ""
                usage: { bytes: 0, samples: 0, telemetries: [] }, // Memory taken by the data (TP.datastore.memory, refreshed by the timer)
                memoryEvent: { action: "", actedAt: 0, actedOn: [] }, // What the library last did about a full memory
                timeSpan: null, // How far back the data goes (TP.datastore.memory.span: the telemetry that covers the longest time)
                pausedAt: 0, pausedFor: 0, // When reception stopped (ms), and for how long it has been off (seconds, refreshed by the timer)
                recv: { on: true, by: "", at: 0 }, // TP.state.receiving and receivingOff, copied by refreshTimeline (the library writes them unproxied)
                // The time line: what the row and the line show of the chosen time group (refreshed on every update of the library)
                timeline: { hasData: false, mode: "live", speed: 1, resumeLive: false, whenText: "", behindText: "", groupLabel: "", groupColor: "", groupName: "", knob: -1 },
                speeds: [0.25, 0.5, 1, 2, 5, 10],
                stripHover: false, // The pointer has been on the island for a moment (the row opens 120 ms after it came, closes 400 ms after it left)
                dragging: false,   // The line is being dragged
                hoverX: -1, hoverText: "", // The pointer on the line: where, and what time that is
                showGroups: false, // "⋯": the list of the time groups is open
                groupsTick: 0,     // (the list of the time groups is made again when it changes)
                windows: [[15, "15 s"], [60, "1 min"], [300, "5 min"], [3600, "1 h"], [0, "All"]], // Seconds of data kept
                policies: [
                    { value: "thin", label: "Thin out the oldest data", note: "Keep the lowest and highest samples of each moment: the shape of the history stays, with less detail." },
                    { value: "forget", label: "Forget the oldest data", note: "The window gets shorter for the telemetries that take the most room." },
                    { value: "stop", label: "Stop receiving", note: "Stop storing what the devices send, and tell me." },
                ],
            }
        },
        computed: {
            paused() { return !this.recv.on; }, // Not receiving
            receivingOffBy() { return this.recv.on ? "" : this.recv.by; },
            receivingSince() { const d = new Date(this.recv.at); return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, "0")).join(":"); },
            receivingText() {
                if (this.recv.on) return "What the devices send is stored. R stops it.";
                return (this.recv.by == "memory" ? "Stopped by the memory limit at " : "Stopped at ") + this.receivingSince + ": what was sent since is lost.";
            },
            commandsOn() { return !!this.TP.state.commands; },
            commandCount() { return this.commands.settings + this.commands.actions; },
            // The time group the time line, Space and Esc act on: chosen under "⋯" (or by a click in one of its views), else the dashboard's
            baseGroup() { return this.ctx.activeDashboard ? this.ctx.activeDashboard.getGroupName() : ""; },
            chosenGroup() { return this.ctx.timeGroup || this.baseGroup; },
            timelineOpen() { return !!this.ctx.activeDashboard && (this.stripHover || this.focused || this.dragging || this.ctx.topPanel == "time"); },
            // The time groups of the dashboard, for "⋯": its own, then its custom ones, with their state
            timeGroups() {
                this.groupsTick;
                const dashboard = this.ctx.activeDashboard;
                if (!dashboard) return [];
                const T = Vue.toRaw(this.TP), base = dashboard.getGroupName();
                const state = (key) => {
                    const time = T.view.timeOf(key);
                    if (time.mode == "live") return "live";
                    return (time.mode == "replay" ? time.speed + "× " : "") + formatMoment(time.at);
                };
                const list = [{ key: base, name: dashboard.name, kind: "dashboard", color: "var(--color-primary)", state: state(base) }];
                for (const g of T.dashboards.getTimeGroups(dashboard.name)) list.push({ key: g.key, name: g.name, kind: "custom", color: g.color, state: state(g.key) });
                return list;
            },
            // Reasons to stay on screen even when nothing moves
            pinned() { return !!(this.ctx.topPanel || this.ctx.bandVisible || this.editor.state.enabled || !this.ctx.activeDashboard || this.hovered || this.focused || this.dragging || this.commandsOn || this.cmdAttention); },
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
                if (event.action == "stop" && this.paused) notice = "Not receiving: the memory allowed for the data is full. Clear some data or shorten the window, then receive again.";
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
                if (gap >= 1) text += " · not received for " + time(gap);
                else if (span && window > 0 && kept < window * 0.9 && this.memoryEvent.action == "forget" && this.TP.state.memoryPolicy == "forget" && this.usage.bytes > this.TP.state.memoryLimit * 0.6) text += " · shortened by the memory limit";
                return {
                    isThinned: thinnedFor > 0, thinnedTitle: `Old data of ${names} was thinned out to fit in memory: real samples, fewer of them (see the data menu)`,
                    thinned: share(thinnedFor), plain: share(kept - thinnedFor), gap: share(gap), text,
                    thinnedText: thinnedFor > 0 ? (thinnedFor >= kept ? "all thinned" : "thinned before " + time(kept - thinnedFor + gap)) : "",
                    fromText: time(window > 0 ? window : kept + gap) + " ago",
                    title: span ? `"${span.name}" goes the furthest back: ${time(kept)}` + (window > 0 ? ` of the ${time(window)} kept` : "") + (thinnedFor > 0 ? `. Hatched: ${names} thinned out to save memory (real samples, fewer of them)` : "") : "How much of the data window is filled",
                };
            },
            // What the confirmation in the data menu asks, and the word of its button
            clearQuestion() {
                const name = this.ctx.activeDashboard ? this.ctx.activeDashboard.name : "";
                if (this.confirmForget == "layout") return { text: 'Remove every view of "' + name + '"?', action: "Empty" };
                if (this.confirmForget == "dashboards") { const n = this.dashboardList().filter(d => !d.isAuto).length; return { text: "Delete " + (n == 1 ? "the dashboard" : "the " + n + " dashboards") + " you arranged" + (this.dashboardList().some(d => d.isAuto) ? ", and empty Live?" : "?"), action: "Delete" }; }
                return { text: "Forget every telemetry and its data?", action: "Forget" };
            },
            activeViewCount() { const d = this.ctx.activeDashboard; return d ? d.getStats().viewCount + (d.getView() && d.getView().views ? d.getView().views.length : 0) : 0; },
            leftPanels() { return this.panels.filter(p => p.name != "help"); }, // The group of buttons: Help has its own, after Edit
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
            paused(paused) { this.pausedAt = paused ? this.recv.at : 0; this.pausedFor = 0; },
            // The row of the time line opens a moment after the pointer came, and closes a moment after it left (not on a mere crossing)
            hovered(on) {
                clearTimeout(this._stripTimer);
                this._stripTimer = setTimeout(() => { this.stripHover = on; }, on ? 120 : 400);
            },
            timelineOpen(open) { if (!open) this.hoverX = -1; this.$nextTick(() => this.measureLine()); },
            "ctx.activeDashboard"() { this.ctx.timeGroup = ""; },
            // When a reason to stay goes away, the island lingers for a moment
            pinned(value) { if (!value) this.wake(); },
            // A pending delete confirmation does not survive the list being closed
            "ctx.topPanel"(panel) { this.confirmDelete = ""; this.confirmForget = ""; if (panel != "time") this.showGroups = false; else this.groupsTick++; },
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
                if (panel.name == "export") return [{ text: "Save your data, open a file" }];
                if (panel.name != "sources") return [];
                const connections = this.TP.connection.connections;
                if (!connections.length) return [{ text: "No source" }];
                return connections.map(c => ({ text: c.type + " " + c.name + (c.connected ? "" : " (lost)"), status: c.connected ? "ok" : "bad" }));
            },
            // Reception on and off (what the sources send is stored or lost)
            toggleReceiving(event) { this.release(event); const T = Vue.toRaw(this.TP); T.setReceiving(!T.state.receiving); this.refreshTimeline(); },
            // The time line acts on the chosen time group (doc/time.md "Actions and keys")
            togglePlay(event) { this.release(event); if (this.chosenGroup) Vue.toRaw(this.TP).view.togglePlay(this.chosenGroup); this.refreshTimeline(); },
            goLive(event) { this.release(event); if (this.chosenGroup) Vue.toRaw(this.TP).view.backToLive(this.chosenGroup); this.refreshTimeline(); },
            setSpeed(speed) { if (this.chosenGroup) Vue.toRaw(this.TP).view.setSpeed(this.chosenGroup, speed); this.refreshTimeline(); },
            step(dir) { if (this.chosenGroup) Vue.toRaw(this.TP).view.step(this.chosenGroup, dir); this.refreshTimeline(); },
            chooseGroup(key) { this.ctx.timeGroup = key == this.baseGroup ? "" : key; this.refreshTimeline(); },
            allLive() { if (this.baseGroup) Vue.toRaw(this.TP).view.allLive(this.baseGroup); this.ctx.timeGroup = ""; this.groupsTick++; this.refreshTimeline(); },
            // On every update of the library: what the line and the row show. The line is drawn again only when what it shows changed.
            refreshTimeline() {
                const T = Vue.toRaw(this.TP);
                const off = T.state.receivingOff;
                if (this.recv.on !== T.state.receiving || this.recv.at !== (off ? off.at : 0)) this.recv = { on: T.state.receiving, by: off ? off.by : "", at: off ? off.at : 0 };
                const base = this.baseGroup;
                // A click in a view held its group: the time line follows it (only a group of this dashboard)
                const held = T.view.lastHeld;
                if (held && held.count !== this._heldCount) {
                    this._heldCount = held.count;
                    if (base && (held.name === base || held.name.startsWith(base + T.view.TIME_GROUP_SEPARATOR))) this.ctx.timeGroup = held.name === base ? "" : held.name;
                }
                const name = this.chosenGroup;
                const intervals = [];
                if (name) for (const idOrName of T.view.groupTelemetries(name)) {
                    const telem = T.datastore.getTelemetry(idOrName);
                    if (!telem) continue;
                    for (const type in telem.data) {
                        if (T.protocol.isMetaDataType(Number(type))) continue;
                        const ts = telem.data[type].timestamps;
                        if (ts && ts.length) intervals.push([ts[0], ts[ts.length - 1]]);
                    }
                }
                const map = this._map = timelineMap(intervals, this._lineWidth || 0);
                const g = name ? T.view.groups[name] : undefined;
                const time = name && intervals.length ? T.view.timeOf(name) : undefined;
                const mode = time ? time.mode : "live";
                const newest = map ? map.to : 0;
                const custom = name && name !== base ? T.dashboards.getTimeGroups(this.ctx.activeDashboard.name).find((c) => c.key === name) : undefined;
                const next = {
                    hasData: !!time, mode, speed: time ? time.speed : 1, resumeLive: !!(g && g.resume == "live"),
                    whenText: !time ? "no data" : (mode == "live" ? "live" : (mode == "replay" ? time.speed + "× · " : "") + formatMoment(time.at)),
                    behindText: time && mode != "live" ? "−" + formatBehind(Math.max(0, newest - time.at)) + (time.movedWithWindow ? " (moved with the data window)" : "") : "",
                    groupLabel: custom ? custom.name : "", groupColor: custom ? custom.color : "", groupName: custom ? custom.name : (this.ctx.activeDashboard ? this.ctx.activeDashboard.name : ""),
                    knob: map && time && mode != "live" ? Math.round(timelinePx(map, time.at) * 2) / 2 : -1,
                };
                const cur = this.timeline;
                for (const key in next) if (cur[key] !== next[key]) { this.timeline = next; break; }
                // The line itself
                const canvas = this.$refs.lineCanvas;
                if (!canvas) return;
                const height = this._lineHeight || 3;
                const offs = map && name ? T.datastore.gapsIn(T.view.groupTelemetries(name), map.from, map.to).map((p) => Math.round(timelinePx(map, p.from)) + "-" + Math.round(timelinePx(map, p.to))) : [];
                const open = this.timelineOpen;
                const key = [this._lineWidth, height, open, mode, next.knob, map ? map.segments.map((s) => Math.round(s.px0) + ":" + Math.round(s.px1)).join(",") : "none", offs.join(","), T.theme.key()].join("|");
                if (key === this._lineKey) return;
                this._lineKey = key;
                this.drawLine(canvas, map, mode, next.knob, offs, height, open);
            },
            // The line is drawn only when it has something to say (held or replaying, a period not received in view) or while the row is
            // open; live with nothing to say, or no data: nothing (its place stays, to be pointed at)
            drawLine(canvas, map, mode, knob, offs, height, open) {
                const width = this._lineWidth || 0, ratio = window.devicePixelRatio || 1;
                if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) { canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio); }
                const c = canvas.getContext("2d");
                c.setTransform(ratio, 0, 0, ratio, 0, 0);
                c.clearRect(0, 0, width, height);
                if (!map || !(open || mode != "live" || offs.length)) return;
                const css = getComputedStyle(canvas);
                const color = (name) => css.getPropertyValue(name).trim();
                c.fillStyle = color("--color-bg-dark") || "#ddd";
                c.fillRect(0, 0, width, height);
                // Covered by data, in grey; held or replaying, in the color of the mode up to the moment shown (the data after it stays grey)
                const muted = color("--color-text-muted") || "#888", modeColor = mode == "replay" ? color("--tm-replay") : color("--tm-held");
                c.globalAlpha = 0.45;
                c.fillStyle = muted;
                for (const s of map.segments) c.fillRect(s.px0, 0, s.px1 - s.px0, height);
                c.globalAlpha = 1;
                const knobAt = (x, fill) => { // (round when the line is thick enough for it)
                    c.fillStyle = fill;
                    if (height >= 5) { c.beginPath(); c.arc(Math.min(width - height / 2, Math.max(height / 2, x)), height / 2, height / 2, 0, 2 * Math.PI); c.fill(); }
                    else c.fillRect(Math.min(width - 3, Math.max(0, x - 1.5)), 0, 3, height);
                };
                if (mode != "live") {
                    c.globalAlpha = 0.85;
                    c.fillStyle = modeColor;
                    for (const s of map.segments) if (s.px0 < knob) c.fillRect(s.px0, 0, Math.min(s.px1, knob) - s.px0, height);
                    c.globalAlpha = 1;
                }
                // Periods not received: hatched
                if (offs.length) {
                    c.fillStyle = color("--color-warning") || "orange";
                    for (const range of offs) {
                        const [a, b] = range.split("-").map(Number);
                        for (let x = a; x < Math.max(a + 2, b); x += 4) c.fillRect(x, 0, 2, height);
                    }
                }
                // Folded periods without data: a notch
                c.fillStyle = color("--color-bg-light") || "#fff";
                for (let i = 1; i < map.segments.length; i++) c.fillRect(map.segments[i - 1].px1 + 1, 0, FOLD_PX - 2, height);
                // The moment shown: a knob; live, a red dot at the newest end
                if (mode != "live") knobAt(knob, modeColor);
                else knobAt(width, color("--color-danger") || "red");
            },
            measureLine() {
                const line = this.$refs.line;
                if (!line) return;
                const canvas = this.$refs.lineCanvas;
                this._lineWidth = canvas ? canvas.clientWidth : line.clientWidth;
                this._lineHeight = canvas ? canvas.clientHeight : 3;
                this._lineKey = "";
                this.refreshTimeline();
            },
            // The pointer on the line: the time under it; pressed or dragged: held there
            linePosition(event) { const box = this.$refs.lineCanvas.getBoundingClientRect(); return Math.max(0, Math.min(box.width, event.clientX - box.left)); },
            lineDown(event) {
                if (event.button !== 0 || !this._map || !this.chosenGroup) return;
                this.dragging = true;
                try { event.currentTarget.setPointerCapture(event.pointerId); } catch (e) {}
                this.lineSeek(event);
            },
            lineMove(event) {
                if (!this._map) return;
                const x = this.linePosition(event), T = Vue.toRaw(this.TP);
                const t = timelineTime(this._map, x), time = T.view.timeOf(this.chosenGroup);
                this.hoverX = x;
                const folded = this._map.segments.some((s, i) => i > 0 && x > this._map.segments[i - 1].px1 && x < s.px0);
                this.hoverText = folded ? "no data" : (time.movedWithWindow && Math.abs(x - this.timeline.knob) < 6 ? "moved with the data window" : formatMoment(t) + " · −" + formatBehind(Math.max(0, this._map.to - t)));
                if (this.dragging) this.lineSeek(event);
            },
            lineUp(event) {
                if (!this.dragging) return;
                this.dragging = false;
                try { event.currentTarget.releasePointerCapture(event.pointerId); } catch (e) {}
            },
            lineSeek(event) { Vue.toRaw(this.TP).view.seek(this.chosenGroup, timelineTime(this._map, this.linePosition(event))); this.refreshTimeline(); },
            // The wheel over the open time line: 1 % of its period per notch (later downwards or to the right), Alt: one sample per notch
            onWheel(event) {
                if (!this.timelineOpen || !this.timeline.hasData || !this._map) return;
                event.preventDefault();
                let delta = (event.deltaY || 0) + (event.deltaX || 0);
                if (event.deltaMode === 1) delta *= 33; else if (event.deltaMode === 2) delta *= 300;
                const notches = delta / 100, T = Vue.toRaw(this.TP);
                if (event.altKey) {
                    this._wheelSamples = (this._wheelSamples || 0) + notches;
                    const samples = Math.trunc(this._wheelSamples);
                    if (samples) { this._wheelSamples -= samples; T.view.move(this.chosenGroup, { samples }); }
                }
                else T.view.move(this.chosenGroup, { seconds: notches * 0.01 * Math.max(1e-3, this._map.to - this._map.from) });
            },
            toggleSidePanel(name, event) {
                this.release(event);
                if (name == "help") this.ctx.helpOpen = !this.ctx.helpOpen;
                else if (name == "export") this.ctx.exportOpen = !this.ctx.exportOpen;
                else this.ctx.sidePanel = (this.ctx.sidePanel == name) ? "" : name;
                this.ctx.topPanel = "";
            },
            isPanelOpen(panel) { return panel.name == "help" ? !!this.ctx.helpOpen : (panel.name == "export" ? !!this.ctx.exportOpen : this.ctx.sidePanel == panel.name);
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
            exportDashboard(dashboard) {
                exportDashboardFile(this.TP, dashboard);
            },
            // A file picked here goes to the Import panel (panel-export.js), like a file dropped on the page: one place to open files
            importDashboards(event) {
                const input = event.target;
                if (input.files.length) { this.ctx.droppedFiles = Vue.markRaw(Array.from(input.files)); this.ctx.exportOpen = true; this.ctx.topPanel = ""; }
                input.value = ""; // The same file can be picked again
            },
            toggleCommands(event) {
                this.release(event);
                this.TP.commands.setEnabled(!this.TP.state.commands);
            },
            plural(count, word) { return count + " " + word + (count == 1 ? "" : "s"); },
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
                const summary = this.TP.commands.summary();
                if (JSON.stringify(summary) !== JSON.stringify(this.commands)) this.commands = summary;
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
                if (seconds >= 0) { this.TP.state.dataTimeout = seconds; this.saveDataSettings(); }
            },
            setLimit(megabytes) {
                megabytes = Number(megabytes);
                if (megabytes >= 0) { this.TP.state.memoryLimit = megabytes * 1e6; this.saveDataSettings(); this.measureNow(); }
            },
            setPolicy(policy) { this.TP.state.memoryPolicy = policy; this.saveDataSettings(); },
            saveDataSettings() {
                const state = this.TP.state;
                try { localStorage.setItem(DATA_SETTINGS_KEY, JSON.stringify({ window: state.dataTimeout, limit: state.memoryLimit, policy: state.memoryPolicy })); } catch (e) { /* (private browsing...: not remembered) */ }
            },
            restoreDataSettings() {
                let saved;
                try { saved = JSON.parse(localStorage.getItem(DATA_SETTINGS_KEY) || "null"); } catch (e) { return; }
                if (!saved || typeof saved != "object") return;
                const state = Vue.toRaw(this.TP).state;
                if (typeof saved.window == "number" && saved.window >= 0) state.dataTimeout = saved.window;
                if (typeof saved.limit == "number" && saved.limit >= 0) state.memoryLimit = saved.limit;
                if (DATA_POLICIES.includes(saved.policy)) state.memoryPolicy = saved.policy;
            },
            measureNow() { this.TP.datastore.checkMemory(true); this.refreshMemory(); },
            // Clearing data. Telemetries, dashboards and views stay (but for "Forget everything", which also forgets the telemetries);
            // dashboards have their own two buttons (see confirmClear).
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
            askForget(what) {
                this.confirmForget = what;
                this.$nextTick(() => { if (this.$refs.forgetCancel) this.$refs.forgetCancel.focus(); }); // A stray Enter or Space is harmless
            },
            // What was asked is done: forgetting the telemetries, emptying the displayed dashboard, or deleting the dashboards (the auto
            // dashboard cannot be deleted: it is emptied, and goes on displaying what arrives)
            confirmClear() {
                const what = this.confirmForget;
                this.confirmForget = "";
                if (what == "forget") this.TP.datastore.forgetTelemetries();
                else if (what == "layout" && this.ctx.activeDashboard) this.TP.dashboards.clearDashboard(this.ctx.activeDashboard.name);
                else if (what == "dashboards") {
                    this.editor.setEnabled(false);
                    for (const dashboard of this.dashboardList()) {
                        if (dashboard.isAuto) this.TP.dashboards.clearDashboard(dashboard.name);
                        else this.TP.dashboards.removeDashboard(dashboard.name);
                    }
                    this.ctx.activeDashboard = this.dashboardList()[0] || null;
                }
                this.editor.refresh();
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
                if (this.TP.commands.keyboardCaptured) return; // (a joystick drives with the keys)
                const t = event.target;
                if (t && (t.isContentEditable || (t.closest && t.closest("input, textarea, select")))) return; // Typing
                if (event.key == " " && t && t.closest && t.closest("button, summary, a")) return; // Space activates a focused control, as usual
                if (event.key == " ") { event.preventDefault(); this.togglePlay(); return; }
                const T = Vue.toRaw(this.TP), group = this.chosenGroup;
                // The arrows move the time shown (one sample, Shift: 1 % of the line), unless a control that uses them has the focus;
                // while the time line is open, Home goes to the oldest sample and End to live
                const arrow = event.key == "ArrowLeft" || event.key == "ArrowRight";
                const controlFocused = t && t.closest && t.closest(".tm-popup, [role=slider], [role=tablist], [role=listbox], [role=menu], [role=radiogroup]");
                const homeEnd = this.timelineOpen && (event.key == "Home" || event.key == "End");
                if (group && this.timeline.hasData && this._map && ((arrow && !controlFocused) || homeEnd)) {
                    event.preventDefault();
                    const dir = event.key == "ArrowLeft" ? -1 : 1;
                    if (event.key == "Home") T.view.seek(group, this._map.from);
                    else if (event.key == "End") T.view.backToLive(group);
                    else if (event.shiftKey) T.view.move(group, { seconds: dir * 0.01 * Math.max(1e-3, this._map.to - this._map.from) });
                    else T.view.move(group, { samples: dir });
                    return;
                }
                // Replay speed: "-" and "+" (or "=", the same key unshifted on QWERTY and AZERTY; the keypad's too)
                const speedDir = { "-": -1, "_": -1, "+": 1, "=": 1 }[event.key];
                if (group && speedDir) { event.preventDefault(); T.view.changeSpeed(group, speedDir); return; }
                const key = event.key.toLowerCase();
                if (key == "r") { event.preventDefault(); this.toggleReceiving(); return; }
                if (key == "e") { event.preventDefault(); this.toggleEdit(); return; }
                if (key == "c" && (this.commandCount || this.commandsOn)) { event.preventDefault(); this.toggleCommands(); return; }
                const panel = this.panels.find(p => !p.soon && (p.key.toLowerCase() == key || (p.name == "help" && key == "?")));
                if (panel) { event.preventDefault(); this.toggleSidePanel(panel.name); }
            },
        },
        created() {
            this.restoreDataSettings();
            this._onKeyDown = (e) => this.onKeyDown(e);
            this._onPointerDown = (e) => this.onPointerDown(e);
            this._onActivity = (e) => this.onActivity(e);
            window.addEventListener("keydown", this._onKeyDown);
            window.addEventListener("pointerdown", this._onPointerDown, true);
            for (const type of ACTIVITY_EVENTS) window.addEventListener(type, this._onActivity, true);
        },
        mounted() {
            this.wake();
            this._onCommandBlocked = () => {
                this.cmdAttention = false;
                clearTimeout(this._attentionTimer);
                this.$nextTick(() => { this.cmdAttention = true; }); // (again from the start when it was already flashing)
                this._attentionTimer = setTimeout(() => { this.cmdAttention = false; }, 2000);
            };
            this.TP.commands.onBlockedHooks.push(this._onCommandBlocked);
            // The time line follows every update of the library (a replay moves 30 times per second); its width is measured when it changes
            this._timelineHook = () => this.refreshTimeline();
            Vue.toRaw(this.TP).updates.onUpdateHooks.push(this._timelineHook);
            if (typeof ResizeObserver === "function" && this.$refs.line) { this._lineObserver = new ResizeObserver(() => this.measureLine()); this._lineObserver.observe(this.$refs.line); }
            this.measureLine();
            this._onWheel = (e) => this.onWheel(e);
            this.$refs.island.addEventListener("wheel", this._onWheel, { passive: false }); // (taken while the time line is open: the page must not scroll meanwhile)
            this.refreshRate();
            this._rateTimer = setInterval(() => this.refreshRate(), 250);
        },
        unmounted() {
            window.removeEventListener("keydown", this._onKeyDown);
            window.removeEventListener("pointerdown", this._onPointerDown, true);
            for (const type of ACTIVITY_EVENTS) window.removeEventListener(type, this._onActivity, true);
            clearTimeout(this._idleTimer);
            clearInterval(this._rateTimer);
            clearTimeout(this._attentionTimer);
            clearTimeout(this._stripTimer);
            const hooks = this.TP.commands.onBlockedHooks, index = hooks.indexOf(this._onCommandBlocked);
            if (index >= 0) hooks.splice(index, 1);
            const updates = Vue.toRaw(this.TP).updates.onUpdateHooks, at = updates.indexOf(this._timelineHook);
            if (at >= 0) updates.splice(at, 1);
            if (this._lineObserver) this._lineObserver.disconnect();
            if (this.$refs.island) this.$refs.island.removeEventListener("wheel", this._onWheel);
        },
        template: vueHTML,
    });
}
