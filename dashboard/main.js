// @ts-check
/// <reference path="./global.d.ts" />

/**
 * @typedef {Object} AgentRecord
 * @property {string} id
 * @property {string} role
 * @property {number} balance
 * @property {number} reward
 */

/**
 * @typedef {Object} MarketState
 * @property {number} wage
 * @property {number} price
 */

/**
 * @typedef {Object} MetricsState
 * @property {number} gini
 * @property {number} total_money
 * @property {number} treasury
 */

/**
 * @typedef {Object} PolicyState
 * @property {number} tax_rate
 */

/**
 * @typedef {Object} KernelState
 * @property {number} step
 * @property {number} uptime_s
 * @property {boolean} [policies_loaded]
 * @property {AgentRecord[]} agents
 * @property {MarketState} market
 * @property {MetricsState} metrics
 * @property {PolicyState} policy
 * @property {Object<string, string|number|boolean|null>} [extra]
 */

/**
 * @typedef {Object} KernelEvent
 * @property {string} [kind]
 * @property {string} [by]
 * @property {Object<string, string|number|boolean|null>} [detail]
 */

/**
 * @typedef {Object} AckMessage
 * @property {string} [type]
 * @property {string} [id]
 * @property {boolean} [ok]
 * @property {string} [error]
 * @property {string} [output]
 * @property {{ is_admin?: boolean }} [auth]
 */

/**
 * @typedef {new (ctx: CanvasRenderingContext2D | null, config: Record<string, string|number|boolean|null|object>) => {
 *   data: { labels: (number|string)[], datasets: Array<{ data: number[], borderColor: string }> },
 *   options: { plugins: { legend: { labels: { color: string } } }, scales: { y: { grid: { color: string }, ticks: { color: string } } } },
 *   update: (mode?: string) => void,
 *   destroy: () => void
 * }} EconChartConstructor
 */

/**
 * @typedef {Window & typeof globalThis & {
 *   econWM?: WindowManager;
 *   kernelClient?: KernelClient;
 *   launchWindow?: (type: string) => void;
 *   startTour?: () => void;
 *   cycleTheme?: () => void;
 *   va?: (event: string, properties?: Record<string, string|number|boolean|null>) => void;
 *   ECONOS_KERNEL_WS_URL?: string;
 *   Chart?: EconChartConstructor;
 * }} CustomWindow
 */

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** @param {Record<string, unknown>} value @returns {value is KernelState} */
function isKernelState(value) {
    return typeof value.step === 'number' && typeof value.uptime_s === 'number'
        && Array.isArray(value.agents) && isRecord(value.market) && isRecord(value.metrics) && isRecord(value.policy);
}

/** @param {Record<string, unknown>} value @returns {value is AckMessage} */
function isAckMessage(value) {
    return value.type === 'ack' && (value.id === undefined || typeof value.id === 'string')
        && (value.ok === undefined || typeof value.ok === 'boolean');
}

/** @param {Record<string, unknown>} value @returns {value is KernelEvent} */
function isKernelEvent(value) {
    return value.type === 'event';
}

const _w = /** @type {CustomWindow} */ (window);
/**
 * EconOS Window Manager + Kernel Client
 * AESTHETIC_DNA: Glassmorphic Bloomberg-grade desktop OS, fed by live WebSocket telemetry.
 */

