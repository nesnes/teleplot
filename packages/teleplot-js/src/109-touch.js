/*
 * Fingers on the views (doc/touch.md). A view shares the finger with the page: one finger scrolls the page (a tap still does what a
 * click does), two fingers move what the view shows (pan, pinch to zoom, turn). A view grabs one finger only for what is meant to be
 * moved by hand (a writable pose on a map, a joystick, a value bar: they say so through "owns"). A double tap does what a double click
 * does (back to live, fit the view), counted here because browsers do not give a dependable dblclick for a finger. A mouse is not
 * concerned: the views keep their own handlers for it.
 *
 * TELEPLOT.view.touchGestures(element, {owns(x, y), pinch(step), pinchEnd(), doubleTap(x, y), hint}) listens to the touch events of
 * the element and returns a function that stops listening. Positions are in the element (px from its top left corner).
 *   - owns(x, y): true when a finger put there belongs to the view (the page must not scroll with it).
 *   - pinch(step): two fingers (or more) moved, step = TELEPLOT.view.pinchStep(before, now) {cx, cy, dx, dy, scale, angle} and
 *     fingers (how many are down: a view may give three another meaning). Taken on the first two; a finger more or less starts again.
 *   - hint: a text shown for a moment when one finger drags over the view (the page scrolls): "Two fingers to move the map".
 * The element should have "touch-action: pan-x pan-y" (the browser scrolls with one finger, never zooms the page on the view).
 * The computations (pinchStep, isDoubleTap, pinchWindow) have no DOM and are tested.
 */

TELEPLOT.view.TAP_MS = 300;        // Longer, it is a press
TELEPLOT.view.TAP_SLOP = 10;       // px a tap may move
TELEPLOT.view.DOUBLE_TAP_MS = 350; // Between the two taps of a double tap
TELEPLOT.view.DOUBLE_TAP_PX = 30;  // How far apart they may be
TELEPLOT.view.HINT_MS = 1400;

// Two fingers before ([[x, y], [x, y]]) and now: where they are (centroid of now), how far that moved, how much further apart they are
// (scale > 1: spread) and how much the line between them turned (radians, counterclockwise on the screen)
TELEPLOT.view.pinchStep = function(before, now) {
    let c0 = [(before[0][0] + before[1][0]) / 2, (before[0][1] + before[1][1]) / 2];
    let c1 = [(now[0][0] + now[1][0]) / 2, (now[0][1] + now[1][1]) / 2];
    let d0 = Math.hypot(before[1][0] - before[0][0], before[1][1] - before[0][1]);
    let d1 = Math.hypot(now[1][0] - now[0][0], now[1][1] - now[0][1]);
    let a0 = Math.atan2(before[1][1] - before[0][1], before[1][0] - before[0][0]);
    let a1 = Math.atan2(now[1][1] - now[0][1], now[1][0] - now[0][0]);
    let angle = a0 - a1; // (screen y goes down)
    if(angle > Math.PI) angle -= 2 * Math.PI;
    else if(angle < -Math.PI) angle += 2 * Math.PI;
    return { cx: c1[0], cy: c1[1], dx: c1[0] - c0[0], dy: c1[1] - c0[1], scale: d0 > 0 && d1 > 0 ? d1 / d0 : 1, angle };
}

// Is this tap {x, y, t (ms)} the second of a double tap after the previous one?
TELEPLOT.view.isDoubleTap = function(previous, tap) {
    return !!previous && tap.t - previous.t <= TELEPLOT.view.DOUBLE_TAP_MS && Math.hypot(tap.x - previous.x, tap.y - previous.y) <= TELEPLOT.view.DOUBLE_TAP_PX;
}

// A time window [from, to] pinched: "at" (the time under the fingers) stays under them, the window gets "scale" times shorter, and it
// moves by "shift" (time: positive = the data moves to the right, earlier times come into view). Never shorter than "minSpan".
TELEPLOT.view.pinchWindow = function(from, to, at, scale, shift, minSpan = 1e-3) {
    if(!(scale > 0)) scale = 1;
    let span = to - from;
    if(span / scale < minSpan) scale = span / minSpan;
    return { from: at + (from - at) / scale - shift, to: at + (to - at) / scale - shift };
}

