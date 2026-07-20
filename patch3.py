import re

with open('dashboard/main.js', 'r') as f:
    text = f.read()

def sub(old, new):
    global text
    if old not in text: print("NOT FOUND:", repr(old))
    text = text.replace(old, new)

# 1. Globals and types
text = text.replace('// @ts-check', '''// @ts-check
const _w = /** @type {any} */ (window);
''')

# Replace window. with _w. for custom properties
text = re.sub(r'window\.ECONOS_KERNEL_WS_URL', r'_w.ECONOS_KERNEL_WS_URL', text)
text = re.sub(r'window\.va', r'_w.va', text)
text = re.sub(r'window\.launchWindow', r'_w.launchWindow', text)
text = re.sub(r'window\.econWM', r'_w.econWM', text)
text = re.sub(r'window\.kernelClient', r'_w.kernelClient', text)
text = re.sub(r'window\.startTour', r'_w.startTour', text)
text = re.sub(r'window\.cycleTheme', r'_w.cycleTheme', text)
sub('typeof window.va', 'typeof _w.va')
sub('typeof _w.va', 'typeof _w.va') # in case I missed it

# `new Chart` needs Chart to be typed
sub("new Chart(", "new _w.Chart(")

sub('createWindow(id, title, x, y, w, h, contentHTML) {', '/**\n     * @param {string} id\n     * @param {string} title\n     * @param {number} x\n     * @param {number} y\n     * @param {number} w\n     * @param {number} h\n     * @param {string} contentHTML\n     */\n    createWindow(id, title, x, y, w, h, contentHTML) {')
sub('focusWindow(win) {', '/** @param {HTMLElement} win */\n    focusWindow(win) {')
sub('startDragging(e, win) {', '/** @param {MouseEvent} e\n     * @param {HTMLElement} win */\n    startDragging(e, win) {')
sub('handleMouseMove(e) {', '/** @param {MouseEvent} e */\n    handleMouseMove(e) {')
sub('_onMessage(e) {', '/** @param {MessageEvent} e */\n    _onMessage(e) {')
sub('sendCommand(line) {', '/** @param {string} line\n     * @returns {Promise<any>} */\n    sendCommand(line) {')
sub('_failPendingAcks(err) {', '/** @param {Error} err */\n    _failPendingAcks(err) {')
sub('subscribe(cb) {', '/** @param {function(any, boolean=): void} cb */\n    subscribe(cb) {')
sub('onEvent(cb) {', '/** @param {function(any): void} cb */\n    onEvent(cb) {')
sub('onAdminChange(cb) {', '/** @param {function(boolean): void} cb */\n    onAdminChange(cb) {')

sub('const fmtMoney = (n) => {', '/** @param {number} n */\nconst fmtMoney = (n) => {')
sub('const procIdFor = (agentId) => {', '/** @param {string} agentId */\nconst procIdFor = (agentId) => {')
sub('const procNameFor = (agentId) =>', '/** @param {string} agentId */\nconst procNameFor = (agentId) =>')
sub('function initMacroChart(kc) {', '/** @param {KernelClient} kc */\nfunction initMacroChart(kc) {')

sub("const mkBtn = (target, pct) => {", "/** @param {string} target\n         * @param {number} pct */\n        const mkBtn = (target, pct) => {")
sub("const append = (text, cls = 'text-white/60') => {", "/** @param {string} text\n         * @param {string} [cls] */\n        const append = (text, cls = 'text-white/60') => {")

sub("const setFlashing = (el, text) => {", "/** @param {HTMLElement|null} el\n     * @param {string} text */\n    const setFlashing = (el, text) => {")
sub("const show = (el) => {", "/** @param {HTMLElement} el */\n    const show = (el) => {")
sub("const cleanup = (completed) => {", "/** @param {boolean} completed */\n    const cleanup = (completed) => {")
sub("const positionAround = (target) => {", "/** @param {HTMLElement|null} target */\n    const positionAround = (target) => {")
sub("const formatUptime = (s) => {", "/** @param {number} s */\n        const formatUptime = (s) => {")
sub("function resolveTheme(pref) {", "/** @param {string} pref */\nfunction resolveTheme(pref) {")
sub("function applyTheme(pref) {", "/** @param {string} pref */\nfunction applyTheme(pref) {")
sub("function setThemePref(pref) {", "/** @param {string} pref */\nfunction setThemePref(pref) {")

