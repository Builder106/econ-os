/**
 * EconOS Window Manager + Kernel Client
 * AESTHETIC_DNA: Glassmorphic Bloomberg-grade desktop OS, fed by live WebSocket telemetry.
 */

class WindowManager {
    constructor() {
        this.windows = [];
        this.activeWindow = null;
        this.highestZ = 100;
        this.desktop = document.getElementById('desktop');
        this.initEvents();
    }

    initEvents() {
        document.addEventListener('mousedown', (e) => {
            const win = e.target.closest('.window');
            if (win) this.focusWindow(win);
        });
        document.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        document.addEventListener('mouseup', () => this.stopDragging());
    }

    createWindow(id, title, x, y, w, h, contentHTML) {
        const existing = document.getElementById(id);
        if (existing) { this.focusWindow(existing); return existing; }

        const win = document.createElement('div');
        win.id = id;
        win.className = 'window active';
        win.style.left = `${x}px`;
        win.style.top = `${y}px`;
        win.style.width = `${w}px`;
        win.style.height = `${h}px`;
        win.style.zIndex = ++this.highestZ;

        win.innerHTML = `
            <div class="window-header">
                <span class="window-title">${title}</span>
                <div class="window-controls">
                    <div class="control-btn btn-min"></div>
                    <div class="control-btn btn-max"></div>
                    <div class="control-btn btn-close" onclick="this.closest('.window').remove()"></div>
                </div>
            </div>
            <div class="window-content">${contentHTML}</div>
        `;

        const header = win.querySelector('.window-header');
        header.addEventListener('mousedown', (e) => this.startDragging(e, win));

        this.desktop.appendChild(win);
        this.windows.push(win);
        this.focusWindow(win);
        return win;
    }

    focusWindow(win) {
        if (this.activeWindow) this.activeWindow.classList.remove('active');
        this.activeWindow = win;
        win.classList.add('active');
        win.style.zIndex = ++this.highestZ;
    }

    startDragging(e, win) {
        this.isDragging = true;
        this.dragWin = win;
        this.offsetX = e.clientX - win.offsetLeft;
        this.offsetY = e.clientY - win.offsetTop;
        document.body.style.cursor = 'move';
    }

    handleMouseMove(e) {
        if (this.isDragging && this.dragWin) {
            this.dragWin.style.left = `${e.clientX - this.offsetX}px`;
            this.dragWin.style.top = `${e.clientY - this.offsetY}px`;
        }
    }

    stopDragging() {
        this.isDragging = false;
        this.dragWin = null;
        document.body.style.cursor = 'default';
    }
}

/**
 * KernelClient — single WebSocket to the shared kernel, multiplexed:
 *   - inbound `tick`   → state cache + .subscribe(cb) listeners
 *   - inbound `event`  → .onEvent(cb) listeners (admin shocks, resets)
 *   - inbound `ack`    → resolves the matching .sendCommand() promise
 *   - per-connection `isAdmin` flag flips on a successful `sudo` ack
 *
 * Reconnect drops admin elevation by design — the server-side connection is
 * gone and conn.is_admin lives there.
 */
class KernelClient {
    constructor() {
        // In split-host deploys (dashboard on Vercel, kernel on Koyeb) the URL is
        // injected via dashboard/config.js. Same-origin fallback keeps local dev
        // (FastAPI serving the dashboard at /) working unchanged.
        const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
        this.url = window.ECONOS_KERNEL_WS_URL || `${proto}//${location.host}/ws`;
        this.tickListeners = new Set();
        this.eventListeners = new Set();
        this.adminListeners = new Set();
        this.state = null;
        this.connected = false;
        this.isAdmin = false;
        this._reconnectMs = 800;
        this._cmdSeq = 0;
        this._pendingAcks = new Map();
        this._connect();
    }

