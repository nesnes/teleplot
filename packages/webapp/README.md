# Teleplot web application

The page of Teleplot for end users: dashboards of the telemetry received, built on the library
([packages/teleplot-js](../teleplot-js/README.md)). Static files: the server ([packages/server](../server/README.md)) serves them,
and so can any web server. Releases ship it as `teleplot-webapp.zip`.

The library is copied in [`libs/teleplot-js.js`](libs/teleplot-js.js) by its `build.sh`: rebuild the library after changing it.

| Files | What | Documentation |
| --- | --- | --- |
| `index.html`, `main.js`, [`css/`](css/) | the page, its layout and its state (`ctx`) | [webapp-layout.md](../../doc/webapp-layout.md) |
| [`components/top-menu.js`](components/top-menu.js) | the top menu and the data menu | [top-menu.md](../../doc/top-menu.md) |
| [`components/welcome.js`](components/welcome.js) | what the page shows until data comes | [webapp-layout.md](../../doc/webapp-layout.md) "Welcome" |
| [`components/panel-telemetries.js`](components/panel-telemetries.js) | the telemetries received, to drag on dashboards | |
| [`components/panel-sources.js`](components/panel-sources.js) | sources, serial console, commands per device | [sources.md](../../doc/sources.md) |
| [`components/panel-help.js`](components/panel-help.js) | the Help: a gallery of what can be displayed, and the reference of the text protocol | [webapp-layout.md](../../doc/webapp-layout.md) "Help panel" |
| [`components/panel-export.js`](components/panel-export.js) | export and import of data and dashboards | [files.md](../../doc/files.md) "In the webapp" |
| [`components/dashboard.js`](components/dashboard.js), `dashboard-editor.js`, `panel-edit.js` | dashboards and the edit mode | [dashboard-editing.md](../../doc/dashboard-editing.md) |
| [`components/sample-robot.js`](components/sample-robot.js), `sample-controls.js` | the robot sample: a simulated robot, with its own dashboard | |
| [`components/telemetry-rate.js`](components/telemetry-rate.js) | rates of the telemetries | |
| [`media/`](media/) | files used by the Help (a mesh, a floor plan) and the logo | |

## Run it

From the root of the repository:

```bash
node packages/server/main.js
```

then open http://127.0.0.1:8080. The robot sample (welcome screen, "Try me") shows most of what Teleplot can do without any device.

## Tests

```bash
./test.sh
```

The logic of the panels (editor commands, export helpers, every line of the Help checked against the parser, rates), with the runner of
the library. What a browser does (drag and drop, rendering) is checked in a browser.