sub("this.windows = [];", "/** @type {HTMLElement[]} */ this.windows = [];")
sub("this.activeWindow = null;", "/** @type {HTMLElement | null} */ this.activeWindow = null;")
sub("this.desktop = document.getElementById('desktop');", "/** @type {HTMLElement | null} */ this.desktop = document.getElementById('desktop');")
sub("this.tickListeners = new Set();", "/** @type {Set<function(any, boolean=): void>} */ this.tickListeners = new Set();")
sub("this.eventListeners = new Set();", "/** @type {Set<function(any): void>} */ this.eventListeners = new Set();")
sub("this.adminListeners = new Set();", "/** @type {Set<function(boolean): void>} */ this.adminListeners = new Set();")
sub("this.state = null;", "/** @type {any} */ this.state = null;")
sub("this._pendingAcks = new Map();", "/** @type {Map<string, {resolve: function, reject: function, timer: any}>} */ this._pendingAcks = new Map();")

sub("let activeEl = null;", "/** @type {HTMLElement | null} */\n    let activeEl = null;")
sub("const history = [];", "/** @type {string[]} */\n        const history = [];")

sub("kc.subscribe((s, connected) => {", "kc.subscribe((/** @type {any} */ s, /** @type {boolean} */ connected) => {")
sub("kc.subscribe((s) => {", "kc.subscribe((/** @type {any} */ s) => {")
sub("kc.onEvent((evt) => {", "kc.onEvent((/** @type {any} */ evt) => {")
sub("kc.onAdminChange((isAdmin) => {", "kc.onAdminChange((/** @type {boolean} */ isAdmin) => {")
sub(".map((a) => {", ".map((/** @type {any} */ a) => {")
sub("document.addEventListener('mousedown', (e) => {", "document.addEventListener('mousedown', (/** @type {MouseEvent} */ e) => {")
sub("header.addEventListener('mousedown', (e) => this.startDragging(e, win));", "header.addEventListener('mousedown', (/** @type {any} */ e) => this.startDragging(e, win));")

sub("document.addEventListener('mouseover', (e) => {", "document.addEventListener('mouseover', (/** @type {MouseEvent} */ e) => {")
sub("document.addEventListener('mouseout', (e) => {", "document.addEventListener('mouseout', (/** @type {MouseEvent} */ e) => {")
sub("document.addEventListener('mousedown', hide);", "document.addEventListener('mousedown', hide);")


sub("""const win = e.target.closest('.window');""", """const target = /** @type {HTMLElement} */ (e.target);
            const win = target ? /** @type {HTMLElement} */ (target.closest('.window')) : null;""")

sub("""const el = e.target.closest('[data-tip]');""", """const target = /** @type {HTMLElement} */ (e.target);
        const el = target ? /** @type {HTMLElement} */ (target.closest('[data-tip]')) : null;""")

sub("""document.querySelectorAll('#policy-manager [data-shock]').forEach((btn) => {""", """document.querySelectorAll('#policy-manager [data-shock]').forEach((/** @type {any} */ btn) => {""")
sub("""document.querySelectorAll('#policy-manager [data-cmd]').forEach((btn) => {""", """document.querySelectorAll('#policy-manager [data-cmd]').forEach((/** @type {any} */ btn) => {""")
sub("""document.querySelectorAll('#policy-manager .pm-admin').forEach((b) => {""", """document.querySelectorAll('#policy-manager .pm-admin').forEach((/** @type {any} */ b) => {""")


sub("""const slider = document.getElementById('pm-tax-slider');
        const taxLabel = document.getElementById('pm-tax');
        const authLabel = document.getElementById('pm-auth');""", """const slider = /** @type {HTMLInputElement | null} */ (document.getElementById('pm-tax-slider'));
        const taxLabel = document.getElementById('pm-tax');
        const authLabel = document.getElementById('pm-auth');
        if (!slider || !taxLabel || !authLabel) return;""")


sub("""const out = document.getElementById('shell-output');
        const input = document.getElementById('shell-input');""", """const out = document.getElementById('shell-output');
        const input = /** @type {HTMLInputElement | null} */ (document.getElementById('shell-input'));
        if (!out || !input) return;""")


sub("""const titleEl   = callout.querySelector('#tour-title');
    const bodyEl    = callout.querySelector('#tour-body');
    const stepNumEl = callout.querySelector('#tour-step-num');
    const prevBtn   = callout.querySelector('#tour-prev');
    const nextBtn   = callout.querySelector('#tour-next');
    const skipBtn   = callout.querySelector('#tour-skip');""", """const titleEl   = callout.querySelector('#tour-title');
    const bodyEl    = callout.querySelector('#tour-body');
    const stepNumEl = callout.querySelector('#tour-step-num');
    const prevBtn   = /** @type {HTMLButtonElement | null} */ (callout.querySelector('#tour-prev'));
    const nextBtn   = /** @type {HTMLButtonElement | null} */ (callout.querySelector('#tour-next'));
    const skipBtn   = /** @type {HTMLButtonElement | null} */ (callout.querySelector('#tour-skip'));
    if (!titleEl || !bodyEl || !stepNumEl || !prevBtn || !nextBtn || !skipBtn) return;""")

