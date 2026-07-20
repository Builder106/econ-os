import re

with open('dashboard/main.js', 'r') as f:
    text = f.read()

def sub(old, new):
    global text
    if old not in text: print("NOT FOUND:", old)
    text = text.replace(old, new)

# 1. Globals and types
text = text.replace('// @ts-check', '''// @ts-check
/** @type {any} */
const _window = window;
''')

# Replace window. with _window. for custom properties
text = re.sub(r'window\.ECONOS_KERNEL_WS_URL', r'_window.ECONOS_KERNEL_WS_URL', text)
text = re.sub(r'typeof window\.va === \'function\'', r'typeof _window.va === \'function\'', text)
text = re.sub(r'window\.va\(', r'_window.va(', text)
text = re.sub(r'window\.launchWindow', r'_window.launchWindow', text)
text = re.sub(r'window\.econWM', r'_window.econWM', text)
text = re.sub(r'window\.kernelClient', r'_window.kernelClient', text)
text = re.sub(r'window\.startTour', r'_window.startTour', text)
text = re.sub(r'window\.cycleTheme', r'_window.cycleTheme', text)

# `new Chart` needs Chart to be typed
sub("new Chart(", "new _window.Chart(")


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

sub("kc.subscribe((s, connected) => {", "kc.subscribe((/** @type {any} */ s, /** @type {boolean} */ connected) => {")
sub("kc.subscribe((s) => {", "kc.subscribe((/** @type {any} */ s) => {")
sub("kc.onEvent((evt) => {", "kc.onEvent((/** @type {any} */ evt) => {")
sub("kc.onAdminChange((isAdmin) => {", "kc.onAdminChange((/** @type {boolean} */ isAdmin) => {")
sub(".map((a) => {", ".map((/** @type {any} */ a) => {")

sub("""const header = win.querySelector('.window-header');
        header.addEventListener('mousedown', (e) => this.startDragging(e, win));""", """const header = win.querySelector('.window-header');
        if (header) header.addEventListener('mousedown', (/** @type {any} */ e) => this.startDragging(e, win));""")

sub("""const win = e.target.closest('.window');
            if (win) this.focusWindow(win);""", """const target = /** @type {HTMLElement} */ (e.target);
            const win = target ? /** @type {HTMLElement} */ (target.closest('.window')) : null;
            if (win) this.focusWindow(win);""")

sub("e.target.closest('[data-tip]')", "/** @type {HTMLElement} */ (e.target).closest('[data-tip]')")

sub("""document.querySelectorAll('#policy-manager [data-shock]').forEach((btn) => {""", """document.querySelectorAll('#policy-manager [data-shock]').forEach((/** @type {any} */ btn) => {""")
sub("""document.querySelectorAll('#policy-manager [data-cmd]').forEach((btn) => {""", """document.querySelectorAll('#policy-manager [data-cmd]').forEach((/** @type {any} */ btn) => {""")
sub("""document.querySelectorAll('#policy-manager .pm-admin').forEach((b) => {""", """document.querySelectorAll('#policy-manager .pm-admin').forEach((/** @type {any} */ b) => {""")

sub("""const slider = document.getElementById('pm-tax-slider');
        const taxLabel = document.getElementById('pm-tax');
        const authLabel = document.getElementById('pm-auth');

        let userIsDragging = false;
        slider.addEventListener""", """const slider = /** @type {HTMLInputElement | null} */ (document.getElementById('pm-tax-slider'));
        const taxLabel = document.getElementById('pm-tax');
        const authLabel = document.getElementById('pm-auth');
        if (!slider || !taxLabel || !authLabel) return;

        let userIsDragging = false;
        slider.addEventListener""")

sub("""const out = document.getElementById('shell-output');
        const input = document.getElementById('shell-input');

        const append""", """const out = document.getElementById('shell-output');
        const input = /** @type {HTMLInputElement | null} */ (document.getElementById('shell-input'));
        if (!out || !input) return;

        const append""")

sub("""const history = [];""", """/** @type {string[]} */\n        const history = [];""")

