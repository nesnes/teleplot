# Teleplot documentation

Back to the project: [README](../README.md).

## Sending data

| Page | What it covers |
| --- | --- |
| [textProtocol.md](textProtocol.md) | The text protocol (V1, extended): numbers, positions, clouds, texts, ranges and thresholds, labels and dashboards, images, 3D and 2D lines, commands |
| [binaryProtocol.md](binaryProtocol.md) | The binary protocol: packets, sections, files |
| [cpp-client-api.md](cpp-client-api.md) | The C++ client ([`clients/cpp`](../clients/cpp/)) and the Arduino library ([`clients/arduino/Teleplot`](../clients/arduino/Teleplot/)): one API, with samples and its reference |
| [python-client-api.md](python-client-api.md) | The Python client ([`clients/python`](../clients/python/)): the API of the C++ client, with its names, in one file |
| [telecmd.md](telecmd.md) | Commands: settings and actions the page sends back to a device |
| [sources.md](sources.md) | Where data comes from (server, serial port, page), times since boot, the Sources panel |
| [server.md](server.md) | The Teleplot server: options, who can connect, messages, slow pages |
| [files.md](files.md) | Data files (text, binary, CSV): export, import, the Export and import panel |
| [reference.md](reference.md) | What every value does: telemetries, shapes, describing, commands, views and their options, dashboards, client calls, in every language (the Reference tab of the Help panel, generated) |

## What is displayed

| Page | What it covers |
| --- | --- |
| [time-views.md](time-views.md) | States over time: timelines, stacks (what runs), marks on charts, ranges and thresholds, gauges |
| [time.md](time.md) | Receiving, holding and replaying: reception on or off, the time shown per time group (live, held, replay), the time line of the top menu (spec, not built yet) |
| [graph.md](graph.md) | Graphs: state machines and behavior trees, their structure over time, what runs in them |
| [3d.md](3d.md) | 3D shapes, points, point clouds and cameras; the 3D and image views |
| [2d.md](2d.md) | 2D drawings, frames and pixel frames; the 2D view |
| [depth.md](depth.md) | Depth maps: pictures of values, in colors and placed in 3D |
| [dashboard-text.md](dashboard-text.md) | Dashboards as text (`DASH|` lines): files, messages, labels that are paths |
| [dashboard-editing.md](dashboard-editing.md) | Edit mode of the webapp, time groups, the look of the views |

## The web application

| Page | What it covers |
| --- | --- |
| [webapp-layout.md](webapp-layout.md) | Docks, welcome screen, Help panel, motion |
| [top-menu.md](top-menu.md) | The top menu, the data menu (data window, memory), shortcuts |

## Inside

| Page | What it covers |
| --- | --- |
| [performance.md](performance.md) | Decimation, ingestion, memory, and measured figures |
| [packages/teleplot-js](../packages/teleplot-js/README.md) | The library: build, sources, demo pages, tests ([tests/README.md](../packages/teleplot-js/tests/README.md)) |
| [packages/webapp](../packages/webapp/README.md) | The web application: components, tests |
| [packages/server](../packages/server/README.md) | The server package: run, tests, executables |
| [clients](../clients/README.md) | Client libraries and samples per language |

Pictures used by the README: [images/](images/).
