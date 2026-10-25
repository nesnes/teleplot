// Every example of the Python client, run for about a second by ./test.sh (run_example.py): the library of the page understands
// everything it sent and gets the telemetries the example is about.
const fs = require('node:fs');
const path = require('node:path');
const test = require('../../../packages/teleplot-js/tests/helpers/mini-test');
const assert = require('node:assert/strict');
const { loadTeleplot } = require('../../../packages/teleplot-js/tests/helpers/load');

const OUT = path.join(process.env.TELEPLOT_PYTHON_OUT || path.join(__dirname, '..', 'build'), 'examples');
const EXAMPLES = path.join(__dirname, '..', 'examples');

const EXPECT = {
    '01_first_value': { wave: 'number' },
    '02_describe': { battery: 'number' },
    '03_together': { 'motor.left': 'number', 'motor.right': 'number' },
    '04_logs': { presses: 'number', events: 'log' },
    '05_what_runs': { task: 'stack' },
    '06_moving_shape': { robot: 'shape' },
    '07_settings': { gain: 'setting', wave: 'number' },
    '08_buttons': { say: 'action' },
    '09_states': { mode: 'text' },
    '10_map_position': { gps: 'xy' },
    '11_scene_3d': { body: 'shape', arm: 'shape' },
    '12_drawings': { path: 'shape', goal: 'shape', wind: 'shape' },
    '13_lidar': { lidar: 'cloud' },
    '14_picture': { camera: 'image' },
    '15_joystick': { drive: 'setting', speed: 'number' },
    '16_setting_rules': { mode: 'setting', target: 'setting' },
    '17_time_and_rate': { reading: 'number', fast: 'number' },
    '18_threads': { 'motor.current': 'number', task: 'stack', 'task.control': 'stack' },
    '19_file': { temperature: 'number' },
    '20_dashboard': { speed: 'number', mode: 'text' },
    '21_stats': { 'teleplot.packets': 'number', 'teleplot.queued': 'number' },
    '22_text_protocol': { wave: 'number' },
};

function read(name) {
    const U = loadTeleplot();
    let problems = 0;
    problems += U.files.importData(new Uint8Array(fs.readFileSync(path.join(OUT, name + '.teleplot')))).problems;
    const text = fs.readFileSync(path.join(OUT, name + '.teleplot.txt'), 'utf8');
    if (text !== '') problems += U.files.importData(text).problems;
    U.__timers.run();
    return { U, problems };
}
function holds(U, telem, kind) {
    const P = U.protocol, has = (type) => telem.data[type] !== undefined && telem.data[type].timestamps.length > 0;
    switch (kind) {
        case 'number': return has(P.SECTION_TYPE_TELEM_DATA_NUMBER);
        case 'text': return has(P.SECTION_TYPE_TELEM_DATA_TEXT);
        case 'log': return has(P.SECTION_TYPE_TELEM_DATA_TEXT) && telem.getAttribute(P.TELEM_ATTR_LOG) === true;
        case 'stack': return has(P.SECTION_TYPE_TELEM_DATA_TEXT) && telem.getAttribute(P.TELEM_ATTR_STACK) === true;
        case 'xy': return has(P.SECTION_TYPE_TELEM_DATA_NUMBER_2D);
        case 'shape': return telem.getAttribute(P.TELEM_ATTR_SHAPE) !== undefined;
        case 'cloud': return has(P.SECTION_TYPE_TELEM_DATA_POINT_CLOUD);
        case 'image': return has(P.SECTION_TYPE_TELEM_DATA_IMAGE);
        case 'setting': return (telem.getAttribute(P.TELEM_ATTR_WRITE) || {}).kind === 'setting';
        case 'action': return (telem.getAttribute(P.TELEM_ATTR_WRITE) || {}).kind === 'action';
    }
    throw new Error(kind);
}

test('every example is run by the tests, and every test has its example', () => {
    assert.deepEqual(fs.readdirSync(EXAMPLES).filter((n) => n.endsWith('.py')).map((n) => n.slice(0, -3)).sort(), Object.keys(EXPECT).sort());
});

for (const [name, expect] of Object.entries(EXPECT)) {
    test(`${name}: everything understood, ${Object.keys(expect).join(', ')}`, () => {
        const { U, problems } = read(name);
        assert.equal(problems, 0);
        for (const [telemetry, kind] of Object.entries(expect)) {
            const telem = U.datastore.findByName(telemetry);
            assert.ok(telem, `telemetry ${telemetry}`);
            assert.ok(holds(U, telem, kind), `${telemetry} is a ${kind}`);
        }
    });
}
