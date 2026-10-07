/*
 * Edit panel (right side, only while a dashboard is being edited). It follows the selection made on the dashboard:
 * - nothing selected: dashboard settings (name, time window, theme, structure)
 * - a container (row, column, stack): direction, alignment, gap, appearance (cards/flat) and top color for all its children, children
 * - a view (chart, values, log): header with duplicate/delete, breadcrumb, tabs "Data" (title, telemetries) and "Display" (options)
 * What happens on the dashboard itself (pills, drag and drop, resize) is in dashboard-editor.js.
 */
function initComponent_panel_edit(vue) {
    let name = "panel-edit";

    const vueHTML = `
        <div class="edit-panel" v-if="editor.state.enabled && dashboard">
          <template v-if="editor.state.revision >= 0 && tick >= 0">

            <!-- Dashboard -->
            <template v-if="!selected">
              <div class="edit-head"><span>Dashboard</span><button class="edit-done" @click="editor.setEnabled(false)">Done</button></div>
              <div class="edit-body">
                <div class="edit-section first">Settings</div>
                <label class="edit-field">Name
                  <input type="text" class="edit-input" :value="dashboard.name" :disabled="dashboard.isAuto" :title="dashboard.isAuto ? 'The automatic dashboard keeps its name' : ''" spellcheck="false"
                    @change="rename($event.target.value)" @keydown.enter="$event.target.blur()">
                </label>
                <div class="edit-field">Time window
                  <span class="edit-value">{{ group.cursorActive ? 'zoomed' : 'full range' }}
                    <button class="edit-btn" :disabled="!group.cursorActive" @click="resetZoom()">Reset</button></span>
                </div>
                <div class="edit-field">Theme
                  <span class="edit-seg"><button :class="{on: theme != 'dark'}" @click="setTheme('light')">Light</button><button :class="{on: theme == 'dark'}" @click="setTheme('dark')">Dark</button></span>
                </div>
                <div class="edit-field">Views appearance
                  <span class="edit-seg"><button :class="{on: dashboard.view.layout.appearance != 'flat'}" @click="dashboard.view.layout.appearance = 'card'">Cards</button><button :class="{on: dashboard.view.layout.appearance == 'flat'}" @click="dashboard.view.layout.appearance = 'flat'">Flat</button></span>
                </div>
                <div class="edit-field">Top color
                  <span class="edit-seg"><button :class="{on: dashboard.view.layout.accent != 'off'}" @click="dashboard.view.layout.accent = 'on'">On</button><button :class="{on: dashboard.view.layout.accent == 'off'}" @click="dashboard.view.layout.accent = 'off'">Off</button></span>
                </div>
                <div class="edit-section">Structure</div>
                <div class="edit-field">Views<span class="edit-value">{{ stats.viewCount }}</span></div>
                <div class="edit-field">Telemetries<span class="edit-value">{{ stats.telemetryCount }}</span></div>
                <div class="edit-field">Containers<span class="edit-value">{{ containerCount }}</span></div>
                <div class="edit-hint">Click a pill to edit an element, a <b>+</b> to add one.<br>Drag a pill to move it. <kbd>←</kbd><kbd>→</kbd> width, <kbd>↑</kbd><kbd>↓</kbd> height, <kbd>Alt</kbd> + arrows to move, <kbd>Esc</kbd> to deselect.</div>
              </div>
            </template>

            <!-- Container -->
            <template v-else-if="isContainer">
              <div class="edit-head">
                <span class="edit-title"><i class="icofont-layout"></i> {{ typeLabel }}</span>
                <span class="edit-actions">
                  <button class="edit-icon" title="Duplicate" aria-label="Duplicate" @click="editor.duplicateView(selected.id)"><i class="icofont-copy"></i></button>
                  <button class="edit-icon danger" title="Delete" aria-label="Delete" @click="remove()"><i class="icofont-trash"></i></button>
                </span>
              </div>
              <div class="edit-crumb"><template v-for="(p, i) in ancestors" :key="p.id"><a @click="editor.select(i == 0 ? '' : p.id)">{{ i == 0 ? 'Dashboard' : editor.typeLabel(p) }}</a> › </template><b>{{ typeLabel }}</b></div>
              <div class="edit-body">
                <div class="edit-section first">Layout</div>
                <div class="edit-field">Direction
                  <span class="edit-seg">
                    <button :class="{on: selected.layout.type == 'row'}" @click="editor.setContainerType(selected.id, 'row')">Row</button>
                    <button :class="{on: selected.layout.type == 'column'}" @click="editor.setContainerType(selected.id, 'column')">Column</button>
                    <button :class="{on: selected.layout.type == 'stack'}" @click="editor.setContainerType(selected.id, 'stack')">Stack</button>
                  </span>
                </div>
                <template v-if="selected.layout.type != 'stack'">
                  <div class="edit-field">Align
                    <span class="edit-seg"><button v-for="a in ['start', 'center', 'stretch']" :key="a" :class="{on: selected.layout.align == a}" @click="selected.layout.align = a">{{ a }}</button></span>
                  </div>
                  <div class="edit-field">Gap
                    <span class="edit-step"><button :disabled="selected.layout.gap <= 0" @click="selected.layout.gap = Math.max(0, selected.layout.gap - 0.5)">−</button><span>{{ selected.layout.gap }}</span><button :disabled="selected.layout.gap >= 4" @click="selected.layout.gap = Math.min(4, selected.layout.gap + 0.5)">+</button></span>
                  </div>
                </template>
                <div class="edit-field">Appearance
                  <span class="edit-seg"><button v-for="o in [['inherit', 'Inherit'], ['card', 'Cards'], ['flat', 'Flat']]" :key="o[0]" :class="{on: (selected.layout.appearance || 'inherit') == o[0]}" @click="selected.layout.appearance = o[0]">{{ o[1] }}</button></span>
                </div>
                <div class="edit-field">Top color
                  <span class="edit-seg"><button v-for="o in [['inherit', 'Inherit'], ['on', 'On'], ['off', 'Off']]" :key="o[0]" :class="{on: (selected.layout.accent || 'inherit') == o[0]}" @click="selected.layout.accent = o[0]">{{ o[1] }}</button></span>
                </div>
                <div class="edit-section">Children <span class="edit-count">{{ selected.views.length }}</span></div>
                <div v-if="!selected.views.length" class="edit-hint">Empty. Click the + inside it, drag a pill, or drag a telemetry from the Telemetries panel into it.</div>
                <div v-for="child in selected.views" :key="child.id" class="edit-field edit-child" @click="editor.select(child.id)">
                  <span>{{ editor.typeLabel(child) }}<span v-if="child.options && child.options.title" class="edit-muted"> · {{ child.options.title }}</span></span>
                  <span class="edit-muted">w {{ child.layout.width }}</span>
                </div>
              </div>
            </template>

            <!-- View -->
            <template v-else>
              <div class="edit-head">
                <span class="edit-title"><i :class="viewIcon"></i> {{ typeLabel }}</span>
                <span class="edit-actions">
                  <button class="edit-icon" title="Duplicate" aria-label="Duplicate" @click="editor.duplicateView(selected.id)"><i class="icofont-copy"></i></button>
                  <button class="edit-icon danger" title="Delete" aria-label="Delete" @click="remove()"><i class="icofont-trash"></i></button>
                </span>
              </div>
              <div class="edit-crumb"><template v-for="(p, i) in ancestors" :key="p.id"><a @click="editor.select(i == 0 ? '' : p.id)">{{ i == 0 ? 'Dashboard' : editor.typeLabel(p) }}</a> › </template><b>{{ typeLabel }}</b></div>
              <div class="edit-tabs"><span :class="{on: tab == 'data'}" @click="tab = 'data'">Data</span><span :class="{on: tab == 'display'}" @click="tab = 'display'">Display</span></div>
              <div class="edit-body">
                <template v-if="tab == 'data'">
                  <label class="edit-field">Title
                    <input type="text" class="edit-input" v-model="selected.options.title" placeholder="none" spellcheck="false">
                  </label>
                  <div class="edit-section">{{ selected.type == 'teleplot-chart' ? 'Series' : 'Telemetries' }} <span class="edit-count">{{ telemetries.length }}</span></div>
                  <div v-if="!telemetries.length" class="edit-hint">Nothing displayed yet. Add a telemetry below, or drop one from the Telemetries panel on the view.</div>
                  <div v-for="t in telemetries" :key="t.key" class="edit-field">
                    <span class="edit-telem" :title="t.name"><i class="edit-swatch" :style="{background: t.color}"></i> {{ t.name }}</span>
                    <button class="edit-icon small" title="Remove" aria-label="Remove" @click="selected.removeTelemetry(t.key); tick++"><i class="icofont-close"></i></button>
                  </div>
                  <div class="edit-combo">
                    <input type="search" class="edit-input edit-add" v-model="addQuery" placeholder="＋ add telemetry… (search)" spellcheck="false" autocomplete="off"
                      @focus="addOpen = true" @blur="addOpen = false" @keydown.enter.prevent="matches.length && addTelemetry(matches[0].id)" @keydown.esc.stop="addOpen = false; $event.target.blur()">
                    <div v-if="addOpen" class="edit-combo-list">
                      <div v-for="c in matches.slice(0, 100)" :key="c.id" class="edit-combo-item" :title="c.name" @mousedown.prevent="addTelemetry(c.id)">{{ c.name }}</div>
                      <div v-if="!matches.length" class="edit-hint edit-combo-empty">{{ candidates.length ? 'No telemetry matches.' : 'No other compatible telemetry.' }}</div>
                      <div v-else-if="matches.length > 100" class="edit-hint edit-combo-empty">{{ matches.length - 100 }} more, refine the search.</div>
                    </div>
                  </div>
                </template>
                <template v-else>
                  <template v-for="o in schema" :key="o.key">
                    <label v-if="o.type == 'bool'" class="edit-field">{{ o.label }}
                      <input type="checkbox" class="edit-check" :checked="selected.options[o.key]" @change="selected.options[o.key] = $event.target.checked">
                    </label>
                    <div v-else class="edit-field">{{ o.label }}
                      <input type="number" class="edit-input edit-number" :min="o.min" :max="o.max" :step="o.step || 1" :value="selected.options[o.key]"
                        @change="setNumber(o, $event.target.value)">
                    </div>
                  </template>
                  <div class="edit-hint">Width and height are set on the dashboard, with the pill of the view.</div>
                </template>
              </div>
            </template>

          </template>
        </div>
    `;

    return vue.component(name, {
        name: name,
        setup() {
            const TP = Vue.inject("TP");
            const ctx = Vue.inject("ctx");
            const editor = Vue.inject("editor");
            return { TP, ctx, editor };
        },
        data() {
            return { tick: 0, tab: "data", addQuery: "", addOpen: false, theme: document.documentElement.dataset["theme"] || "light" };
        },
        computed: {
            dashboard() { return this.ctx.activeDashboard; },
            group() { return this.TP.view.groups[this.dashboard.getGroupName()] || {}; },
            selected() { this.editor.state.revision; return this.editor.getSelected(); },
            isContainer() { return this.editor.isContainer(this.selected); },
            typeLabel() { return this.editor.typeLabel(this.selected); },
            ancestors() { this.editor.state.revision; return this.editor.getPath(this.selected).slice(0, -1); },
            stats() { this.editor.state.revision; return this.dashboard.getStats(); },
            containerCount() {
                this.editor.state.revision;
                const count = (v) => this.editor.isContainer(v) ? v.views.reduce((n, c) => n + count(c), 1) : 0;
                return Math.max(0, count(this.dashboard.view) - 1); // the dashboard layout itself doesn't count
            },
            viewIcon() {
                return { "teleplot-chart": "icofont-chart-line", "teleplot-current-value": "icofont-numbered", "teleplot-log": "icofont-list" }[this.selected.type] || "icofont-chart";
            },
            schema() { return this.selected && this.selected.getOptionsSchema ? this.selected.getOptionsSchema() : []; },
            telemetries() {
                const view = this.selected; this.tick;
                if (!view || !view.telemetryIdOrNameList) return [];
                return Array.from(view.telemetryIdOrNameList).map((key, i) => {
                    const telem = this.TP.datastore.getTelemetry(key);
                    if (!telem) return { key, name: String(key) + " (no data yet)", color: "gray" };
                    let color = telem.getAttribute(this.TP.protocol.TELEM_ATTR_COLOR);
                    if (!color) color = this.TP.colors.getColor(i + 1).toStrRGB();
                    return { key, name: telem.getAttribute(this.TP.protocol.TELEM_ATTR_NAME) || String(key), color };
                });
            },
            // Candidates containing every word of the search (case-insensitive)
            matches() {
                const words = this.addQuery.toLowerCase().split(/\s+/).filter(Boolean);
                return this.candidates.filter((c) => { const n = c.name.toLowerCase(); return words.every((w) => n.includes(w)); });
            },
            candidates() {
                const view = this.selected; this.tick;
                if (!view || !view.telemetryIdOrNameList) return [];
                const used = new Set(Array.from(view.telemetryIdOrNameList).map((k) => { const t = this.TP.datastore.getTelemetry(k); return t ? t.id : k; }));
                const list = [];
                for (const id in this.TP.datastore.telemetries) {
                    const telem = this.TP.datastore.telemetries[id];
                    if (used.has(telem.id)) continue;
                    if (view.supportedDataTypes && !Object.keys(telem.data).some((t) => view.supportedDataTypes.includes(t))) continue;
                    list.push({ id: telem.id, name: telem.getAttribute(this.TP.protocol.TELEM_ATTR_NAME) || String(telem.id) });
                }
                return list.sort((a, b) => a.name.localeCompare(b.name));
            }
        },
        created() {
            // The library embeds its own Vue: what it changes (telemetry lists, sizes, options) is not tracked by this one. Refresh on a timer.
            this._timer = setInterval(() => { this.tick++; }, 250);
        },
        beforeUnmount() { clearInterval(this._timer); },
        watch: {
            "editor.state.selectedId"() { this.tab = "data"; this.addQuery = ""; this.addOpen = false; }
        },
        methods: {
            rename(value) {
                const name = this.TP.dashboards.renameDashboard(this.dashboard.name, value);
                this.$el.querySelector("input").value = name;
            },
            resetZoom() {
                this.group.cursorActive = false;
                this.group.timestampFrom = -1;
                this.group.timestampTo = -1;
            },
            setTheme(theme) {
                this.theme = theme;
                document.documentElement.dataset["theme"] = theme;
            },
            remove() { this.editor.removeView(this.selected.id); },
            addTelemetry(id) {
                this.selected.addTelemetry(Number(id));
                this.tick++;
                this.addQuery = ""; // the list stays open to add several telemetries in a row
            },
            setNumber(option, value) {
                let n = Number(value);
                if (!Number.isFinite(n)) return;
                if (option.min !== undefined) n = Math.max(option.min, n);
                if (option.max !== undefined) n = Math.min(option.max, n);
                this.selected.options[option.key] = Math.round(n);
            }
        },
        template: vueHTML,
    });
}
