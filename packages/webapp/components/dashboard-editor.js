/*
 * Dashboard editor.
 *
 * Lives in the webapp: the library only provides what any application needs (view.clone(), view.dispose(), TELEPLOT.view.removeView(),
 * telemetry list helpers, the "title" option...).
 * Edit mode turns a dashboard (a tree of layouts, stacks and views) into something that can be rearranged. This file owns what
 * happens ON the dashboard; the forms around it (settings panel, edit button) are Vue components:
 *
 * - Structure commands (no DOM involved, usable from scripts and tests): select, resize, moveView, moveBy, duplicateView,
 *   removeView, setContainerType, addView, dropTelemetries.
 * - Edit chrome (DOM, drawn over each view and container while edit mode is on):
 *     - a "pill" per element (blue: view, orange: container, purple: nested container) labelled with the element type
 *       (Chart, Values, Log, Row, Column, Grid, Stack - never the content title). Click selects, drag moves.
 *     - the selected pill unfolds a second, connected line "w - n +" / "h - n +" (width weight, or columns in a grid; height step).
 *     - views are inert (a shield covers them: no cursor, zoom or hover) but keep updating, and still accept telemetry drops.
 *     - every container reserves a band at its top so its pill never covers its children.
 *     - dragging a pill shows a blue insertion line in the hovered container (empty containers accept drops too).
 *     - "+" slots at every seam between views and at the end of every container (and in empty ones): click opens a menu
 *       (Chart, Values, Log, Row, Column, Grid, Stack) that creates the element there. They are always visible in edit mode.
 *   Outside edit mode the same slots appear only while a telemetry is being dragged from the Telemetries panel: dropping on a
 *   slot creates the view(s) suited to the telemetry (see TELEPLOT.view.suggestViewType), dropping on a view still adds it as a series,
 *   and dropping anywhere else on the dashboard (free room of a container, around or under the views) adds the view(s) at the end of
 *   the container under the pointer: no need to aim.
 *   Keyboard (an element selected): arrows resize (left/right width, up/down height), Alt+arrows move inside the parent,
 *   Escape cancels a drag, then deselects.
 *
 * Usage: const editor = initDashboardEditor(TP); editor.setRoot(dashboard.getView()); editor.setEnabled(true); and call editor.refresh() regularly.
 * Nothing selected means "the dashboard itself" (the root has no pill).
 */
