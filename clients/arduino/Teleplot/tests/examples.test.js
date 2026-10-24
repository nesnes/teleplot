// Every example, run on a computer by ./test.sh (run_example.cpp, 6 simulated seconds): the library of the page understands every
// line it wrote (serial port, UDP packets, SD file) and gets the telemetries the example is about.
const fs = require('node:fs');
const path = require('node:path');
const test = require('../../../../packages/teleplot-js/tests/helpers/mini-test');
const assert = require('node:assert/strict');
const { loadTeleplot } = require('../../../../packages/teleplot-js/tests/helpers/load');

const OUT = path.join(process.env.TELEPLOT_MICRO_OUT || path.join(__dirname, '..', 'build'), 'examples');
const EXAMPLES = path.join(__dirname, '..', 'examples');

// What each example must give the page (names of telemetries, and what each holds)
const EXPECT = {
    '01_FirstValue': { wave: 'number' },
    '02_Describe': { battery: 'number' },
    '03_Together': { 'motor.left': 'number', 'motor.right': 'number' },
    '04_Logs': { presses: 'number', events: 'log' },
    '05_WhatRuns': { task: 'stack' },
    '06_MovingShape': { robot: 'shape' },
    '07_Settings': { 'blink.period': 'setting' },
    '08_Buttons': { blink: 'action' },
    '09_WiFiUDP': { rssi: 'number', wave: 'number' },
    '10_States': { mode: 'text' },
    '11_MapPosition': { gps: 'xy' },
    '12_Scene3D': { body: 'shape', arm: 'shape' },
    '13_Drawings': { path: 'shape', goal: 'shape', wind: 'shape' },
    '14_Lidar': { lidar: 'cloud' },
    '15_Picture': { tile: 'image' },
    '16_Joystick': { drive: 'setting', speed: 'number' },
    '17_SettingRules': { mode: 'setting', target: 'setting' },
    '18_TimeAndRate': { reading: 'number', fast: 'number' },
    '19_Dates': { wave: 'number' },
    '20_SDCard': { temperature: 'number' },
    '21_Dashboard': { speed: 'number', mode: 'text' },
    '22_SmallBoards': { a: 'number', c: 'number', 'teleplot.tooBig': 'number', 'teleplot.samples': 'number' },
};

function read(name) {
    const U = loadTeleplot();
    let problems = 0;
    for (const [suffix, options] of [['serial', { serial: true }], ['udp', {}], ['sd', {}]]) {
        const text = fs.readFileSync(path.join(OUT, `${name}.${suffix}.txt`), 'utf8');
        if (text !== '') problems += U.files.importData(text, options).problems;
    }
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
    assert.deepEqual(fs.readdirSync(EXAMPLES).filter((n) => !n.startsWith('.')).sort(), Object.keys(EXPECT).sort());
});

for (const [name, expect] of Object.entries(EXPECT)) {
    test(`${name}: every line understood, ${Object.keys(expect).join(', ')}`, () => {
        const { U, problems } = read(name);
        assert.equal(problems, 0);
        for (const [telemetry, kind] of Object.entries(expect)) {
            const telem = U.datastore.findByName(telemetry);
            assert.ok(telem, `telemetry ${telemetry}`);
            assert.ok(holds(U, telem, kind), `${telemetry} is a ${kind}`);
        }
    });
}

test('details: 15_Picture is the PNG itself, 21_Dashboard makes its dashboard, 18 keeps 20 "fast" samples per second', () => {
    const picture = read('15_Picture').U;
    const tile = picture.datastore.findByName('tile').data[picture.protocol.SECTION_TYPE_TELEM_DATA_IMAGE].data[1][0];
    assert.deepEqual(Array.from(Buffer.from(tile, 'base64').subarray(0, 4)), [0x89, 0x50, 0x4E, 0x47]);
    assert.ok(read('21_Dashboard').U.dashboards.dashboards.Robot);
    const timing = read('18_TimeAndRate').U;
    const fast = timing.datastore.findByName('fast').data[timing.protocol.SECTION_TYPE_TELEM_DATA_NUMBER].timestamps;
    const perSecond = fast.length / (fast[fast.length - 1] - fast[0]);
    assert.ok(perSecond <= 20.5 && perSecond > 15, `${perSecond} per second`);
});