    _connect() {
        try { this.ws = new WebSocket(this.url); }
        catch (e) { this._scheduleReconnect(); return; }
        this.ws.onopen = () => { this.connected = true; this._reconnectMs = 800; this._notifyTick(); };
        this.ws.onmessage = (e) => this._onMessage(e);
        this.ws.onclose = () => {
            this.connected = false;
            if (this.isAdmin) { this.isAdmin = false; this._notifyAdmin(); }
            this._failPendingAcks(new Error('disconnected'));
            this._notifyTick();
            this._scheduleReconnect();
        };
        this.ws.onerror = () => { try { this.ws.close(); } catch (_) {} };
    }

    _scheduleReconnect() {
        const delay = this._reconnectMs;
        this._reconnectMs = Math.min(this._reconnectMs * 2, 8000);
        setTimeout(() => this._connect(), delay);
    }

    _onMessage(e) {
        let msg;
        try { msg = JSON.parse(e.data); } catch { return; }
        if (msg.type === 'tick' || (msg.market && msg.agents)) {
            this.state = msg;
            this._notifyTick();
            return;
        }
        if (msg.type === 'ack') {
            const p = this._pendingAcks.get(msg.id);
            if (p) {
                clearTimeout(p.timer);
                this._pendingAcks.delete(msg.id);
                if (msg.ok) p.resolve(msg);
                else p.reject(Object.assign(new Error(msg.error || 'command failed'), { ack: msg }));
            }
            if (msg.auth && msg.auth.is_admin && !this.isAdmin) {
                this.isAdmin = true;
                this._notifyAdmin();
            }
            return;
        }
        if (msg.type === 'event') {
            for (const cb of this.eventListeners) { try { cb(msg); } catch (err) { console.error(err); } }
            return;
        }
    }

    sendCommand(line) {
        return new Promise((resolve, reject) => {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                reject(new Error('not connected'));
                return;
            }
            const id = `c${++this._cmdSeq}`;
            const timer = setTimeout(() => {
                this._pendingAcks.delete(id);
                reject(new Error('command timed out'));
            }, 8000);
            this._pendingAcks.set(id, { resolve, reject, timer });
            this.ws.send(JSON.stringify({ type: 'cmd', id, line }));
        });
    }

    _failPendingAcks(err) {
        for (const [, p] of this._pendingAcks) { clearTimeout(p.timer); p.reject(err); }
        this._pendingAcks.clear();
    }

    subscribe(cb) {
        this.tickListeners.add(cb);
        if (this.state) { try { cb(this.state, this.connected); } catch (e) { console.error(e); } }
        return () => this.tickListeners.delete(cb);
    }

    onEvent(cb) {
        this.eventListeners.add(cb);
        return () => this.eventListeners.delete(cb);
    }

    onAdminChange(cb) {
        this.adminListeners.add(cb);
        try { cb(this.isAdmin); } catch (e) { console.error(e); }
        return () => this.adminListeners.delete(cb);
    }

    _notifyTick() {
        for (const cb of this.tickListeners) { try { cb(this.state, this.connected); } catch (err) { console.error(err); } }
    }

    _notifyAdmin() {
        for (const cb of this.adminListeners) { try { cb(this.isAdmin); } catch (err) { console.error(err); } }
    }
}

// --- helpers ---

