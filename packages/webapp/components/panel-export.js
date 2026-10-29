/*
 * Export and import panel (right dock, in place of Help): saving what Teleplot holds to a file, and opening files. See doc/files.md "In the webapp".
 *
 * Two sections that cannot be mistaken for one another, then the files of the session:
 * - Export: three questions with their defaults selected (what, when, format), so that one click saves everything. "Choose..." unfolds
 *   the telemetries, by label, with what each weighs; CSV unfolds its settings (layout, time, separator) and the first lines of the
 *   file as a table. Under them, what the file will hold, before it is written.
 *   The Export section folds to its header while a file is being opened.
 * - Import: a file that is chosen (here, from the "Import…" of the dashboard list, or dropped anywhere on the page) is first read without being stored (a dry run of the library):
 *   the panel shows what it holds and what opening it changes, with the options that matter for its format. Then one button.
 * - Files of this session: what was opened and saved. An opened file can show its period on the dashboard and be taken back.
 *
 * The library does the work (TP.files, see doc/files.md): this file chooses options and displays results.
 */
const EXPORT_PIECE = 4 << 20; // A file is read by pieces of this size: the page stays alive and shows the progress
const EXPORT_FORMATS = [
    { id: "binary", label: "Binary", extension: ".teleplot", type: "application/octet-stream", note: "Exact and small, to open here again." },
    { id: "text", label: "Text", extension: ".teleplot.txt", type: "text/plain", note: "Lines of the text protocol: readable, and what a device can log." },
    { id: "csv", label: "CSV", extension: ".teleplot.csv", type: "text/csv", note: "For a spreadsheet or a script: numbers and text only." },
];
const EXPORT_SEPARATORS = [[",", "Comma  ,"], [";", "Semicolon  ;"], ["\t", "Tab"]];
const EXPORT_TIMES = [["iso", "Date and time (ISO 8601)"], ["ms", "Milliseconds since 1970"], ["s", "Seconds since 1970"]];
const EXPORT_CSV_TYPES = ["20", "21", "22", "23"]; // Data types a CSV holds: numbers, positions, text

// Files opened and saved since the page was loaded (the panel can be closed in between)
const exportHistory = Vue.reactive({ list: [], nextId: 1 });

function exportFormatBytes(bytes) {
    if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + " GB";
    if (bytes >= 1e6) return (bytes / 1e6).toFixed(bytes >= 1e7 ? 0 : 1) + " MB";
    if (bytes >= 1000) return (bytes / 1000).toFixed(bytes >= 1e4 ? 0 : 1) + " kB";
    return Math.round(bytes) + " B";
}
function exportFormatCount(count) {
    if (count >= 1e6) return (count / 1e6).toFixed(count >= 1e7 ? 1 : 2) + " M";
    if (count >= 1e4) return Math.round(count / 1000) + " k";
    return String(count).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}
