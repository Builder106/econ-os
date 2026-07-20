// @ts-check
/// <reference path="./global.d.ts" />
const _w = /** @type {any} */ (window);
/**
 * EconOS Window Manager + Kernel Client
 * AESTHETIC_DNA: Glassmorphic Bloomberg-grade desktop OS, fed by live WebSocket telemetry.
 */

class WindowManager {
    constructor() {
        /** @type {HTMLElement[]} */ this.windows = [];
        /** @type {HTMLElement | null} */ this.activeWindow = null;
        this.highestZ = 100;
        /** @type {HTMLElement | null} */ this.desktop = document.getElementById('desktop');
        this.offsetX = 0;
        this.offsetY = 0;
        this.initEvents();
    }

    initEvents() {
        document.addEventListener('mousedown', (/** @type {MouseEvent} */ e) => {
            const target = /** @type {HTMLElement} */ (e.target);
            const win = target ? /** @type {HTMLElement} */ (target.closest('.window')) : null;
            if (win) this.focusWindow(win);
        });
        document.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        document.addEventListener('mouseup', () => this.stopDragging());
    }

    /**
     * @param {string} id
     * @param {string} title
     * @param {number} x
     * @param {number} y
     * @param {number} w
     * @param {number} h
     * @param {string} contentHTML
     */
    createWindow(id, title, x, y, w, h, contentHTML) {
        const existing = document.getElementById(id);
        if (existing) { this.focusWindow(existing); return existing; }

        // Clamp to viewport so windows never spawn (partially) offscreen on
        // narrower displays — coords were originally tuned for 1920+ widths.
        // 20px margin on sides; 60px reserved at the bottom for the taskbar.
        const MARGIN = 20;
        const TASKBAR_RESERVE = 60;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        w = Math.min(w, vw - MARGIN * 2);
        h = Math.min(h, vh - MARGIN - TASKBAR_RESERVE);
        x = Math.max(MARGIN, Math.min(x, vw - w - MARGIN));
        y = Math.max(MARGIN, Math.min(y, vh - h - TASKBAR_RESERVE));

        const win = document.createElement('div');
        win.id = id;
        win.className = 'window active';
        win.style.left = `${x}px`;
        win.style.top = `${y}px`;
        win.style.width = `${w}px`;
        win.style.height = `${h}px`;
        win.style.zIndex = String(++this.highestZ);

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
        if(header) header.addEventListener('mousedown', (/** @type {any} */ e) => this.startDragging(e, win));

        if(this.desktop) this.desktop.appendChild(win);
        this.windows.push(win);
        this.focusWindow(win);
        return win;
    }

    /** @param {HTMLElement} win */
    focusWindow(win) {
        if (this.activeWindow) this.activeWindow.classList.remove('active');
        this.activeWindow = win;
        win.classList.add('active');
        win.style.zIndex = String(++this.highestZ);
    }

    /** @param {MouseEvent} e
     * @param {HTMLElement} win */
    startDragging(e, win) {
        this.isDragging = true;
        this.dragWin = win;
        this.offsetX = e.clientX - win.offsetLeft;
        this.offsetY = e.clientY - win.offsetTop;
        if(document.body) document.body.style.cursor = 'move';
    }

    /** @param {MouseEvent} e */
    handleMouseMove(e) {
        const dragWin = this.dragWin; if (this.isDragging && dragWin) {
            dragWin.style.left = `${e.clientX - this.offsetX}px`;
            dragWin.style.top = `${e.clientY - this.offsetY}px`;
        }
    }

    stopDragging() {
        this.isDragging = false;
        this.dragWin = null;
        if(document.body) document.body.style.cursor = 'default';
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
        this.url = _w.ECONOS_KERNEL_WS_URL || `${proto}//${location.host}/ws`;
        /** @type {Set<Function>} */ this.tickListeners = new Set();
        /** @type {Set<Function>} */ this.eventListeners = new Set();
        /** @type {Set<Function>} */ this.adminListeners = new Set();
        /** @type {any} */ this.state = null;
        this.connected = false;
        this.isAdmin = false;
        this._reconnectMs = 800;
        this._cmdSeq = 0;
        /** @type {Map<string, {resolve: function, reject: function, timer: any}>} */ this._pendingAcks = new Map();
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
        if(this.ws) this.ws.onerror = () => { try { if(this.ws) this.ws.close(); } catch (_) {} };
    }

    _scheduleReconnect() {
        const delay = this._reconnectMs;
        this._reconnectMs = Math.min(this._reconnectMs * 2, 8000);
        setTimeout(() => this._connect(), delay);
    }