const fmtMoney = (n) => {
    if (n == null || isNaN(n)) return '—';
    const v = Math.abs(n);
    if (v >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (v >= 1e3) return (n / 1e3).toFixed(2) + 'K';
    return n.toFixed(2);
};

const procIdFor = (agentId) => {
    const m = agentId.match(/(consumer|producer)_(\d+)/);
    if (!m) return agentId;
    return (m[1] === 'consumer' ? 'C-' : 'P-') + String(m[2]).padStart(2, '0');
};

const procNameFor = (agentId) =>
    agentId.startsWith('consumer') ? 'CONSUMER_POLICY_NET' : 'PRODUCER_RL_OPTIMIZER';

// --- window launchers ---

window.launchWindow = function(type) {
    const wm = window.econWM;
    const kc = window.kernelClient;

    if (type === 'process-explorer') {
        wm.createWindow('processes', 'Process Telemetry Hub', 80, 180, 700, 520,
            `<div class="font-mono text-[12px]">
                <div class="grid grid-cols-[60px_1fr_80px_60px_20px] gap-2 text-white/55 uppercase pb-1 border-b border-white/5 mb-2">
                    <span>PID</span><span>Process</span><span>Balance</span><span>Δ Reward</span><span></span>
                </div>
                <div id="proc-rows" class="space-y-1.5 text-[12px]">
                    <div class="text-white/55 italic">connecting to kernel…</div>
                </div>
            </div>`);
        const rowsEl = document.getElementById('proc-rows');
        const unsub = kc.subscribe((s, connected) => {
            if (!document.getElementById('proc-rows')) { unsub(); return; }
            if (!s) {
                rowsEl.innerHTML = `<div class="text-white/55 italic">${
                    connected ? 'connected — awaiting first tick…' : 'connecting to kernel…'
                }</div>`;
                return;
            }
            rowsEl.innerHTML = s.agents.map((a) => {
                const isCons = a.role === 'consumer';
                const dotColor = isCons ? 'var(--terminal-cyan)' : 'var(--terminal-gold)';
                const reward = (a.reward >= 0 ? '+' : '') + a.reward.toFixed(3);
                const rewardCls = a.reward >= 0 ? 'text-terminal-green' : 'text-terminal-red';
                return `<div class="grid grid-cols-[60px_1fr_80px_60px_20px] gap-2 items-center">
                    <span class="text-terminal-cyan">${procIdFor(a.id)}</span>
                    <span class="text-white/70">${procNameFor(a.id)}</span>
                    <span class="text-white/60">${fmtMoney(a.balance)}</span>
                    <span class="${rewardCls}">${reward}</span>
                    <div class="status-pulse" style="background:${dotColor};box-shadow:0 0 8px ${dotColor};"></div>
                </div>`;
            }).join('');
        });

    } else if (type === 'macro-monitor') {
        wm.createWindow('macro-monitor', 'Market Analytics Suite', 800, 100, 820, 600,
            `<div class="grid grid-cols-2 gap-4 h-full font-mono text-[12px]">
                <div class="col-span-2 border-b border-white/10 pb-2">
                    <div class="flex justify-between items-center mb-1">
                        <span class="text-white/40 uppercase">Global Asset Equilibrium (Wage vs Price)</span>
                        <span id="macro-status" class="text-terminal-green">CONNECTING…</span>
                    </div>
                    <div class="h-64 w-full"><canvas id="mainChart" class="chart-glow"></canvas></div>
                </div>
                <div class="space-y-2 border-r border-white/5 pr-2">
                    <span class="text-white/55 uppercase">Structural Inequality (Gini)</span>
                    <div class="text-4xl font-bold text-terminal-cyan tracking-tight value-flash" id="macro-gini">—</div>
                    <div class="text-[11px] text-white/55">consumer wealth distribution</div>
                </div>
                <div class="space-y-2 pl-2">
                    <span class="text-white/55 uppercase">System Liquidity</span>
                    <div class="text-3xl font-bold text-white tracking-tighter value-flash" id="macro-money">—</div>
                    <div class="flex gap-3 text-[11px] text-white/40">
                        <span>TREASURY <span id="macro-treasury" class="text-terminal-gold">—</span></span>
                        <span>τ <span id="macro-tax" class="text-terminal-magenta">—</span></span>
                    </div>
                </div>
            </div>`);
        initMacroChart(kc);

    } else if (type === 'policy-manager') {
        wm.createWindow('policy-manager', 'Monetary Command Center', 240, 240, 480, 540,
            `<div class="space-y-3 font-mono text-[13px]">
                <div class="flex justify-between items-center text-[11px] uppercase pb-2 border-b border-white/5">
                    <span class="text-white/55">FED MODE</span>
                    <span id="pm-auth" class="text-terminal-red">visitor</span>
                </div>
                <div class="space-y-2">
                    <div class="flex justify-between items-center uppercase">
                        <span class="text-white/40">Income Tax τ</span>
                        <span id="pm-tax" class="text-terminal-cyan text-sm">—</span>
                    </div>
                    <input id="pm-tax-slider" type="range" min="0" max="100" step="1" value="0" disabled
                        class="w-full accent-terminal-cyan h-1 bg-white/10 rounded opacity-40">
                    <div class="flex justify-between text-[11px] text-white/40"><span>0%</span><span>100%</span></div>
                </div>
                <div class="space-y-1 border-t border-white/5 pt-2">
                    <span class="text-white/40 uppercase text-[11px]">Wage Shock</span>
                    <div class="grid grid-cols-4 gap-1" id="pm-wage-shocks"></div>
                </div>
                <div class="space-y-1">
                    <span class="text-white/40 uppercase text-[11px]">Price Shock</span>
                    <div class="grid grid-cols-4 gap-1" id="pm-price-shocks"></div>
                </div>
                <div class="grid grid-cols-3 gap-1 border-t border-white/5 pt-2">
                    <button data-cmd="pause"  class="pm-admin py-1 text-[12px] uppercase border border-white/10 text-white/60 hover:bg-white/5">Pause</button>
                    <button data-cmd="resume" class="pm-admin py-1 text-[12px] uppercase border border-white/10 text-white/60 hover:bg-white/5">Resume</button>
                    <button data-cmd="reset"  class="pm-admin py-1 text-[12px] uppercase border border-terminal-red/30 text-terminal-red hover:bg-terminal-red/10">Reset</button>
                </div>
                <div class="text-[11px] text-white/55 flex justify-between border-t border-white/5 pt-2">
                    <span>STEP <span id="pm-step" class="text-terminal-gold">—</span></span>
                    <span>UPTIME <span id="pm-uptime">—</span>s</span>
                    <span id="pm-policies">—</span>
                </div>
            </div>`);

        const SHOCKS = [-10, -5, 5, 10];
        const mkBtn = (target, pct) => {
            const sign = pct > 0 ? '+' : '';
            const cls = pct > 0 ? 'text-terminal-green' : 'text-terminal-red';
            return `<button class="pm-admin py-1 text-[12px] border border-white/10 ${cls} hover:bg-white/5"
                data-shock="${target}" data-pct="${pct}">${sign}${pct}%</button>`;
        };
        document.getElementById('pm-wage-shocks').innerHTML  = SHOCKS.map(p => mkBtn('wage', p)).join('');
        document.getElementById('pm-price-shocks').innerHTML = SHOCKS.map(p => mkBtn('price', p)).join('');

        const slider = document.getElementById('pm-tax-slider');
        const taxLabel = document.getElementById('pm-tax');
        const authLabel = document.getElementById('pm-auth');

        let userIsDragging = false;
        slider.addEventListener('pointerdown', () => { userIsDragging = true; });
        slider.addEventListener('pointerup',   () => { userIsDragging = false; });
        slider.addEventListener('input',  () => { taxLabel.textContent = parseInt(slider.value, 10).toFixed(2) + '%'; });
        slider.addEventListener('change', async () => {
            try { await kc.sendCommand(`tax ${slider.value}`); }
            catch (err) { console.warn('tax cmd failed:', err.message); }
        });

        document.querySelectorAll('#policy-manager [data-shock]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                try { await kc.sendCommand(`shock ${btn.dataset.shock} ${btn.dataset.pct}`); }
                catch (err) { console.warn('shock cmd failed:', err.message); }
            });
        });
        document.querySelectorAll('#policy-manager [data-cmd]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                try { await kc.sendCommand(btn.dataset.cmd); }
                catch (err) { console.warn(`${btn.dataset.cmd} failed:`, err.message); }
            });
        });

        const unsubTick = kc.subscribe((s) => {
            if (!document.getElementById('pm-tax')) { unsubTick(); return; }
            if (!s) return;
            const taxPct = s.policy.tax_rate * 100;
            if (!userIsDragging) {
                slider.value = String(Math.round(taxPct));
                taxLabel.textContent = taxPct.toFixed(2) + '%';
            }
            document.getElementById('pm-step').textContent = s.step;
            document.getElementById('pm-uptime').textContent = s.uptime_s;
            document.getElementById('pm-policies').textContent = s.policies_loaded ? 'PPO ✓' : 'RANDOM';
        });

        const unsubAdmin = kc.onAdminChange((isAdmin) => {
            if (!document.getElementById('pm-auth')) { unsubAdmin(); return; }
            authLabel.textContent = isAdmin ? '🔓 admin' : '🔒 visitor';
            authLabel.className = isAdmin ? 'text-terminal-green' : 'text-terminal-red';
            slider.disabled = !isAdmin;
            slider.classList.toggle('opacity-40', !isAdmin);
            document.querySelectorAll('#policy-manager .pm-admin').forEach((b) => {
                b.disabled = !isAdmin;
                b.classList.toggle('opacity-40', !isAdmin);
                b.classList.toggle('cursor-not-allowed', !isAdmin);
            });
        });

    } else if (type === 'econ-shell') {
        wm.createWindow('econ-shell', 'EconOS Institutional Terminal', 1080, 80, 620, 480,
            `<div class="flex flex-col h-full font-mono text-[12px]">
                <div id="shell-output" class="flex-1 text-white/60 overflow-auto mb-2 space-y-0.5"></div>
                <div class="flex items-center gap-2 border-t border-white/5 pt-2">
                    <span class="text-terminal-cyan font-bold">root@econos:~$</span>
                    <input id="shell-input" class="flex-1 bg-transparent border-none outline-none text-white font-mono"
                        placeholder="type 'help' — 'sudo &lt;token&gt;' for admin" autocomplete="off" autocapitalize="off" spellcheck="false">
                </div>
            </div>`);

        const out = document.getElementById('shell-output');
        const input = document.getElementById('shell-input');

        const append = (text, cls = 'text-white/60') => {
            const d = document.createElement('div');
            d.className = cls + ' whitespace-pre';
            d.textContent = text;
            out.appendChild(d);
            out.scrollTop = out.scrollHeight;
        };
        append('>>> [SYSTEM_AUTH] read-only session attached to shared kernel', 'text-terminal-cyan');
        append("$ type 'help' to list commands. 'sudo <token>' to elevate.", 'text-white/40');

        const history = [];
        let histIdx = -1;

        input.addEventListener('keydown', async (e) => {
            if (e.key === 'ArrowUp') {
                if (history.length === 0) return;
                histIdx = Math.max(0, (histIdx === -1 ? history.length : histIdx) - 1);
                input.value = history[histIdx] || '';
                e.preventDefault();
                return;
            }
            if (e.key === 'ArrowDown') {
                if (histIdx === -1) return;
                histIdx = histIdx + 1;
                if (histIdx >= history.length) { histIdx = -1; input.value = ''; }
                else input.value = history[histIdx];
                e.preventDefault();
                return;
            }
            if (e.key !== 'Enter') return;

            const line = input.value;
            if (!line.trim()) return;
            input.value = '';
            history.push(line); histIdx = -1;

            const echoed = /^\s*sudo\s+/i.test(line) ? 'sudo ****' : line;
            append('> ' + echoed, 'text-white/80');
            try {
                const ack = await kc.sendCommand(line);
                if (ack.output) append(ack.output, 'text-terminal-green');
            } catch (err) {
                append('! ' + (err.message || 'command failed'), 'text-terminal-red');
            }
        });

        const unsubEvt = kc.onEvent((evt) => {
            if (!document.getElementById('shell-output')) { unsubEvt(); return; }
            const detail = Object.keys(evt.detail || {}).length ? '  ' + JSON.stringify(evt.detail) : '';
            append(`* [${(evt.by || '?').toUpperCase()}] ${evt.kind}${detail}`, 'text-terminal-magenta');
        });

    } else if (type === 'system-menu') {
        wm.createWindow('sys-menu', 'EconOS System', 50, 300, 220, 220,
            `<div class="space-y-2 text-[13px] text-white/60">
                <div class="hover:text-white cursor-pointer" onclick="launchWindow('process-explorer')"><i class="ph ph-cpu"></i> Process Telemetry</div>
                <div class="hover:text-white cursor-pointer" onclick="launchWindow('macro-monitor')"><i class="ph ph-chart-line"></i> Market Analytics</div>
                <div class="hover:text-white cursor-pointer" onclick="launchWindow('policy-manager')"><i class="ph ph-shield-check"></i> Policy Manager</div>
                <div class="hover:text-white cursor-pointer" onclick="launchWindow('econ-shell')"><i class="ph ph-terminal"></i> Institutional Terminal</div>
                <div class="border-t border-white/5 mt-2 pt-2 hover:text-white cursor-pointer" onclick="launchWindow('about')"><i class="ph ph-question"></i> What is EconOS?</div>
            </div>`);

    } else if (type === 'about') {
        wm.createWindow('about', 'README.TXT', 380, 60, 720, 720,
            `<div class="font-mono text-white/80 space-y-4 leading-relaxed">
                <div>
                    <div class="text-terminal-cyan text-2xl font-bold uppercase tracking-wider">EconOS</div>
                    <div class="text-white/55 text-[13px] mt-1">Economic Operating System &mdash; a live, shared mainframe.</div>
                </div>

                <div class="bg-terminal-cyan/5 border border-terminal-cyan/20 rounded p-3 space-y-1">
                    <div class="flex justify-between items-baseline">
                        <span class="text-white/55 uppercase text-[11px] tracking-wide">Live now</span>
                        <span class="text-terminal-green text-[11px] uppercase animate-pulse">● broadcasting</span>
                    </div>
                    <div class="grid grid-cols-3 gap-3 mt-2">
                        <div>
                            <div class="text-white/40 text-[11px] uppercase">Step</div>
                            <div id="about-step" class="text-terminal-cyan text-2xl font-bold value-flash">—</div>
                        </div>
                        <div>
                            <div class="text-white/40 text-[11px] uppercase">Uptime</div>
                            <div id="about-uptime" class="text-terminal-gold text-2xl font-bold">—</div>
                        </div>
                        <div>
                            <div class="text-white/40 text-[11px] uppercase">Viewers</div>
                            <div id="about-viewers" class="text-terminal-magenta text-2xl font-bold">—</div>
                        </div>
                    </div>
                </div>

                <p class="text-[14px] text-white/75 leading-relaxed">
                    Twelve RL agents (10 consumers, 2 producers) trade labor and goods continuously.
                    You're seeing the same simulation every other visitor sees, in real time.
                    Watch the macro chart, inspect agents in the shell, or
                    <span class="text-terminal-gold">sudo</span> in to shock the economy as the Fed.
                </p>

                <div class="border-t border-white/10 pt-3">
                    <div class="text-white/55 uppercase text-[12px] mb-2 tracking-wide">Windows</div>
                    <ul class="space-y-1.5 text-[13px] text-white/75">
                        <li><span class="text-terminal-cyan font-bold">Macro Viz</span> &mdash; live wage, price, Gini, treasury, total liquidity</li>
                        <li><span class="text-terminal-cyan font-bold">Processes</span> &mdash; every agent's balance + last reward, per tick</li>
                        <li><span class="text-terminal-cyan font-bold">Econ Shell</span> &mdash; read-only inspection; <span class="text-terminal-gold">sudo</span> for Fed mode</li>
                        <li><span class="text-terminal-cyan font-bold">Policy Mgr</span> &mdash; tax slider + wage/price shock buttons (admin)</li>
                    </ul>
                </div>

                <div class="border-t border-white/10 pt-3">
                    <div class="text-white/55 uppercase text-[12px] mb-2 tracking-wide">Try in the shell</div>
                    <pre class="text-[13px] text-terminal-green leading-relaxed whitespace-pre bg-black/30 rounded p-2">help                  # list every command
inspect consumer_3    # one agent
top 5                 # richest agents
gini                  # current inequality
sudo &lt;token&gt;          # Fed mode (admin)</pre>
                </div>

                <div class="border-t border-white/10 pt-3">
                    <div class="text-white/55 uppercase text-[12px] mb-2 tracking-wide">Stack</div>
                    <p class="text-[13px] text-white/65">
                        PettingZoo · Stable-Baselines3 (PPO) · FastAPI · WebSocket fan-out
                        · Tailscale Funnel · Vercel
                    </p>
                </div>

                <div class="border-t border-white/10 pt-3 flex justify-between items-center">
                    <a href="https://github.com/Builder106/EconOS" target="_blank" rel="noopener"
                       class="text-terminal-cyan hover:text-white text-[13px] underline">
                        github.com/Builder106/EconOS &rarr;
                    </a>
                    <span class="text-white/45 text-[12px] italic">close to dismiss</span>
                </div>
            </div>`);

        const formatUptime = (s) => {
            if (s == null) return '—';
            if (s < 60) return `${Math.floor(s)}s`;
            if (s < 3600) return `${Math.floor(s/60)}m ${Math.floor(s%60)}s`;
            return `${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m`;
        };
        const unsubAbout = kc.subscribe((s) => {
            if (!document.getElementById('about-step')) { unsubAbout(); return; }
            if (!s) return;
            document.getElementById('about-step').textContent = s.step.toLocaleString();
            document.getElementById('about-uptime').textContent = formatUptime(s.uptime_s);
            // viewers count isn't in the snapshot; fall back to '1' (you).
            document.getElementById('about-viewers').textContent = '1+';
        });

        try { localStorage.setItem('econos.aboutSeen', '1'); } catch (_) {}
    }
};