sub("stepNumEl.textContent = stepIdx + 1;", "stepNumEl.textContent = String(stepIdx + 1);")

sub("err.message", "(/** @type {any} */ (err)).message")
sub("new Error(msg.error", "new Error(/** @type {any} */ (msg).error")
sub("msg.auth && msg.auth.is_admin", "/** @type {any} */ (msg).auth && /** @type {any} */ (msg).auth.is_admin")

sub("document.getElementById('pm-step').textContent", "const pmStep = document.getElementById('pm-step'); if(pmStep) pmStep.textContent")
sub("document.getElementById('pm-uptime').textContent", "const pmUptime = document.getElementById('pm-uptime'); if(pmUptime) pmUptime.textContent")
sub("document.getElementById('pm-policies').innerHTML", "const pmPol = document.getElementById('pm-policies'); if(pmPol) pmPol.innerHTML")

sub("document.getElementById('about-step').textContent = s.step.toLocaleString();", "const as = document.getElementById('about-step'); if(as) as.textContent = s.step.toLocaleString();")
sub("document.getElementById('about-uptime').textContent = formatUptime(s.uptime_s);", "const au = document.getElementById('about-uptime'); if(au) au.textContent = formatUptime(s.uptime_s);")
sub("document.getElementById('about-viewers').textContent = '1+';", "const av = document.getElementById('about-viewers'); if(av) av.textContent = '1+';")

sub("""const sysTime = document.getElementById('sys-time');
    setInterval(() => { sysTime.innerText = new Date().toLocaleTimeString(); }, 1000);""", """const sysTime = document.getElementById('sys-time');
    if (sysTime) setInterval(() => { sysTime.innerText = new Date().toLocaleTimeString(); }, 1000);""")

sub("const taskMeta = document.getElementById('sys-time').parentElement;", """const taskMeta = sysTime ? sysTime.parentElement : null;
    if (!taskMeta) return;""")

sub("""const w = document.getElementById(step.focusWindow === 'process-explorer' ? 'processes' : step.focusWindow);
            if (w) _w.econWM.focusWindow(w);
            else _w.launchWindow(step.focusWindow);""", """const w = document.getElementById(step.focusWindow === 'process-explorer' ? 'processes' : step.focusWindow);
            if (w && _w.econWM) _w.econWM.focusWindow(w);
            else if (_w.launchWindow) _w.launchWindow(step.focusWindow);""")

sub("const wm = _w.econWM;\n    const kc = _w.kernelClient;", "const wm = _w.econWM;\n    const kc = _w.kernelClient;\n    if (!wm || !kc) return;")
sub("const wm = _w.econWM;\n\n    setupTooltips();", "const wm = _w.econWM;\n    if (!wm) return;\n\n    setupTooltips();")
sub("const wm = _w.econWM;\n    if (!wm) return;\n\n    setupTooltips();\n\n    // Make the toggle", "const wm = _w.econWM;\n    if (!wm) return;\n\n    setupTooltips();\n\n    // Make the toggle")

sub("const rowsEl = document.getElementById('proc-rows');\n        const unsub = kc.subscribe((/** @type {any} */ s, /** @type {boolean} */ connected) => {", "const rowsEl = document.getElementById('proc-rows');\n        if (!rowsEl) return;\n        const unsub = kc.subscribe((/** @type {any} */ s, /** @type {boolean} */ connected) => {")

sub("const THEME_CYCLE = { dark: 'light', light: 'system', system: 'dark' };", "/** @type {Object<string, string>} */\nconst THEME_CYCLE = { dark: 'light', light: 'system', system: 'dark' };")
sub("const THEME_ICONS = { dark: 'ph-moon', light: 'ph-sun', system: 'ph-desktop' };", "/** @type {Object<string, string>} */\nconst THEME_ICONS = { dark: 'ph-moon', light: 'ph-sun', system: 'ph-desktop' };")
sub("""const THEME_TIPS  = {
    dark:   'Theme: dark (click for light)',
    light:  'Theme: light (click for system)',
    system: 'Theme: system (click for dark)',
};""", """/** @type {Object<string, string>} */\nconst THEME_TIPS  = {
    dark:   'Theme: dark (click for light)',
    light:  'Theme: light (click for system)',
    system: 'Theme: system (click for dark)',
};""")

with open('dashboard/main.js', 'w') as f:
    f.write(text)
