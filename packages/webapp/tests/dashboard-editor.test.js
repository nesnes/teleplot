// components/dashboard-editor.js: structure commands of the dashboard editor (the DOM part is checked in a browser)
const fs = require('node:fs');
const path = require('node:path');
const test = require('../../teleplot-js/tests/helpers/mini-test');
const assert = require('node:assert/strict');
const { loadTeleplot } = require('../../teleplot-js/tests/helpers/load');

const code = fs.readFileSync(path.join(__dirname, '..', 'components', 'dashboard-editor.js'), 'utf8');

// Dashboard: root column [ row [chart A, values B], log C ]
function setup() {
    const T = loadTeleplot();
    globalThis.Vue = T.Vue;
    globalThis.__T = T;
    const editor = new Function(code + '\nreturn initDashboardEditor;')()(T);
    const root = new T.view.ViewLayout('', 'g'); root.layout.type = 'column';
    const row = new T.view.ViewLayout('', 'g');
    const a = new T.view.ViewChart('', ['a'], 'g'), b = new T.view.ViewCurrentValue('', ['b'], 'g'), c = new T.view.ViewLog('', ['c'], 'g');
    root.addView(row); row.addView(a); row.addView(b); root.addView(c);
    T.view.addView(root); // a dashboard registers its layout (Dashboard.setView)
    editor.setRoot(root);
    return { T, editor, root, row, a, b, c };
}
const ids = (container) => container.views.map(v => v.id);

test('type labels are the element type, never the content', () => {
    const { editor, root, row, a, b, c } = setup();
    a.setOption('title', 'Speed');
    assert.deepEqual([root, row, a, b, c].map(editor.typeLabel), ['Column', 'Row', 'Chart', 'Values', 'Log']);
});

test('parents, paths and containment', () => {
    const { editor, root, row, a } = setup();
    assert.equal(editor.getParent(a), row);
    assert.equal(editor.getParent(row), root);
    assert.equal(editor.getParent(root), undefined);
    assert.deepEqual(editor.getPath(a), [root, row, a]);
    assert.ok(editor.contains(root, a) && !editor.contains(a, root));
});

test('select reveals a view hidden behind another tab of a stack, and ignores the root', () => {
    const { T, editor, root, a } = setup();
    const stack = new T.view.ViewStack('', 'g');
    const x = new T.view.ViewLog('', ['x'], 'g'), y = new T.view.ViewLog('', ['y'], 'g');
    stack.addView(x); stack.addView(y); root.addView(stack);
    stack.layout.selected = x.id;
    assert.equal(editor.select(y.id), true);
    assert.equal(stack.layout.selected, y.id);
    assert.equal(editor.state.selectedId, y.id);
    assert.equal(editor.select(root.id), false);
    assert.equal(editor.state.selectedId, '');
    editor.select(a.id); editor.select(''); assert.equal(editor.getSelected(), undefined);
});

test('sizes are clamped, the root has none', () => {
    const { editor, root, a } = setup();
    assert.equal(editor.resize(a.id, 'width', +100), true);
    assert.equal(a.layout.width, editor.WIDTH_MAX);
    editor.resize(a.id, 'width', -100);   assert.equal(a.layout.width, editor.WIDTH_MIN);
    editor.resize(a.id, 'height', -100);  assert.equal(a.layout.height, editor.HEIGHT_MIN);
    editor.resize(a.id, 'height', +100);  assert.equal(a.layout.height, editor.HEIGHT_MAX);
    assert.equal(editor.setSize(root.id, 'width', 3), false);
    assert.equal(editor.setSize(a.id, 'depth', 3), false);
    assert.equal(editor.setSize(a.id, 'width', 'abc'), false);
});

test('share of the parent and minimum height', () => {
    const { editor, a, b } = setup();
    a.setSize(3, 2); b.setSize(1, 3);
    assert.equal(editor.getShare(a), 75);
    assert.equal(editor.getShare(b), 25);
    assert.equal(editor.getMinHeightEm(b), 12);
});