function initMacroChart(kc) {
    const canvas = document.getElementById('mainChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                { label: 'WAGE',  borderColor: '#FFD700', borderWidth: 1, pointRadius: 0, data: [], tension: 0.2 },
                { label: 'PRICE', borderColor: '#00FF41', borderWidth: 1, pointRadius: 0, data: [], tension: 0.2 }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false, animation: false,
            plugins: { legend: { labels: { color: 'rgba(255,255,255,0.7)', font: { size: 12 } } } },
            scales: {
                x: { display: false },
                y: { grid: { color: 'rgba(255,255,255,0.07)' }, ticks: { color: 'rgba(255,255,255,0.6)', font: { size: 12 } } }
            }
        }
    });

    const MAX_POINTS = 100;
    const statusEl = () => document.getElementById('macro-status');
    const giniEl   = () => document.getElementById('macro-gini');
    const moneyEl  = () => document.getElementById('macro-money');
    const treasEl  = () => document.getElementById('macro-treasury');
    const taxEl    = () => document.getElementById('macro-tax');

    // Briefly flash an element when its content changes — proof-of-life cue.
    const lastVal = new WeakMap();
    const setFlashing = (el, text) => {
        if (!el) return;
        if (lastVal.get(el) === text) return;
        lastVal.set(el, text);
        el.textContent = text;
        el.classList.remove('flashing');
        // force reflow so the animation re-triggers
        void el.offsetWidth;
        el.classList.add('value-flash', 'flashing');
    };

    let lastStep = -1;
    const unsub = kc.subscribe((s, connected) => {
        if (!document.getElementById('mainChart')) { unsub(); return; }
        const st = statusEl();
        if (st) {
            st.textContent = connected ? 'LIVE' : (s ? 'RECONNECTING…' : 'CONNECTING…');
            st.className = connected ? 'text-terminal-green' : 'text-terminal-gold';
        }
        if (!s || s.step === lastStep) return;
        lastStep = s.step;

        chart.data.labels.push(s.step);
        chart.data.datasets[0].data.push(s.market.wage);
        chart.data.datasets[1].data.push(s.market.price);
        if (chart.data.labels.length > MAX_POINTS) {
            chart.data.labels.shift();
            chart.data.datasets[0].data.shift();
            chart.data.datasets[1].data.shift();
        }
        chart.update('none');

        setFlashing(giniEl(),  s.metrics.gini.toFixed(3));
        setFlashing(moneyEl(), '$' + fmtMoney(s.metrics.total_money));
        setFlashing(treasEl(), fmtMoney(s.metrics.treasury));
        setFlashing(taxEl(),   (s.policy.tax_rate * 100).toFixed(1) + '%');
    });
}

