import re
with open('dashboard/main.js', 'r') as f: text = f.read()

lines = text.split('\n')
for idx in [75, 77, 104, 105, 133, 134, 135, 157, 221, 228, 234, 274, 389, 390, 1059]:
    print(f"--- Line {idx} ---")
    for j in range(max(0, idx-2), min(len(lines), idx+1)):
        print(f"{j+1}: {lines[j]}")
    print()