sub("""const titleEl   = callout.querySelector('#tour-title');
    const bodyEl    = callout.querySelector('#tour-body');
    const stepNumEl = callout.querySelector('#tour-step-num');
    const prevBtn   = callout.querySelector('#tour-prev');
    const nextBtn   = callout.querySelector('#tour-next');
    const skipBtn   = callout.querySelector('#tour-skip');

    let stepIdx = 0;""", """const titleEl   = callout.querySelector('#tour-title');
    const bodyEl    = callout.querySelector('#tour-body');
    const stepNumEl = callout.querySelector('#tour-step-num');
    const prevBtn   = /** @type {HTMLButtonElement | null} */ (callout.querySelector('#tour-prev'));
    const nextBtn   = /** @type {HTMLButtonElement | null} */ (callout.querySelector('#tour-next'));
    const skipBtn   = /** @type {HTMLButtonElement | null} */ (callout.querySelector('#tour-skip'));

    if (!titleEl || !bodyEl || !stepNumEl || !prevBtn || !nextBtn || !skipBtn) return;

    let stepIdx = 0;""")

sub("""stepNumEl.textContent = stepIdx + 1;""", """stepNumEl.textContent = String(stepIdx + 1);""")

sub("err.message", "(/** @type {any} */ (err)).message")
sub("new Error(msg.error", "new Error(/** @type {any} */ (msg).error")
sub("msg.auth && msg.auth.is_admin", "/** @type {any} */ (msg).auth && /** @type {any} */ (msg).auth.is_admin")

sub("document.getElementById('pm-step').textContent", "const pmS = document.getElementById('pm-step'); if(pmS) pmS.textContent")
sub("document.getElementById('pm-uptime').textContent", "const pmU = document.getElementById('pm-uptime'); if(pmU) pmU.textContent")
sub("document.getElementById('pm-policies').innerHTML", "const pmP = document.getElementById('pm-policies'); if(pmP) pmP.innerHTML")

sub("document.getElementById('about-step').textContent = s.step.toLocaleString();", "const as = document.getElementById('about-step'); if(as) as.textContent = s.step.toLocaleString();")
sub("document.getElementById('about-uptime').textContent = formatUptime(s.uptime_s);", "const au = document.getElementById('about-uptime'); if(au) au.textContent = formatUptime(s.uptime_s);")
sub("document.getElementById('about-viewers').textContent = '1+';", "const av = document.getElementById('about-viewers'); if(av) av.textContent = '1+';")

sub("""const sysTime = document.getElementById('sys-time');
    setInterval(() => { sysTime.innerText = new Date().toLocaleTimeString(); }, 1000);""", """const sysTime = document.getElementById('sys-time');
    if (sysTime) setInterval(() => { sysTime.innerText = new Date().toLocaleTimeString(); }, 1000);""")

sub("const taskMeta = document.getElementById('sys-time').parentElement;", """const taskMeta = sysTime ? sysTime.parentElement : null;
    if (!taskMeta) return;""")

sub("""const w = document.getElementById(step.focusWindow === 'process-explorer' ? 'processes' : step.focusWindow);
            if (w) _window.econWM.focusWindow(w);
            else _window.launchWindow(step.focusWindow);""", """const w = document.getElementById(step.focusWindow === 'process-explorer' ? 'processes' : step.focusWindow);
            if (w && _window.econWM) _window.econWM.focusWindow(w);
            else if (_window.launchWindow) _window.launchWindow(step.focusWindow);""")

sub("const wm = _window.econWM;\n    const kc = _window.kernelClient;", "const wm = _window.econWM;\n    const kc = _window.kernelClient;\n    if (!wm || !kc) return;")
sub("const wm = _window.econWM;\n\n    setupTooltips();", "const wm = _window.econWM;\n    if (!wm) return;\n\n    setupTooltips();")
sub("const wm = _window.econWM;\n    if (!wm) return;\n\n    setupTooltips();\n\n    // Make the toggle", "const wm = _window.econWM;\n    if (!wm) return;\n\n    setupTooltips();\n\n    // Make the toggle")

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