test('moveView: into another container at an index, within the same one, never into itself', () => {
    const { editor, root, row, a, b, c } = setup();
    assert.equal(editor.moveView(c.id, row.id, 1), true);
    assert.deepEqual(ids(row), [a.id, c.id, b.id]);
    assert.deepEqual(ids(root), [row.id]);
    // same container: index counts the places before the move
    assert.equal(editor.moveView(a.id, row.id, 3), true);
    assert.deepEqual(ids(row), [c.id, b.id, a.id]);
    assert.equal(editor.moveView(a.id, row.id, 0), true);
    assert.deepEqual(ids(row), [a.id, c.id, b.id]);
    // refused moves change nothing
    assert.equal(editor.moveView(row.id, row.id, 0), false);
    assert.equal(editor.moveView(root.id, row.id, 0), false);
    assert.equal(editor.moveView(a.id, a.id, 0), false);
    assert.deepEqual(ids(row), [a.id, c.id, b.id]);
});

test('moveView: a container cannot go inside its descendants', () => {
    const { T, editor, root, row } = setup();
    const inner = new T.view.ViewLayout('', 'g'); row.addView(inner);
    assert.equal(editor.moveView(row.id, inner.id, 0), false);
    assert.equal(editor.getParent(row), root);
});

test('moving into a stack displays the moved view; moving to another parent unmounts it', () => {
    const { T, editor, root, a } = setup();
    const stack = new T.view.ViewStack('', 'g'); root.addView(stack);
    let disposed = 0; a.dispose = () => disposed++;
    assert.equal(editor.moveView(a.id, stack.id), true);
    assert.equal(stack.layout.selected, a.id);
    assert.equal(disposed, 1);
});

test('moveBy shifts a view inside its parent and stops at the ends', () => {
    const { editor, row, a, b } = setup();
    assert.equal(editor.moveBy(a.id, 1), true);
    assert.deepEqual(ids(row), [b.id, a.id]);
    assert.equal(editor.moveBy(a.id, 1), false);
    assert.equal(editor.moveBy(a.id, -1), true);
    assert.deepEqual(ids(row), [a.id, b.id]);
    assert.equal(editor.moveBy(a.id, -1), false);
});

test('duplicate: copy right after the original, selected, independent', () => {
    const { editor, row, a, b } = setup();
    a.setOption('title', 'Speed');
    const copy = editor.duplicateView(a.id);
    assert.deepEqual(ids(row), [a.id, copy.id, b.id]);
    assert.equal(editor.state.selectedId, copy.id);
    assert.equal(copy.getOption('title'), 'Speed');
    copy.addTelemetry('z');
    assert.deepEqual(Array.from(a.telemetryIdOrNameList), ['a']);
    assert.equal(editor.duplicateView(editor.getRoot().id), undefined);
});

test('duplicate a container copies its content', () => {
    const { editor, root, row } = setup();
    const copy = editor.duplicateView(row.id);
    assert.equal(root.views.length, 3);
    assert.equal(copy.views.length, 2);
    assert.notEqual(copy.views[0].id, row.views[0].id);
});

test('remove: detaches and unregisters the view and its children, clears the selection', () => {
    const { T, editor, root, row, a } = setup();
    [root, row, a].forEach(v => T.view.addView(v));
    editor.select(a.id);
    assert.equal(editor.removeView(row.id), true);
    assert.equal(root.views.length, 1);
    assert.equal(T.view.getView(a.id), undefined);
    assert.equal(editor.state.selectedId, '');
    assert.equal(editor.removeView(root.id), false);
});