function initDashboardEditor(TP) {
    const E = {};

    E.WIDTH_MIN = 1;  E.WIDTH_MAX = 12; // Width: weight among siblings (flex-grow) in a row, number of columns in a grid
    E.NEW_VIEW_HEIGHT = 6;
    E.HEIGHT_MIN = 0; E.HEIGHT_MAX = 12; // Height step: minimum height of 4*h em
    E.DRAG_THRESHOLD = 6;               // px before a pill press becomes a drag

    // Reactive: applications bind their panels on it
    E.state = Vue.reactive({
        enabled: false,
        rootId: "",     // Dashboard layout being edited
        selectedId: "", // "" = nothing selected (dashboard settings)
        dragging: false,
        telemetryDrag: false, // A telemetry of the side panel is being dragged: the "+" slots show up even outside edit mode
        revision: 0     // Incremented by every structure change
    });

    // ------------------------------------------------------------------ Tree helpers

    // Children of a layout come out of a reactive array as proxies: views are compared by id, never by identity
    const same = (a, b) => !!a && !!b && a.id === b.id;
    const indexOf = (container, view) => container.views.findIndex((v) => v.id === view.id);

    E.isContainer = (view) => !!view && Array.isArray(view.views);
    E.isStack = (view) => !!view && view.layout !== undefined && view.layout.type === "stack";
    E.getRoot = () => TP.view.getView(E.state.rootId);

    // Name of the element type, as written on its pill
    E.typeLabel = function(view) {
        if (!view) return "";
        if (E.isContainer(view)) return { column: "Column", stack: "Stack", grid: "Grid" }[view.layout.type] || "Row";
        switch (view.type) {
            case "teleplot-chart": return "Chart";
            case "teleplot-current-value": return "Values";
            case "teleplot-log": return "Log";
        }
        return view.name ? view.name.charAt(0).toUpperCase() + view.name.slice(1) : "View";
    };

    E.getParent = function(view) {
        let root = E.getRoot();
        if (!root || !view) return undefined;
        let visit = (container) => {
            for (let child of container.views) {
                if (same(child, view)) return container;
                if (E.isContainer(child)) { let found = visit(child); if (found) return found; }
            }
            return undefined;
        };
        return visit(root);
    };

    // Root first, the view last. Empty when the view is not in the edited dashboard.
    E.getPath = function(view) {
        let root = E.getRoot();
        if (!root || !view) return [];
        if (same(view, root)) return [root];
        let path = [];
        for (let v = view; v; v = E.getParent(v)) { path.unshift(v); if (same(v, root)) return path; }
        return [];
    };

    // Is "view" inside "container" (or the container itself) ?
    E.contains = function(container, view) {
        if (same(container, view)) return true;
        if (!E.isContainer(container)) return false;
        return container.views.some((child) => E.contains(child, view));
    };

    E.getSelected = () => E.state.selectedId ? TP.view.getView(E.state.selectedId) : undefined;

    E.__changed = function() { E.state.revision++; };

    // ------------------------------------------------------------------ Mode and selection

    E.setRoot = function(view) {
        let id = view ? view.id : "";
        if (E.state.rootId === id) return;
        E.state.rootId = id;
        E.state.selectedId = "";
        E.cancelDrag();
        closeMenu();
        E.__changed();
    };

    E.setEnabled = function(enabled) {
        enabled = !!enabled;
        if (E.state.enabled === enabled) return;
        E.state.enabled = enabled;
        if (!enabled) { E.cancelDrag(); E.state.selectedId = ""; closeMenu(); }
        E.refresh();
    };

    E.select = function(viewId) {
        if (!viewId) { E.state.selectedId = ""; return true; }
        let view = TP.view.getView(viewId);
        if (!view || same(view, E.getRoot())) { E.state.selectedId = ""; return false; }
        let path = E.getPath(view);
        if (!path.length) return false;
        // Reveal it: a view hidden behind another tab of a stack becomes the displayed one
        for (let i = 0; i < path.length - 1; i++) {
            if (E.isStack(path[i])) path[i].layout.selected = path[i + 1].id;
        }
        E.state.selectedId = view.id;
        return true;
    };

    // ------------------------------------------------------------------ Structure commands

    E.clamp = (value, min, max) => Math.max(min, Math.min(max, value));

    E.setSize = function(viewId, dimension, value) {
        let view = TP.view.getView(viewId);
        if (!view || same(view, E.getRoot())) return false;
        value = Math.round(Number(value));
        if (!Number.isFinite(value)) return false;
        if (dimension === "width") view.layout.width = E.clamp(value, E.WIDTH_MIN, E.WIDTH_MAX);
        else if (dimension === "height") view.layout.height = E.clamp(value, E.HEIGHT_MIN, E.HEIGHT_MAX);
        else return false;
        return true;
    };

    E.resize = function(viewId, dimension, delta) {
        let view = TP.view.getView(viewId);
        if (!view || (dimension !== "width" && dimension !== "height")) return false;
        return E.setSize(viewId, dimension, view.layout[dimension] + delta);
    };

    E.isGrid = (view) => !!view && view.layout !== undefined && view.layout.type === "grid";

    // Share of the parent's width taken by a view, in percent (weights of its siblings, columns of a grid; a stack displays one view at a time)
    E.getShare = function(view) {
        let parent = E.getParent(view);
        if (!parent || E.isStack(parent)) return 100;
        if (E.isGrid(parent)) {
            let columns = Math.max(1, parent.grid.columns);
            return Math.round(100 * E.clamp(view.layout.width, 1, columns) / columns);
        }
        let total = parent.views.reduce((sum, v) => sum + v.layout.width, 0);
        return total > 0 ? Math.round(100 * view.layout.width / total) : 100;
    };

    E.getMinHeightEm = (view) => 4 * view.layout.height;

    // Move a view into a container at an index (default: the end). A container can't go inside itself or its descendants.
    E.moveView = function(viewId, containerId, index = -1) {
        let view = TP.view.getView(viewId);
        let target = TP.view.getView(containerId);
        if (!view || !target || !E.isContainer(target) || same(view, E.getRoot())) return false;
        if (E.contains(view, target)) return false;
        let source = E.getParent(view);
        if (!source) return false;
        let oldIndex = indexOf(source, view);
        if (index < 0 || index > target.views.length) index = target.views.length;
        if (source.id === target.id && oldIndex < index) index--; // the view leaves its place before being inserted
        if (source.id === target.id && oldIndex === index) return true;

        source.removeView(view.id);
        if (source.id !== target.id) TP.view.disposeView(view, true); // new place = new DOM element: views mount again there
        target.addView(view, index);
        if (E.isStack(target)) target.layout.selected = view.id;
        E.__changed();
        return true;
    };

    // Move a view by n places inside its parent (Alt+arrows)
    E.moveBy = function(viewId, delta) {
        let view = TP.view.getView(viewId);
        let parent = E.getParent(view);
        if (!parent) return false;
        let index = indexOf(parent, view);
        let target = index + delta;
        if (target < 0 || target >= parent.views.length) return false;
        // Same parent: remove then insert at the new place (moveView counts the index before removal)
        return E.moveView(viewId, parent.id, delta > 0 ? target + 1 : target);
    };

    // Copy of a view (and of its content for containers), placed after the original. Returns the copy.
    E.duplicateView = function(viewId) {
        let view = TP.view.getView(viewId);
        let parent = E.getParent(view);
        if (!view || !parent) return undefined;
        let copy = view.clone();
        parent.addView(copy, indexOf(parent, view) + 1);
        if (E.isStack(parent)) parent.layout.selected = copy.id;
        E.state.selectedId = copy.id;
        E.__changed();
        return copy;
    };

    E.removeView = function(viewId) {
        let view = TP.view.getView(viewId);
        let parent = E.getParent(view);
        if (!view || !parent) return false;
        if (E.state.selectedId && E.contains(view, TP.view.getView(E.state.selectedId))) E.state.selectedId = "";
        parent.removeView(view.id);
        TP.view.removeView(view);
        E.__changed();
        return true;
    };

    // Change what a container is: "row", "column", "grid" or "stack". A stack is another kind of view: the container is replaced by a new one
    // holding the same children (the root of the dashboard can only switch between row, column and grid).
    E.setContainerType = function(viewId, type) {
        let view = TP.view.getView(viewId);
        if (!E.isContainer(view) || !["row", "column", "grid", "stack"].includes(type)) return view;
        if (view.layout.type === type) return view;
        let wasStack = E.isStack(view);
        if (!wasStack && type !== "stack") { view.layout.type = type; E.__changed(); return view; }

        let parent = E.getParent(view);
        if (!parent) return view; // root
        let replacement = type === "stack" ? new TP.view.ViewStack("", view.group) : new TP.view.ViewLayout("", view.group);
        if (type !== "stack") replacement.layout.type = type;
        replacement.layout.width = view.layout.width;
        replacement.layout.height = view.layout.height;
        let children = view.views.slice();
        for (let child of children) { view.removeView(child.id); TP.view.disposeView(child, true); }
        for (let child of children) replacement.addView(child);
        let wasSelected = E.state.selectedId === view.id;
        let index = indexOf(parent, view);
        parent.removeView(view.id);
        TP.view.removeView(view);
        parent.addView(replacement, index);
        if (E.isStack(parent)) parent.layout.selected = replacement.id;
        if (wasSelected) E.state.selectedId = replacement.id;
        E.__changed();
        return replacement;
    };

    // ------------------------------------------------------------------ Adding views

    E.ADD_TYPES = ["chart", "values", "log", "row", "column", "grid", "stack"]; // What the "+" menu offers
    E.ADD_LABELS = { chart: "Chart", values: "Values", log: "Log", row: "Row", column: "Column", grid: "Grid", stack: "Stack" };

    // New element in a container at an index (default: the end): a view ("chart", "values", "log", optionally showing telemetries)
    // or an empty container ("row", "column", "grid", "stack"). Selected while editing. Returns it (undefined for an unknown type or container).
    E.addView = function(type, containerId, index = -1, telemetries = []) {
        let target = TP.view.getView(containerId);
        if (!target || !E.isContainer(target)) return undefined;
        let view;
        if (type === "stack") view = new TP.view.ViewStack("", target.group);
        else if (type === "row" || type === "column" || type === "grid") {
            view = new TP.view.ViewLayout("", target.group);
            view.layout.type = type;
            if (type === "grid") view.layout.align = "stretch"; // Views of a line share its height
        }
        else view = TP.view.createView(type, telemetries, target.group);
        if (!view) return undefined;
        if (!E.isContainer(view)) view.layout.height = E.NEW_VIEW_HEIGHT; // A bit taller than the library default: new views start comfortable
        if (index < 0 || index > target.views.length) index = target.views.length;
        target.addView(view, index);
        if (E.isStack(target)) target.layout.selected = view.id;
        if (E.state.enabled) E.state.selectedId = view.id;
        E.__changed();
        return view;
    };

    // Dropped telemetries (ids) become views at an index of a container: one view per kind of data (numbers together in a chart,
    // the rest together in a values view), in the order the kinds appear. Unknown ids are ignored. Returns the new views.
    E.dropTelemetries = function(ids, containerId, index = -1) {
        let groups = new Map();
        for (let id of ids) {
            if (TP.datastore.getTelemetry(id) === undefined) continue;
            let type = TP.view.suggestViewType(id);
            if (!groups.has(type)) groups.set(type, []);
            if (!groups.get(type).includes(id)) groups.get(type).push(id);
        }
        let created = [];
        for (let [type, list] of groups) {
            let view = E.addView(type, containerId, index < 0 ? -1 : index + created.length, list);
            if (view) created.push(view);
        }
        return created;
    };

    // Geometry of the "+" slots of a container, from the rectangles of its children ([{index, rect}] in display order).
    // Slot: {index (where a new element would go), vertical, x, y, length} (a vertical slot is a seam between side-by-side children),
    // or {index: 0, empty: true, x, y} for a container without children. "inset" moves the two end slots inside the container,
    // so that they stay away from the slots of the parent. A row that wraps gives each of its lines its own end slots.
    E.slotLayout = function(horizontal, rect, kids, inset = 0) {
        if (!kids.length) return [{ index: 0, empty: true, x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2 }];
        const start = (r) => horizontal ? r.left : r.top, end = (r) => horizontal ? r.right : r.bottom;
        const cross = (r) => horizontal ? [r.top, r.bottom] : [r.left, r.right];
        const make = (index, at, c0, c1) => horizontal
            ? { index, vertical: true, x: at, y: c0, length: c1 - c0 }
            : { index, vertical: false, x: c0, y: at, length: c1 - c0 };
        let out = [make(kids[0].index, start(kids[0].rect) + inset, ...cross(kids[0].rect))];
        for (let i = 1; i < kids.length; i++) {
            let a = kids[i - 1], b = kids[i];
            let [a0, a1] = cross(a.rect), [b0, b1] = cross(b.rect);
            if (Math.min(a1, b1) - Math.max(a0, b0) > 1) out.push(make(b.index, (end(a.rect) + start(b.rect)) / 2, Math.min(a0, b0), Math.max(a1, b1)));
            else { // next line of a wrapping row
                out.push(make(a.index + 1, end(a.rect) - inset, a0, a1));
                out.push(make(b.index, start(b.rect) + inset, b0, b1));
            }
        }
        let last = kids[kids.length - 1];
        out.push(make(last.index + 1, end(last.rect) - inset, ...cross(last.rect)));
        return out;
    };

    // ------------------------------------------------------------------ Drag and drop of pills

    let drag = undefined; // {id, startX, startY, active, ghost, line, target}

    // Where would the dragged view land if released at (x, y) ? {container, index, rect, line}
    E.computeDrop = function(x, y, draggedId) {
        let dragged = TP.view.getView(draggedId);
        let target = undefined, targetEl = undefined;
        for (let el of document.elementsFromPoint(x, y)) {
            if (!el.hasAttribute || !el.hasAttribute("data-tp-edit")) continue;
            let view = TP.view.getView(el.getAttribute("data-tp-edit"));
            if (!view || !E.isContainer(view) || (dragged && E.contains(dragged, view))) continue;
            target = view; targetEl = el; break;
        }
        if (!target) return undefined;

        // Rendered element of each child: the wrapper, or the tab for a stack (only the selected child is displayed)
        let tabs = E.isStack(target) ? Array.from(targetEl.querySelectorAll(".teleplot-js-view-stack-header-item")).filter((t) => t.closest("[data-tp-edit]") === targetEl) : [];
        let kids = [];
        target.views.forEach((child, i) => {
            let el = E.isStack(target) ? tabs[i] : document.getElementById(child.divId);
            if (el) kids.push({ index: i, rect: el.getBoundingClientRect() });
        });
        let result = { container: target, el: targetEl, index: target.views.length, line: undefined };
        if (!kids.length) return result;

        let horizontal = target.layout.type !== "column";
        let distance = (r) => { // distance from the point to the rectangle (0 inside)
            let dx = Math.max(r.left - x, 0, x - r.right), dy = Math.max(r.top - y, 0, y - r.bottom);
            return Math.hypot(dx, dy);
        };
        let nearest = kids.reduce((best, k) => distance(k.rect) < distance(best.rect) ? k : best, kids[0]);
        let r = nearest.rect;
        let after = horizontal ? x > (r.left + r.right) / 2 : y > (r.top + r.bottom) / 2;
        result.index = nearest.index + (after ? 1 : 0);
        result.line = horizontal
            ? { vertical: true,  x: after ? r.right : r.left, y: r.top, length: r.height }
            : { vertical: false, x: r.left, y: after ? r.bottom : r.top, length: r.width };
        return result;
    };

    function startDrag() {
        drag.active = true;
        E.state.dragging = true;
        E.select(drag.id);
        let view = TP.view.getView(drag.id);
        let el = document.getElementById(view.divId);
        if (el) el.classList.add("tp-dragsrc");
        drag.ghost = document.createElement("div");
        drag.ghost.className = "tp-ghost";
        drag.ghost.textContent = E.typeLabel(view);
        document.body.appendChild(drag.ghost);
        drag.line = document.createElement("div");
        document.body.appendChild(drag.line);
        document.body.classList.add("tp-dragging");
    }

    function moveDrag(event) {
        drag.ghost.style.left = (event.clientX + 12) + "px";
        drag.ghost.style.top = (event.clientY + 10) + "px";
        if (drag.target && drag.target.el) drag.target.el.classList.remove("tp-droptarget");
        let target = E.computeDrop(event.clientX, event.clientY, drag.id);
        drag.target = target;
        let line = drag.line;
        if (!target) { line.className = ""; line.style.cssText = ""; return; }
        target.el.classList.add("tp-droptarget");
        if (!target.line) { line.className = ""; line.style.cssText = ""; return; }
        let l = target.line, t = 3;
        line.className = "tp-ins " + (l.vertical ? "tp-ins-v" : "tp-ins-h");
        line.style.cssText = l.vertical
            ? `left:${l.x - t / 2}px;top:${l.y}px;width:${t}px;height:${l.length}px`
            : `left:${l.x}px;top:${l.y - t / 2}px;height:${t}px;width:${l.length}px`;
    }

    function endDrag(commit) {
        if (!drag) return;
        let current = drag;
        drag = undefined;
        if (current.active) {
            document.body.classList.remove("tp-dragging");
            if (current.ghost) current.ghost.remove();
            if (current.line) current.line.remove();
            if (current.target && current.target.el) current.target.el.classList.remove("tp-droptarget");
            let view = TP.view.getView(current.id);
            let el = view && document.getElementById(view.divId);
            if (el) el.classList.remove("tp-dragsrc");
            E.state.dragging = false;
            if (commit && current.target) E.moveView(current.id, current.target.container.id, current.target.index);
            E.__justDragged = true; setTimeout(() => { E.__justDragged = false; }, 0);
        }
        E.refresh();
    }

    E.cancelDrag = function() { endDrag(false); };

    // ------------------------------------------------------------------ Chrome (DOM drawn over the dashboard)

    const esc = (text) => String(text).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

    function pillHtml(view, selected, flat) {
        let w = view.layout.width, h = view.layout.height;
        let size = selected ? `<div class="tp-szrow">`
            + `<span class="tp-sg"><span class="tp-k">w</span><button data-tp-act="width-" ${w <= E.WIDTH_MIN ? "disabled" : ""} title="Narrower (Left)">&minus;</button><b>${w}</b><button data-tp-act="width+" ${w >= E.WIDTH_MAX ? "disabled" : ""} title="Wider (Right)">+</button></span>`
            + `<span class="tp-sg"><span class="tp-k">h</span><button data-tp-act="height-" ${h <= E.HEIGHT_MIN ? "disabled" : ""} title="Shorter (Down)">&minus;</button><b>${h}</b><button data-tp-act="height+" ${h >= E.HEIGHT_MAX ? "disabled" : ""} title="Taller (Up)">+</button></span>`
            + `</div>` : "";
        let del = selected ? `<button class="tp-del" data-tp-act="delete" title="Delete" aria-label="Delete"><i class="icofont-trash"></i></button>` : "";
        let columns = E.isGrid(E.getParent(view)) ? `${w} column${w == 1 ? "" : "s"} · ` : "";
        let tip = `${columns}${E.getShare(view)}% of the width · min height ${E.getMinHeightEm(view)} em`;
        return `<div class="tp-pc${selected ? " tp-on" : ""}${flat ? " tp-flat" : ""}">`
            + `<div class="tp-pill" data-tp-pill="${view.id}" title="${esc(tip)}"><span class="tp-grip">&#8942;&#8942;</span>${esc(E.typeLabel(view))}${del}</div>${size}</div>`;
    }

    // Own children of a wrapper (the chrome is kept apart from what the view's own Vue app renders)
    const ownChild = (el, cls) => { for (let c of el.children) if (c.classList.contains(cls)) return c; return undefined; };
    const ensureChild = (el, cls) => {
        let c = ownChild(el, cls);
        if (!c) { c = document.createElement("div"); c.className = cls; el.appendChild(c); }
        return c;
    };

    const DECORATION_CLASSES = ["tp-v", "tp-c", "tp-c2", "tp-root", "tp-sel", "tp-empty"];

    function undecorate(el) {
        el.removeAttribute("data-tp-edit");
        el.classList.remove(...DECORATION_CLASSES, "tp-dragsrc", "tp-droptarget");
        for (let cls of ["tp-chrome", "tp-shield", "tp-placeholder"]) { let c = ownChild(el, cls); if (c) c.remove(); }
    }

    function decorate(el, view, depth) {
        let isRoot = same(view, E.getRoot());
        let container = E.isContainer(view);
        let selected = E.state.selectedId === view.id;
        el.setAttribute("data-tp-edit", view.id);
        let classes = [];
        if (isRoot) classes.push("tp-root", "tp-c");
        else classes.push(container ? (depth >= 2 ? "tp-c2" : "tp-c") : "tp-v");
        if (container && !view.views.length) classes.push("tp-empty");
        if (selected) classes.push("tp-sel");
        for (let cls of DECORATION_CLASSES) el.classList.toggle(cls, classes.includes(cls));

        if (!isRoot) {
            // Pill: rebuilt only when what it shows changed. Small views unfold the size line beside the pill, not under it
            let flat = !container && el.offsetHeight < 70 && el.offsetWidth >= 220;
            let chrome = ensureChild(el, "tp-chrome");
            let html = pillHtml(view, selected, flat);
            if (chrome.__html !== html) { chrome.innerHTML = html; chrome.__html = html; }
        }
        if (!container) {
            let shield = ensureChild(el, "tp-shield");
            if (!shield.__ready) { // Views are inert, but the telemetries of the side panels can still be dropped on them
                shield.__ready = true;
                shield.addEventListener("dragover", (e) => e.preventDefault());
                shield.addEventListener("dragenter", (e) => { e.preventDefault(); if (view.onDragEnter) view.onDragEnter(e, view); });
                shield.addEventListener("dragleave", (e) => { if (view.onDragLeave) view.onDragLeave(e, view); });
                shield.addEventListener("drop", (e) => { e.preventDefault(); if (view.onDragDrop) view.onDragDrop(e, view); });
            }
        }
        let placeholder = ownChild(el, "tp-placeholder");
        if (container && !view.views.length) {
            if (!placeholder) { placeholder = ensureChild(el, "tp-placeholder"); placeholder.textContent = E.isStack(view) ? "empty stack — click + to add a view" : "empty — click + to add a view"; }
        } else if (placeholder) placeholder.remove();
    }

    let lastEnabled = false;
    E.refresh = function() {
        if (typeof document.querySelectorAll !== "function") return; // No DOM (tests)
        let root = E.getRoot();
        let live = new Set();
        if (E.state.enabled && root) {
            let visit = (view, depth) => {
                let el = document.getElementById(view.divId);
                if (el && el.hasAttribute("v-pre")) { decorate(el, view, depth); live.add(el); }
                if (E.isContainer(view)) view.views.forEach((child) => visit(child, depth + 1));
            };
            visit(root, 0);
        }
        if (E.state.enabled || lastEnabled) {
            for (let el of document.querySelectorAll("[data-tp-edit]")) if (!live.has(el)) undecorate(el);
        }
        lastEnabled = E.state.enabled;
        updateSlots();
    };

    // ------------------------------------------------------------------ "+" slots (DOM layer above the dashboard)

    const TELEMETRY_TYPE = "text/x-teleplot-drag-type-telemetry";
    const isTelemetryDrag = (event) => !!event.dataTransfer && Array.from(event.dataTransfer.types || []).includes(TELEMETRY_TYPE);
    function dragIds(event) {
        let ids = [Number(event.dataTransfer.getData("text/x-teleplot-drag-id"))];
        if (Array.from(event.dataTransfer.types).includes("text/x-teleplot-drag-ids")) ids = event.dataTransfer.getData("text/x-teleplot-drag-ids").split(",").map(Number);
        return ids.filter((id) => Number.isFinite(id));
    }
    function setTelemetryDrag(value) {
        if (E.state.telemetryDrag === value) return;
        E.state.telemetryDrag = value;
        E.refresh();
    }

    let slotsLayer = undefined, menu = undefined;
    const slotEls = new Map(); // key -> button

    const tabsOf = (el) => Array.from(el.querySelectorAll(".teleplot-js-view-stack-header-item")).filter((t) => t.closest(".teleplot-js-view") === el);

    // Visible part of the dashboard: slots outside of it (scrolled away, under a bar) are not shown
    function clipRect(el) {
        let rect = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
            let overflow = getComputedStyle(p);
            if (/(auto|scroll|hidden)/.test(overflow.overflowX + overflow.overflowY)) {
                let r = p.getBoundingClientRect();
                rect = { left: Math.max(rect.left, r.left), top: Math.max(rect.top, r.top), right: Math.min(rect.right, r.right), bottom: Math.min(rect.bottom, r.bottom) };
            }
        }
        return rect;
    }

    function collectSlots(container, depth, clip, out) {
        let el = document.getElementById(container.divId);
        if (!el || !el.offsetWidth) return;
        let rect = el.getBoundingClientRect();
        let kids = [];
        container.views.forEach((child, i) => {
            let kidEl = E.isStack(container) ? tabsOf(el)[i] : document.getElementById(child.divId);
            if (!kidEl || !kidEl.offsetWidth) return;
            kids.push({ index: i, rect: kidEl.getBoundingClientRect() });
        });
        let horizontal = E.isStack(container) || container.layout.type !== "column";
        let inset = depth > 0 && !E.isStack(container) ? 9 : 0;
        E.slotLayout(horizontal, rect, kids, inset).forEach((slot, i) => {
            if (slot.empty) { slot.vertical = true; }
            let cx = slot.empty ? slot.x : (slot.vertical ? slot.x : slot.x + slot.length / 2);
            let cy = slot.empty ? slot.y : (slot.vertical ? slot.y + slot.length / 2 : slot.y);
            if (cx < clip.left || cx > clip.right || cy < clip.top || cy > clip.bottom) return;
            // Slots on the very edge of the visible area are kept inside it, so they stay whole and reachable
            if (!slot.empty && slot.vertical) slot.x = Math.min(Math.max(slot.x, clip.left + 11), clip.right - 11);
            else if (!slot.empty) slot.y = Math.min(Math.max(slot.y, clip.top + 11), clip.bottom - 11);
            out.push(Object.assign(slot, { key: container.id + ":" + i, containerId: container.id }));
        });
        if (!E.isStack(container)) container.views.forEach((child) => { if (E.isContainer(child)) collectSlots(child, depth + 1, clip, out); });
        else { let shown = container.views.find((v) => v.id === container.layout.selected); if (shown && E.isContainer(shown)) collectSlots(shown, depth + 1, clip, out); }
    }

    function makeSlotEl(key) {
        let b = document.createElement("button");
        b.type = "button";
        b.innerHTML = '<span class="tp-slot-line"></span><span class="tp-slot-dot">+</span>';
        b.addEventListener("click", (e) => { e.stopPropagation(); if (!E.state.enabled) return; if (menu && menu.__slot === b) closeMenu(); else openMenu(b); });
        b.addEventListener("dragenter", (e) => { if (isTelemetryDrag(e)) { e.preventDefault(); b.classList.add("tp-hot"); } });
        b.addEventListener("dragover", (e) => { if (isTelemetryDrag(e)) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; b.classList.add("tp-hot"); } });
        b.addEventListener("dragleave", () => b.classList.remove("tp-hot"));
        b.addEventListener("drop", (e) => {
            if (!isTelemetryDrag(e)) return;
            e.preventDefault(); e.stopPropagation();
            b.classList.remove("tp-hot");
            E.dropTelemetries(dragIds(e), b.__slot.containerId, b.__slot.index);
            setTelemetryDrag(false);
            E.refresh();
        });
        return b;
    }

    // A telemetry dragged over the dashboard but on no view and no slot: which container would take it ? The innermost one under the
    // pointer; the root for the room around and under the dashboard. Undefined on a view (it takes the telemetry as a series) or elsewhere.
    function looseDropTarget(event) {
        let root = E.getRoot();
        let rootEl = root && document.getElementById(root.divId);
        let t = event.target;
        if (!rootEl || !t || !t.closest || t.closest(".tp-slot")) return undefined;
        let viewEl = t.closest(".teleplot-js-view");
        if (viewEl && rootEl.contains(viewEl)) {
            let view = TP.view.views.find((v) => v.divId === viewEl.id);
            return E.isContainer(view) ? { view, el: viewEl } : undefined;
        }
        let host = rootEl.parentElement;
        return !viewEl && host && host.contains(t) ? { view: root, el: rootEl } : undefined;
    }
    let looseEl = undefined; // Container highlighted as the target of such a drop
    function markLooseTarget(target) {
        let el = target ? target.el : undefined;
        if (looseEl && looseEl !== el) looseEl.classList.remove("tp-droptarget");
        looseEl = el;
        let root = E.getRoot();
        let onRoot = !!target && same(target.view, root);
        if (el && !onRoot) el.classList.add("tp-droptarget"); // The root shows it on its "add at the end" zone instead
        let append = slotEls.get("append");
        if (append) append.classList.toggle("tp-hot", onRoot);
    }

    // While a telemetry is dragged, only the slots close to the pointer stand out (the others stay faint: less noise on the dashboard)
    const NEAR = 150;
    function markNearSlots(x, y) {
        for (let b of slotEls.values()) if (b.__c && !b.classList.contains("tp-slot-a")) b.classList.toggle("tp-near", Math.hypot(b.__c[0] - x, b.__c[1] - y) < NEAR);
    }

    function removeSlots() {
        slotEls.forEach((b) => b.remove());
        slotEls.clear();
        if (slotsLayer) { slotsLayer.remove(); slotsLayer = undefined; }
        closeMenu();
    }

    function updateSlots() {
        let root = E.getRoot();
        let rootEl = root && document.getElementById(root.divId);
        if (!(E.state.enabled || E.state.telemetryDrag) || !rootEl) { if (slotsLayer) removeSlots(); return; }
        if (!slotsLayer) { slotsLayer = document.createElement("div"); slotsLayer.className = "tp-slots"; document.body.appendChild(slotsLayer); }
        slotsLayer.classList.toggle("tp-telemetry-drag", E.state.telemetryDrag);
        let specs = [];
        collectSlots(root, 0, clipRect(rootEl), specs);
        let seen = new Set();
        for (let spec of specs) {
            seen.add(spec.key);
            let b = slotEls.get(spec.key);
            if (!b) { b = makeSlotEl(spec.key); slotEls.set(spec.key, b); slotsLayer.appendChild(b); }
            b.__slot = spec;
            let kind = spec.empty ? "e" : (spec.vertical ? "v" : "h");
            let cls = "tp-slot tp-slot-" + kind + (b.classList.contains("tp-hot") ? " tp-hot" : "") + (b.classList.contains("tp-near") ? " tp-near" : "") + (menu && menu.__slot === b ? " tp-open" : "");
            if (b.className !== cls) b.className = cls;
            let t = E.state.telemetryDrag ? "Drop to create a view here" : "Add a view here";
            if (b.title !== t) { b.title = t; b.setAttribute("aria-label", t); }
            let box;
            if (spec.empty) box = { left: spec.x - 16, top: spec.y - 16, width: 32, height: 32 };
            else if (spec.vertical) { let h = Math.max(spec.length, 24); box = { left: spec.x - 10, top: spec.y - (h - spec.length) / 2, width: 20, height: h }; }
            else { let w = Math.max(spec.length, 24); box = { left: spec.x - (w - spec.length) / 2, top: spec.y - 10, width: w, height: 20 }; }
            b.__c = [box.left + box.width / 2, box.top + box.height / 2];
            b.style.left = box.left + "px"; b.style.top = box.top + "px"; b.style.width = box.width + "px"; b.style.height = box.height + "px";
        }
        // While a telemetry is dragged: a big drop zone at the bottom of the dashboard, to append a view at the end of the root
        if (E.state.telemetryDrag) {
            let r = rootEl.getBoundingClientRect(), clip = clipRect(rootEl);
            let left = Math.max(r.left, clip.left) + 8, right = Math.min(r.right, clip.right) - 8;
            // In the room kept under the dashboard (see dashboard.js); pinned to the bottom of the visible area when that is further down
            let host = rootEl.parentElement ? rootEl.parentElement.getBoundingClientRect() : r;
            let bottom = Math.min(host.bottom - 8, clip.bottom - 8);
            let spec = { key: "append", containerId: root.id, index: -1, append: true };
            seen.add("append");
            let b = slotEls.get("append");
            if (!b) { b = makeSlotEl("append"); b.textContent = ""; slotEls.set("append", b); slotsLayer.prepend(b); } // under the other slots
            b.__slot = spec; b.__c = [(left + right) / 2, bottom - 32];
            let cls = "tp-slot tp-slot-a" + (b.classList.contains("tp-hot") ? " tp-hot" : "");
            if (b.className !== cls) b.className = cls;
            b.title = "Drop to add at the end of the dashboard";
            b.style.left = left + "px"; b.style.top = (bottom - 64) + "px"; b.style.width = Math.max(0, right - left) + "px"; b.style.height = "64px";
        }
        for (let [key, b] of slotEls) if (!seen.has(key)) { if (menu && menu.__slot === b) closeMenu(); b.remove(); slotEls.delete(key); }
    }

    // Menu of what a slot can create
    function openMenu(slotEl) {
        closeMenu();
        let item = (type) => `<button type="button" role="menuitem" data-tp-new="${type}">${esc(E.ADD_LABELS[type])}</button>`;
        menu = document.createElement("div");
        menu.className = "tp-menu";
        menu.setAttribute("role", "menu");
        menu.innerHTML = '<div class="tp-menu-title">Add</div>' + ["chart", "values", "log"].map(item).join("") + '<hr><div class="tp-menu-title">Container</div>' + ["row", "column", "grid", "stack"].map(item).join("");
        menu.__slot = slotEl;
        let spec = slotEl.__slot;
        menu.addEventListener("click", (e) => {
            let button = e.target.closest("[data-tp-new]");
            if (!button) return;
            e.stopPropagation();
            E.addView(button.getAttribute("data-tp-new"), spec.containerId, spec.index);
            closeMenu();
            E.refresh();
        });
        document.body.appendChild(menu);
        let r = slotEl.getBoundingClientRect();
        let left = Math.min(Math.max(4, r.left + r.width / 2 - menu.offsetWidth / 2), window.innerWidth - menu.offsetWidth - 4);
        let top = r.bottom + 6 + menu.offsetHeight > window.innerHeight ? r.top - 6 - menu.offsetHeight : r.bottom + 6;
        menu.style.left = left + "px"; menu.style.top = Math.max(4, top) + "px";
        slotEl.classList.add("tp-open");
        let first = menu.querySelector("button");
        if (first) first.focus();
    }

    function closeMenu() {
        if (!menu) return;
        if (menu.__slot) menu.__slot.classList.remove("tp-open");
        menu.remove();
        menu = undefined;
    }

    // ------------------------------------------------------------------ Events (one set of listeners for the whole page)

    function onPointerDown(event) {
        if (!E.state.enabled || event.button !== 0 || !event.target.closest) return;
        if (event.target.closest("[data-tp-act]")) return; // a button of the pill, not a drag
        let pill = event.target.closest("[data-tp-pill]");
        if (!pill) return;
        event.preventDefault(); // no text selection, no native drag
        drag = { id: pill.getAttribute("data-tp-pill"), startX: event.clientX, startY: event.clientY, active: false };
    }
    function onPointerMove(event) {
        if (!drag) return;
        if (!drag.active) {
            if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < E.DRAG_THRESHOLD) return;
            startDrag();
        }
        moveDrag(event);
    }
    function onPointerUp() {
        if (!drag) return;
        if (drag.active) { endDrag(true); return; }
        let id = drag.id;
        drag = undefined;
        E.select(id); // a plain click selects
        E.refresh();
    }
    function onClick(event) {
        if (!E.state.enabled || E.__justDragged || !event.target.closest) return;
        let t = event.target;
        let act = t.closest("[data-tp-act]");
        if (act && E.state.selectedId && act.getAttribute("data-tp-act") === "delete") {
            E.removeView(E.state.selectedId);
            E.refresh();
            return;
        }
        if (act && E.state.selectedId) {
            let [dimension, sign] = act.getAttribute("data-tp-act").match(/^(width|height)([+-])$/).slice(1);
            E.resize(E.state.selectedId, dimension, sign === "+" ? 1 : -1);
            E.refresh();
            return;
        }
        let tab = t.closest(".teleplot-js-view-stack-header-item");
        if (tab) { // A tab of a stack: select what it shows (the stack itself stays selectable from its pill)
            let stackEl = tab.closest("[data-tp-edit]");
            let stack = stackEl && TP.view.getView(stackEl.getAttribute("data-tp-edit"));
            let child = stack && E.isStack(stack) && stack.views[tabsOf(stackEl).indexOf(tab)];
            if (child) { E.select(child.id); E.refresh(); }
            return;
        }
        if (t.closest("[data-tp-pill]") || t.closest(".teleplot-js-view-stack-header")) return;
        let root = E.getRoot();
        let rootEl = root && document.getElementById(root.divId);
        if (rootEl && rootEl.contains(t)) { E.state.selectedId = ""; E.refresh(); } // click on the dashboard itself
    }
    function onKeyDown(event) {
        if (menu) { // The "+" menu has the keyboard while it is open
            if (event.key === "Escape") { event.stopPropagation(); let slot = menu.__slot; closeMenu(); if (slot) slot.focus(); return; }
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault(); event.stopPropagation();
                let buttons = Array.from(menu.querySelectorAll("button"));
                let at = buttons.indexOf(document.activeElement);
                buttons[(at + (event.key === "ArrowDown" ? 1 : buttons.length - 1)) % buttons.length].focus();
                return;
            }
        }
        if (!E.state.enabled) return;
        if (event.key === "Escape" && drag && drag.active) { event.stopPropagation(); E.cancelDrag(); return; }
        let target = event.target;
        if (target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable)) return;
        let id = E.state.selectedId;
        if (!id) return;
        if (event.key === "Escape") { E.state.selectedId = ""; E.refresh(); return; }
        if (!event.key.startsWith("Arrow")) return;
        let step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
        event.preventDefault();
        if (event.altKey) E.moveBy(id, step);
        else if (event.key === "ArrowLeft" || event.key === "ArrowRight") E.resize(id, "width", step);
        else E.resize(id, "height", -step); // up = taller
        E.refresh();
    }

    if (typeof document.addEventListener === "function") {
        document.addEventListener("pointerdown", onPointerDown);
        document.addEventListener("pointermove", onPointerMove);
        document.addEventListener("pointerup", onPointerUp);
        document.addEventListener("pointercancel", () => E.cancelDrag());
        document.addEventListener("click", onClick);
        document.addEventListener("keydown", onKeyDown, true);
        // Telemetries dragged from the side panel: the "+" slots show up (even outside edit mode) until the drag ends
        document.addEventListener("dragenter", (e) => { if (isTelemetryDrag(e)) setTelemetryDrag(true); }, true);
        document.addEventListener("dragover", (e) => { if (isTelemetryDrag(e)) { setTelemetryDrag(true); markNearSlots(e.clientX, e.clientY); } }, true);
        document.addEventListener("dragend", () => { markLooseTarget(undefined); setTelemetryDrag(false); }, true);
        document.addEventListener("drop", () => setTimeout(() => setTelemetryDrag(false), 0), true);
        // Telemetries dropped on the dashboard but on no view and no slot go at the end of the container under the pointer
        document.addEventListener("dragover", (e) => {
            if (!isTelemetryDrag(e)) return;
            let target = looseDropTarget(e);
            if (e.target.closest && e.target.closest(".tp-slot")) { if (looseEl) markLooseTarget(undefined); return; } // the slot shows itself
            markLooseTarget(target);
            if (target) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }
        });
        document.addEventListener("drop", (e) => {
            if (!isTelemetryDrag(e)) return;
            let target = looseDropTarget(e);
            markLooseTarget(undefined);
            if (!target) return;
            e.preventDefault();
            E.dropTelemetries(dragIds(e), target.view.id, -1);
            setTelemetryDrag(false);
            E.refresh();
        });
        document.addEventListener("mousemove", () => { if (E.state.telemetryDrag) setTelemetryDrag(false); }, true); // mouse events do not fire during a drag: the drag is over
        document.addEventListener("pointerdown", (e) => { if (menu && !menu.contains(e.target) && !(e.target.closest && e.target.closest(".tp-slot"))) closeMenu(); }, true);
    }

    // ------------------------------------------------------------------ Style


    return E;
}