// "12 s", "1 min 30 s", "1 h 8 min", "2 d 3 h"
function exportFormatDuration(seconds) {
    if (!(seconds > 0)) return "0 s";
    if (seconds < 1) return (Math.round(seconds * 1000) / 1000) + " s";
    seconds = Math.round(seconds);
    const d = Math.floor(seconds / 86400), h = Math.floor(seconds % 86400 / 3600), m = Math.floor(seconds % 3600 / 60), s = seconds % 60;
    if (d) return d + " d" + (h ? " " + h + " h" : "");
    if (h) return h + " h" + (m ? " " + m + " min" : "");
    if (m) return m + " min" + (s ? " " + s + " s" : "");
    return s + " s";
}
// A period, as someone would say it now: "14:02:10 → 14:07:10", "Yesterday 16:41:00 → 17:49:10", "12 Mar 2026 09:14:02 → 09:27:44".
// Times before 2001 are those of a device that counts from its start: "0:00:00 → 0:12:30 after the device started".
function exportFormatPeriod(from, to, now = Date.now()) {
    if (from === undefined || to === undefined) return "";
    const two = (n) => String(n).padStart(2, "0");
    if (to < 978307200) {
        const clock = (t) => Math.floor(t / 3600) + ":" + two(Math.floor(t % 3600 / 60)) + ":" + two(Math.floor(t % 60));
        return clock(from) + " → " + clock(to) + " after the device started";
    }
    const clock = (date) => two(date.getHours()) + ":" + two(date.getMinutes()) + ":" + two(date.getSeconds());
    if (from < 978307200) { // Lines with the time of a device, and lines without time (dated when read)
        return Math.floor(from / 3600) + ":" + two(Math.floor(from % 3600 / 60)) + ":" + two(Math.floor(from % 60)) + " after the device started, and lines dated now (" + clock(new Date(to * 1000)) + ")";
    }
    const day = (date) => {
        const start = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
        const days = Math.round((start(new Date(now)) - start(date)) / 86400000);
        if (days === 0) return "";
        if (days === 1) return "Yesterday ";
        return date.getDate() + " " + ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][date.getMonth()] + " " + date.getFullYear() + " ";
    };
    const a = new Date(from * 1000), b = new Date(to * 1000);
    return day(a) + clock(a) + " → " + (day(b) !== day(a) ? day(b) : "") + clock(b);
}
// "session-1407.teleplot", "session-1407.teleplot.txt", "session-1407.teleplot.csv"
function exportFileName(format, date = new Date()) {
    const two = (n) => String(n).padStart(2, "0");
    const extension = (EXPORT_FORMATS.find((f) => f.id === format) || EXPORT_FORMATS[0]).extension;
    return "session-" + two(date.getHours()) + two(date.getMinutes()) + extension;
}
// Ids of the telemetries a dashboard displays
function exportOnScreen(TP, dashboard) {
    const shown = new Set();
    const visit = (view) => {
        if (!view) return;
        if (Array.isArray(view.views)) { view.views.forEach(visit); return; }
        for (const entry of (view.telemetryIdOrNameList || [])) {
            const telem = TP.datastore.getTelemetry(entry);
            if (telem) shown.add(telem.id);
        }
    };
    if (dashboard) visit(dashboard.getView());
    return Array.from(shown);
}
// The period a dashboard is zoomed on: {from, to} of the first of its time groups that is zoomed, undefined when none is
function exportZoom(TP, dashboard) {
    if (!dashboard) return undefined;
    const base = dashboard.getGroupName();
    for (const name of Object.keys(TP.view.groups)) {
        const group = TP.view.groups[name];
        if ((name === base || name.startsWith(base + TP.view.TIME_GROUP_SEPARATOR)) && group.cursorActive && group.timestampFrom < group.timestampTo) return { from: group.timestampFrom, to: group.timestampTo };
    }
    return undefined;
}
function exportDownload(parts, name, type) {
    const url = URL.createObjectURL(new Blob(parts, { type }));
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function initComponent_panel_export(vue) {
    let name = "panel-export";

    const seg = (model, options, extra = "") => `<div class="export-seg" role="radiogroup">
        <button v-for="o in ${options}" :key="o.id" type="button" role="radio" :aria-checked="${model} == o.id" :class="{on: ${model} == o.id}" :disabled="o.disabled" :title="o.title" @click="${model} = o.id${extra}">{{o.label}}</button>
    </div>`;

    const vueHTML = `
        <div class="export-layout" :class="{dragging: dragging}">

            <!-- ============================================================ Export -->
            <!-- Folded while a file is being opened: one thing at a time, and the receipt gets the room -->
            <section class="export-section export-out" :class="{folded: !!pending}">
                <header><span class="export-badge"><i class="icofont-download"></i></span><div><h2>Export</h2><span>{{pending ? 'Back once the file below is opened or cancelled.' : 'Save what Teleplot holds to a file.'}}</span></div></header>
                <div class="export-fold" :inert="!!pending"><div class="export-fold-body">
                <div class="export-card">
                    <div class="export-field">
                        <label>What</label>${seg("what", "whatOptions")}
                        <label>When</label>${seg("when", "whenOptions")}
                        <label>Format</label>${seg("format", "formatOptions")}
                        <span></span>
                        <label class="export-check" :class="{off: format == 'csv' || !dashboardNames.length}">
                            <input type="checkbox" v-model="withDashboards" :disabled="format == 'csv' || !dashboardNames.length">
                            <span v-if="format == 'csv'">Dashboards <small>(not in a CSV)</small></span>
                            <span v-else-if="!dashboardNames.length">No dashboard to include</span>
                            <span v-else>Include {{dashboardNames.length == 1 ? 'the dashboard "' + dashboardNames[0] + '"' : 'the ' + dashboardNames.length + ' dashboards'}}</span>
                        </label>
                    </div>
                    <div class="export-sub">{{formatNote}}</div>

                    <!-- Choose...: the telemetries, by label, with what each weighs -->
                    <div v-if="what == 'choose'" class="export-inset">
                        <div class="export-inset-head"><b>Telemetries</b><span>{{chosenCount}} of {{telemetryCount}}</span><span class="export-grow"></span>
                            <button type="button" @click="chooseAll(true)">All</button><button type="button" @click="chooseAll(false)">None</button><button type="button" :disabled="!ctx.activeDashboard" @click="chooseOnScreen()">On screen</button>
                        </div>
                        <div class="export-list">
                            <label v-for="row in rows" :key="row.key" class="export-check" :class="{off: !row.usable}">
                                <input type="checkbox" :checked="row.state == 'on'" :indeterminate.prop="row.state == 'some'" :disabled="!row.usable" @change="chooseRow(row, $event.target.checked)">
                                <span class="export-row-name" :title="row.tip || row.label">{{row.label}} <small v-if="row.count > 1">· {{row.count}}</small></span>
                                <small class="export-mono">{{row.usable ? row.size : 'not in a CSV'}}</small>
                            </label>
                            <div v-if="!rows.length" class="export-sub">No telemetry yet.</div>
                        </div>
                    </div>

                    <!-- CSV: its settings, and the first lines of the file -->
                    <div v-if="format == 'csv'" class="export-inset">
                        <div class="export-inset-head"><b>CSV</b></div>
                        <div class="export-field">
                            <label>Layout</label>${seg("csv.layout", "layoutOptions")}
                            <label>Separator</label><select v-model="csv.separator" aria-label="Separator between the fields">${EXPORT_SEPARATORS.map(([v, l]) => `<option value="${v === "\t" ? "&#9;" : v}">${l}</option>`).join("")}</select>
                            <label>Time</label><select v-model="csv.time" aria-label="How the time is written">${EXPORT_TIMES.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select>
                        </div>
                        <div class="export-sub">{{csv.layout == 'columns' ? 'A column per telemetry, a line per moment.' : 'A line per sample: time, name, value.'}} Numbers always use a point (1.5), so they cannot be mistaken for a separator.</div>
                        <template v-if="preview.rows.length">
                            <div class="export-inset-head export-preview-head"><b>Preview</b><span>first lines{{preview.more ? ', ' + preview.more + ' more column' + (preview.more == 1 ? '' : 's') : ''}}</span></div>
                            <div class="export-preview"><table>
                                <tr><th v-for="(cell, i) in preview.header" :key="i">{{cell}}</th></tr>
                                <tr v-for="(line, r) in preview.rows" :key="r"><td v-for="(cell, i) in line" :key="i" :class="{empty: cell === ''}">{{cell}}</td></tr>
                            </table></div>
                            <div v-if="csv.layout == 'columns'" class="export-sub">An empty cell: no sample at that very time. Nothing is filled in.</div>
                        </template>
                    </div>
                    <div v-if="format == 'csv' && estimate.leftOut" class="export-note"><b>!</b><span>A CSV holds numbers and text: {{estimate.leftOut}} {{estimate.leftOut == 1 ? 'telemetry is' : 'telemetries are'}} left out (images, 3D, point clouds). The binary file keeps everything.</span></div>

                    <div class="export-recap">
                        <div class="export-grow">
                            <div><b class="export-mono">{{count(estimate.samples)}}</b> {{format == 'csv' ? 'values' : 'samples'}}<template v-if="periodText"> · {{periodText}}</template></div>
                            <div class="export-sub">{{estimate.telemetries}} {{estimate.telemetries == 1 ? 'telemetry' : 'telemetries'}} · about {{bytes(estimate.bytes)}} · {{fileName}}</div>
                        </div>
                        <button type="button" class="export-btn export-primary" :disabled="!canSave" @click="save()"><i class="icofont-download"></i> Save</button>
                    </div>
                    <div v-if="saved" class="export-note" :class="{good: !saved.skipped}" role="status"><b>{{saved.skipped ? '!' : '✓'}}</b><span>{{saved.text}}</span></div>
                </div>
                </div></div>
            </section>

            <!-- ============================================================ Import -->
            <section class="export-section export-in">
                <header><span class="export-badge"><i class="icofont-upload"></i></span><div><h2>Import</h2><span>Open a data file, the log of a device, a CSV, dashboards.</span></div></header>

                <!-- Nothing chosen: where to drop -->
                <div v-if="!pending" class="export-drop" :class="{over: dragging}">
                    <b>Drop a file anywhere on the page</b>
                    <span>or <button type="button" class="export-link" @click="$refs.file.click()">choose a file…</button></span>
                    <small>.teleplot (binary), .teleplot.txt (text protocol lines, dashboards), .teleplot.csv, or the log of a device</small>
                    <input ref="file" type="file" multiple hidden @change="pick($event.target.files); $event.target.value = ''">
                </div>

                <!-- A file being described, or its receipt -->
                <div v-else class="export-card">
                    <div class="export-inset-head export-receipt-head"><b>{{pending.state == 'opening' ? 'Opening' : 'About to open'}}</b><span v-if="queue.length">then {{queue.length}} more</span></div>
                    <div class="export-line"><b class="export-grow export-name">{{pending.file.name}}</b><span class="export-mono export-sub">{{bytes(pending.file.size)}}</span></div>

                    <template v-if="pending.state == 'reading' || pending.state == 'opening'">
                        <div class="export-progress" role="progressbar" :aria-valuenow="Math.round(pending.progress * 100)" aria-valuemin="0" aria-valuemax="100"><i :style="{width: (pending.progress * 100) + '%'}"></i></div>
                        <div class="export-line"><span class="export-sub export-grow">{{pending.state == 'opening' ? 'Storing its data' : 'Reading it, nothing is stored yet'}} · {{Math.round(pending.progress * 100)}} %</span><button type="button" class="export-link export-danger" @click="cancel()">Cancel</button></div>
                    </template>

                    <div v-else-if="pending.state == 'error'" class="export-note"><b>!</b><span>{{pending.error}}</span></div>

                    <template v-else>
                        <dl class="export-receipt">
                            <dt>Format</dt>
                            <dd>
                                {{formatName(pending.info)}}
                                <label v-if="pending.info.format == 'text' && (pending.info.samples || pending.info.problems || pending.options.serial)" class="export-check"><input type="checkbox" v-model="pending.options.serial" @change="describe()"><span>Logged from a serial port <small>(telemetry lines start with &gt;)</small></span></label>
                                <div v-if="pending.info.csv" class="export-field export-field-small">
                                    <label>Separator</label><select v-model="pending.options.separator" @change="describe()">${EXPORT_SEPARATORS.map(([v, l]) => `<option value="${v === "\t" ? "&#9;" : v}">${l}</option>`).join("")}</select>
                                </div>
                            </dd>
                            <template v-if="pending.info.csv">
                                <dt>Time</dt>
                                <dd><div class="export-field export-field-small">
                                    <label>Column</label><select v-model.number="pending.options.timeColumn" @change="describe()"><option v-for="(column, i) in pending.info.csv.columns" :key="i" :value="i">{{column || 'column ' + (i + 1)}}</option></select>
                                    <label>Written as</label><select v-model="pending.options.timeUnit" @change="describe()">${EXPORT_TIMES.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select>
                                </div></dd>
                                <dt>Names</dt>
                                <dd><div class="export-field export-field-small">
                                    <label>Start with</label><input type="text" v-model="pending.options.prefix" placeholder="nothing" spellcheck="false" autocomplete="off" @change="describe()">
                                </div><small>{{pending.info.csv.layout == 'lines' ? 'One sample per line (time, name, value)' : (pending.info.csv.columns.length - 1) + ' columns become telemetries'}}{{csvExample}}</small></dd>
                            </template>
                            <dt>Period</dt>
                            <dd v-if="pending.info.samples">{{period(pending.info.from, pending.info.to)}} <small v-if="sameEra(pending.info)">({{duration(pending.info.to - pending.info.from)}})</small></dd>
                            <dd v-else><small>No data in this file</small></dd>
                            <dt>Data</dt>
                            <dd :class="{'export-left-out': both && !pending.options.data}"><b class="export-mono">{{count(pending.info.samples)}}</b> {{pending.info.samples == 1 ? 'sample' : 'samples'}} in {{pending.info.telemetries.length}} {{pending.info.telemetries.length == 1 ? 'telemetry' : 'telemetries'}}
                                <small v-if="pending.info.telemetries.length">{{pending.info.created}} new<template v-if="pending.info.telemetries.length - pending.info.created"> · {{pending.info.telemetries.length - pending.info.created}} already here: their samples are added</template></small>
                            </dd>
                            <template v-if="pending.info.dashboards.length">
                                <dt>Dashboards</dt>
                                <dd :class="{'export-left-out': both && !pending.options.dashboards}"><span v-for="(final, original) in pending.info.dashboardNames" :key="original" class="export-dash">"{{original}}"<small v-if="final != original"> becomes "{{final}}"</small></span></dd>
                            </template>
                            <template v-if="pending.info.problems">
                                <dt>Problems</dt>
                                <dd class="export-warn">{{pending.info.problems}} {{pending.info.format == 'binary' ? 'packet' : 'line'}}{{pending.info.problems == 1 ? '' : 's'}} not understood: {{pending.info.problems == 1 ? 'it is' : 'they are'}} skipped</dd>
                            </template>
                        </dl>
                        <div v-if="pending.info.windowNeeded && pending.options.data" class="export-note"><b>!</b><span>Longer than your data window ({{duration(TP.state.dataTimeout)}}): the window will be set to <b>{{duration(pending.info.windowNeeded)}}</b> so that nothing is dropped.</span></div>
                        <div v-if="nothingToOpen" class="export-note"><b>!</b><span>Nothing in this file was understood. A text file holds lines of the text protocol (name:time:value), a CSV starts with a line of column names.</span></div>
                        <!-- A file that holds both: take the data, the dashboards, or both -->
                        <div v-if="both" class="export-take">
                            <b>Take from this file</b>
                            <label class="export-check"><input type="checkbox" v-model="pending.options.data"><span>Its data <small>({{count(pending.info.samples)}} samples)</small></span></label>
                            <label class="export-check"><input type="checkbox" v-model="pending.options.dashboards"><span>Its {{pending.info.dashboards.length == 1 ? 'dashboard' : pending.info.dashboards.length + ' dashboards'}}</span></label>
                        </div>
                        <label v-if="hasData && pending.info.samples && pending.options.data" class="export-check export-clear"><input type="checkbox" v-model="pending.options.clear"><span>Clear the current data first</span></label>
                        <div class="export-line export-buttons"><button type="button" class="export-btn export-grow" @click="cancel()">Cancel</button><button type="button" class="export-btn export-primary export-grow" :disabled="nothingToOpen || (both && !pending.options.data && !pending.options.dashboards)" @click="open()">Open</button></div>
                    </template>
                </div>
            </section>

            <!-- ============================================================ Files of this session -->
            <section v-if="files.length" class="export-section export-files">
                <header class="export-plain"><h3>Files of this session</h3></header>
                <div v-for="f in files" :key="f.id" class="export-card export-file" :class="'export-file-' + f.kind">
                    <div class="export-line">
                        <span class="export-kind" :title="f.kind == 'opened' ? 'Opened' : 'Saved'"><i :class="f.kind == 'opened' ? 'icofont-upload' : 'icofont-download'"></i></span>
                        <b class="export-grow export-name">{{f.name}}</b>
                        <span v-if="f.problems" class="export-pill">{{f.problems}} not understood</span>
                    </div>
                    <div class="export-sub">{{f.kind == 'opened' ? 'Opened' : 'Saved'}} {{clock(f.at)}}<template v-if="f.periodText"> · {{f.periodText}}</template></div>
                    <div class="export-sub">{{f.summary}}</div>
                    <div v-if="f.removed" class="export-sub"><i>Its data was removed ({{count(f.removed)}} samples).</i></div>
                    <div v-if="confirmRemove == f.id" class="export-line export-confirm" role="alertdialog">
                        <span class="export-grow">Remove its data? What else its telemetries hold in that period goes too.</span>
                        <button type="button" class="export-btn" @click="confirmRemove = 0">Cancel</button><button type="button" class="export-btn export-danger-btn" @click="remove(f)">Remove</button>
                    </div>
                    <div v-else class="export-line export-actions">
                        <template v-if="f.kind == 'opened'">
                            <button v-if="f.result.samples && !f.removed" type="button" class="export-link" :disabled="!ctx.activeDashboard" title="Zooms the dashboard on the period of this file" @click="showPeriod(f)">Show its period</button>
                            <button v-for="d in f.dashboards" :key="d" type="button" class="export-link" @click="showDashboard(d)">Open "{{d}}"</button>
                            <span class="export-grow"></span>
                            <button v-if="f.result.samples && !f.removed" type="button" class="export-link export-danger" @click="confirmRemove = f.id">Remove its data</button>
                        </template>
                        <button v-else type="button" class="export-link" title="Saves again with the same choices, on what there is now" @click="saveAgain(f)">Save again</button>
                    </div>
                </div>
            </section>
        </div>
    `;

    const vueCSS = `
        .export-layout {
            --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
            box-sizing: border-box; max-height: calc(100vh - 7rem); padding: 0.2rem 0.8rem 1rem 0.2rem; overflow-y: auto; scrollbar-width: thin; color: var(--color-text);
        }
        .export-layout button, .export-layout select, .export-layout input { font: inherit; color: inherit; }
        .export-grow { flex: 1 1 0; min-width: 0; }
        .export-mono { font-family: var(--mono); font-variant-numeric: tabular-nums; }
        .export-sub, .export-layout small { color: var(--color-text-muted); font-size: 0.9rem; line-height: 1.35; }
        .export-line { display: flex; align-items: center; gap: 0.5rem; min-width: 0; }
        .export-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

        /* The two sections: each has its color, its badge and its own frame, so that saving and opening cannot be mistaken */
        .export-section { --tone: var(--color-primary); margin-top: 0.9rem; }
        .export-section:first-child { margin-top: 0.3rem; }
        .export-in { --tone: hsl(268, 45%, 55%); }
        .export-out, .export-in { padding: 0 0.5rem 0.55rem; border-radius: 0.6rem; border: 1px solid color-mix(in srgb, var(--tone) 40%, transparent); background: color-mix(in srgb, var(--tone) 6%, transparent); }
        .export-section > header { display: flex; align-items: center; gap: 0.55rem; margin: 0 -0.5rem 0.5rem; padding: 0.4rem 0.6rem; border-radius: 0.55rem 0.55rem 0 0; background: color-mix(in srgb, var(--tone) 14%, transparent); }
        .export-section > header h2 { margin: 0; font-size: 1.15rem; font-weight: 700; line-height: 1.2; }
        .export-section > header span { color: var(--color-text-muted); font-size: 0.9rem; }
        .export-badge { flex: none; display: grid; place-items: center; width: 1.9rem; height: 1.9rem; border-radius: 50%; background: var(--tone); }
        .export-section > header .export-badge i { color: #fff; font-size: 1rem; }
        /* A section folds by sliding its height (the row of a grid goes from the height of its content to nothing) */
        .export-fold { display: grid; grid-template-rows: 1fr; transition: grid-template-rows var(--motion-fast, 0.15s) var(--ease-out, ease-out); }
        .export-fold-body { min-height: 0; overflow: hidden; padding: 3px; margin: -3px; } /* (room for the shadow of the card) */
        .export-section.folded { padding-bottom: 0; }
        .export-section.folded > header { margin-bottom: 0; border-radius: 0.55rem; }
        .export-section.folded .export-fold { grid-template-rows: 0fr; }
        .export-section.folded .export-fold-body { padding-top: 0; padding-bottom: 0; margin-top: 0; margin-bottom: 0; }
        @media (prefers-reduced-motion: reduce) { .export-fold { transition: none; } }
        .export-section > header.export-plain { background: none; margin: 0 0 0.35rem; padding: 0; }
        .export-plain h3 { margin: 0; font-size: 0.85rem; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: var(--color-text-muted); }

        .export-card { background: var(--color-bg-light); border-radius: 0.4rem; box-shadow: 0 0 3px var(--color-shadow); padding: 0.55rem 0.65rem 0.65rem; }
        .export-card + .export-card { margin-top: 0.5rem; }
        .export-field { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 0.4rem 0.6rem; align-items: center; }
        .export-field > label:nth-child(odd) { color: var(--color-text-muted); font-weight: 600; }
        .export-field-small { margin-top: 0.25rem; gap: 0.25rem 0.5rem; font-size: 0.95rem; }
        .export-seg { display: flex; border: 1px solid var(--color-bg-dark); border-radius: 0.7rem; overflow: hidden; background: var(--color-bg); }
        .export-seg button { flex: 1 1 auto; min-width: 0; padding: 0.3rem 0.4rem; font-size: 0.95rem; border: 0; background: none; font-weight: 600; color: var(--color-text-muted); white-space: nowrap; cursor: pointer; }
        .export-seg button + button { border-left: 1px solid var(--color-bg-dark); }
        .export-seg button.on { background: var(--color-bg-light); color: var(--color-primary); box-shadow: inset 0 -2px 0 var(--color-primary); }
        .export-seg button:disabled { opacity: 0.45; cursor: default; }
        .export-seg button:focus-visible, .export-btn:focus-visible, .export-link:focus-visible { outline: 2px solid var(--color-primary); outline-offset: -2px; }
        .export-layout select, .export-layout input[type=text] { min-width: 0; width: 100%; box-sizing: border-box; padding: 0.22rem 0.4rem; border: 1px solid var(--color-bg-dark); border-radius: 0.5rem; background: var(--color-bg-light); }
        .export-check { display: flex; align-items: baseline; gap: 0.4rem; cursor: pointer; }
        .export-check input { flex: none; margin: 0; position: relative; top: 0.12rem; accent-color: var(--color-primary); }
        .export-check.off { opacity: 0.5; cursor: default; }
        .export-card > .export-sub { margin-top: 0.4rem; }

        .export-inset { margin-top: 0.5rem; padding: 0.45rem 0.55rem 0.5rem; border-radius: 0.5rem; background: var(--color-bg); border: 1px solid var(--color-bg-dark); }
        .export-inset-head { display: flex; align-items: baseline; gap: 0.4rem; margin-bottom: 0.3rem; font-size: 0.9rem; }
        .export-inset-head b { font-weight: 700; }
        .export-inset-head span { color: var(--color-text-muted); }
        .export-inset-head button { border: 0; background: none; padding: 0 0.15rem; font-weight: 600; color: var(--color-primary); cursor: pointer; }
        .export-inset-head button:disabled { opacity: 0.4; cursor: default; }
        .export-inset > .export-sub { margin-top: 0.35rem; }
        .export-preview-head { margin-top: 0.55rem; }
        .export-list { max-height: 14rem; overflow-y: auto; scrollbar-width: thin; }
        .export-list .export-check { padding: 0.12rem 0; }
        .export-row-name { flex: 1 1 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .export-preview { overflow-x: auto; scrollbar-width: thin; }
        .export-preview table { border-collapse: collapse; width: 100%; font: 0.85rem/1.3 var(--mono); background: var(--color-bg-light); }
        .export-preview th, .export-preview td { border: 1px solid var(--color-bg-dark); padding: 0.1rem 0.35rem; text-align: right; white-space: nowrap; max-width: 9rem; overflow: hidden; text-overflow: ellipsis; }
        .export-preview th:first-child, .export-preview td:first-child { max-width: none; text-align: left; }
        .export-preview th { color: var(--color-text-muted); font-weight: 700; background: var(--color-bg); }
        .export-preview td.empty { background: repeating-linear-gradient(135deg, transparent 0 4px, color-mix(in srgb, var(--color-text-muted) 16%, transparent) 4px 5px); }

        .export-note { display: flex; gap: 0.45rem; margin-top: 0.5rem; padding: 0.4rem 0.55rem; border-radius: 0.5rem; background: color-mix(in srgb, var(--color-warning) 16%, transparent); font-size: 0.9rem; line-height: 1.35; }
        .export-note.good { background: color-mix(in srgb, var(--color-success) 14%, transparent); }
        .export-recap { display: flex; align-items: center; gap: 0.6rem; margin-top: 0.6rem; padding-top: 0.55rem; border-top: 1px solid var(--color-bg-dark); }
        .export-btn { display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem; padding: 0.4rem 0.9rem; border-radius: 0.7rem; border: 1px solid var(--color-bg-dark); background: var(--color-bg-light); font-weight: 600 !important; white-space: nowrap; cursor: pointer; }
        .export-btn:hover { border-color: var(--color-primary); }
        .export-btn.export-primary { background: var(--color-primary); border-color: var(--color-primary); color: #fff; }
        .export-btn.export-primary:hover { background: color-mix(in srgb, var(--color-primary) 88%, black); }
        .export-btn.export-danger-btn { background: var(--color-danger); border-color: var(--color-danger); color: #fff; }
        .export-btn:disabled { opacity: 0.45; cursor: default; }
        .export-link { border: 0; background: none; padding: 0.1rem 0.15rem; font-weight: 600 !important; color: var(--color-primary) !important; cursor: pointer; }
        .export-link:hover { text-decoration: underline; }
        .export-link:disabled { opacity: 0.4; cursor: default; text-decoration: none; }
        .export-link.export-danger { color: var(--color-danger) !important; }

        /* Import */
        .export-drop { display: flex; flex-direction: column; align-items: center; gap: 0.15rem; padding: 1rem 0.7rem; border: 2px dashed color-mix(in srgb, var(--tone) 55%, transparent); border-radius: 0.6rem; text-align: center; color: var(--color-text-muted); background: var(--color-bg-light); transition: background 0.1s, border-color 0.1s; }
        .export-drop b { color: var(--color-text); font-size: 1.05rem; }
        .export-drop.over { border-color: var(--tone); border-style: solid; background: color-mix(in srgb, var(--tone) 14%, var(--color-bg-light)); }
        .export-receipt-head { margin-bottom: 0.15rem; text-transform: uppercase; letter-spacing: 0.05em; font-size: 0.85rem; color: var(--color-text-muted); }
        .export-receipt { display: grid; grid-template-columns: max-content minmax(0, 1fr); margin: 0.4rem 0 0; }
        .export-receipt dt, .export-receipt dd { margin: 0; padding: 0.32rem 0; border-top: 1px dashed var(--color-bg-dark); }
        .export-receipt dt { padding-right: 0.8rem; color: var(--color-text-muted); font-weight: 600; }
        .export-receipt dt:first-of-type, .export-receipt dt:first-of-type + dd { border-top: 0; }
        .export-receipt dd > small { display: block; }
        .export-receipt .export-check { margin-top: 0.2rem; font-size: 0.95rem; }
        .export-dash { display: block; }
        .export-warn { color: color-mix(in srgb, var(--color-warning) 60%, var(--color-text)); font-weight: 600; }
        .export-clear { margin-top: 0.5rem; }
        .export-take { display: flex; flex-direction: column; gap: 0.2rem; margin-top: 0.55rem; padding: 0.45rem 0.55rem; border-radius: 0.5rem; background: var(--color-bg); border: 1px solid var(--color-bg-dark); }
        .export-take b { font-size: 0.9rem; }
        .export-left-out { opacity: 0.45; text-decoration: line-through; }
        .export-buttons { margin-top: 0.55rem; }
        .export-progress { height: 0.45rem; margin: 0.5rem 0 0.3rem; border-radius: 0.3rem; background: var(--color-bg-dark); overflow: hidden; }
        .export-progress i { display: block; height: 100%; background: var(--tone); transition: width 0.15s; }

        /* Files of the session */
        .export-kind { flex: none; display: grid; place-items: center; width: 1.5rem; height: 1.5rem; border-radius: 0.4rem; background: var(--color-text-muted); }
        .export-file .export-kind i { color: #fff; font-size: 0.8rem; }
        .export-file-opened .export-kind { background: hsl(268, 45%, 55%); }
        .export-file-saved .export-kind { background: var(--color-primary); }
        .export-file > .export-sub { margin-top: 0.15rem; }
        .export-actions { margin-top: 0.3rem; flex-wrap: wrap; gap: 0.2rem 0.6rem; }
        .export-confirm { margin-top: 0.4rem; font-size: 0.9rem; line-height: 1.3; }
        .export-confirm .export-btn { padding: 0.25rem 0.6rem; }
        .export-pill { flex: none; padding: 0 0.5rem; border-radius: 1rem; font-size: 0.85rem; font-weight: 600; border: 1px solid var(--color-warning); background: color-mix(in srgb, var(--color-warning) 14%, transparent); }
    `;
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
                tick: 0,              // What there is to save is not reactive (raw data): measured again on a timer
                what: "all",          // "all", "screen" (what the displayed dashboard shows) or "choose" (see chosen)
                when: "all",          // "all", "zoom" (what the dashboard is zoomed on) or "last" (the last minute)
                format: "binary",
                withDashboards: true,
                chosen: {},           // Telemetry id -> chosen, for "choose"
                csv: { layout: "columns", separator: ",", time: "iso" },
                saved: null,          // What the last save has to say: {text, skipped}
                pending: null,        // The file being opened: {file, state: "reading" | "ready" | "opening" | "error", progress, info, options, error, run}
                queue: [],            // Files waiting for their turn
                dragging: false,      // A file is being dragged over the page
                confirmRemove: 0,     // Id of the file whose removal is being confirmed
            };
        },
        computed: {
            files() { return exportHistory.list; },
            whatOptions() {
                return [{ id: "all", label: "Everything" }, { id: "screen", label: "On screen", disabled: !this.ctx.activeDashboard, title: "What the displayed dashboard shows" }, { id: "choose", label: "Choose…" }];
            },
            whenOptions() {
                this.tick;
                return [{ id: "all", label: "All" }, { id: "zoom", label: "Zoomed", disabled: !exportZoom(this.TP, this.ctx.activeDashboard), title: "The period the dashboard is zoomed on (drag on a chart to zoom)" }, { id: "last", label: "Last min" }];
            },
            formatOptions() { return EXPORT_FORMATS.map((f) => ({ id: f.id, label: f.label, title: f.note })); },
            layoutOptions() { return [{ id: "columns", label: "Columns" }, { id: "lines", label: "Lines" }]; },
            formatNote() { return EXPORT_FORMATS.find((f) => f.id === this.format).note; },
            // Dashboards that go in the file: the displayed one with "On screen", all of them otherwise
            dashboardNames() {
                const names = Object.keys(this.TP.dashboards.dashboards);
                if (this.what === "screen") return this.ctx.activeDashboard ? [this.ctx.activeDashboard.name] : [];
                return names;
            },
            telemetryCount() { this.tick; return Object.keys(this.TP.datastore.telemetries).length; },
            hasData() { this.tick; return Object.values(this.TP.datastore.telemetries).some((telem) => Object.keys(telem.data).length > 0); },
            // The checklist: a line per label (its telemetries together), then the telemetries without label
            rows() {
                this.tick;
                const P = this.TP.protocol, groups = {}, rows = [];
                for (const telem of Object.values(this.TP.datastore.telemetries)) {
                    const label = telem.getAttribute(P.TELEM_ATTR_VIEW_LABEL);
                    const item = { id: telem.id, bytes: telem.getMemoryUsage().bytes, usable: this.format !== "csv" || Object.keys(telem.data).some((type) => EXPORT_CSV_TYPES.includes(type)) };
                    if (label) (groups[label] = groups[label] || []).push(item);
                    else rows.push({ key: "t" + telem.id, label: telem.getAttribute(P.TELEM_ATTR_NAME) || String(telem.id), tip: this.TP.view.telemetryTip(telem), items: [item] });
                }
                const all = Object.keys(groups).sort().map((label) => ({ key: "l" + label, label, items: groups[label] })).concat(rows.sort((a, b) => a.label.localeCompare(b.label)));
                for (const row of all) {
                    const usable = row.items.filter((item) => item.usable);
                    const on = usable.filter((item) => this.chosen[item.id]).length;
                    row.count = row.items.length;
                    row.usable = usable.length > 0;
                    row.state = on === 0 ? "off" : (on === usable.length ? "on" : "some");
                    row.size = exportFormatBytes(row.items.reduce((sum, item) => sum + item.bytes, 0));
                }
                return all;
            },
            chosenCount() { this.tick; return Object.keys(this.chosen).filter((id) => this.chosen[id] && this.TP.datastore.getTelemetry(Number(id))).length; },
            // What the library is asked: see TP.files
            options() {
                this.tick;
                const options = { dashboards: this.format !== "csv" && this.withDashboards ? this.dashboardNames : false };
                if (this.what === "screen") options.telemetries = exportOnScreen(this.TP, this.ctx.activeDashboard);
                else if (this.what === "choose") options.telemetries = Object.keys(this.chosen).filter((id) => this.chosen[id]).map(Number);
                if (this.when === "zoom") { const zoom = exportZoom(this.TP, this.ctx.activeDashboard); if (zoom) Object.assign(options, zoom); }
                else if (this.when === "last") { const span = this.TP.datastore.getTimeSpan(); if (span) options.from = span.newest - 60; }
                if (this.format === "csv") Object.assign(options, this.csv);
                return options;
            },
            estimate() { return this.TP.files.estimate(this.format, this.options); },
            periodText() {
                this.tick;
                if (this.when === "zoom" && this.options.from !== undefined) return exportFormatDuration(this.options.to - this.options.from) + ", as zoomed";
                if (this.when === "last") return "the last minute";
                const span = this.TP.datastore.getTimeSpan();
                return span ? exportFormatDuration(span.duration) : "";
            },
            fileName() { this.tick; return exportFileName(this.format); },
            canSave() { return this.estimate.samples > 0 || (this.options.dashboards && this.options.dashboards.length > 0); },
            // The first lines of the CSV, a few columns of them
            preview() {
                if (this.format !== "csv") return { header: [], rows: [], more: 0 };
                const table = this.TP.files.previewCSV(this.options, 4), shown = 5;
                const cut = (cells) => cells.slice(0, shown).map((cell) => typeof cell === "number" ? String(cell) : cell);
                return { header: cut(table.header), rows: table.rows.map(cut), more: Math.max(0, table.header.length - shown) };
            },
            // The file holds data and dashboards: each can be taken without the other
            both() { const info = this.pending && this.pending.info; return !!info && info.samples > 0 && info.dashboards.length > 0; },
            nothingToOpen() { const info = this.pending && this.pending.info; return !!info && info.samples === 0 && info.dashboards.length === 0; },
            csvExample() {
                const info = this.pending.info, prefix = this.pending.options.prefix || "";
                const first = info.csv.columns.find((column, i) => i !== info.csv.timeColumn && column);
                return info.csv.layout === "lines" || !first ? "" : ', for example "' + prefix + first + '"';
            },
        },
        watch: {
            // "Zoomed" and "On screen" stop making sense when the dashboard goes or stops being zoomed
            whenOptions(options) { if (options.find((o) => o.id === this.when).disabled) this.when = "all"; },
            whatOptions(options) { if (options.find((o) => o.id === this.what).disabled) this.what = "all"; },
            what(value) { this.saved = null; if (value === "choose" && !Object.keys(this.chosen).length) this.chooseAll(true); },
            when() { this.saved = null; },
            format() { this.saved = null; },
            // Files dropped on the page (main.js) come here
            "ctx.droppedFiles"(files) { this.takeDropped(files); },
        },
        mounted() {
            this.timer = setInterval(() => { this.tick++; }, 1000);
            // The drop itself is handled for the whole page (main.js): here, only the look of the drop zone
            let depth = 0;
            const hasFiles = (event) => event.dataTransfer && Array.from(event.dataTransfer.types).includes("Files");
            this.onDrag = { enter: (e) => { if (hasFiles(e)) { depth++; this.dragging = true; } }, leave: (e) => { if (hasFiles(e)) { depth = Math.max(0, depth - 1); this.dragging = depth > 0; } }, drop: () => { depth = 0; this.dragging = false; } };
            window.addEventListener("dragenter", this.onDrag.enter);
            window.addEventListener("dragleave", this.onDrag.leave);
            window.addEventListener("drop", this.onDrag.drop);
            this.takeDropped(this.ctx.droppedFiles);
        },
        unmounted() {
            clearInterval(this.timer);
            window.removeEventListener("dragenter", this.onDrag.enter);
            window.removeEventListener("dragleave", this.onDrag.leave);
            window.removeEventListener("drop", this.onDrag.drop);
            if (this.pending) this.pending.run++; // (what was being read stops)
        },
        methods: {
            count: exportFormatCount,
            bytes: exportFormatBytes,
            duration: exportFormatDuration,
            period(from, to) { return exportFormatPeriod(from, to); },
            sameEra(info) { return (info.from < 978307200) === (info.to < 978307200); }, // Both times of a device, or both dates
            clock(date) { return [date.getHours(), date.getMinutes()].map((n) => String(n).padStart(2, "0")).join(":"); },
            formatName(info) {
                if (info.format === "binary") return "Binary data file";
                if (info.format === "csv") return "CSV";
                return info.samples === 0 && info.dashboards.length ? "Dashboards, as text" : "Text: lines of the text protocol";
            },

            // ------------------------------------------------------------ Export
            chooseAll(on) {
                const chosen = {};
                if (on) for (const row of this.rows) for (const item of row.items) if (item.usable) chosen[item.id] = true;
                this.chosen = chosen;
            },
            chooseOnScreen() {
                const chosen = {};
                for (const id of exportOnScreen(this.TP, this.ctx.activeDashboard)) chosen[id] = true;
                this.chosen = chosen;
            },
            chooseRow(row, on) {
                const chosen = Object.assign({}, this.chosen);
                for (const item of row.items) { if (on && item.usable) chosen[item.id] = true; else delete chosen[item.id]; }
                this.chosen = chosen;
            },
            save() {
                const format = this.format, options = this.options;
                const run = { binary: this.TP.files.exportBinary, text: this.TP.files.exportText, csv: this.TP.files.exportCSV }[format];
                const out = run(options);
                const name = exportFileName(format);
                const size = out.parts.reduce((sum, part) => sum + part.length, 0);
                exportDownload(out.parts, name, EXPORT_FORMATS.find((f) => f.id === format).type);
                const unit = format === "csv" ? "values" : "samples";
                let text = "Saved " + name + ": " + exportFormatCount(out.samples) + " " + unit + ", " + exportFormatBytes(size) + ".";
                if (out.skipped) text += " " + exportFormatCount(out.skipped) + " " + (out.skipped === 1 ? "sample" : "samples") + " could not be written in this format" + (format === "binary" ? "." : ": the binary file keeps everything.");
                this.saved = { text, skipped: out.skipped };
                const what = { all: "everything", screen: "what was on screen", choose: (options.telemetries || []).length + " telemetries" }[this.what];
                exportHistory.list.unshift({
                    id: exportHistory.nextId++, kind: "saved", name, at: new Date(), problems: 0, periodText: "",
                    summary: what + (this.periodText ? ", " + this.periodText : "") + " · " + exportFormatCount(out.samples) + " " + unit + " · " + exportFormatBytes(size),
                    settings: { what: this.what, when: this.when, format, withDashboards: this.withDashboards, chosen: Object.assign({}, this.chosen), csv: Object.assign({}, this.csv) },
                });
            },
            saveAgain(file) {
                Object.assign(this, file.settings, { chosen: Object.assign({}, file.settings.chosen), csv: Object.assign({}, file.settings.csv) });
                this.$nextTick(() => { if (this.canSave) this.save(); });
            },

            // ------------------------------------------------------------ Import
            takeDropped(files) {
                if (!files || !files.length) return;
                this.ctx.droppedFiles = null;
                this.pick(files);
            },
            pick(files) {
                this.queue.push(...Array.from(files || []).map((file) => Vue.markRaw(file))); // (a File behind a proxy cannot be read)
                this.next();
            },
            next() {
                if (this.pending || !this.queue.length) return;
                const file = this.queue.shift();
                this.pending = { file, state: "reading", progress: 0, info: null, error: "", run: 0,
                    options: { data: true, dashboards: true, clear: false, serial: false, separator: "", timeColumn: -1, timeUnit: "", prefix: "", format: /\.csv$/i.test(file.name) ? "csv" : undefined } };
                this.describe();
            },
            // What the library is told about the file: only what was chosen (the rest is found in the file)
            importOptions(extra) {
                const o = this.pending.options, options = Object.assign({}, extra);
                if (o.format) options.format = o.format;
                if (o.serial) options.serial = true;
                if (o.separator) options.separator = o.separator;
                if (o.timeColumn >= 0) options.timeColumn = o.timeColumn;
                if (o.timeUnit) options.timeUnit = o.timeUnit;
                if (o.prefix) options.prefix = o.prefix;
                return options;
            },
            // Gives a file to an import of the library, piece by piece. Returns its result, undefined when it was cancelled meanwhile.
            async read(options) {
                const pending = this.pending, run = ++pending.run, file = pending.file;
                const job = this.TP.files.createImport(options);
                pending.progress = 0;
                for (let at = 0; at < file.size || at === 0; at += EXPORT_PIECE) {
                    const piece = await file.slice(at, at + EXPORT_PIECE).arrayBuffer();
                    if (this.pending !== pending || pending.run !== run) { if (options.dryRun) job.finish(); return undefined; }
                    job.add(piece);
                    pending.progress = file.size ? Math.min(1, (at + EXPORT_PIECE) / file.size) : 1;
                    await new Promise((resolve) => setTimeout(resolve, 0)); // Let the page breathe (and the progress show)
                    if (this.pending !== pending || pending.run !== run) { if (options.dryRun) job.finish(); return undefined; }
                }
                return job.finish();
            },
            // Reads the file without storing anything, to say what it holds
            async describe() {
                const pending = this.pending;
                pending.state = "reading";
                try {
                    const info = await this.read(this.importOptions({ dryRun: true }));
                    if (info === undefined) return;
                    pending.info = Vue.markRaw(info);
                    if (info.csv) Object.assign(pending.options, { separator: info.csv.separator, timeColumn: info.csv.timeColumn, timeUnit: info.csv.timeUnit || "iso" });
                    pending.state = "ready";
                }
                catch (e) { pending.error = "This file could not be read (" + (e && e.message ? e.message : e) + ")."; pending.state = "error"; }
            },
            async open() {
                const pending = this.pending;
                const take = { data: pending.options.data, dashboards: pending.options.dashboards };
                if (pending.options.clear && take.data) this.TP.datastore.clearData();
                pending.state = "opening";
                let result;
                try { result = await this.read(this.importOptions({ extendWindow: true, data: take.data, dashboards: take.dashboards })); }
                catch (e) { pending.error = "This file could not be read (" + (e && e.message ? e.message : e) + ")."; pending.state = "error"; return; }
                if (result === undefined) return;
                const parts = [];
                if (result.samples) parts.push(exportFormatCount(result.samples) + (result.samples === 1 ? " sample · " : " samples · ") + result.telemetries.length + (result.telemetries.length === 1 ? " telemetry" : " telemetries"));
                if (result.dashboards.length) parts.push((result.dashboards.length === 1 ? "dashboard " : "dashboards ") + result.dashboards.map((d) => '"' + d + '"').join(", "));
                if (result.windowExtended) parts.push("data window set to " + exportFormatDuration(this.TP.state.dataTimeout));
                exportHistory.list.unshift({
                    id: exportHistory.nextId++, kind: "opened", name: pending.file.name, at: new Date(), problems: result.problems, removed: 0,
                    periodText: result.samples ? exportFormatPeriod(result.from, result.to) + (this.sameEra(result) ? " (" + exportFormatDuration(result.to - result.from) + ")" : "") : "",
                    summary: parts.join(" · ") || (take.data || take.dashboards ? "Nothing was understood" : "Nothing was taken"), dashboards: result.dashboards, result: Vue.markRaw(result),
                });
                if (result.dashboards.length && (!this.ctx.activeDashboard || !result.samples)) this.showDashboard(result.dashboards[0]);
                this.pending = null;
                this.next();
            },
            cancel() {
                if (this.pending) this.pending.run++;
                this.pending = null;
                this.next();
            },

            // ------------------------------------------------------------ Files of the session
            showDashboard(name) {
                const dashboard = this.TP.dashboards.getDashboard(name);
                if (dashboard) this.ctx.activeDashboard = dashboard;
            },
            // Zooms the displayed dashboard on the period of a file (a file of yesterday is far from the live data)
            showPeriod(file) {
                const dashboard = this.ctx.activeDashboard;
                if (!dashboard) return;
                const margin = Math.max(0.5, (file.result.to - file.result.from) * 0.02);
                // (held on that period: it is not live data)
                Vue.toRaw(this.TP).view.zoomTo(dashboard.getGroupName(), file.result.from - margin, file.result.to + margin);
            },
            remove(file) {
                file.removed = this.TP.files.removeImported(file.result);
                this.confirmRemove = 0;
                this.tick++;
            },
        },
        template: vueHTML,
    });
}
