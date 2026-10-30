const test = require('./helpers/mini-test');
const assert = require('node:assert/strict');
const { loadTeleplot } = require('./helpers/load');

const TELEPLOT = loadTeleplot();
const V = TELEPLOT.view;
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, a + " != " + b);

// An element that records its listeners; events are given by hand: touches are {clientX, clientY}
function fakeElement() {
    const listeners = {};
    return {
        listeners, children: [],
        addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
        removeEventListener(type, fn) { listeners[type] = (listeners[type] || []).filter((f) => f !== fn); },
        getBoundingClientRect: () => ({ left: 100, top: 50 }),
        appendChild(c) { this.children.push(c); },
        fire(type, touches, changed) {
            const event = { touches, changedTouches: changed || touches, cancelable: true, prevented: false, preventDefault() { this.prevented = true; } };
            for (const fn of listeners[type] || []) fn(event);
            return event;
        },
    };
}
const at = (x, y) => ({ clientX: x + 100, clientY: y + 50 }); // (element coordinates -> page)

test('pinchStep: centroid, its move, spread and turn of two fingers', () => {
    const step = V.pinchStep([[0, 0], [100, 0]], [[10, 20], [210, 20]]);
    close(step.cx, 110); close(step.cy, 20);
    close(step.dx, 60); close(step.dy, 20);
    close(step.scale, 2);
    close(step.angle, 0);
    const turned = V.pinchStep([[0, 0], [100, 0]], [[50, -50], [50, 50]]); // the line turned a quarter clockwise on the screen
    close(turned.scale, 1);
    close(turned.angle, -Math.PI / 2);
    close(V.pinchStep([[0, 0], [0, 0]], [[0, 0], [10, 0]]).scale, 1); // (no distance before: no zoom made up)
});

test('isDoubleTap: two taps close in time and place', () => {
    assert.equal(V.isDoubleTap(undefined, { x: 0, y: 0, t: 0 }), false);
    assert.equal(V.isDoubleTap({ x: 0, y: 0, t: 0 }, { x: 5, y: 5, t: 200 }), true);
    assert.equal(V.isDoubleTap({ x: 0, y: 0, t: 0 }, { x: 5, y: 5, t: V.DOUBLE_TAP_MS + 1 }), false);
    assert.equal(V.isDoubleTap({ x: 0, y: 0, t: 0 }, { x: 60, y: 0, t: 100 }), false);
});

test('pinchWindow: the time under the fingers stays under them, the window gets shorter, a shift moves it', () => {
    const w = V.pinchWindow(0, 100, 25, 2, 0);
    close(w.from, 12.5); close(w.to, 62.5); // 25 stays at a quarter of the window
    const moved = V.pinchWindow(0, 100, 50, 1, 10); // fingers moved right: earlier times come in
    close(moved.from, -10); close(moved.to, 90);
    const tiny = V.pinchWindow(0, 1, 0.5, 1e9, 0, 0.01); // never shorter than minSpan
    close(tiny.to - tiny.from, 0.01);
});

test('touchGestures: one finger is left to the page, two fingers pinch, a double tap is told', () => {
    const el = fakeElement();
    const steps = [], taps = [];
    let ended = 0;
    const off = V.touchGestures(el, { pinch: (s) => steps.push(s), pinchEnd: () => ended++, doubleTap: (x, y) => taps.push([x, y]) });
    // One finger that moves: not prevented (the page scrolls), no tap
    assert.equal(el.fire('touchstart', [at(10, 10)]).prevented, false);
    assert.equal(el.fire('touchmove', [at(10, 60)]).prevented, false);
    el.fire('touchend', [], [at(10, 60)]);
    // Two fingers: prevented, steps in element coordinates
    assert.equal(el.fire('touchstart', [at(0, 0), at(100, 0)]).prevented, true);
    assert.equal(el.fire('touchmove', [at(0, 0), at(200, 0)]).prevented, true);
    assert.equal(steps.length, 1);
    close(steps[0].scale, 2); close(steps[0].cx, 100);
    el.fire('touchend', [at(0, 0)], [at(200, 0)]);
    assert.equal(ended, 1);
    el.fire('touchend', [], [at(0, 0)]); // (the last finger of a pinch is no tap)
    // Two taps: the second is a double tap, prevented (no click after it)
    el.fire('touchstart', [at(30, 40)]); el.fire('touchend', [], [at(30, 40)]);
    el.fire('touchstart', [at(32, 41)]);
    assert.equal(el.fire('touchend', [], [at(32, 41)]).prevented, true);
    assert.deepEqual(taps, [[32, 41]]);
    off();
    assert.equal((el.listeners.touchstart || []).length, 0);
});

test('touchGestures: a finger the view owns does not scroll the page; a swipe shows the hint', () => {
    const el = fakeElement();
    V.touchGestures(el, { owns: (x, y) => x < 50, hint: "Two fingers to move the map" });
    el.fire('touchstart', [at(10, 10)]);
    assert.equal(el.fire('touchmove', [at(40, 10)]).prevented, true);
    el.fire('touchend', [], [at(40, 10)]);
    assert.equal(el.children.length, 0);
    el.fire('touchstart', [at(100, 10)]);
    assert.equal(el.fire('touchmove', [at(100, 80)]).prevented, false);
    assert.equal(el.children.length, 1);
    assert.equal(el.children[0].textContent, "Two fingers to move the map");
});

test('touchGestures: the steps say how many fingers are down, and a finger more starts again without a jump', () => {
    const el = fakeElement();
    const steps = [];
    V.touchGestures(el, { pinch: (s) => steps.push(s) });
    el.fire('touchstart', [at(0, 0), at(100, 0)]);
    el.fire('touchmove', [at(10, 0), at(110, 0)]);
    el.fire('touchmove', [at(20, 0), at(120, 0), at(60, 50)]); // a third finger: no step
    el.fire('touchmove', [at(20, 30), at(120, 30), at(60, 80)]);
    assert.deepEqual(steps.map((s) => [s.fingers, s.dx, s.dy]), [[2, 10, 0], [3, 0, 30]]);
});
