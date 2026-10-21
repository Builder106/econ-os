const bootButton = /** @type {HTMLButtonElement} */ (document.getElementById('boot'));
const stopButton = /** @type {HTMLButtonElement} */ (document.getElementById('stop'));
const commandForm = document.getElementById('command-form');
const commandInput = /** @type {HTMLInputElement} */ (document.getElementById('command'));
const runButton = /** @type {HTMLButtonElement} */ (document.getElementById('run'));
const consoleOutput = /** @type {HTMLTextAreaElement} */ (document.getElementById('console'));
const guestStatus = document.getElementById('status');
const bootTime = document.getElementById('boot-time');
const transfer = document.getElementById('transfer');

let emulator;
let bootStarted;
let serialTail = '';
let toolInstalling = false;
let guestReady = false;

function transferredBytes() {
  const entries = /** @type {PerformanceResourceTiming[]} */ (performance.getEntriesByType('resource'));
  const total = entries
    .filter((entry) => /\/(vendor|assets)\//.test(new URL(entry.name).pathname))
    .reduce((sum, entry) => sum + entry.transferSize, 0);
  transfer.textContent = `${(total / 1024 / 1024).toFixed(1)} MiB`;
}

function onSerialByte(byte) {
  const character = String.fromCharCode(byte);
  if (character === '\r') return;
  if (consoleOutput.value === 'Guest has not started.') consoleOutput.value = '';
  consoleOutput.value = (consoleOutput.value + character).slice(-60000);
  consoleOutput.scrollTop = consoleOutput.scrollHeight;
  serialTail = (serialTail + character).slice(-160);

  if (!toolInstalling && serialTail.endsWith('~% ')) {
    toolInstalling = true;
    guestStatus.textContent = 'Configuring guest network';
    emulator.serial0_send('udhcpc -i eth0 -n -q\n');
    emulator.serial0_send('echo ECONOS_LAB_READY\n');
    return;
  }

  if (toolInstalling && !guestReady && serialTail.includes('ECONOS_LAB_READY') && serialTail.endsWith('~% ')) {
    guestReady = true;
    guestStatus.textContent = 'Linux ready';
    bootTime.textContent = `${((performance.now() - bootStarted) / 1000).toFixed(1)} s`;
    transferredBytes();
    commandInput.disabled = false;
    runButton.disabled = false;
    commandInput.focus();
  }
}

bootButton.addEventListener('click', async () => {
  bootButton.disabled = true;
  stopButton.disabled = false;
  guestStatus.textContent = 'Booting Linux';
  consoleOutput.value = 'Guest has not started.';
  serialTail = '';
  toolInstalling = false;
  guestReady = false;
  performance.clearResourceTimings();
  bootStarted = performance.now();

  try {
    const vendorModule = '/vendor/libv86.mjs';
    const { V86 } = await import(vendorModule);
    emulator = new V86({
      wasm_path: '/vendor/v86.wasm',
      memory_size: 128 * 1024 * 1024,
      vga_memory_size: 2 * 1024 * 1024,
      bios: { url: '/assets/seabios.bin' },
      vga_bios: { url: '/assets/vgabios.bin' },
      bzimage: { url: '/assets/buildroot-bzimage68.bin' },
      initrd: { url: '/assets/econos-initrd.cpio.gz' },
      filesystem: {},
      net_device: { type: 'virtio', relay_url: 'fetch' },
      cmdline: 'tsc=reliable mitigations=off random.trust_cpu=on',
      autostart: true,
      disable_keyboard: true,
      disable_speaker: true,
    });
    emulator.add_listener('serial0-output-byte', onSerialByte);
  } catch (error) {
    guestStatus.textContent = `Boot failed: ${error instanceof Error ? error.message : 'unknown error'}`;
    bootButton.disabled = false;
    stopButton.disabled = true;
  }
});

stopButton.addEventListener('click', async () => {
  stopButton.disabled = true;
  commandInput.disabled = true;
  runButton.disabled = true;
  await emulator?.stop();
  await emulator?.destroy();
  emulator = undefined;
  guestStatus.textContent = 'Guest stopped';
  bootButton.disabled = false;
});

commandForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!guestReady || !emulator) return;
  const command = commandInput.value.trim();
  if (!command) return;
  emulator.serial0_send(`${command}\n`);
  commandInput.value = '';
});
