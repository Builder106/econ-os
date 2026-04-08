/**
 * EconOS Window Manager & Kernel Shell
 * AESTHETIC_DNA: Glassmorphic Desktop OS
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

// Launch Window Helper
window.launchWindow = function(type) {
    const wm = window.econWM;
    if (type === 'process-explorer') {
        wm.createWindow('processes', 'Process Telemetry Hub', 150, 150, 500, 350, 
            `<div class="space-y-4 font-mono text-[9px]">
                <div class="flex justify-between text-white/20 uppercase pb-1 border-b border-white/5">
                    <span>Process ID</span><span>Node_Telemetry</span><span>Resource</span><span>Health</span>
                </div>
                <div class="space-y-3">
                    <div class="flex items-center justify-between">
                        <span class="text-terminal-cyan">001</span>
                        <div class="flex flex-col">
                            <span>KERNEL_CORE_INIT</span>
                            <div class="sparkline-container bg-white/5 h-2 w-32 mt-1 relative overflow-hidden">
                                <div class="absolute inset-0 bg-terminal-cyan/20 animate-pulse"></div>
                            </div>
                        </div>
                        <span class="text-white/40">1.2GB</span>
                        <div class="status-pulse"></div>
                    </div>
                    <div class="flex items-center justify-between">
                        <span class="text-terminal-cyan">A-42</span>
                        <div class="flex flex-col">
                            <span>CONSUMER_POLICY_NET</span>
                            <div class="sparkline-container bg-white/5 h-2 w-32 mt-1 relative overflow-hidden">
                                <div class="absolute inset-0 bg-terminal-green/20 w-3/4"></div>
                            </div>
                        </div>
                        <span class="text-white/40">4.5GB</span>
                        <div class="status-pulse" style="background: var(--terminal-cyan); box-shadow: 0 0 8px var(--terminal-cyan);"></div>
                    </div>
                    <div class="flex items-center justify-between border-t border-white/5 pt-3">
                        <span class="text-terminal-cyan">P-112</span>
                        <div class="flex flex-col">
                            <span>PRODUCER_RL_OPTIMIZER</span>
                            <div class="sparkline-container bg-white/5 h-2 w-32 mt-1 relative overflow-hidden">
                                <div class="absolute inset-0 bg-terminal-gold/20 w-1/2"></div>
                            </div>
                        </div>
                        <span class="text-white/40">12.1GB</span>
                        <div class="status-pulse" style="background: var(--terminal-gold); box-shadow: 0 0 8px var(--terminal-gold);"></div>
                    </div>
                </div>
            </div>`);
    } else if (type === 'macro-monitor') {
        wm.createWindow('macro-monitor', 'Market Analytics Suite', 200, 100, 600, 450, 
            `<div class="grid grid-cols-2 gap-4 h-full font-mono text-[9px]">
                <div class="col-span-2 border-b border-white/10 pb-2">
                    <div class="flex justify-between items-center mb-1">
                        <span class="text-white/40 uppercase">Global Asset Equilibrium (Price vs Wage)</span>
                        <span class="text-terminal-green">LIVE Telemetry</span>
                    </div>
                    <div class="h-32 w-full"><canvas id="mainChart"></canvas></div>
                </div>
                <div class="space-y-2 border-r border-white/5 pr-2">
                    <span class="text-white/20 uppercase">Structural Inequality (Gini)</span>
                    <div class="flex items-end gap-1 h-12">
                        <div class="bg-terminal-cyan/80 w-2 h-3/4"></div>
                        <div class="bg-terminal-cyan/80 w-2 h-1/2"></div>
                        <div class="bg-terminal-cyan/80 w-2 h-4/5"></div>
                        <div class="bg-terminal-cyan/80 w-2 h-1/4"></div>
                        <div class="bg-terminal-cyan/80 w-2 h-2/3"></div>
                    </div>
                    <div class="flex justify-between text-terminal-cyan font-bold">
                        <span>GA-22</span> <span>0.341</span>
                    </div>
                </div>
                <div class="space-y-2 pl-2">
                    <span class="text-white/20 uppercase">System Liquidity</span>
                    <div class="text-2xl font-bold text-white tracking-tighter">$142.1M</div>
                    <div class="flex gap-2">
                        <span class="text-terminal-green">▲ 2.4%</span>
                        <span class="text-white/20">W-AVG_VOL</span>
                    </div>
                </div>
            </div>`);
        initSimulation();
    } else if (type === 'policy-manager') {
        wm.createWindow('policy-manager', 'Monetary Command Center', 250, 250, 320, 250, 
            `<div class="space-y-6 font-mono text-[10px]">
                <div class="space-y-2">
                    <div class="flex justify-between items-center uppercase">
                        <span class="text-white/40">Income Tax Rate</span> 
                        <span class="text-terminal-cyan text-sm">15.00%</span>
                    </div>
                    <input type="range" min="0" max="50" value="15" class="w-full accent-terminal-cyan appearance-none h-1 bg-white/10 rounded">
                    <div class="flex justify-between text-[8px] text-white/20">
                        <span>L-BOUND: 0.0</span> <span>U-BOUND: 50.0</span>
                    </div>
                </div>
                <div class="space-y-2 border-t border-white/5 pt-4">
                    <div class="flex justify-between items-center uppercase">
                        <span class="text-white/40">Target Interest</span> 
                        <span class="text-terminal-gold text-sm">2.45%</span>
                    </div>
                    <input type="range" min="0" max="100" value="25" class="w-full accent-terminal-gold appearance-none h-1 bg-white/10 rounded">
                    <div class="flex justify-between text-[8px] text-white/20">
                        <span>YIELD: 1.25</span> <span>FED_LIMIT: 5.00</span>
                    </div>
                </div>
                <button class="w-full py-2 bg-terminal-cyan/10 border border-terminal-cyan/30 text-terminal-cyan uppercase font-bold text-[9px] hover:bg-terminal-cyan/20 transition-all">
                    Commit Policy Overrides
                </button>
            </div>`);
    } else if (type === 'econ-shell') {
        wm.createWindow('econ-shell', 'EconOS Institutional Terminal', 720, 50, 450, 300, 
            `<div class="flex flex-col h-full font-mono text-[9px]">
                <div id="shell-output" class="flex-1 text-white/50 overflow-auto mb-2 space-y-1">
                    <div class="text-terminal-cyan">>>> [SYSTEM_AUTH] Admin Session Started</div>
                    <div>$ initializing node_modules... [DONE]</div>
                    <div>$ connecting to market_shard_01... [DONE]</div>
                    <div class="text-terminal-gold">$ WARNING: Inequality (Gini) exceeding threshold (0.42)</div>
                    <div class="animate-pulse">_</div>
                </div>
                <div class="flex items-center gap-2 border-t border-white/5 pt-2">
                    <span class="text-terminal-cyan font-bold">root@econos:~$</span>
                    <input id="shell-input" class="flex-1 bg-transparent border-none outline-none text-white font-mono" placeholder="await input...">
                </div>
            </div>`);
    } else if (type === 'system-menu') {
        wm.createWindow('sys-menu', 'EconOS System', 50, 300, 200, 150, 
            `<div class="space-y-2 text-[10px] text-white/60">
                <div class="hover:text-white cursor-pointer"><i class="ph ph-user"></i> User Settings</div>
                <div class="hover:text-white cursor-pointer"><i class="ph ph-hard-drive"></i> Kernel Logs</div>
                <div class="hover:text-white cursor-pointer" onclick="launchWindow('policy-manager')"><i class="ph ph-shield-check"></i> Security Policy</div>
                <div class="border-t border-white/5 pt-2 hover:text-terminal-red cursor-pointer"><i class="ph ph-power"></i> Shutdown</div>
            </div>`);
    }
}

// OS Logic
document.addEventListener('DOMContentLoaded', () => {
    window.econWM = new WindowManager();
    const wm = window.econWM;
    
    // Boot Sequence Terminal
    const bootWin = wm.createWindow('boot-loader', 'EconOS Boot', 100, 50, 400, 300, 
        '<div id="boot-log" class="font-mono text-[9px] text-terminal-green space-y-1"></div>'
    );
    
    const bootLog = document.getElementById('boot-log');
    const messages = [
        '[    0.000] Initializing EconOS Kernel v5.4...',
        '[    0.124] Loading Multi-Agent Resource Allocator...',
        '[    0.450] Mounting /dev/agents...',
        '[    0.782] Spawning Consumer Processes (100 total)...',
        '[    1.120] Initializing PPO Learning Pipeline...',
        '[    1.540] Checking Market Synchronization...',
        '[    2.100] SUCCESS: Economic Loopback Established.',
        '[    2.500] Starting Web_Desktop_System...'
    ];

    let i = 0;
    const bootInterval = setInterval(() => {
        if (i < messages.length) {
            bootLog.innerHTML += `<div>${messages[i]}</div>`;
            i++;
        } else {
            clearInterval(bootInterval);
            setTimeout(() => {
                bootWin.remove();
                launchWindow('macro-monitor');
                launchWindow('econ-shell');
            }, 1000);
        }
    }, 400);

    // Update Clock
    setInterval(() => {
        document.getElementById('sys-time').innerText = new Date().toLocaleTimeString();
    }, 1000);
});

// Re-using simulation logic but mapped to EconOS Windows
function initSimulation() {
    const mainCtx = document.getElementById('mainChart').getContext('2d');
    
    // --- Chart.js Setup ---
    const mainChart = new Chart(mainCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                { label: 'AVG WAGE', borderColor: '#FFD700', borderWidth: 1, pointRadius: 0, data: [] },
                { label: 'AVG PRICE', borderColor: '#00FF41', borderWidth: 1, pointRadius: 0, data: [] }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { x: { display: false }, y: { grid: { color: 'rgba(255,255,255,0.05)' } } } }
    });

    let cycle = 0;
    setInterval(() => {
        cycle++;
        const wage = (10 + Math.sin(cycle * 0.1) * 2 + Math.random()).toFixed(2);
        const price = (8 + Math.cos(cycle * 0.1) * 1.5 + Math.random()).toFixed(2);
        
        mainChart.data.labels.push(cycle);
        mainChart.data.datasets[0].data.push(parseFloat(wage));
        mainChart.data.datasets[1].data.push(parseFloat(price));
        if (mainChart.data.labels.length > 50) {
            mainChart.data.labels.shift();
            mainChart.data.datasets[0].data.shift();
            mainChart.data.datasets[1].data.shift();
        }
        mainChart.update('none');
    }, 500);
}