    /** @param {MessageEvent} e */
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
            if (!p) return;
            if (true) {
                clearTimeout(p.timer);
                this._pendingAcks.delete(msg.id);
                if (msg.ok) p.resolve(msg);
                else p.reject(Object.assign(new Error(/** @type {any} */ (msg).error || 'command failed'), { ack: msg }));
            }
            if (/** @type {any} */ (msg).auth && /** @type {any} */ (msg).auth.is_admin && !this.isAdmin) {
                this.isAdmin = true;
                this._notifyAdmin();
                if (typeof _w.va === 'function') _w.va('event', { name: 'sudo_succeeded' });
            }
            return;
        }
        if (msg.type === 'event') {
            for (const cb of this.eventListeners) { try { cb(msg); } catch (err) { console.error(err); } }
            return;
        }
    }

    /** @param {string} line
     * @returns {Promise<any>} */
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

    /** @param {Error} err */
    _failPendingAcks(err) {
        for (const [, p] of this._pendingAcks) { clearTimeout(p.timer); p.reject(err); }
        this._pendingAcks.clear();
    }

    /** @param {Function} cb */
    subscribe(cb) {
        this.tickListeners.add(cb);
        if (this.state) { try { cb(this.state, this.connected); } catch (e) { console.error(e); } }
        return () => this.tickListeners.delete(cb);
    }

    /** @param {Function} cb */
    onEvent(cb) {
        this.eventListeners.add(cb);
        return () => this.eventListeners.delete(cb);
    }

    /** @param {Function} cb */
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