class WindowManager {
    constructor() {
        /** @type {HTMLElement[]} */ this.windows = [];
        /** @type {HTMLElement | null} */ this.activeWindow = null;
        this.highestZ = 100;
        /** @type {HTMLElement | null} */ this.desktop = document.getElementById('window-layer');
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
        if (existing) {
            this.focusWindow(existing);
            if (!existing.classList.contains('docked') && window.matchMedia('(max-width: 600px)').matches) {
                existing.scrollIntoView({ block: 'start' });
            }
            return existing;
        }

        // The workspace is narrower than the viewport because the tool rail
        // sits beside it. Keep floating windows inside that workspace.
        const MARGIN = 20;
        const vw = this.desktop?.clientWidth || window.innerWidth;
        const vh = this.desktop?.clientHeight || window.innerHeight;
        w = Math.min(w, vw - MARGIN * 2);
        h = Math.min(h, vh - MARGIN * 2);
        x = Math.max(MARGIN, Math.min(x, vw - w - MARGIN));
        y = Math.max(MARGIN, Math.min(y, vh - h - MARGIN));

        const win = document.createElement('div');
        win.id = id;
        win.className = 'window active';
        if (id === 'macro-monitor' || id === 'processes') win.classList.add('docked');
        win.style.left = `${x}px`;
        win.style.top = `${y}px`;
        win.style.width = `${w}px`;
        win.style.height = `${h}px`;
        win.style.zIndex = String(++this.highestZ);

        win.innerHTML = `
            <div class="window-header">
                <h2 class="window-title">${title}</h2>
                <div class="window-controls">
                    <button type="button" class="control-btn" aria-label="Close ${title}">Close <i class="ph ph-x" aria-hidden="true"></i></button>
                </div>
            </div>
            <div class="window-content">${contentHTML}</div>
        `;

        const header = win.querySelector('.window-header');
        if (header && !win.classList.contains('docked')) header.addEventListener('mousedown', (/** @type {MouseEvent} */ e) => this.startDragging(e, win));
        const close = win.querySelector('.control-btn');
        if (close) close.addEventListener('click', () => win.remove());

        if (this.desktop) this.desktop.appendChild(win);
        this.windows.push(win);
        this.focusWindow(win);
        if (!win.classList.contains('docked') && window.matchMedia('(max-width: 600px)').matches) {
            win.scrollIntoView({ block: 'start' });
        }
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
        if (document.body) document.body.style.cursor = 'move';
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
        if (document.body) document.body.style.cursor = 'default';
    }
}

/**
 * KernelClient: single WebSocket to the shared kernel, multiplexed:
 *   - inbound `tick`   → state cache + .subscribe(cb) listeners
 *   - inbound `event`  → .onEvent(cb) listeners (admin shocks, resets)
 *   - inbound `ack`    → resolves the matching .sendCommand() promise
 *   - per-connection `isAdmin` flag flips on a successful `sudo` ack
 *
 * Reconnect drops admin elevation by design: the server-side connection is
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
        /** @type {KernelState | null} */ this.state = null;
        this.connected = false;
        this.isAdmin = false;
        this._reconnectMs = 800;
        this._cmdSeq = 0;
        /** @type {Map<string, {resolve: function, reject: function, timer: ReturnType<typeof setTimeout> | number}>} */ this._pendingAcks = new Map();
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
        if (this.ws) this.ws.onerror = () => { try { if (this.ws) this.ws.close(); } catch (_) { } };
    }

    _scheduleReconnect() {
        const delay = this._reconnectMs;
        this._reconnectMs = Math.min(this._reconnectMs * 2, 8000);
        setTimeout(() => this._connect(), delay);
    }

    /** @param {MessageEvent} e */
    _onMessage(e) {
        let msg;
        try { msg = JSON.parse(typeof e.data === 'string' ? e.data : String(e.data)); } catch { return; }
        if (!isRecord(msg)) return;
        if (isKernelState(msg)) {
            this.state = msg;
            this._notifyTick();
            return;
        }
        if (isAckMessage(msg)) {
            const p = this._pendingAcks.get(msg.id);
            if (!p) return;
            const ackMsg = msg;
            clearTimeout(p.timer);
            this._pendingAcks.delete(msg.id);
            if (msg.ok) p.resolve(msg);
            else p.reject(Object.assign(new Error(ackMsg.error || 'command failed'), { ack: msg }));
            if (ackMsg.auth && ackMsg.auth.is_admin && !this.isAdmin) {
                this.isAdmin = true;
                this._notifyAdmin();
                if (typeof _w.va === 'function') _w.va('event', { name: 'sudo_succeeded' });
            }
            return;
        }
        if (isKernelEvent(msg)) {
            for (const cb of this.eventListeners) { try { cb(msg); } catch (err) { console.error(err); } }
            return;
        }
    }

    /** @param {string} line
     * @returns {Promise<AckMessage>} */
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
    agentId.startsWith('consumer') ? 'Consumer' : 'Producer';