TELEPLOT.view.touchGestures = function(element, handlers) {
    if(!element || typeof element.addEventListener !== "function") return () => {};
    let state = { two: undefined, count: 0, owned: false, tap: undefined, lastTap: undefined, hinted: 0, hintEl: undefined, hintTimer: 0 };
    let local = (touch) => { let box = element.getBoundingClientRect(); return [touch.clientX - box.left, touch.clientY - box.top]; };
    let pair = (event) => [local(event.touches[0]), local(event.touches[1])];
    let showHint = () => {
        if(!handlers.hint || typeof document === "undefined" || !document.createElement) return;
        let now = Date.now();
        if(now - state.hinted < 4000) return; // (not again on every swipe)
        state.hinted = now;
        if(!state.hintEl) {
            state.hintEl = document.createElement("div");
            state.hintEl.className = "teleplot-js-touch-hint";
            state.hintEl.setAttribute("role", "status");
            element.appendChild(state.hintEl);
        }
        state.hintEl.textContent = handlers.hint;
        state.hintEl.classList.add("teleplot-js-touch-hint-on");
        clearTimeout(state.hintTimer);
        state.hintTimer = setTimeout(() => { if(state.hintEl) state.hintEl.classList.remove("teleplot-js-touch-hint-on"); }, TELEPLOT.view.HINT_MS);
    };
    let start = (event) => {
        if(event.touches.length >= 2) {
            state.tap = undefined;
            state.two = pair(event);
            state.count = event.touches.length;
            event.preventDefault(); // Two fingers are the view's: no scroll, no zoom of the page
            return;
        }
        let at = local(event.touches[0]);
        state.owned = !!(handlers.owns && handlers.owns(at[0], at[1]));
        state.tap = { x: at[0], y: at[1], t: Date.now(), moved: false };
    };
    let move = (event) => {
        if(event.touches.length >= 2) {
            if(event.cancelable) event.preventDefault();
            let now = pair(event);
            if(!state.two || state.count !== event.touches.length) { state.two = now; state.count = event.touches.length; return; } // (no jump when a finger comes or goes)
            let step = TELEPLOT.view.pinchStep(state.two, now);
            step.fingers = event.touches.length;
            state.two = now;
            if(handlers.pinch) handlers.pinch(step);
            return;
        }
        if(state.owned) { if(event.cancelable) event.preventDefault(); return; }
        let tap = state.tap;
        if(tap && !tap.moved) {
            let at = local(event.touches[0]);
            if(Math.hypot(at[0] - tap.x, at[1] - tap.y) > TELEPLOT.view.TAP_SLOP) { tap.moved = true; if(!state.two) showHint(); }
        }
    };
    let end = (event) => {
        if(state.two && event.touches.length < 2) {
            state.two = undefined;
            state.lastTap = undefined;
            if(handlers.pinchEnd) handlers.pinchEnd();
            return;
        }
        if(event.touches.length) return;
        let tap = state.tap;
        state.tap = undefined;
        state.owned = false;
        if(!tap || tap.moved || Date.now() - tap.t > TELEPLOT.view.TAP_MS) { state.lastTap = undefined; return; }
        if(TELEPLOT.view.isDoubleTap(state.lastTap, tap)) {
            state.lastTap = undefined;
            if(handlers.doubleTap) {
                if(event.cancelable) event.preventDefault(); // (no click after it: it would hold what the double tap set live)
                handlers.doubleTap(tap.x, tap.y);
            }
            return;
        }
        state.lastTap = tap;
    };
    let cancel = () => { state.two = undefined; state.tap = undefined; state.owned = false; if(handlers.pinchEnd) handlers.pinchEnd(); };
    element.addEventListener("touchstart", start, { passive: false });
    element.addEventListener("touchmove", move, { passive: false });
    element.addEventListener("touchend", end, { passive: false });
    element.addEventListener("touchcancel", cancel);
    return () => {
        element.removeEventListener("touchstart", start, { passive: false });
        element.removeEventListener("touchmove", move, { passive: false });
        element.removeEventListener("touchend", end, { passive: false });
        element.removeEventListener("touchcancel", cancel);
        clearTimeout(state.hintTimer);
        if(state.hintEl) state.hintEl.remove();
    };
}

// The hint, over the view (the element is positioned by its view)
if(typeof document !== "undefined" && document.createElement && document.head) {
    let elem = document.createElement("style");
    elem.textContent = `
        .teleplot-js-touch-hint {
            position: absolute; left: 50%; top: 50%; z-index: 6; translate: -50% -50%;
            max-width: 80%; padding: 0.5em 0.9em; border-radius: 0.6em; text-align: center;
            background: rgba(0, 0, 0, 0.78); color: #fff; font-size: 0.95em; line-height: 1.3;
            pointer-events: none; opacity: 0; transition: opacity 0.15s;
        }
        .teleplot-js-touch-hint-on { opacity: 1; }
        @media (prefers-reduced-motion: reduce) { .teleplot-js-touch-hint { transition: none; } }
    `;
    document.head.appendChild(elem);
}
