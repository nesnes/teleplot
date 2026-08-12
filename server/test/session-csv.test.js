const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const www = path.join(__dirname, "..", "www");

const uPlot = {
    join: tables => {
        const timestamps = Array.from(new Set(tables.flatMap(table => table[0]))).sort((a, b) => a - b);
        return [timestamps].concat(tables.map(table => {
            const values = new Map(table[0].map((timestamp, index) => [timestamp, table[1][index]]));
            return timestamps.map(timestamp => values.has(timestamp) ? values.get(timestamp) : null);
        }));
    }
};

function exportCSV(app) {
    let savedFile;
    const context = {
        app,
        uPlot,
        saveFile: (content, name) => { savedFile = { content, name }; },
        buildFileName: (name, extension) => `${name}.${extension}`,
        module: { exports: {} }
    };

    vm.runInNewContext(
        `${fs.readFileSync(path.join(www, "utils", "import_export", "session.js"), "utf8")}\nmodule.exports = exportSessionCSV;`,
        context
    );
    context.module.exports();
    return savedFile;
}

const defaultExportApp = {
    csvCellSeparator: ",",
    csvDecimalSeparator: ".",
    csvExportView: true,
    telemetries: {
        temperature: { type: "default", unit: "C", data: [[1000, 2000], [20.5, 21.5]] },
        state: { type: "text", data: [[1500, 2500], ["warming", 'ready, "steady"']] }
    }
};
const defaultExport = exportCSV(defaultExportApp);

assert.strictEqual(defaultExport.name, "session.csv");
assert.strictEqual(defaultExportApp.csvExportView, false);
assert.strictEqual(defaultExport.content, [
    "timestamp(ms),temperature (C),state,",
    '"1000","20.5",,',
    '"1500",,"warming",',
    '"2000","21.5",,',
    '"2500",,"ready, ""steady""",',
    ""
].join("\n"));

const commaDecimalExport = exportCSV({
    csvCellSeparator: ";",
    csvDecimalSeparator: ",",
    csvExportView: true,
    telemetries: {
        temperature: { type: "default", data: [[1000], [20.5]] },
        display: { type: "text", data: [[1000], ["3.14"]] },
        invalid: { type: "default", data: [[1000], [NaN]] }
    }
});

assert.strictEqual(commaDecimalExport.content, [
    "timestamp(ms);temperature;display;invalid;",
    '"1000";"20,5";"3.14";;',
    ""
].join("\n"));

console.log("CSV export preserves text values, CSV quoting, and numeric decimal formatting");