/** @param {number} n */
const fmtMoney = (n) => {
    if (n == null || isNaN(n)) return '—';
    const v = Math.abs(n);
    if (v >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (v >= 1e3) return (n / 1e3).toFixed(2) + 'K';
    return n.toFixed(2);
};

/** @param {string} agentId */
const procIdFor = (agentId) => {
    const m = agentId.match(/(consumer|producer)_(\d+)/);
    if (!m) return agentId;
    return (m[1] === 'consumer' ? 'C-' : 'P-') + String(m[2]).padStart(2, '0');
};

/** @param {string} agentId */
const procNameFor = (agentId) =>
    agentId.startsWith('consumer') ? 'CONSUMER_POLICY_NET' : 'PRODUCER_RL_OPTIMIZER';

// --- window launchers ---

_w.launchWindow = function(/** @type {string} */ type) {
    const wm = _w.econWM;
    const kc = _w.kernelClient;
    if (!wm || !kc) return;

    if (type === 'process-explorer') {
        wm.createWindow('processes', 'Process Telemetry Hub', 80, 180, 700, 520,
            `<div class="font-mono text-[12px]">
                <div class="grid grid-cols-[60px_1fr_80px_60px_20px] gap-2 text-white/55 uppercase pb-1 border-b border-white/5 mb-2">
                    <span data-tip="Process ID — C-* are consumers, P-* producers">PID</span>
                    <span data-tip="Underlying RL policy network controlling this agent">Process</span>
                    <span data-tip="Current cash on hand for this agent">Balance</span>
                    <span data-tip="Reward signal from the most recent tick (utility for consumers, profit for producers)">Δ Reward</span>
                    <span data-tip="Status indicator">​</span>
                </div>
                <div id="proc-rows" class="space-y-1.5 text-[12px]">
                    <div class="text-white/55 italic">connecting to kernel…</div>
                </div>
            </div>`);
        const rowsEl = document.getElementById('proc-rows');
        if (!rowsEl) return;
        const unsub = kc.subscribe((/** @type {any} */ s, /** @type {boolean} */ connected) => {
            if (!document.getElementById('proc-rows')) { unsub(); return; }
            if (!s) {
                rowsEl.innerHTML = `<div class="text-white/55 italic">${
                    connected ? 'connected — awaiting first tick…' : 'connecting to kernel…'
                }</div>`;
                return;
            }
            rowsEl.innerHTML = s.agents.map((/** @type {any} */ a) => {
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
                <div class="col-span-2 border-b border-white/10 pb-2" data-tip="Live wage and price across the simulation. Both move as agents trade. Updates every 500ms.">
                    <div class="flex justify-between items-center mb-1">
                        <span class="text-white/40 uppercase">Global Asset Equilibrium (Wage vs Price)</span>
                        <span id="macro-status" class="text-terminal-green" data-tip="WebSocket connection status to the kernel">CONNECTING…</span>
                    </div>
                    <div class="h-64 w-full"><canvas id="mainChart" class="chart-glow"></canvas></div>
                </div>
                <div class="space-y-2 border-r border-white/5 pr-2" data-tip="Gini coefficient — 0 means perfect equality, 1 means total wealth concentration">
                    <span class="text-white/55 uppercase">Structural Inequality (Gini)</span>
                    <div class="text-4xl font-bold text-terminal-cyan tracking-tight value-flash" id="macro-gini">—</div>
                    <div class="text-[11px] text-white/55">consumer wealth distribution</div>
                </div>
                <div class="space-y-2 pl-2" data-tip="Total money in circulation = sum of agent balances + treasury. Conserved unless taxed.">
                    <span class="text-white/55 uppercase">System Liquidity</span>
                    <div class="text-3xl font-bold text-white tracking-tighter value-flash" id="macro-money">—</div>
                    <div class="flex gap-3 text-[11px] text-white/40">
                        <span data-tip="Tax revenue accumulated in the public coffer">TREASURY <span id="macro-treasury" class="text-terminal-gold">—</span></span>
                        <span data-tip="Income tax rate — admin sets via Policy Manager or shell">τ <span id="macro-tax" class="text-terminal-magenta">—</span></span>
                    </div>
                </div>
            </div>`);
        initMacroChart(kc);

    } else if (type === 'policy-manager') {
        wm.createWindow('policy-manager', 'Monetary Command Center', 240, 240, 480, 540,
            `<div class="space-y-3 font-mono text-[13px]">
                <div class="flex justify-between items-center text-[11px] uppercase pb-2 border-b border-white/5">
                    <span class="text-white/55">FED MODE</span>
                    <span id="pm-auth" class="text-terminal-red" data-tip="Sudo via the Econ Shell to elevate this connection to admin">visitor</span>
                </div>
                <div class="space-y-2" data-tip="Income tax rate. Skims gross wage income from consumers; revenue accrues to the treasury.">
                    <div class="flex justify-between items-center uppercase">
                        <span class="text-white/40">Income Tax τ</span>
                        <span id="pm-tax" class="text-terminal-cyan text-sm">—</span>
                    </div>
                    <input id="pm-tax-slider" type="range" min="0" max="100" step="1" value="0" disabled
                        class="w-full accent-terminal-cyan h-1 bg-white/10 rounded opacity-40">
                    <div class="flex justify-between text-[11px] text-white/40"><span>0%</span><span>100%</span></div>
                </div>
                <div class="space-y-1 border-t border-white/5 pt-2" data-tip="One-shot multiplicative shock to market wage; lands on the next tick">
                    <span class="text-white/40 uppercase text-[11px]">Wage Shock</span>
                    <div class="grid grid-cols-4 gap-1" id="pm-wage-shocks"></div>
                </div>
                <div class="space-y-1" data-tip="One-shot multiplicative shock to market price; lands on the next tick">
                    <span class="text-white/40 uppercase text-[11px]">Price Shock</span>
                    <div class="grid grid-cols-4 gap-1" id="pm-price-shocks"></div>
                </div>
                <div class="grid grid-cols-3 gap-1 border-t border-white/5 pt-2">
                    <button data-cmd="pause"  data-tip="Halt the kernel tick loop" class="pm-admin py-1 text-[12px] uppercase border border-white/10 text-white/60 hover:bg-white/5">Pause</button>
                    <button data-cmd="resume" data-tip="Resume the kernel tick loop" class="pm-admin py-1 text-[12px] uppercase border border-white/10 text-white/60 hover:bg-white/5">Resume</button>
                    <button data-cmd="reset"  data-tip="Reset the simulation — all balances back to defaults, treasury cleared" class="pm-admin py-1 text-[12px] uppercase border border-terminal-red/30 text-terminal-red hover:bg-terminal-red/10">Reset</button>
                </div>
                <div class="text-[11px] text-white/55 flex justify-between border-t border-white/5 pt-2">
                    <span>STEP <span id="pm-step" class="text-terminal-gold">—</span></span>
                    <span>UPTIME <span id="pm-uptime">—</span>s</span>
                    <span id="pm-policies">—</span>
                </div>
            </div>`);

        const SHOCKS = [-10, -5, 5, 10];
        /** @param {string} target
         * @param {number} pct */
        const mkBtn = (target, pct) => {
            const sign = pct > 0 ? '+' : '';
            const cls = pct > 0 ? 'text-terminal-green' : 'text-terminal-red';
            return `<button class="pm-admin py-1 text-[12px] border border-white/10 ${cls} hover:bg-white/5"
                data-shock="${target}" data-pct="${pct}">${sign}${pct}%</button>`;
        };
        const wSh = document.getElementById('pm-wage-shocks'); if(wSh) wSh.innerHTML  = SHOCKS.map(p => mkBtn('wage', p)).join('');
        const pSh = document.getElementById('pm-price-shocks'); if(pSh) pSh.innerHTML = SHOCKS.map(p => mkBtn('price', p)).join('');

        const slider = /** @type {HTMLInputElement | null} */ (document.getElementById('pm-tax-slider'));
        const taxLabel = document.getElementById('pm-tax');
        const authLabel = document.getElementById('pm-auth');
        if (!slider || !taxLabel || !authLabel) return;

        let userIsDragging = false;
        slider.addEventListener('pointerdown', () => { userIsDragging = true; });
        slider.addEventListener('pointerup',   () => { userIsDragging = false; });
        slider.addEventListener('input',  () => { taxLabel.textContent = parseInt(slider.value, 10).toFixed(2) + '%'; });
        slider.addEventListener('change', async () => {
            try {
                await kc.sendCommand(`tax ${slider.value}`);
                if (typeof _w.va === 'function') {
                    _w.va('event', {
                        name: 'policy_tax_changed',
                        data: { pct: slider.value },
                    });
                }
            } catch (err) { console.warn('tax cmd failed:', (/** @type {any} */ (err)).message); }
        });

        document.querySelectorAll('#policy-manager [data-shock]').forEach((/** @type {any} */ btn) => {
            btn.addEventListener('click', async () => {
                try {
                    await kc.sendCommand(`shock ${btn.dataset.shock} ${btn.dataset.pct}`);
                    if (typeof _w.va === 'function') {
                        _w.va('event', {
                            name: 'admin_shock_fired',
                            data: { kind: btn.dataset.shock, pct: btn.dataset.pct },
                        });
                    }
                } catch (err) { console.warn('shock cmd failed:', (/** @type {any} */ (err)).message); }
            });
        });
        document.querySelectorAll('#policy-manager [data-cmd]').forEach((/** @type {any} */ btn) => {
            btn.addEventListener('click', async () => {
                try { await kc.sendCommand(btn.dataset.cmd); }
                catch (err) { console.warn(`${btn.dataset.cmd} failed:`, (/** @type {any} */ (err)).message); }
            });
        });

        const unsubTick = kc.subscribe((/** @type {any} */ s) => {
            if (!document.getElementById('pm-tax')) { unsubTick(); return; }
            if (!s) return;
            const taxPct = s.policy.tax_rate * 100;
            if (!userIsDragging) {
                slider.value = String(Math.round(taxPct));
                taxLabel.textContent = taxPct.toFixed(2) + '%';
            }
            const pmStep = document.getElementById('pm-step'); if(pmStep) pmStep.textContent = s.step;
            const pmUptime = document.getElementById('pm-uptime'); if(pmUptime) pmUptime.textContent = s.uptime_s;
            const pmPol = document.getElementById('pm-policies'); if(pmPol) pmPol.innerHTML = s.policies_loaded
                ? '<i class="ph-bold ph-check-circle text-terminal-green"></i>&nbsp; PPO loaded'
                : '<i class="ph-bold ph-dice-five text-white/50"></i>&nbsp; random fallback';
        });

        const unsubAdmin = kc.onAdminChange((/** @type {boolean} */ isAdmin) => {
            if (!document.getElementById('pm-auth')) { unsubAdmin(); return; }
            authLabel.innerHTML = isAdmin
                ? '<i class="ph-fill ph-lock-open"></i>&nbsp; admin'
                : '<i class="ph-fill ph-lock"></i>&nbsp; visitor';
            authLabel.className = isAdmin ? 'text-terminal-green' : 'text-terminal-red';
            slider.disabled = !isAdmin;
            slider.classList.toggle('opacity-40', !isAdmin);
            document.querySelectorAll('#policy-manager .pm-admin').forEach((/** @type {any} */ b) => {
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
        const input = /** @type {HTMLInputElement | null} */ (document.getElementById('shell-input'));
        if (!out || !input) return;

        /** @param {string} text
         * @param {string} [cls] */
        const append = (text, cls = 'text-white/60') => {
            const d = document.createElement('div');
            d.className = cls + ' whitespace-pre';
            d.textContent = text;
            out.appendChild(d);
            out.scrollTop = out.scrollHeight;
        };
        append('>>> [SYSTEM_AUTH] read-only session attached to shared kernel', 'text-terminal-cyan');
        append("$ type 'help' to list commands. 'sudo <token>' to elevate.", 'text-white/40');

        /** @type {string[]} */
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

            // Only the verb — never args. 'sudo abc123' becomes 'sudo'; tokens stay private.
            const verb = (line.trim().split(/\s+/)[0] || '').slice(0, 24);
            if (typeof _w.va === 'function') {
                _w.va('event', { name: 'shell_command_run', data: { cmd: verb } });
            }

            try {
                const ack = await kc.sendCommand(line);
                if (ack.output) append(ack.output, 'text-terminal-green');
            } catch (err) {
                append('! ' + ((/** @type {any} */ (err)).message || 'command failed'), 'text-terminal-red');
            }
        });

        const unsubEvt = kc.onEvent((/** @type {any} */ evt) => {
            if (!document.getElementById('shell-output')) { unsubEvt(); return; }
            const detail = Object.keys(evt.detail || {}).length ? '  ' + JSON.stringify(evt.detail) : '';
            append(`* [${(evt.by || '?').toUpperCase()}] ${evt.kind}${detail}`, 'text-terminal-magenta');
        });

    } else if (type === 'system-menu') {
        wm.createWindow('sys-menu', 'EconOS System', 50, 300, 240, 260,
            `<div class="space-y-2 text-[13px] text-white/60">
                <div class="hover:text-white cursor-pointer" onclick="if(_w.launchWindow) _w.launchWindow('process-explorer')"><i class="ph ph-cpu"></i> Process Telemetry</div>
                <div class="hover:text-white cursor-pointer" onclick="if(_w.launchWindow) _w.launchWindow('macro-monitor')"><i class="ph ph-chart-line"></i> Market Analytics</div>
                <div class="hover:text-white cursor-pointer" onclick="launchWindow('policy-manager')"><i class="ph ph-shield-check"></i> Policy Manager</div>
                <div class="hover:text-white cursor-pointer" onclick="launchWindow('econ-shell')"><i class="ph ph-terminal"></i> Institutional Terminal</div>
                <div class="border-t border-white/5 mt-2 pt-2 hover:text-white cursor-pointer" onclick="if(_w.launchWindow) _w.launchWindow('about')"><i class="ph ph-question"></i> What is EconOS?</div>
                <div class="hover:text-white cursor-pointer" onclick="startTour()"><i class="ph ph-compass"></i> Take a tour</div>
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
                        <span class="text-terminal-green text-[11px] uppercase animate-pulse flex items-center gap-1.5">
                            <i class="ph-fill ph-circle text-[8px]"></i> broadcasting
                        </span>
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

                <button onclick="startTour()"
                    class="w-full px-4 py-3 text-[14px] uppercase font-semibold tracking-wide border-2 border-terminal-cyan/50 text-terminal-cyan bg-terminal-cyan/10 hover:bg-terminal-cyan/20 hover:border-terminal-cyan rounded transition-colors flex items-center justify-center gap-2"
                    data-tip="5-step guided walkthrough of the desktop">
                    <i class="ph-bold ph-compass"></i> Take a 5-step tour &rarr;
                </button>

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

        /** @param {number} s */
        const formatUptime = (s) => {
            if (s == null) return '—';
            if (s < 60) return `${Math.floor(s)}s`;
            if (s < 3600) return `${Math.floor(s/60)}m ${Math.floor(s%60)}s`;
            return `${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m`;
        };
        const unsubAbout = kc.subscribe((/** @type {any} */ s) => {
            if (!document.getElementById('about-step')) { unsubAbout(); return; }
            if (!s) return;
            const as = document.getElementById('about-step'); if(as) as.textContent = s.step.toLocaleString();
            const au = document.getElementById('about-uptime'); if(au) au.textContent = formatUptime(s.uptime_s);
            // viewers count isn't in the snapshot; fall back to '1' (you).
            const av = document.getElementById('about-viewers'); if(av) av.textContent = '1+';
        });

        try { localStorage.setItem('econos.aboutSeen', '1'); } catch (_) {}
    }
};

/** @param {KernelClient} kc */
function initMacroChart(kc) {
    const canvas = document.getElementById('mainChart');
    if (!canvas) return;
    const ctx = /** @type {HTMLCanvasElement} */ (canvas).getContext('2d');

    const chart = new _w.Chart(ctx, {
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
    /** @param {HTMLElement|null} el
     * @param {string} text */
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
    const unsub = kc.subscribe((/** @type {any} */ s, /** @type {boolean} */ connected) => {
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

// --- tooltips: data-tip attribute + global hover handler ---

function setupTooltips() {
    const tip = document.createElement('div');
    tip.id = 'tooltip';
    if(document.body) document.body.appendChild(tip);

    /** @type {HTMLElement | null} */
    let activeEl = null;
    const MARGIN = 8;
    /** @param {HTMLElement} el */
    const show = (el) => {
        const text = el.getAttribute('data-tip');
        if (!text) return;
        activeEl = el;
        tip.textContent = text;
        // Reset transform/visibility before measuring so width reflects the new text,
        // not stale layout from the previous target.
        tip.style.transform = 'none';
        tip.style.left = '0';
        tip.style.top = '0';
        const tipW = tip.offsetWidth;   // forces reflow with new text
        const tipH = tip.offsetHeight;
        const half = tipW / 2;

        const r = el.getBoundingClientRect();
        // Prefer above; flip below if no headroom.
        const placeBelow = r.top - tipH - 10 < MARGIN;
        const top = placeBelow ? r.bottom + 10 : r.top - 10;

        // Center horizontally on the target, then clamp so neither edge
        // leaves the viewport. Previous version used a fixed 80px buffer,
        // which clipped wide tooltips at the screen edge (desktop icons).
        let left = r.left + r.width / 2;
        left = Math.max(half + MARGIN, Math.min(left, window.innerWidth - half - MARGIN));

        tip.style.left = `${left}px`;
        tip.style.top  = `${top}px`;
        tip.style.transform = placeBelow ? 'translate(-50%, 0)' : 'translate(-50%, -100%)';
        tip.classList.add('visible');
    };
    const hide = () => { tip.classList.remove('visible'); activeEl = null; };

    document.addEventListener('mouseover', (/** @type {MouseEvent} */ e) => {
        const target = /** @type {HTMLElement} */ (e.target);
        const el = target ? /** @type {HTMLElement} */ (target.closest('[data-tip]')) : null;
        if (el && el !== activeEl) show(el);
    });
    document.addEventListener('mouseout', (/** @type {MouseEvent} */ e) => {
        const target = /** @type {HTMLElement} */ (e.target);
        const el = target ? /** @type {HTMLElement} */ (target.closest('[data-tip]')) : null;
        if (el && el === activeEl) hide();
    });
    document.addEventListener('mousedown', hide); // hide on any click
}

// --- guided tour: spotlight + callout + step counter ---

const TOUR_STEPS = [
    {
        title: 'Welcome to EconOS',
        body: 'This is a live multi-agent economic simulation. Twelve RL agents — 10 consumers, 2 producers — are trading right now. You\'re seeing the same simulation as every other visitor.',
        target: '#sys-link',
        focusWindow: null,
    },
    {
        title: 'Macro Monitor',
        body: 'Live wage and price chart. The Gini coefficient measures inequality (0 = equal, 1 = total concentration). System Liquidity is the total money in circulation — conserved unless taxed.',
        target: '#mainChart',
        focusWindow: 'macro-monitor',
    },
    {
        title: 'Process Explorer',
        body: 'Every agent in the simulation. C-* are consumers, P-* are producers. Each row updates per tick: balance drifts as they trade, reward shows the most recent step\'s utility or profit.',
        target: '#proc-rows',
        focusWindow: 'process-explorer',
    },
    {
        title: 'Econ Shell',
        body: 'Your terminal into the kernel. Type "help" to list commands. Try "inspect consumer_3", "top 5", "gini". To unlock Fed mode and shock the economy, type "sudo <token>".',
        target: '#shell-input',
        focusWindow: 'econ-shell',
    },
    {
        title: 'Fed Mode (Admin)',
        body: 'Once you sudo, the Policy Manager unlocks. Drag the τ slider to tax consumer income, click ±5/±10% to shock wages or prices, or pause/reset the kernel. Every action broadcasts to all viewers.',
        target: '#pm-tax-slider',
        focusWindow: 'policy-manager',
    },
];

function startTour() {
    if (document.getElementById('tour-overlay')) return; // already running
    // Close README if open so it doesn't block the tour visually
    const aboutWin = document.getElementById('about');
    if (aboutWin) aboutWin.remove();
    if (typeof _w.va === 'function') _w.va('event', { name: 'tour_started' });

    const overlay = document.createElement('div');
    overlay.id = 'tour-overlay';

    const spotlight = document.createElement('div');
    spotlight.id = 'tour-spotlight';

    const callout = document.createElement('div');
    callout.id = 'tour-callout';
    callout.innerHTML = `
        <div class="tour-step-counter">Step <span id="tour-step-num">1</span> of ${TOUR_STEPS.length}</div>
        <div id="tour-title"></div>
        <div id="tour-body"></div>
        <div class="tour-buttons">
            <button id="tour-skip" type="button">Skip</button>
            <button id="tour-prev" type="button">← Back</button>
            <button id="tour-next" type="button">Next →</button>
        </div>
    `;

    if(document.body) document.body.append(overlay, spotlight, callout);

    const titleEl   = callout.querySelector('#tour-title');
    const bodyEl    = callout.querySelector('#tour-body');
    const stepNumEl = callout.querySelector('#tour-step-num');
    const prevBtn   = /** @type {HTMLButtonElement | null} */ (callout.querySelector('#tour-prev'));
    const nextBtn   = /** @type {HTMLButtonElement | null} */ (callout.querySelector('#tour-next'));
    const skipBtn   = /** @type {HTMLButtonElement | null} */ (callout.querySelector('#tour-skip'));
    if (!titleEl || !bodyEl || !stepNumEl || !prevBtn || !nextBtn || !skipBtn) return;

    let stepIdx = 0;

    /** @param {boolean} completed */
    const cleanup = (completed) => {
        overlay.remove(); spotlight.remove(); callout.remove();
        if (completed) { try { localStorage.setItem('econos.tourSeen', '1'); } catch (_) {} }
    };

    /** @param {HTMLElement|null} target */
    const positionAround = (target) => {
        if (!target) {
            spotlight.style.opacity = '0';
            callout.style.top = '50%';
            callout.style.left = '50%';
            callout.style.transform = 'translate(-50%, -50%)';
            return;
        }
        const r = target.getBoundingClientRect();
        spotlight.style.opacity = '1';
        spotlight.style.top    = `${r.top - 6}px`;
        spotlight.style.left   = `${r.left - 6}px`;
        spotlight.style.width  = `${r.width + 12}px`;
        spotlight.style.height = `${r.height + 12}px`;

        const cw = 360, ch = callout.offsetHeight || 220;
        let top, left;
        // Prefer below the target; fall back to above; fall back to right.
        if (r.bottom + ch + 24 < window.innerHeight) {
            top  = r.bottom + 16;
            left = r.left + r.width / 2 - cw / 2;
        } else if (r.top - ch - 24 > 0) {
            top  = r.top - ch - 16;
            left = r.left + r.width / 2 - cw / 2;
        } else {
            top  = r.top + r.height / 2 - ch / 2;
            left = r.right + 16;
        }
        left = Math.max(20, Math.min(left, window.innerWidth - cw - 20));
        top  = Math.max(20, Math.min(top,  window.innerHeight - ch - 20));
        callout.style.top = `${top}px`;
        callout.style.left = `${left}px`;
        callout.style.transform = 'none';
    };

    const renderStep = () => {
        const step = TOUR_STEPS[stepIdx];
        if (step.focusWindow) {
            const w = document.getElementById(step.focusWindow === 'process-explorer' ? 'processes' : step.focusWindow);
            if (w) _w.econWM.focusWindow(w);
            else if(_w.launchWindow) _w.launchWindow(step.focusWindow);
        }
        titleEl.textContent = step.title;
        bodyEl.textContent  = step.body;
        stepNumEl.textContent = String(stepIdx + 1);
        prevBtn.disabled = stepIdx === 0;
        nextBtn.textContent = stepIdx === TOUR_STEPS.length - 1 ? 'Done' : 'Next →';
        // Targets in just-launched windows need a paint cycle before getBoundingClientRect is meaningful.
        requestAnimationFrame(() => positionAround(document.querySelector(step.target)));
    };

    nextBtn.addEventListener('click', () => {
        if (stepIdx === TOUR_STEPS.length - 1) {
            if (typeof _w.va === 'function') _w.va('event', { name: 'tour_completed' });
            return cleanup(true);
        }
        stepIdx++; renderStep();
    });
    prevBtn.addEventListener('click', () => {
        if (stepIdx > 0) { stepIdx--; renderStep(); }
    });
    skipBtn.addEventListener('click', () => {
        if (typeof _w.va === 'function') {
            // step is 1-indexed in event data so we can see *where* people drop off
            _w.va('event', { name: 'tour_skipped', data: { step: stepIdx + 1 } });
        }
        cleanup(true);
    });

    renderStep();
}
_w.startTour = startTour;

// --- theme cycling: dark / light / system ---
// The inline <head> script resolves and applies the initial theme before
// first paint. This wires the taskbar toggle + a matchMedia listener so the
// 'system' mode actually follows the OS theme changes in real time.

const THEME_KEY = 'econos.themePref';
/** @type {Object<string, string>} */
const THEME_ICONS = { dark: 'ph-moon', light: 'ph-sun', system: 'ph-desktop' };
/** @type {Object<string, string>} */
const THEME_TIPS  = {
    dark:   'Theme: dark (click for light)',
    light:  'Theme: light (click for system)',
    system: 'Theme: system (click for dark)',
};
/** @type {Object<string, string>} */
const THEME_CYCLE = { dark: 'light', light: 'system', system: 'dark' };

function getThemePref() {
    try { return localStorage.getItem(THEME_KEY) || 'system'; } catch (_) { return 'system'; }
}
/** @param {string} pref */
function resolveTheme(pref) {
    if (pref === 'system') {
        return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    return pref;
}
/** @param {string} pref */
function applyTheme(pref) {
    const resolved = resolveTheme(pref);
    document.documentElement.dataset.theme = resolved;
    const btn = document.getElementById('theme-toggle');
    if (btn) {
        btn.innerHTML = `<i class="ph ${THEME_ICONS[pref]}"></i>`;
        btn.setAttribute('data-tip', THEME_TIPS[pref]);
    }
    // Track preference change as an analytics event (only when explicitly cycled,
    // not on first-paint apply — see setThemePref).
}
/** @param {string} pref */
function setThemePref(pref) {
    try { localStorage.setItem(THEME_KEY, pref); } catch (_) {}
    applyTheme(pref);
    if (typeof _w.va === 'function') {
        _w.va('event', { name: 'theme_changed', data: { pref } });
    }
}
_w.cycleTheme = function () {
    setThemePref(THEME_CYCLE[getThemePref()]);
};

// --- boot ---

document.addEventListener('DOMContentLoaded', () => {
    _w.econWM = new WindowManager();
    _w.kernelClient = new KernelClient();
    const wm = _w.econWM;
    if (!wm) return;

    setupTooltips();

    // Make the toggle icon + tip reflect the resolved theme from the head script.
    applyTheme(getThemePref());

    // When the user is on 'system', track OS theme changes live.
    try {
        window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
            if (getThemePref() === 'system') applyTheme('system');
        });
    } catch (_) { /* Safari < 14 lacks addEventListener on MediaQueryList; ignore */ }

    const bootWin = wm.createWindow('boot-loader', 'EconOS Boot', 100, 50, 420, 280,
        '<div id="boot-log" class="font-mono text-[12px] text-terminal-green space-y-1"></div>'
    );
    const bootLog = document.getElementById('boot-log'); if(!bootLog) return;
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
                if(_w.launchWindow) _w.launchWindow('macro-monitor');
                if(_w.launchWindow) _w.launchWindow('process-explorer');
                // First-visit only: show the README/about window so newcomers
                // know what they're looking at. Repeat visitors get the
                // dashboard clean; the ? icon in the taskbar reopens it.
                let seen = false;
                try { seen = !!localStorage.getItem('econos.aboutSeen'); } catch (_) {}
                if (!seen) if(_w.launchWindow) _w.launchWindow('about');
            }, 800);
        }
    }, 350);

    // taskbar status: clock + kernel step + connection state
    const sysTime = document.getElementById('sys-time');
    if (sysTime) setInterval(() => { sysTime.innerText = new Date().toLocaleTimeString(); }, 1000);

    const taskMeta = sysTime ? sysTime.parentElement : null;
    if (!taskMeta) return;
    const stepBadge = document.createElement('span');
    stepBadge.id = 'sys-step';
    stepBadge.className = 'text-terminal-cyan';
    stepBadge.textContent = 'STEP —';
    stepBadge.setAttribute('data-tip', 'Current simulation tick (advances every ~500ms while live)');
    taskMeta.insertBefore(stepBadge, taskMeta.firstChild);

    const linkBadge = document.createElement('span');
    linkBadge.id = 'sys-link';
    linkBadge.className = 'text-terminal-red flex items-center gap-1.5';
    linkBadge.innerHTML = '<i class="ph-fill ph-circle text-[8px]"></i> OFFLINE';
    linkBadge.setAttribute('data-tip', 'WebSocket connection state — LIVE means kernel ticks are streaming');
    taskMeta.insertBefore(linkBadge, taskMeta.firstChild);

    _w.kernelClient.subscribe((/** @type {any} */ s, /** @type {boolean=} */ connected) => {
        const label = connected ? 'LIVE' : (s ? 'RECONNECTING' : 'CONNECTING');
        linkBadge.innerHTML = `<i class="ph-fill ph-circle text-[8px]"></i> ${label}`;
        linkBadge.className = (connected ? 'text-terminal-green' : 'text-terminal-gold') + ' flex items-center gap-1.5';
        if (s) stepBadge.textContent = `STEP ${s.step}`;
    });
});
