/*
 * Tooltips and hover for a finger. A finger cannot hover: held still on something for TIP_MS, it does what the mouse does when it
 * rests there. What has a tooltip shows it (the "title" of the element, or the tip of a button of the top menu), and what reacts to
 * the mouse coming over it is told so (mouseenter: a series of a chart lights up, a part of a message in the Help is named). Letting go
 * puts everything back, and the click that the release would make is dropped (it was a question, not an action).
 * A finger that moves first scrolls, as usual; a press that lifts a telemetry (dashboard-editor.js, E.touchLift) is not a question.
 */
function initTouchTips(editor) {
    const TIP_MS = 450, SLOP = 10;
    let press = undefined; // {id, x, y, target, timer}
    let shown = undefined; // {bubble, tipped, entered: [elements told mouseenter]}
    let swallowClickUntil = 0;

    function show() {
        const p = press;
        if (!p || editor.isLifting()) return;
        const target = p.target;
        const tipped = target.closest(".tm-tipped");
        const titled = target.closest("[title]");
        const entered = [];
        for (let el = target; el && el !== document.body; el = el.parentElement) { // (as the mouse would: every element it enters)
            el.dispatchEvent(new MouseEvent("mouseenter", { bubbles: false, clientX: p.x, clientY: p.y }));
            entered.push(el);
        }
        let bubble = undefined;
        if (tipped) tipped.classList.add("tip-shown");
        else if (titled && titled.getAttribute("title")) {
            bubble = document.createElement("div");
            bubble.className = "touch-tip";
            bubble.setAttribute("role", "tooltip");
            bubble.textContent = titled.getAttribute("title");
            document.body.appendChild(bubble);
            const box = titled.getBoundingClientRect(), w = bubble.offsetWidth, h = bubble.offsetHeight;
            const left = Math.min(Math.max(8, p.x - w / 2), window.innerWidth - w - 8);
            const top = p.y - 56 - h > 8 ? p.y - 56 - h : Math.min(box.bottom + 8, window.innerHeight - h - 8); // (above the finger, where it can be seen)
            bubble.style.left = left + "px";
            bubble.style.top = top + "px";
        }
        shown = { bubble, tipped, entered };
        swallowClickUntil = Infinity; // until the release
    }
    function hide() {
        if (!shown) return;
        const s = shown;
        shown = undefined;
        if (s.bubble) s.bubble.remove();
        if (s.tipped) s.tipped.classList.remove("tip-shown");
        for (const el of s.entered) el.dispatchEvent(new MouseEvent("mouseleave", { bubbles: false }));
        swallowClickUntil = performance.now() + 400;
    }
    function end() {
        if (press) clearTimeout(press.timer);
        press = undefined;
        hide();
    }

    window.addEventListener("pointerdown", (e) => {
        end();
        if (e.pointerType !== "touch" || !e.isPrimary || !e.target.closest || e.target.closest("input, textarea, select, [contenteditable]")) return;
        for (let el = e.target, i = 0; el && el !== document.body && i < 6; el = el.parentElement, i++) { // What takes the finger (a joystick, a bar, a pill) is held on purpose
            if (getComputedStyle(el).touchAction == "none") return;
        }
        press = { id: e.pointerId, x: e.clientX, y: e.clientY, target: e.target };
        press.timer = setTimeout(show, TIP_MS);
    }, true);
    window.addEventListener("pointermove", (e) => {
        if (press && e.pointerId === press.id && Math.hypot(e.clientX - press.x, e.clientY - press.y) > (shown ? 4 * SLOP : SLOP)) end();
    }, true);
    window.addEventListener("pointerup", (e) => { if (press && e.pointerId === press.id) end(); }, true);
    window.addEventListener("pointercancel", (e) => { if (press && e.pointerId === press.id) end(); }, true);
    window.addEventListener("click", (e) => {
        if (performance.now() < swallowClickUntil) { e.preventDefault(); e.stopPropagation(); swallowClickUntil = 0; }
    }, true);
    window.addEventListener("contextmenu", (e) => { if (shown) e.preventDefault(); }, true); // (the browser's menu of a long press)
}