test('container type: row/column switch in place, stack replaces the container and keeps its children', () => {
    const { T, editor, root, row, a, b, c } = setup();
    row.setSize(3, 2);
    assert.equal(editor.setContainerType(row.id, 'column'), row);
    assert.equal(row.layout.type, 'column');

    editor.select(row.id);
    const stack = editor.setContainerType(row.id, 'stack');
    assert.notEqual(stack, row);
    assert.equal(editor.typeLabel(stack), 'Stack');
    assert.deepEqual(ids(stack), [a.id, b.id]);
    assert.deepEqual([stack.layout.width, stack.layout.height], [3, 2]);
    assert.deepEqual(ids(root), [stack.id, c.id]);
    assert.equal(editor.state.selectedId, stack.id);
    assert.equal(row.views.length, 0);

    const back = editor.setContainerType(stack.id, 'row');
    assert.equal(editor.typeLabel(back), 'Row');
    assert.deepEqual(ids(back), [a.id, b.id]);

    // the root of the dashboard only switches between row, column and grid
    assert.equal(editor.setContainerType(root.id, 'stack'), root);
    assert.equal(root.layout.type, 'column');
    assert.equal(editor.setContainerType(root.id, 'row'), root);
    assert.equal(root.layout.type, 'row');
    assert.equal(editor.setContainerType(root.id, 'grid'), root);
    assert.equal(root.layout.type, 'grid');
});

test('grid containers: switched in place, added from the menu, a view takes columns of the grid', () => {
    const { editor, root, row, a, b } = setup();
    assert.equal(editor.setContainerType(row.id, 'grid'), row);
    assert.equal(editor.typeLabel(row), 'Grid');
    assert.equal(editor.isGrid(row), true);
    row.grid.columns = 4;
    a.setSize(2); b.setSize(8);
    assert.equal(editor.getShare(a), 50);
    assert.equal(editor.getShare(b), 100, 'never wider than the grid');
    const grid = editor.addView('grid', root.id);
    assert.deepEqual([grid.layout.type, grid.layout.align, editor.typeLabel(grid)], ['grid', 'stretch', 'Grid']);
    assert.ok(editor.ADD_TYPES.includes('grid'));
    const dropped = editor.dropTelemetries([], grid.id);
    assert.deepEqual(dropped, []);
    assert.equal(editor.addView('chart', grid.id).layout.width, 2, 'a chart takes two columns');
    assert.equal(editor.addView('values', grid.id).layout.width, 1);
    assert.equal(editor.addView('log', grid.id).layout.width, 2);
});

test('disabling edit mode clears the selection; changing the root resets it', () => {
    const { editor, a } = setup();
    editor.setEnabled(true); editor.select(a.id);
    editor.setEnabled(false);
    assert.equal(editor.state.selectedId, '');
    editor.setEnabled(true); editor.select(a.id);
    editor.setRoot(undefined);
    assert.equal(editor.state.selectedId, '');
});

test('addView: views and empty containers at an index, selected while editing, the group follows the container', () => {
    const { editor, root, row, a, b } = setup();
    editor.setEnabled(true);
    const log = editor.addView('log', row.id, 1);
    assert.ok(log instanceof globalThis.__T.view.ViewLog);
    assert.deepEqual(ids(row), [a.id, log.id, b.id]);
    assert.equal(log.group, 'g');
    assert.equal(editor.state.selectedId, log.id);
    const inner = editor.addView('column', row.id);            // default: the end
    assert.equal(row.views.at(-1).id, inner.id);
    assert.deepEqual([inner.layout.type, inner.views.length], ['column', 0]);
    assert.equal(editor.addView('stack', root.id, 0).layout.type, 'stack');
    assert.equal(root.views[0].layout.type, 'stack');
    assert.equal(editor.addView('chart', inner.id, 99).layout.width, 2, 'index beyond the end = the end');
    assert.equal(editor.addView('nope', row.id), undefined);
    assert.equal(editor.addView('chart', a.id), undefined, 'a view is not a container');
    assert.equal(editor.addView('chart', 'missing'), undefined);
});

test('addView into a stack displays the new view; selection is left alone outside edit mode', () => {
    const { T, editor, root } = setup();
    const stack = new T.view.ViewStack('', 'g'); root.addView(stack);
    const v = editor.addView('values', stack.id);
    assert.equal(stack.layout.selected, v.id);
    assert.equal(editor.state.selectedId, '', 'not editing');
});

