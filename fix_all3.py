import re
with open('dashboard/main.js', 'r') as f: text = f.read()

def sub(a,b):
    global text
    text = text.replace(a, b)

sub("const header = win.querySelector('.window-header');\n        header.addEventListener", "const header = win.querySelector('.window-header');\n        if(header) header.addEventListener")
sub("this.desktop.appendChild(win);", "if(this.desktop) this.desktop.appendChild(win);")

sub("if (this.isDragging && this.dragWin) {\n            this.dragWin.style.left", "const dragWin = this.dragWin; if (this.isDragging && dragWin) {\n            dragWin.style.left")
sub("this.dragWin.style.top =", "dragWin.style.top =")

sub("/** @type {Set<function(any, boolean=): void>} */", "/** @type {Set<Function>} */")
sub("/** @type {Set<function(any): void>} */", "/** @type {Set<Function>} */")
sub("/** @type {Set<function(boolean): void>} */", "/** @type {Set<Function>} */")

sub("this.ws.onerror", "if(this.ws) this.ws.onerror")

sub("/** @param {function(any, boolean=): void} cb */", "/** @param {Function} cb */")
sub("/** @param {function(any): void} cb */", "/** @param {Function} cb */")
sub("/** @param {function(boolean): void} cb */", "/** @param {Function} cb */")

sub("_w.launchWindow = function(type) {", "_w.launchWindow = function(/** @type {string} */ type) {")

sub("document.getElementById('pm-wage-shocks').innerHTML", "const wSh = document.getElementById('pm-wage-shocks'); if(wSh) wSh.innerHTML")
sub("document.getElementById('pm-price-shocks').innerHTML", "const pSh = document.getElementById('pm-price-shocks'); if(pSh) pSh.innerHTML")

sub("_w.kernelClient.subscribe((s, connected) => {", "_w.kernelClient.subscribe((/** @type {any} */ s, /** @type {boolean=} */ connected) => {")

with open('dashboard/main.js', 'w') as f: f.write(text)
