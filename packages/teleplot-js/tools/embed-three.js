#!/usr/bin/env node
// Builds src/004-lib-three.js: three.js embedded in the library as TELEPLOT.THREE (like Vue and uPlot, see build.sh).
// three.js only ships ES modules; this turns each module into a function (imports become destructuring, exports a returned object)
// and adds the two addons the 3D view uses (OrbitControls, STLLoader) to the same object.
//
// To upgrade: put these files of the "three" npm package in a folder and run   node tools/embed-three.js <folder>
//   build/three.core.js, build/three.module.js, examples/jsm/controls/OrbitControls.js, examples/jsm/loaders/STLLoader.js, LICENSE
// (all in the same folder, without their sub folders), then ./build.sh
const fs = require("node:fs");
const path = require("node:path");

const dir = process.argv[2];
if (!dir) { console.error("Usage: node tools/embed-three.js <folder with the three.js files>"); process.exit(1); }
const read = (name) => fs.readFileSync(path.join(dir, name), "utf8").replace(/\r\n/g, "\n");

// "A, B as C" -> [["A", "A"], ["B", "C"]]
const names = (list) => list.split(",").map((s) => s.trim()).filter(Boolean).map((s) => { const [a, b] = s.split(/\s+as\s+/); return [a, b || a]; });
const IMPORT = /^import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"];?[ \t]*$/gm;
const REEXPORT = /^export\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"];?[ \t]*$/gm;
const EXPORT = /^export\s*\{([^}]*)\};?[ \t]*$/gm;

// A module as a function body: "from" is the variable holding what it imports
function convert(source, from) {
    const exported = [], reexported = [];
    let body = source
        .replace(IMPORT, (_, list) => "const { " + names(list).map(([a, b]) => a === b ? a : `${a}: ${b}`).join(", ") + " } = " + from + ";")
        .replace(REEXPORT, (_, list) => { reexported.push(...names(list)); return ""; })
        .replace(EXPORT, (_, list) => { exported.push(...names(list)); return ""; });
    if (/^\s*(import|export)\b/m.test(body)) throw new Error("An import or export statement was not converted");
    const result = reexported.map(([a, b]) => `${b}: ${from}.${a}`).concat(exported.map(([a, b]) => a === b ? a : `${b}: ${a}`));
    return body + "\nreturn { " + result.join(", ") + " };\n";
}

const core = read("three.core.js"), main = read("three.module.js");
const version = (core.match(/const REVISION = '([^']+)'/) || [])[1] || "?";
const license = read("LICENSE").trim().split("\n").map((l) => " * " + l).join("\n");

const out = `/**
 * three.js r${version} (https://threejs.org), with the addons OrbitControls and STLLoader.
 * Embedded by tools/embed-three.js: do not edit by hand.
 *
${license}
 */
TELEPLOT.THREE = (function () {
const __core = (function () {
${convert(core, "undefined")}
})();
const __three = (function () {
${convert(main, "__core")}
})();
const THREE = Object.assign({}, __three);
THREE.OrbitControls = (function () {
${convert(read("OrbitControls.js"), "THREE")}
})().OrbitControls;
THREE.STLLoader = (function () {
${convert(read("STLLoader.js"), "THREE")}
})().STLLoader;
return THREE;
})();
`;
const target = path.join(__dirname, "..", "src", "004-lib-three.js");
fs.writeFileSync(target, out);
console.log(`Wrote ${target}: three.js r${version}, ${(out.length / 1e6).toFixed(2)} MB`);
