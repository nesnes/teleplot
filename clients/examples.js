// The examples of every client, one set for all languages: the same numbers, the same ideas, the same telemetries. Each client's
// examples.test.js runs its examples, reads what they sent with the library of the page, and checks it against this list; a
// language without one of them says why (MISSING), what only one language has is numbered from 30 (its own EXTRA list).
const assert = require('node:assert/strict');

const COMMON = {
    1: ['first value', { wave: 'number' }],
    2: ['describe', { battery: 'number', debug: 'number' }],
    3: ['together', { 'motor.left': 'number', 'motor.right': 'number' }],
    4: ['logs', { events: 'log' }],
    5: ['states', { mode: 'text' }],
    6: ['what runs', { task: 'stack' }],
    7: ['map position', { gps: 'xy' }],
    8: ['moving shape', { robot: 'shape' }],
    9: ['drawings', { path: 'shape', zone: 'shape', spot: 'shape', wind: 'shape', goal: 'shape' }],
    10: ['scene 3D', { body: 'shape', arm: 'shape', drone: 'xyz' }],
    11: ['looks', { ball: 'shape', glass: 'shape', pawn: 'shape', sign: 'shape' }],
    12: ['lidar', { lidar: 'cloud' }],
    13: ['picture', { camera: 'image' }],
    14: ['camera', { camera: 'camera', box: 'shape', detection: 'shape' }],
    15: ['depth map', { depth: 'depth' }],
    16: ['settings', { gain: 'setting', wave: 'number' }],
    17: ['buttons', { blink: 'action' }],
    18: ['joystick', { drive: 'setting', speed: 'number' }],
    19: ['setting rules', { mode: 'setting', target: 'setting' }],
    20: ['time and rate', { reading: 'number', fast: 'number' }],
    21: ['clock', { wave: 'number' }],
    22: ['recording', { temperature: 'number' }],
    23: ['dashboard', { speed: 'number', mode: 'text' }],
    24: ['stats', { 'teleplot.samples': 'number', 'teleplot.bytes': 'number' }],
    25: ['graphs', { mode: 'graph', bt: 'graph' }],
};

function holds(U, telem, kind) {
    const P = U.protocol, has = (type) => telem.data[type] !== undefined && telem.data[type].timestamps.length > 0;
    switch (kind) {
        case 'number': return has(P.SECTION_TYPE_TELEM_DATA_NUMBER);
        case 'text': return has(P.SECTION_TYPE_TELEM_DATA_TEXT);
        case 'log': return has(P.SECTION_TYPE_TELEM_DATA_TEXT) && telem.getAttribute(P.TELEM_ATTR_LOG) === true;
        case 'stack': return has(P.SECTION_TYPE_TELEM_DATA_TEXT) && telem.getAttribute(P.TELEM_ATTR_STACK) === true;
        case 'xy': return has(P.SECTION_TYPE_TELEM_DATA_NUMBER_2D);
        case 'xyz': return has(P.SECTION_TYPE_TELEM_DATA_NUMBER_3D);
        case 'shape': return telem.getAttribute(P.TELEM_ATTR_SHAPE) !== undefined;
        case 'cloud': return has(P.SECTION_TYPE_TELEM_DATA_POINT_CLOUD);
        case 'image': return has(P.SECTION_TYPE_TELEM_DATA_IMAGE);
        case 'camera': return has(P.SECTION_TYPE_TELEM_DATA_IMAGE) && has(P.SECTION_TYPE_TELEM_DATA_CAMERA_INTRINSICS);
        case 'depth': return has(P.SECTION_TYPE_TELEM_DATA_IMAGE) && (telem.getAttribute(P.TELEM_ATTR_PIXELS) || {}).depth === true;
        case 'setting': return (telem.getAttribute(P.TELEM_ATTR_WRITE) || {}).kind === 'setting';
        case 'action': return (telem.getAttribute(P.TELEM_ATTR_WRITE) || {}).kind === 'action';
        case 'graph': return has(P.SECTION_TYPE_TELEM_DATA_TEXT) && telem.hasStructure(); // (a structure, doc/graph.md, and what runs in it)
    }
    throw new Error('unknown kind ' + kind);
}

// What a page made of an example's files must hold
function check(U, expect) {
    for (const [telemetry, kind] of Object.entries(expect)) {
        const telem = U.datastore.findByName(telemetry);
        assert.ok(telem, `telemetry ${telemetry}`);
        assert.ok(holds(U, telem, kind), `${telemetry} is a ${kind}`);
    }
}

// The tests of the examples of a client. names: its example names (01_FirstValue, 01_first_value...); read(name) → {U, problems};
// missing: {number: why}; extra: {name: expect}.
function testExamples(test, names, read, missing, extra, skip = {}) {  // skip: name -> why it cannot run here (a module not installed)
    const number = (name) => parseInt(name, 10);
    test('the examples are the common set (missing ones say why), then this language\'s own (30 and up)', () => {
        for (const n of Object.keys(COMMON).map(Number)) {
            const has = names.some((name) => number(name) === n);
            assert.ok(has !== (n in missing), has ? `${n} (${COMMON[n][0]}) is there but listed as missing` : `${n} (${COMMON[n][0]}) is missing`);
        }
        for (const name of names) assert.ok(number(name) in COMMON || name in extra, `${name}: not in the common set, nor in this language's own`);
        for (const name of Object.keys(extra)) assert.ok(number(name) >= 30 && names.includes(name), `${name}: its own examples are numbered from 30`);
    });
    for (const name of names) {
        const expect = number(name) in COMMON ? COMMON[number(name)][1] : extra[name];
        test(`${name}: everything understood, ${Object.keys(expect).join(', ')}`, { skip: skip[name] }, () => {
            const { U, problems } = read(name);
            assert.equal(problems, 0);
            check(U, expect);
            if (number(name) === 23) assert.ok(U.dashboards.dashboards.Robot, 'the dashboard "Robot"');
        });
    }
}

module.exports = { COMMON, holds, check, testExamples };
