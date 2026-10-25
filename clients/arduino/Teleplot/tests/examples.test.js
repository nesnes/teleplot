// Every example, run on a computer by ./test.sh (run_example.cpp, 6 simulated seconds): the library of the page understands every
// line it wrote (serial port, UDP packets, SD file) and gets the telemetries of the example, as in every language (clients/examples.js).
const fs = require('node:fs');
const path = require('node:path');
const test = require('../../../../packages/teleplot-js/tests/helpers/mini-test');
const assert = require('node:assert/strict');
const { loadTeleplot } = require('../../../../packages/teleplot-js/tests/helpers/load');
const { testExamples } = require('../../../examples.js');

const OUT = path.join(process.env.TELEPLOT_MICRO_OUT || path.join(__dirname, '..', 'build'), 'examples');
const names = fs.readdirSync(path.join(__dirname, '..', 'examples')).filter((n) => !n.startsWith('.')).sort();

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

testExamples(test, names, read, {}, {
    '30_WiFiUDP': { rssi: 'number', wave: 'number' },
    '31_SmallBoards': { a: 'number', c: 'number', 'teleplot.tooBig': 'number', 'teleplot.samples': 'number' },
});

test('details: 13_Picture is the PNG itself, 15_DepthMap its numbers, 20 keeps 20 "fast" samples per second', () => {
    const picture = read('13_Picture').U;
    const camera = picture.datastore.findByName('camera').data[picture.protocol.SECTION_TYPE_TELEM_DATA_IMAGE].data[1][0];
    assert.deepEqual(Array.from(Buffer.from(camera, 'base64').subarray(0, 4)), [0x89, 0x50, 0x4E, 0x47]);
    const depth = read('15_DepthMap').U;
    const numbers = Buffer.from(depth.datastore.findByName('depth').data[depth.protocol.SECTION_TYPE_TELEM_DATA_IMAGE].data[1][0], 'base64');
    assert.equal(numbers.length, 8 + 8 * 8 * 2);
    assert.deepEqual([numbers.readUInt16LE(0), numbers.readUInt16LE(2), numbers[4]], [8, 8, 0]);
    const timing = read('20_TimeAndRate').U;
    const fast = timing.datastore.findByName('fast').data[timing.protocol.SECTION_TYPE_TELEM_DATA_NUMBER].timestamps;
    const perSecond = fast.length / (fast[fast.length - 1] - fast[0]);
    assert.ok(perSecond <= 20.5 && perSecond > 15, `${perSecond} per second`);
});
