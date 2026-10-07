/*
 * Welcome: what the main area shows until there is a dashboard to display (nothing received yet, nothing created).
 * Three steps to get going, a way to try without any code, and the state of the connection to the server.
 */
function initComponent_welcome(vue) {
    let name = "welcome";

    const vueHTML = `
        <section class="welcome">
            <img src="./media/logo-color.svg" class="welcome-logo" alt="Teleplot"/>
            <h1>Plot your telemetry, live</h1>
            <p class="welcome-lead">Send values from your code, they show up here by themselves.</p>

            <ol class="welcome-steps">
                <li>
                    <span class="welcome-n">1</span>
                    <h2>Send</h2>
                    <p>Write <code>name:value</code> to UDP port <b>47269</b>, from any language.</p>
                </li>
                <li>
                    <span class="welcome-n">2</span>
                    <h2>Watch</h2>
                    <p>Every telemetry is charted in the <b>Live</b> dashboard as soon as it arrives.</p>
                </li>
                <li>
                    <span class="welcome-n">3</span>
                    <h2>Arrange</h2>
                    <p>Press <kbd>E</kbd> to build your own dashboard: drag telemetries, resize, reorder.</p>
                </li>
            </ol>

            <div class="welcome-actions">
                <button class="welcome-primary" @click="startSampleData(TP, ctx)">Try with sample data</button>
                <button class="welcome-secondary" @click="ctx.sidePanel = 'help'">How to send data</button>
            </div>

            <p class="welcome-status" :class="status.level" role="status"><i class="welcome-dot"></i>{{status.text}}</p>
        </section>
    `;

    const vueCSS = `
        .welcome {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            width: min(46rem, 100%);
            min-height: 100vh; /* Centred in the window */
            padding: 1rem;
            box-sizing: border-box;
            text-align: center;
            color: var(--color-text);
        }
        .welcome-logo { width: min(15rem, 60%); height: auto; }
        .welcome h1 { margin: 1rem 0 0.2rem; font-size: 2rem; font-weight: 500; }
        .welcome-lead { margin: 0; font-size: 1.2rem; color: var(--color-text-muted); }
        .welcome-steps {
            list-style: none;
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
            gap: 1rem;
            width: 100%;
            margin: 2rem 0 1.6rem;
            padding: 0;
            text-align: left;
        }
        .welcome-steps li {
            padding: 0.9rem 1rem;
            border-radius: 0.9rem;
            background: var(--color-bg-light);
            border: 1px solid var(--color-bg-dark);
        }
        .welcome-n {
            display: inline-grid; place-items: center;
            width: 1.7rem; height: 1.7rem;
            border-radius: 50%;
            background: var(--color-primary); color: #fff;
            font-weight: 600;
        }
        .welcome-steps h2 { margin: 0.5rem 0 0.2rem; font-size: 1.2rem; font-weight: 600; }
        .welcome-steps p { margin: 0; color: var(--color-text-muted); line-height: 1.4; }
        .welcome code, .welcome kbd {
            padding: 0.05rem 0.4rem;
            border-radius: 0.35rem;
            background: color-mix(in srgb, var(--color-text) 8%, transparent);
            font: 0.95rem ui-monospace, Consolas, monospace;
            color: var(--color-text);
        }
        .welcome-actions { display: flex; flex-wrap: wrap; gap: 0.7rem; justify-content: center; }
        .welcome-actions button {
            padding: 0.7rem 1.4rem;
            border-radius: 0.8rem;
            font: inherit; font-size: 1.1rem; font-weight: 600;
            cursor: pointer;
            transition: background var(--motion-fast), color var(--motion-fast), box-shadow var(--motion-fast);
        }
        .welcome-actions button:focus-visible { outline: none; box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 40%, transparent); }
        .welcome-primary { border: 1px solid var(--color-primary); background: var(--color-primary); color: #fff; }
        .welcome-primary:hover { background: color-mix(in srgb, var(--color-primary) 85%, black); }
        .welcome-secondary { border: 1px solid var(--color-bg-dark); background: transparent; color: var(--color-text); }
        .welcome-secondary:hover { background: color-mix(in srgb, var(--color-text) 7%, transparent); }
        .welcome-status { display: flex; align-items: center; gap: 0.5rem; margin: 1.6rem 0 0; color: var(--color-text-muted); }
        .welcome-dot { width: 0.65rem; height: 0.65rem; border-radius: 50%; background: var(--color-text-muted); flex: none; }
        .welcome-status.ok .welcome-dot { background: var(--color-success); animation: welcome-pulse 1.6s ease-in-out infinite; }
        .welcome-status.bad .welcome-dot { background: var(--color-danger); }
        @keyframes welcome-pulse { 0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--color-success) 50%, transparent); } 70%, 100% { box-shadow: 0 0 0 0.5rem transparent; } }
        @media (prefers-reduced-motion: reduce) { .welcome-status.ok .welcome-dot { animation: none; } }
    `;
    // Add css to head
    {
        let elem = document.createElement('style');
        elem.textContent = vueCSS;
        document.head.appendChild(elem);
    }

    return vue.component(name, {
        name: name,
        setup() {
            const TP = Vue.inject("TP");
            const ctx = Vue.inject("ctx");
            return { TP, ctx, startSampleData };
        },
        computed: {
            // Is anything able to deliver data?
            status() {
                const connections = this.TP.connection.connections;
                if (!connections.length) return { level: "bad", text: "No source configured." };
                if (connections.some(c => c.connected)) return { level: "ok", text: "Listening on UDP port 47269, waiting for data..." };
                const c = connections[0];
                return { level: "bad", text: "Cannot reach the Teleplot server at " + c.name + ". Is it running?" };
            },
        },
        template: vueHTML,
    });
}