// --- boot ---

document.addEventListener('DOMContentLoaded', () => {
    window.econWM = new WindowManager();
    window.kernelClient = new KernelClient();
    const wm = window.econWM;

    const bootWin = wm.createWindow('boot-loader', 'EconOS Boot', 100, 50, 420, 280,
        '<div id="boot-log" class="font-mono text-[12px] text-terminal-green space-y-1"></div>'
    );
    const bootLog = document.getElementById('boot-log');
    const messages = [
        '[    0.000] Initializing EconOS Kernel v5.4...',
        '[    0.124] Attaching to shared market shard /ws...',
        '[    0.450] Loading agent telemetry stream...',
        '[    0.782] Mounting MARL parameter store...',
        '[    1.120] PPO inference pipeline online...',
        '[    1.540] Synchronizing tick clock...',
        '[    2.100] SUCCESS: Connected to running kernel.',
        '[    2.500] Starting Web_Desktop_System...'
    ];
    let i = 0;
    const bootInterval = setInterval(() => {
        if (i < messages.length) { bootLog.innerHTML += `<div>${messages[i]}</div>`; i++; }
        else {
            clearInterval(bootInterval);
            setTimeout(() => {
                bootWin.remove();
                launchWindow('macro-monitor');
                launchWindow('process-explorer');
                // First-visit only: show the README/about window so newcomers
                // know what they're looking at. Repeat visitors get the
                // dashboard clean; the ? icon in the taskbar reopens it.
                let seen = false;
                try { seen = !!localStorage.getItem('econos.aboutSeen'); } catch (_) {}
                if (!seen) launchWindow('about');
            }, 800);
        }
    }, 350);

    // taskbar status: clock + kernel step + connection state
    const sysTime = document.getElementById('sys-time');
    setInterval(() => { sysTime.innerText = new Date().toLocaleTimeString(); }, 1000);

    const taskMeta = document.getElementById('sys-time').parentElement;
    const stepBadge = document.createElement('span');
    stepBadge.id = 'sys-step';
    stepBadge.className = 'text-terminal-cyan';
    stepBadge.textContent = 'STEP —';
    taskMeta.insertBefore(stepBadge, taskMeta.firstChild);

    const linkBadge = document.createElement('span');
    linkBadge.id = 'sys-link';
    linkBadge.textContent = '● OFFLINE';
    linkBadge.className = 'text-terminal-red';
    taskMeta.insertBefore(linkBadge, taskMeta.firstChild);

    window.kernelClient.subscribe((s, connected) => {
        linkBadge.textContent = connected ? '● LIVE' : (s ? '● RECONNECTING' : '● CONNECTING');
        linkBadge.className = connected ? 'text-terminal-green' : 'text-terminal-gold';
        if (s) stepBadge.textContent = `STEP ${s.step}`;
    });
});
