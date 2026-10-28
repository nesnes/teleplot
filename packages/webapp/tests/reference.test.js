// The Reference tab of the Help panel (components/help-reference.js): complete, true to the clients, understood, and the same as doc/reference.md
const fs = require('node:fs');
const path = require('node:path');
const test = require('../../teleplot-js/tests/helpers/mini-test');
const assert = require('node:assert/strict');
const { loadTeleplot } = require('../../teleplot-js/tests/helpers/load');
const { loadReference, markdown, FILE } = require('../tools/reference-md');

const R = loadReference();
const ROOT = path.join(__dirname, '..', '..', '..');
const T0 = loadTeleplot();
const OPTIONS = R.refOptionRows(T0);
const allRows = () => [...Object.values(R.REF_ROWS), ...Object.values(OPTIONS).flat()];
const NOW = 1627551892437;

test('the Reference names every property, kind, flag, key, type and option the library knows', () => {
    const parser = fs.readFileSync(path.join(ROOT, 'packages', 'teleplot-js', 'src', '040-parseDataText.js'), 'utf8');
    const block = (start) => parser.slice(parser.indexOf(start), parser.indexOf(';', parser.indexOf(start)));
    const keysOf = (start) => [...block(start).matchAll(/([A-Za-z]+): \[/g)].map(m => m[1]);
    const listOf = (start) => [...block(start).matchAll(/"([A-Za-z]+)"/g)].map(m => m[1]);
    const rows = Object.values(R.REF_ROWS);
    const text = rows.flatMap(r => [r.text || '', r.alt || '', r.values || '']).join('\n');
    const named = (word) => new RegExp('(^|[^A-Za-z])' + word + '(?![A-Za-z])').test(text);
    const missing = (words) => words.filter(w => !named(w));
    assert.deepEqual(missing(keysOf('const _parseDataText_3DProperties')), [], 'properties of 3D| and 2D| lines, short and long names');
    assert.deepEqual(missing(Object.keys(JSON.parse(block('const _parseDataText_shapeTypes =').replace(/^[^{]*/, '').replace(/(\w+):/g, '"$1":')))), [], 'kinds of shapes');
    assert.deepEqual(['t', 'log', 'stack', 'xy', 'xyz', 'pc', 'enum', 'edges', 'np', 'clr'].filter(f => !text.includes('|' + f)), [], 'flags');
    const attributes = [...listOf('if(!["min"'), ...listOf('const _parseDataText_WRITE_KEYS'), ...listOf('const _parseDataText_ARG_KEYS'), 'arg'];
    assert.ok(attributes.length > 15);
    assert.deepEqual(missing(attributes), [], 'keys of ATTR| lines');
    assert.deepEqual(missing(T0.protocol.WRITE_TYPES.filter(Boolean)), [], 'types of settings and arguments');
    assert.deepEqual(missing([...T0.view.VIEW_TYPES, 'row', 'column', 'grid', 'stack', 'none']), [], 'types of DASH| lines');
    const layout = Object.keys(new T0.view.ViewLayout('', 'g').layout).filter(k => !['type', 'selected', 'width', 'height'].includes(k));
    assert.deepEqual(missing([...layout, 'w', 'h', 'title', 'time', 'follow']), [], 'options of DASH| lines');
    assert.deepEqual(['3D|', '2D|', 'ATTR|', 'TH|', 'DASH|', 'ACK|', 'PNG|', 'JPG|', 'RAW|', '>:', '!name#id', '§'].filter(f => !text.includes(f)), [], 'kinds of lines');
    // Every option of every view has its sentence (the names and values come from the views), and no sentence is left over
    const keys = new Set(Object.values(OPTIONS).flat().map(r => r.text.slice(1, -1)));
    assert.deepEqual([...keys].filter(k => !R.REF_OPTIONS[k]), [], 'a sentence for each option of a view (REF_OPTIONS)');
    assert.deepEqual(Object.keys(R.REF_OPTIONS).filter(k => !keys.has(k)), [], 'no sentence for an option that does not exist');
    for (const type of T0.view.VIEW_TYPES) assert.ok(R.REF_THINGS.some(t => t.view == type), 'a page for the view ' + type);
});

test('every call of the C++ reference has a row, and every call of a row exists in its client', () => {
    const doc = fs.readFileSync(path.join(ROOT, 'doc', 'cpp-client-api.md'), 'utf8');
    const reference = doc.slice(doc.indexOf('## Reference'), doc.indexOf('### Types'));
    const pictures = doc.slice(doc.indexOf('## Pictures (`TeleplotImage.h`)'), doc.indexOf('The encoding thread'));
    const calls = new Set();
    for (const part of [reference, pictures]) for (const m of part.matchAll(/`([^`]*)`/g)) for (const n of m[1].matchAll(/([A-Za-z_]\w*)(?:<\w+>)?\(/g)) calls.add(n[1]);
    for (const skip of ['Teleplot', 'Options', 'fn', 'Pixels', 'Picture', 'Jpeg', 'Png', 'Raw', 'Arg', 'void', 'micros']) calls.delete(skip); // (constructors and types, in the rows by their own names; words of the descriptions)
    const written = Object.values(R.REF_ROWS).flatMap(r => [r.call || '', r.ino || '', r.py || '']).join('\n');
    assert.deepEqual([...calls].filter(c => !new RegExp('\\b' + c + '\\b').test(written)), [], 'calls of doc/cpp-client-api.md "Reference" and "Pictures"');

    // The names a row calls are names of its client (methods, classes, constants)
    const source = {
        cpp: fs.readFileSync(path.join(ROOT, 'clients', 'cpp', 'Teleplot.h'), 'utf8') + fs.readFileSync(path.join(ROOT, 'clients', 'cpp', 'TeleplotImage.h'), 'utf8'),
        ino: fs.readFileSync(path.join(ROOT, 'clients', 'arduino', 'Teleplot', 'src', 'Teleplot.h'), 'utf8'),
        py: fs.readFileSync(path.join(ROOT, 'clients', 'python', 'teleplot.py'), 'utf8'),
    };
    const words = Object.fromEntries(Object.entries(source).map(([k, s]) => [k, new Set(s.match(/[A-Za-z_]\w*/g))]));
    const ignore = new Set(['tp', 'name', 'v', 'a', 'x', 'y', 'z', 'w', 'h', 's', 'n', 't', 'r', 'fn', 'data', 'size', 'bytes', 'pts', 'points', 'variable', 'initial', 'handler', 'call', 'result',
        'pixels', 'factor', 'path', 'picture', 'colors', 'intensities', 'roll', 'pitch', 'yaw', 'or', 'with', 'lambda', 'return', 'float', 'const', 'auto', 'args', 'speed', 'camera', 'object', 'attribute', 'udp', 'host', 'port', 'file', 'text', 'value', 'time', 'why', 'Serial']);
    for (const row of Object.values(R.REF_ROWS)) for (const lang of ['cpp', 'py', 'ino']) {
        const c = R.refCall(row, lang);
        if (c.none) continue;
        const code = c.text.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/^(float|double|int|bool|std::string|char\[N\]|str)(, .*)$/, '');
        for (const m of code.matchAll(/([A-Za-z_]\w*)/g)) {
            const word = m[1];
            if (ignore.has(word) || /^[a-z]\d?$/.test(word) || /^(k1|k2|k3|p1|p2|fx|fy|cx|cy)$/.test(word)) continue;
            assert.ok(words[lang].has(word), `${lang}: ${word} (row ${row.id}: ${c.text})`);
        }
    }
});

test('the pages: every row is on one, every drawing names rows of its page, shapes and views have a drawing', () => {
    const on = new Set(R.REF_THINGS.flatMap(t => t.rows));
    R.REF_VIEW_COMMON.forEach(id => on.add(id));
    assert.deepEqual(Object.keys(R.REF_ROWS).filter(id => !on.has(id)), [], 'rows that no page shows');
    for (const thing of R.REF_THINGS) {
        assert.ok(R.REF_FAMILIES.some(f => f.id == thing.family), thing.id + ': its family');
        for (const id of thing.rows) assert.ok(R.REF_ROWS[id], thing.id + ': row ' + id);
        if ((thing.family == 'shapes' || thing.family == 'views') && !thing.matrix) assert.ok(R.REF_DRAWINGS[thing.drawing], thing.id + ': a drawing');
        if (!thing.drawing) continue;
        const rows = R.refRowsOf(thing, OPTIONS), names = Object.fromEntries(rows.map(r => [r.id, r.name]));
        for (const [id] of R.REF_DRAWINGS[thing.drawing].parts) assert.ok(names[id], `${thing.id}: the part ${id} is a row of the page`);
        const svg = R.refDrawing(thing, null, names);
        assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'), thing.id);
        for (const [id] of R.REF_DRAWINGS[thing.drawing].parts) assert.ok(svg.includes(`data-ref-row="${id}"`) && svg.includes('>' + names[id] + '<'), `${thing.id}: ${id} is named`);
        assert.ok(R.refDrawing(thing, R.REF_DRAWINGS[thing.drawing].parts[0][0], names).includes('ref-part on'), thing.id + ': the part of the row pointed at is lit');
    }
    for (const family of R.REF_FAMILIES) assert.ok(R.REF_THINGS.some(t => t.family == family.id), family.id);
    const m = R.refMatrix();
    assert.ok(m.shapes.length >= 10 && m.rows.every(r => r.cells.some(Boolean)), 'every property of the matrix applies to a shape');
    assert.ok(m.rows.find(r => r.row.id == 'vector').cells.filter(Boolean).length == 1, 'the vector: arrows only');
});

test('every example of the Reference is understood, by a fresh page, and is written for every language', () => {
    const examples = [...allRows(), ...R.REF_THINGS].map(item => R.refExample(item)).filter(Boolean);
    assert.ok(examples.length > 60, examples.length + ' examples');
    for (const item of [...allRows(), ...R.REF_THINGS]) if (item.ex) assert.ok(R.refExample(item), 'the example of ' + (item.id) + ' is found');
    for (const ex of examples) {
        const T = loadTeleplot();
        const code = R.helpFill(ex.code, NOW);
        const problems = code.startsWith('DASH|') ? T.dashboards.receiveText(code).problems || 0 : T.parseDataText({ data: code, timestamp: NOW });
        assert.equal(problems, 0, code);
        for (const sender of R.HELP_SENDERS) {
            const line = R.helpLine(sender.id, ex, code, NOW);
            const text = line.parts.map(p => p.text).join('');
            if (sender.id == 'raw') assert.equal(text, code);
            assert.ok(text.length > 0 && (line.note || !/undefined/.test(text)), sender.id + ': ' + code);
            if (['py', 'cpp', 'ino'].includes(sender.id) && ex.lib === null) assert.ok(line.note, sender.id + ' says why there is no call: ' + code);
        }
    }
});

test('a row is written for the language: the line in Raw text and Terminal, the call of each client, or why there is none', () => {
    const lw = R.REF_ROWS.lineWidth;
    assert.deepEqual(['raw', 'sh', 'py', 'cpp', 'ino'].map(s => R.refCall(lw, s).text), ['LW:w', 'LW:w', '.lineWidth(w)', '.lineWidth(w)', '.lineWidth(w)']);
    assert.equal(R.refCall(R.REF_ROWS.shape, 'py').text, '.shape(Teleplot.Rect)', 'Python: derived from C++');
    assert.equal(R.refCall(R.REF_ROWS.write, 'py').text, 'tp.param("name", initial)', 'Python: its own form when it differs');
    assert.deepEqual([R.refCall(R.REF_ROWS.clr, 'cpp').none, R.refCall(R.REF_ROWS.clr, 'raw').none], [true, false], 'a flag the clients have no call for');
    assert.deepEqual([R.refCall(R.REF_ROWS.maxRate, 'sh').none, R.refCall(R.REF_ROWS.maxRate, 'cpp').none], [true, false], 'a call the text protocol has no line for');
    assert.equal(R.refCall(R.REF_ROWS.addOutput, 'cpp').none, true, 'Arduino only');
    const decimation = OPTIONS.chart.find(r => r.id == 'opt.chart.decimation');
    assert.deepEqual([decimation.src, decimation.def, R.refCall(decimation, 'cpp').text, R.refCall(decimation, 'raw').text], ['view', 'true', '|decimation=', '|decimation=']);
    assert.equal(decimation.ex.code, 'DASH|Reference/chart:chart|decimation=false', 'its example sets it to what it is not by default');
    // Search: values of every family, things by their title, an option once even when several views have it
    const found = R.refSearch('width', 'cpp', OPTIONS);
    assert.ok(['lineWidth', 'opt.image.outlineWidth', 'w', 'columnWidth'].every(id => found.rows.some(r => r.id == id)), found.rows.map(r => r.id).join());
    assert.deepEqual(R.refSearch('arrow', 'raw', OPTIONS).things.map(t => t.id), ['arrow']);
    assert.ok(found.rows.slice(0, 4).every(r => /width/.test(r.name)), 'what is named so comes first: ' + found.rows.map(r => r.name).join(', '));
    assert.equal(R.refSearch('point size', 'cpp', OPTIONS).rows.filter(r => r.text == '|pointSize=').length, 1);
    assert.deepEqual(R.refThingsOf('lineWidth').map(t => t.id), ['rect', 'circle', 'line', 'polygon', 'arrow']);
    assert.deepEqual(R.refThingsOf('opt.2d.trailLength').map(t => t.id), ['map']);
});

test('doc/reference.md is what the Reference writes (node packages/webapp/tools/reference-md.js)', () => {
    const written = fs.readFileSync(FILE, 'utf8');
    assert.ok(written === markdown(), 'doc/reference.md is not the Reference of the Help panel: run node packages/webapp/tools/reference-md.js');
    for (const thing of R.REF_THINGS) assert.ok(written.includes('### ' + thing.title + '\r\n'), thing.title);
    assert.ok(written.includes('[All documentation](README.md)'));
});
