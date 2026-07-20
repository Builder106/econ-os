import re
with open('dashboard/main.js', 'r') as f: text = f.read()

def sub(a,b):
    global text
    text = text.replace(a, b)

sub("this.desktop = document.getElementById('desktop');", "this.desktop = document.getElementById('desktop');\n        this.offsetX = 0;\n        this.offsetY = 0;")
sub("if(this.ws) this.ws.onerror = () => { try { this.ws.close(); } catch (_) {} };", "if(this.ws) this.ws.onerror = () => { try { if(this.ws) this.ws.close(); } catch (_) {} };")

with open('dashboard/main.js', 'w') as f: f.write(text)
