import re

with open('dashboard/main.js', 'r') as f:
    content = f.read()

# Add JSDoc types for Window
content = content.replace('// @ts-check', '''// @ts-check

/**
 * @typedef {Object} Window
 * @property {WindowManager} econWM
 * @property {KernelClient} kernelClient
 * @property {function} launchWindow
 * @property {function} startTour
 * @property {function} cycleTheme
 * @property {function} va
 * @property {string} ECONOS_KERNEL_WS_URL
 */
''')

# Fix TS18047, TS2339 (disabled), etc.
content = content.replace("document.querySelectorAll('#policy-manager .pm-admin').forEach((b) => {", "document.querySelectorAll('#policy-manager .pm-admin').forEach((/** @type {any} */ b) => {")

# out and input null checks
content = content.replace('''        const out = document.getElementById('shell-output');
        const input = document.getElementById('shell-input');''', '''        const out = document.getElementById('shell-output');
        const input = /** @type {HTMLInputElement} */ (document.getElementById('shell-input'));
        if (!out || !input) return;''')

content = content.replace("const append = (text, cls = 'text-white/60') => {", "const append = (/** @type {string} */ text, cls = 'text-white/60') => {")

content = content.replace("const history = [];", "/** @type {string[]} */\n        const history = [];")

content = content.replace("kc.onEvent((evt) => {", "kc.onEvent((/** @type {any} */ evt) => {")
content = content.replace("kc.subscribe((s) => {", "kc.subscribe((/** @type {any} */ s) => {")
content = content.replace("kc.subscribe((s, connected) => {", "kc.subscribe((/** @type {any} */ s, /** @type {boolean} */ connected) => {")
content = content.replace("const unsub = kc.subscribe((s, connected) => {", "const unsub = kc.subscribe((/** @type {any} */ s, /** @type {boolean} */ connected) => {")
content = content.replace("function initMacroChart(kc) {", "function initMacroChart(/** @type {any} */ kc) {")

content = content.replace("const chart = new Chart(ctx, {", "const chart = new /** @type {any} */ (window).Chart(ctx, {")

content = content.replace("const setFlashing = (el, text) => {", "const setFlashing = (/** @type {HTMLElement | null} */ el, /** @type {string} */ text) => {")
content = content.replace("const show = (el) => {", "const show = (/** @type {HTMLElement} */ el) => {")

content = content.replace("let activeEl = null;", "/** @type {HTMLElement | null} */\n    let activeEl = null;")
content = content.replace("e.target.closest", "/** @type {HTMLElement} */ (e.target).closest")

content = content.replace("cleanup(true)", "cleanup(true)")
content = content.replace("const cleanup = (completed) => {", "const cleanup = (/** @type {boolean} */ completed) => {")
content = content.replace("const positionAround = (target) => {", "const positionAround = (/** @type {HTMLElement | null} */ target) => {")

content = content.replace("const titleEl   = callout.querySelector('#tour-title');", '''const titleEl   = callout.querySelector('#tour-title');
    const bodyEl    = callout.querySelector('#tour-body');
    const stepNumEl = callout.querySelector('#tour-step-num');
    const prevBtn   = /** @type {HTMLButtonElement} */ (callout.querySelector('#tour-prev'));
    const nextBtn   = /** @type {HTMLButtonElement} */ (callout.querySelector('#tour-next'));
    const skipBtn   = /** @type {HTMLButtonElement} */ (callout.querySelector('#tour-skip'));
    if (!titleEl || !bodyEl || !stepNumEl || !prevBtn || !nextBtn || !skipBtn) return;''')

content = re.sub(r"const bodyEl.*?skipBtn\);", "", content, flags=re.DOTALL) # Need to be careful here

with open('dashboard/main.js', 'w') as f:
    f.write(content)