test('dropTelemetries: numbers together in a chart, the rest together in a values view, unknown ids ignored', () => {
    const { T, editor, row, a } = setup();
    const now = Date.now() / 1000;
    const n1 = T.datastore.addTelemetry('n1'), n2 = T.datastore.addTelemetry('n2'), t1 = T.datastore.addTelemetry('t1');
    n1.addData(T.protocol.SECTION_TYPE_TELEM_DATA_NUMBER, [now], [[1]]);
    n2.addData(T.protocol.SECTION_TYPE_TELEM_DATA_NUMBER, [now], [[2]]);
    t1.addData(T.protocol.SECTION_TYPE_TELEM_DATA_TEXT, [now], [['x']]);
    const created = editor.dropTelemetries([t1.id, n1.id, 9999, n2.id, n1.id], row.id, 1);
    assert.deepEqual(created.map(editor.typeLabel), ['Values', 'Chart']);        // order of first appearance
    assert.deepEqual(ids(row), [a.id, created[0].id, created[1].id, row.views[3].id]);
    assert.deepEqual(Array.from(created[1].telemetryIdOrNameList), [n1.id, n2.id]);
    assert.deepEqual(Array.from(created[0].telemetryIdOrNameList), [t1.id]);
    assert.deepEqual(editor.dropTelemetries([9999], row.id), []);
});

test('slotLayout: seams between children, ends of the container, empty containers', () => {
    const { editor } = setup();
    const R = (left, top, right, bottom) => ({ left, top, right, bottom });
    const cont = R(0, 0, 300, 100);
    const kids = [{ index: 0, rect: R(10, 10, 100, 90) }, { index: 1, rect: R(110, 20, 290, 80) }];
    const row = editor.slotLayout(true, cont, kids);
    assert.deepEqual(row.map(s => [s.index, s.vertical, s.x]), [[0, true, 10], [1, true, 105], [2, true, 290]]);
    assert.deepEqual([row[1].y, row[1].length], [10, 80], 'a seam spans both neighbours');
    const col = editor.slotLayout(false, R(0, 0, 100, 300), [{ index: 0, rect: R(10, 10, 90, 100) }, { index: 1, rect: R(10, 120, 90, 200) }]);
    assert.deepEqual(col.map(s => [s.index, s.vertical, s.y]), [[0, false, 10], [1, false, 110], [2, false, 200]]);
    assert.deepEqual(editor.slotLayout(true, cont, kids, 9).map(s => s.x), [19, 105, 281], 'inset keeps the ends away from the parent');
    const empty = editor.slotLayout(true, cont, []);
    assert.deepEqual([empty.length, empty[0].empty, empty[0].x, empty[0].y], [1, true, 150, 50]);
});

test('slotLayout: a wrapping row gets end slots on every line, children keep their real index', () => {
    const { editor } = setup();
    const R = (left, top, right, bottom) => ({ left, top, right, bottom });
    const kids = [{ index: 0, rect: R(0, 0, 100, 50) }, { index: 1, rect: R(110, 0, 200, 50) }, { index: 2, rect: R(0, 60, 100, 110) }];
    const slots = editor.slotLayout(true, R(0, 0, 210, 120), kids);
    assert.deepEqual(slots.map(s => [s.index, s.x, s.y]), [[0, 0, 0], [1, 105, 0], [2, 200, 0], [2, 0, 60], [3, 100, 60]]);
    // children that are not displayed (hidden stack views) leave a gap in the indexes
    const gap = editor.slotLayout(true, R(0, 0, 300, 50), [{ index: 0, rect: R(0, 0, 100, 50) }, { index: 2, rect: R(110, 0, 200, 50) }]);
    assert.deepEqual(gap.map(s => s.index), [0, 2, 3]);
});

test('views added by the editor start taller than the library default, containers are left alone', () => {
    const { editor, root } = setup();
    const chart = editor.addView('chart', root.id);
    assert.equal(chart.layout.height, editor.NEW_VIEW_HEIGHT);
    assert.ok(editor.NEW_VIEW_HEIGHT > 4);
    const row = editor.addView('row', root.id);
    assert.notEqual(row.layout.height, editor.NEW_VIEW_HEIGHT);
});
