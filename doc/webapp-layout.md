# Webapp layout and motion

```
[left dock: one side panel] [workspace: floating top menu + dashboard] [right dock: edit panel]
```

- **Docks** (`.dock`, `style.css`) hold the side panels. Opening or closing a dock slides its width (`--dock-time`, 160 ms) instead of inserting the panel at once, so the dashboard resizes smoothly and nothing jumps. The left dock has a fixed width for all panels (`--side-w`): switching between Telemetries, Sources and Help only fades the content. The panel stays displayed until the dock has closed (`shownPanel` in `main.js`).
- While a dock moves, the edit chrome (pills, "+" slots) is refreshed on every frame (`motion()` in `main.js`), so it follows the views.
- **Motion tokens**: `--motion-fast` (120 ms, fades and small moves), `--dock-time`, `--ease-out`. Everything quick on purpose: the aim is to follow what moves, not to wait for it. `prefers-reduced-motion` sets them to 0.
- **Workspace**: scrolls by itself (the docks stay in place, `.panel-container` is one window high). A band of room for the top menu sits at its top, scrolled away at start, see `doc/top-menu.md`.
- **Welcome** (`components/welcome.js`) is what the main area shows until there is a dashboard: three steps (send, watch, arrange), a button to try the sample data, and the state of the connection to the server.
- **Help panel** (`components/panel-help.js`): every message format is a copyable example, checked against the library's parser in `tests/help.test.js` (add new formats there too), plus shortcuts and the sample data switch (`components/sample-controls.js`).