_w.launchWindow = function (/** @type {string} */ type) {
    const wm = _w.econWM;
    const kc = _w.kernelClient;
    if (!wm || !kc) return;

    if (type === 'process-explorer') {
        wm.createWindow('processes', 'Agents', 80, 180, 700, 520,
            `<div class="agent-ledger font-mono text-[12px]">
                <div class="agent-heading grid grid-cols-[48px_minmax(0,1fr)_70px_68px] gap-2 text-white/55 pb-2 border-b border-white/5 mb-2">
                    <span data-tip="Agent ID: C-* are consumers, P-* producers">Agent</span>
                    <span>Role</span>
                    <span data-tip="Current cash on hand for this agent">Balance</span>
                    <span data-tip="Reward from the latest tick: utility or profit">Reward</span>
                </div>
                <div id="proc-rows" class="space-y-1.5 text-[12px]">
                    <div class="text-white/55 italic">connecting to kernel…</div>
                </div>
            </div>`);
        const rowsEl = document.getElementById('proc-rows');
        if (!rowsEl) return;
        const unsub = kc.subscribe((/** @type {KernelState} */ s, /** @type {boolean} */ connected) => {
            if (!document.getElementById('proc-rows')) { unsub(); return; }
            if (!s) {
                rowsEl.innerHTML = `<div class="text-white/55 italic">${connected ? 'connected: awaiting first tick…' : 'connecting to kernel…'
                    }</div>`;
                return;
            }
            rowsEl.innerHTML = s.agents.map((/** @type {AgentRecord} */ a) => {
                const reward = (a.reward >= 0 ? '+' : '') + a.reward.toFixed(3);
                const rewardCls = a.reward >= 0 ? 'text-terminal-green' : 'text-terminal-red';
                return `<div class="agent-row grid grid-cols-[48px_minmax(0,1fr)_70px_68px] gap-2 items-center">
                    <span class="text-terminal-cyan">${procIdFor(a.id)}</span>
                    <span class="text-white/70">${procNameFor(a.id)}</span>
                    <span class="text-white/60">${fmtMoney(a.balance)}</span>
                    <span class="${rewardCls}">${reward}</span>
                </div>`;
            }).join('');
        });

    } else if (type === 'macro-monitor') {
        wm.createWindow('macro-monitor', 'Market monitor', 800, 100, 820, 600,
            `<div class="macro-layout grid grid-cols-2 gap-4 h-full font-mono text-[12px]">
                <div class="macro-plot col-span-2 border-b border-white/10 pb-2" data-tip="Live wage and price across the simulation. Both move as agents trade. Updates every 500ms.">
                    <div class="flex justify-between items-center mb-1">
                        <span class="chart-caption">Wage and price over time</span>
                        <span id="macro-status" class="text-terminal-green" data-tip="WebSocket connection status to the kernel">CONNECTING…</span>
                    </div>
                    <div class="chart-frame w-full"><canvas id="mainChart" aria-label="Live wage and price chart" role="img"></canvas></div>
                </div>
                <div class="macro-metric space-y-2" data-tip="Gini coefficient: 0 means perfect equality, 1 means total wealth concentration">
                    <span class="metric-label">Gini coefficient</span>
                    <div class="text-4xl font-bold text-terminal-cyan tracking-tight" id="macro-gini">—</div>
                    <div class="metric-help">0 is equal; 1 is concentrated</div>
                </div>
                <div class="macro-metric space-y-2" data-tip="Total money in circulation = sum of agent balances + treasury.">
                    <span class="metric-label">Money in circulation</span>
                    <div class="text-3xl font-bold text-white tracking-tighter" id="macro-money">—</div>
                    <div class="flex gap-3 text-[11px] text-white/40">
                        <span data-tip="Tax revenue accumulated in the public coffer">Treasury <span id="macro-treasury" class="text-terminal-gold">—</span></span>
                        <span data-tip="Income tax rate: admin sets via Policy Manager or shell">Tax <span id="macro-tax" class="text-terminal-magenta">—</span></span>
                    </div>
                </div>
            </div>`);
        initMacroChart(kc);

    } else if (type === 'policy-manager') {
        wm.createWindow('policy-manager', 'Policy controls', 240, 240, 480, 540,
            `<div class="policy-controls space-y-3 font-mono text-[13px]">
                <div class="flex justify-between items-center pb-2 border-b border-white/5">
                    <span class="text-white/55">Access</span>
                    <span id="pm-auth" class="text-terminal-red" data-tip="Sudo via the Econ Shell to elevate this connection to admin">visitor</span>
                </div>
                <div class="space-y-2" data-tip="Income tax rate. Skims gross wage income from consumers; revenue accrues to the treasury.">
                    <div class="flex justify-between items-center">
                        <label for="pm-tax-slider" class="text-white/60">Income tax</label>
                        <span id="pm-tax" class="text-terminal-cyan text-sm">—</span>
                    </div>
                    <input id="pm-tax-slider" type="range" min="0" max="100" step="1" value="0" disabled
                        class="w-full accent-terminal-cyan h-1 bg-white/10 rounded opacity-40">
                    <div class="flex justify-between text-[11px] text-white/40"><span>0%</span><span>100%</span></div>
                </div>
                <div class="space-y-1 border-t border-white/5 pt-2" data-tip="One-shot multiplicative shock to market wage; lands on the next tick">
                    <span class="text-white/60">Wage shock</span>
                    <div class="grid grid-cols-4 gap-1" id="pm-wage-shocks"></div>
                </div>
                <div class="space-y-1" data-tip="One-shot multiplicative shock to market price; lands on the next tick">
                    <span class="text-white/60">Price shock</span>
                    <div class="grid grid-cols-4 gap-1" id="pm-price-shocks"></div>
                </div>
                <div class="grid grid-cols-3 gap-1 border-t border-white/5 pt-2">
                    <button data-cmd="pause"  data-tip="Halt the kernel tick loop" class="pm-admin text-white/60">Pause</button>
                    <button data-cmd="resume" data-tip="Resume the kernel tick loop" class="pm-admin text-white/60">Resume</button>
                    <button data-cmd="reset"  data-tip="Reset the simulation: all balances back to defaults, treasury cleared" class="pm-admin text-terminal-red">Reset</button>
                </div>
                <div class="text-[11px] text-white/55 flex justify-between border-t border-white/5 pt-2">
                    <span>Step <span id="pm-step" class="text-terminal-gold">—</span></span>
                    <span>Uptime <span id="pm-uptime">—</span>s</span>
                    <span id="pm-policies">—</span>
                </div>
            </div>`);

        const SHOCKS = [-10, -5, 5, 10];
        /** @param {string} target
         * @param {number} pct */
        const mkBtn = (target, pct) => {
            const sign = pct > 0 ? '+' : '';
            const cls = pct > 0 ? 'text-terminal-green' : 'text-terminal-red';
            return `<button class="pm-admin ${cls}" aria-label="${target} shock ${sign}${pct}%"
                data-shock="${target}" data-pct="${pct}">${sign}${pct}%</button>`;
        };
        const wSh = document.getElementById('pm-wage-shocks'); if (wSh) wSh.innerHTML = SHOCKS.map(p => mkBtn('wage', p)).join('');
        const pSh = document.getElementById('pm-price-shocks'); if (pSh) pSh.innerHTML = SHOCKS.map(p => mkBtn('price', p)).join('');

        const slider = /** @type {HTMLInputElement | null} */ (document.getElementById('pm-tax-slider'));
        const taxLabel = document.getElementById('pm-tax');
        const authLabel = document.getElementById('pm-auth');
        if (!slider || !taxLabel || !authLabel) return;

        let userIsDragging = false;
        slider.addEventListener('pointerdown', () => { userIsDragging = true; });
        slider.addEventListener('pointerup', () => { userIsDragging = false; });
        slider.addEventListener('input', () => { taxLabel.textContent = parseInt(slider.value, 10).toFixed(2) + '%'; });
        slider.addEventListener('change', async () => {
            try {
                await kc.sendCommand(`tax ${slider.value}`);
                if (typeof _w.va === 'function') {
                    _w.va('event', {
                        name: 'policy_tax_changed',
                        data: { pct: slider.value },
                    });
                }
            } catch (err) { console.warn('tax cmd failed:', (/** @type {Error} */ (err)).message); }
        });

        document.querySelectorAll('#policy-manager [data-shock]').forEach((/** @type {HTMLButtonElement} */ btn) => {
            btn.addEventListener('click', async () => {
                try {
                    await kc.sendCommand(`shock ${btn.dataset.shock} ${btn.dataset.pct}`);
                    if (typeof _w.va === 'function') {
                        _w.va('event', {
                            name: 'admin_shock_fired',
                            data: { kind: btn.dataset.shock, pct: btn.dataset.pct },
                        });
                    }
                } catch (err) { console.warn('shock cmd failed:', (/** @type {Error} */ (err)).message); }
            });
        });
        document.querySelectorAll('#policy-manager [data-cmd]').forEach((/** @type {HTMLButtonElement} */ btn) => {
            btn.addEventListener('click', async () => {
                try { await kc.sendCommand(btn.dataset.cmd); }
                catch (err) { console.warn(`${btn.dataset.cmd} failed:`, (/** @type {Error} */ (err)).message); }
            });
        });

        const unsubTick = kc.subscribe((/** @type {KernelState} */ s) => {
            if (!document.getElementById('pm-tax')) { unsubTick(); return; }
            if (!s) return;
            const taxPct = s.policy.tax_rate * 100;
            if (!userIsDragging) {
                slider.value = String(Math.round(taxPct));
                taxLabel.textContent = taxPct.toFixed(2) + '%';
            }
            const pmStep = document.getElementById('pm-step'); if (pmStep) pmStep.textContent = String(s.step);
            const pmUptime = document.getElementById('pm-uptime'); if (pmUptime) pmUptime.textContent = String(s.uptime_s);
            const pmPol = document.getElementById('pm-policies'); if (pmPol) pmPol.textContent = s.policies_loaded
                ? 'PPO loaded' : 'Random fallback';
        });

        const unsubAdmin = kc.onAdminChange((/** @type {boolean} */ isAdmin) => {
            if (!document.getElementById('pm-auth')) { unsubAdmin(); return; }
            authLabel.textContent = isAdmin ? 'admin' : 'visitor';
            authLabel.className = isAdmin ? 'text-terminal-green' : 'text-terminal-red';
            slider.disabled = !isAdmin;
            slider.classList.toggle('opacity-40', !isAdmin);
            document.querySelectorAll('#policy-manager .pm-admin').forEach((/** @type {HTMLButtonElement} */ b) => {
                b.disabled = !isAdmin;
                b.classList.toggle('opacity-40', !isAdmin);
                b.classList.toggle('cursor-not-allowed', !isAdmin);
            });
        });

    } else if (type === 'econ-shell') {
        wm.createWindow('econ-shell', 'Econ Shell', 1080, 80, 620, 480,
            `<div class="flex flex-col h-full font-mono text-[12px]">
                <div id="shell-output" class="flex-1 text-white/60 overflow-auto mb-2 space-y-0.5"></div>
                <div class="flex items-center gap-2 border-t border-white/5 pt-2">
                    <label for="shell-input" class="text-terminal-cyan font-bold">econos&gt;</label>
                    <input id="shell-input" type="text"
                        class="bg-transparent flex-1 font-mono text-white text-[12px]"
                        placeholder="Try help or gini" autocomplete="off" autocapitalize="off" spellcheck="false">
                </div>
            </div>`);

        const output = document.getElementById('shell-output');
        const input = /** @type {HTMLInputElement | null} */ (document.getElementById('shell-input'));
        if (!output || !input) return;

        /** @param {string} text
         * @param {string=} cls */
        const append = (text, cls = 'text-white/70') => {
            const row = document.createElement('div');
            row.className = cls;
            row.textContent = text;
            output.appendChild(row);
            output.scrollTop = output.scrollHeight;
        };
        append('Read-only shell. Type help to list commands.', 'text-terminal-cyan');
        append('Administrators can enter sudo <token> to change policy.', 'text-white/55');

        /** @type {string[]} */
        const history = [];
        let histIdx = -1;

        input.addEventListener('keydown', async (e) => {
            if (e.key === 'ArrowUp') {
                if (!history.length) return;
                histIdx = histIdx === -1 ? history.length - 1 : Math.max(0, histIdx - 1);
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

            // Send only the verb without args for telemetry ('sudo abc123' -> 'sudo')
            const verb = (line.trim().split(/\s+/)[0] || '').slice(0, 24);
            if (typeof _w.va === 'function') {
                _w.va('event', { name: 'shell_command_run', data: { cmd: verb } });
            }

            try {
                const ack = await kc.sendCommand(line);
                if (ack.output) append(ack.output, 'text-terminal-green');
            } catch (err) {
                append('! ' + ((/** @type {Error} */ (err)).message || 'command failed'), 'text-terminal-red');
            }
        });

        const unsubEvt = kc.onEvent((/** @type {KernelEvent} */ evt) => {
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
        wm.createWindow('about', 'How EconOS works', 260, 40, 600, 600,
            `<div class="guide-content">
                <p>Twelve learning agents trade labor and goods in one shared simulation. The market continues to run while you watch. A policy change made by an administrator reaches every connected viewer.</p>
                <button type="button" class="guide-tour" onclick="startTour()">Take the guided tour <i class="ph ph-arrow-right" aria-hidden="true"></i></button>
                <h3>Watch the market</h3>
                <p>The chart plots wage and price on each tick. The Gini coefficient tracks how unevenly consumer wealth is distributed; the ledger shows each agent's balance and latest reward.</p>
                <h3>Try the shell</h3>
                <p>Inspection commands work for everyone. Enter <code>help</code>, <code>gini</code>, or <code>inspect consumer_3</code>. Administrators can use <code>sudo &lt;token&gt;</code> to unlock tax and market controls.</p>
                <a href="https://github.com/Builder106/econ-os" target="_blank" rel="noopener">Read the source and methodology <i class="ph ph-arrow-up-right" aria-hidden="true"></i></a>
            </div>`);
    }
};

/** @param {KernelClient} kc */
function initMacroChart(kc) {
    const canvas = document.getElementById('mainChart');
    if (!(canvas instanceof HTMLCanvasElement) || !_w.Chart) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const chart = new _w.Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                { label: 'Wage', borderColor: getComputedStyle(document.documentElement).getPropertyValue('--terminal-gold').trim(), borderWidth: 2, pointRadius: 0, data: [], tension: 0.2 },
                { label: 'Price', borderColor: getComputedStyle(document.documentElement).getPropertyValue('--terminal-green').trim(), borderWidth: 2, pointRadius: 0, data: [], tension: 0.2 }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false, animation: false,
            plugins: { legend: { labels: { color: getComputedStyle(document.documentElement).getPropertyValue('--fg-muted').trim(), font: { size: 12 } } } },
            scales: {
                x: { display: false },
                y: { grid: { color: getComputedStyle(document.documentElement).getPropertyValue('--glass-border').trim() }, ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--fg-muted').trim(), font: { size: 12 } } }
            }
        }
    });

    const updateChartTheme = () => {
        const style = getComputedStyle(document.documentElement);
        chart.data.datasets[0].borderColor = style.getPropertyValue('--terminal-gold').trim();
        chart.data.datasets[1].borderColor = style.getPropertyValue('--terminal-green').trim();
        chart.options.plugins.legend.labels.color = style.getPropertyValue('--fg-muted').trim();
        chart.options.scales.y.grid.color = style.getPropertyValue('--glass-border').trim();
        chart.options.scales.y.ticks.color = style.getPropertyValue('--fg-muted').trim();
        chart.update('none');
    };
    window.addEventListener('econos:theme', updateChartTheme);

    const MAX_POINTS = 100;
    const statusEl = () => document.getElementById('macro-status');
    const giniEl = () => document.getElementById('macro-gini');
    const moneyEl = () => document.getElementById('macro-money');
    const treasEl = () => document.getElementById('macro-treasury');
    const taxEl = () => document.getElementById('macro-tax');

    /** @param {HTMLElement|null} el
     * @param {string} text */
    const setValue = (el, text) => {
        if (!el) return;
        el.textContent = text;
    };

    let lastStep = -1;
    const unsub = kc.subscribe((/** @type {KernelState} */ s, /** @type {boolean} */ connected) => {
        if (document.getElementById('mainChart') !== canvas) {
            unsub();
            window.removeEventListener('econos:theme', updateChartTheme);
            chart.destroy();
            return;
        }
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

        setValue(giniEl(), s.metrics.gini.toFixed(3));
        setValue(moneyEl(), '$' + fmtMoney(s.metrics.total_money));
        setValue(treasEl(), fmtMoney(s.metrics.treasury));
        setValue(taxEl(), (s.policy.tax_rate * 100).toFixed(1) + '%');
    });
}

function setupTooltips() {
    const tip = document.createElement('div');
    tip.id = 'tooltip';
    if (document.body) document.body.appendChild(tip);

    /** @type {HTMLElement | null} */
    let activeEl = null;
    const MARGIN = 8;
    /** @param {HTMLElement} el */
    const show = (el) => {
        const text = el.getAttribute('data-tip');
        if (!text) return;
        activeEl = el;
        tip.textContent = text;
        // Reset transform/visibility before measuring so width reflects the new text.
        tip.style.transform = 'none';
        tip.style.left = '0';
        tip.style.top = '0';
        const tipW = tip.offsetWidth;
        const tipH = tip.offsetHeight;
        const half = tipW / 2;

        const r = el.getBoundingClientRect();
        const placeBelow = r.top - tipH - 10 < MARGIN;
        const top = placeBelow ? r.bottom + 10 : r.top - 10;

        // Center horizontally on the target and clamp within viewport bounds.
        let left = r.left + r.width / 2;
        left = Math.max(half + MARGIN, Math.min(left, window.innerWidth - half - MARGIN));

        tip.style.left = `${left}px`;
        tip.style.top = `${top}px`;
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

const TOUR_STEPS = [
    {
        title: 'Welcome to EconOS',
        body: 'This is a live multi-agent economic simulation. Twelve RL agents (10 consumers, 2 producers) are trading right now. You\'re seeing the same simulation as every other visitor.',
        target: '#sys-link',
        focusWindow: null,
    },
    {
        title: 'Macro Monitor',
        body: 'Live wage and price chart. The Gini coefficient measures inequality (0 = equal, 1 = total concentration). System Liquidity is the total money in circulation, conserved unless taxed.',
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

    if (document.body) document.body.append(overlay, spotlight, callout);

    const titleEl = callout.querySelector('#tour-title');
    const bodyEl = callout.querySelector('#tour-body');
    const stepNumEl = callout.querySelector('#tour-step-num');
    const prevBtn = /** @type {HTMLButtonElement | null} */ (callout.querySelector('#tour-prev'));
    const nextBtn = /** @type {HTMLButtonElement | null} */ (callout.querySelector('#tour-next'));
    const skipBtn = /** @type {HTMLButtonElement | null} */ (callout.querySelector('#tour-skip'));
    if (!titleEl || !bodyEl || !stepNumEl || !prevBtn || !nextBtn || !skipBtn) return;

    let stepIdx = 0;

    /** @param {boolean} completed */
    const cleanup = (completed) => {
        overlay.remove(); spotlight.remove(); callout.remove();
        if (completed) { try { localStorage.setItem('econos.tourSeen', '1'); } catch (_) { } }
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
        spotlight.style.top = `${r.top - 6}px`;
        spotlight.style.left = `${r.left - 6}px`;
        spotlight.style.width = `${r.width + 12}px`;
        spotlight.style.height = `${r.height + 12}px`;

        const cw = 360, ch = callout.offsetHeight || 220;
        let top, left;
        // Prefer below the target; fall back to above; fall back to right.
        if (r.bottom + ch + 24 < window.innerHeight) {
            top = r.bottom + 16;
            left = r.left + r.width / 2 - cw / 2;
        } else if (r.top - ch - 24 > 0) {
            top = r.top - ch - 16;
            left = r.left + r.width / 2 - cw / 2;
        } else {
            top = r.top + r.height / 2 - ch / 2;
            left = r.right + 16;
        }
        left = Math.max(20, Math.min(left, window.innerWidth - cw - 20));
        top = Math.max(20, Math.min(top, window.innerHeight - ch - 20));
        callout.style.top = `${top}px`;
        callout.style.left = `${left}px`;
        callout.style.transform = 'none';
    };

    const renderStep = () => {
        const step = TOUR_STEPS[stepIdx];
        if (step.focusWindow) {
            const w = document.getElementById(step.focusWindow === 'process-explorer' ? 'processes' : step.focusWindow);
            if (w) _w.econWM.focusWindow(w);
            else if (_w.launchWindow) _w.launchWindow(step.focusWindow);
        }
        titleEl.textContent = step.title;
        bodyEl.textContent = step.body;
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

const THEME_KEY = 'econos.themePref';
/** @type {Object<string, string>} */
const THEME_ICONS = { dark: 'ph-moon', light: 'ph-sun', system: 'ph-desktop' };
/** @type {Object<string, string>} */
const THEME_TIPS = {
    dark: 'Theme: dark (click for light)',
    light: 'Theme: light (click for system)',
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
    window.dispatchEvent(new Event('econos:theme'));
}
/** @param {string} pref */
function setThemePref(pref) {
    try { localStorage.setItem(THEME_KEY, pref); } catch (_) { }
    applyTheme(pref);
    if (typeof _w.va === 'function') {
        _w.va('event', { name: 'theme_changed', data: { pref } });
    }
}
_w.cycleTheme = function () {
    setThemePref(THEME_CYCLE[getThemePref()]);
};

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

    if (_w.launchWindow) _w.launchWindow('macro-monitor');
    if (_w.launchWindow) _w.launchWindow('process-explorer');

    // taskbar status: clock + kernel step + connection state
    const sysTime = document.getElementById('sys-time');
    if (sysTime) {
        const updateTime = () => { sysTime.textContent = new Date().toLocaleTimeString(); };
        updateTime();
        setInterval(updateTime, 1000);
    }

    const taskMeta = document.getElementById('task-meta');
    if (!taskMeta) return;
    const stepBadge = document.createElement('span');
    stepBadge.id = 'sys-step';
    stepBadge.className = 'text-terminal-cyan';
    stepBadge.textContent = 'Step —';
    stepBadge.setAttribute('data-tip', 'Current simulation tick (advances every ~500ms while live)');
    taskMeta.insertBefore(stepBadge, taskMeta.firstChild);

    const linkBadge = document.createElement('span');
    linkBadge.id = 'sys-link';
    linkBadge.className = 'text-terminal-gold';
    linkBadge.textContent = 'Connecting';
    linkBadge.setAttribute('aria-live', 'polite');
    linkBadge.setAttribute('data-tip', 'WebSocket connection state: LIVE means kernel ticks are streaming');
    taskMeta.insertBefore(linkBadge, taskMeta.firstChild);

    if (_w.kernelClient) _w.kernelClient.subscribe((/** @type {KernelState} */ s, /** @type {boolean=} */ connected) => {
        const label = connected ? 'Live' : (s ? 'Reconnecting' : 'Connecting');
        linkBadge.textContent = label;
        linkBadge.className = connected ? 'text-terminal-green' : 'text-terminal-gold';
        if (s) stepBadge.textContent = `Step ${s.step}`;
    });
});
