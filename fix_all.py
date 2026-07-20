import re
with open('dashboard/main.js', 'r') as f: text = f.read()
def sub(a,b):
    global text
    text = text.replace(a, b)

sub("win.style.zIndex = ++this.highestZ;", "win.style.zIndex = String(++this.highestZ);")

# Object is possibly undefined in this._pendingAcks.get(msg.id)
sub("const p = this._pendingAcks.get(msg.id);", "const p = this._pendingAcks.get(msg.id);\n            if (!p) return;")
sub("if (p) {", "if (true) {")

# Object is possibly null in:
# document.body.style.cursor = 'move';
sub("document.body.style.cursor = 'move';", "if(document.body) document.body.style.cursor = 'move';")
sub("document.body.style.cursor = 'default';", "if(document.body) document.body.style.cursor = 'default';")
sub("document.body.appendChild(tip);", "if(document.body) document.body.appendChild(tip);")
sub("document.body.append(overlay, spotlight, callout);", "if(document.body) document.body.append(overlay, spotlight, callout);")

sub("typeof window.va", "typeof _w.va")
sub("window.va(", "_w.va(")
sub("window.launchWindow", "_w.launchWindow")

sub("kc.subscribe((s, connected) => {", "kc.subscribe((/** @type {any} */ s, /** @type {boolean=} */ connected) => {")

sub("const chart = new Chart(ctx, {", "const chart = new _w.Chart(ctx, {")
sub("const ctx = canvas.getContext('2d');", "const ctx = /** @type {HTMLCanvasElement} */ (canvas).getContext('2d');")
sub("const bootLog = document.getElementById('boot-log');", "const bootLog = document.getElementById('boot-log'); if(!bootLog) return;")

# Fix launchWindow not being defined
sub("launchWindow('process-explorer')", "if(_w.launchWindow) _w.launchWindow('process-explorer')")
sub("launchWindow('macro-monitor')", "if(_w.launchWindow) _w.launchWindow('macro-monitor')")
sub("launchWindow('about')", "if(_w.launchWindow) _w.launchWindow('about')")
sub("launchWindow(step.focusWindow)", "if(_w.launchWindow) _w.launchWindow(step.focusWindow)")

with open('dashboard/main.js', 'w') as f: f.write(text)
