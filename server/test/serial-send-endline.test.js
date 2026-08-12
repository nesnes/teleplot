const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const www = path.join(__dirname, "..", "www");
const html = fs.readFileSync(path.join(www, "index.html"), "utf8");
const expectedHandler = "input.sendText(input.textToSend, input.endlineToSend)";

const serialInput = html.match(/<input\b(?=[^>]*v-model="input\.textToSend")[^>]*>/);
const sendButton = html.match(/<button\b[^>]*>Send<\/button>/);

assert.ok(serialInput, "serial text input must exist");
assert.ok(sendButton, "serial send button must exist");
const enterHandler = serialInput[0].match(/v-on:keyup\.enter="([^"]+)"/);
const sendHandler = sendButton[0].match(/@click="([^"]+)"/);
assert.ok(enterHandler, "serial text input must define an Enter handler");
assert.ok(sendHandler, "serial send button must define a click handler");
assert.strictEqual(enterHandler[1], expectedHandler);
assert.strictEqual(sendHandler[1], expectedHandler);

const dataInput = fs.readFileSync(path.join(www, "classes", "communication", "data", "DataInput.js"), "utf8");
const dataInputSerial = fs.readFileSync(path.join(www, "classes", "communication", "data", "DataInputSerial.js"), "utf8");
const context = { module: { exports: {} } };
vm.runInNewContext(`${dataInput}\n${dataInputSerial}\nmodule.exports = DataInputSerial;`, context);

const messages = [];
const connection = { sendServerCommand: message => messages.push(message) };
const serial = new context.module.exports(connection, "Serial");
messages.length = 0;

for (const [lineEnding, expected] of [["\\r\\n", "\r\n"], ["\\n", "\n"], ["\\r", "\r"], ["", ""]]) {
    serial.sendText("STATUS", lineEnding);
    assert.strictEqual(messages.pop().text, `STATUS${expected}`);
}

console.log("serial send Enter and button handlers preserve the selected line ending");
