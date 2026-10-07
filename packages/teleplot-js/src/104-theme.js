/*
 * Look of the views: colors (light and dark), cards, empty states, titles.
 *
 * Everything is driven by CSS variables (--teleplot-*) so that an application can restyle the views, and so that dark mode just works:
 * dark is used when <html data-theme="dark"> is set, or when the system prefers dark and data-theme isn't "light".
 * Layouts choose how their views look (see ViewLayout): "card" (default) or "flat" appearance, top color on or off, inherited by what they contain.
 *
 *   --teleplot-text, -muted, -surface, -line, -grid, -primary, -warn, -error, -mono   colors and monospace font stack
 *   --teleplot-bg                                                                  page background that goes with the cards (never applied by the library: hosts use it, e.g. body { background: var(--teleplot-bg) })
 *   --teleplot-card-bg, -card-bw, -card-radius, -card-shadow                          set by layouts ("card" / "flat" appearance)
 *   --teleplot-accent, --teleplot-accent-w                                            top color of a view (set by the view) and its thickness (0 = off)
 */
TELEPLOT.theme = {};
{
    const root = document.documentElement || {}; // (no DOM in tests)
    const darkQuery = (typeof matchMedia === "function") ? matchMedia("(prefers-color-scheme: dark)") : undefined;

    TELEPLOT.theme.isDark = function() {
        let theme = root.dataset ? root.dataset.theme : undefined;
        return theme === "dark" || (theme !== "light" && !!(darkQuery && darkQuery.matches));
    };
    // Changes when the look changes (views redraw what is drawn in canvas)
    TELEPLOT.theme.key = () => TELEPLOT.theme.isDark() ? "dark" : "light";

    // Value of a CSS variable for an element (canvas drawings can't use var()). Cached for a short time: charts ask on every redraw.
    const cache = new WeakMap();
    TELEPLOT.theme.color = function(name, element, fallback = "gray") {
        element = element || root;
        if (typeof getComputedStyle !== "function") return fallback;
        let now = Date.now(), key = TELEPLOT.theme.key();
        let entry = cache.get(element);
        if (!entry || entry.key !== key || now - entry.time > 250) { entry = { key, time: now, values: {} }; cache.set(element, entry); }
        if (!(name in entry.values)) entry.values[name] = getComputedStyle(element).getPropertyValue(name).trim() || fallback;
        return entry.values[name];
    };

    let elem = document.createElement("style");
    elem.textContent = `
        :root {
            --teleplot-text: #1d2329; --teleplot-muted: #66717c; --teleplot-surface: #ffffff; --teleplot-bg: #f4f5f7; --teleplot-line: #d5dbe0;
            --teleplot-grid: rgba(0, 0, 0, 0.08); --teleplot-primary: #2980b9; --teleplot-warn: #b87500; --teleplot-error: #d6453d;
            --teleplot-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
        }
        :root[data-theme="dark"] {
            --teleplot-text: #e8ebee; --teleplot-muted: #8d98a3; --teleplot-surface: #15191d; --teleplot-bg: #0f1215; --teleplot-line: #2c343b;
            --teleplot-grid: rgba(255, 255, 255, 0.09); --teleplot-warn: #e0a800; --teleplot-error: #ff6b63;
        }
        @media (prefers-color-scheme: dark) {
            :root:not([data-theme="light"]) {
                --teleplot-text: #e8ebee; --teleplot-muted: #8d98a3; --teleplot-surface: #15191d; --teleplot-bg: #0f1215; --teleplot-line: #2c343b;
                --teleplot-grid: rgba(255, 255, 255, 0.09); --teleplot-warn: #e0a800; --teleplot-error: #ff6b63;
            }
        }
        @scope (.teleplot-js-style)
        {
            :scope { color: var(--teleplot-text); }

            /* Card: every view that shows telemetries. The top color is an inset bar, so it follows the rounded corners. */
            .teleplot-js-telemetry-card {
                position: relative;
                box-sizing: border-box;
                background: var(--teleplot-card-bg, var(--teleplot-surface));
                color: var(--teleplot-text);
                border: var(--teleplot-card-bw, 1px) solid var(--teleplot-line);
                border-radius: var(--teleplot-card-radius, 8px);
                box-shadow: inset 0 var(--teleplot-accent-w, 2px) 0 0 var(--teleplot-accent, transparent), var(--teleplot-card-shadow, 0 0 0 0 transparent);
                padding: 0.4em 0.6em;
                font-size: 1em;
                text-wrap-style: balance;
            }
            .teleplot-js-telemetry-card-drag-over {
                box-shadow: inset 0 var(--teleplot-accent-w, 2px) 0 0 var(--teleplot-accent, transparent), 0 0 0 2px #007eff94;
            }

            /* Title of a view (option "title"): small caps label in the top left corner */
            .teleplot-js-view-title {
                position: absolute; top: 0.6em; left: 0.9em; z-index: 2; max-width: 42%;
                overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
                font: 600 11px/1.3 var(--teleplot-mono); letter-spacing: 0.04em; text-transform: uppercase;
                color: var(--teleplot-muted); pointer-events: none;
            }
            .teleplot-js-has-title .teleplot-js-telemetry-card:not(.teleplot-js-chart-container) { padding-top: 2em; }

            /* Nothing to show (no telemetry, no data yet, wrong type of data): said in the view instead of an empty rectangle */
            .teleplot-js-empty {
                position: absolute; inset: 0; z-index: 1; overflow: hidden;
                display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.25em;
                padding: 2em 1em 1em; box-sizing: border-box; text-align: center;
                color: var(--teleplot-muted); background: color-mix(in srgb, var(--teleplot-surface) 88%, transparent); border-radius: inherit; pointer-events: none;
            }
            .teleplot-js-empty-title { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; color: var(--teleplot-text); opacity: 0.75; }
            .teleplot-js-empty-hint {
                max-width: 28em; font-size: 0.9em; overflow-wrap: anywhere;
                display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; line-clamp: 3; overflow: hidden;
            }
        }
    `;
    document.head.appendChild(elem);
}
