# Browser Linux lab

The separate local prototype in [`lab/`](../lab/) boots a small Linux guest in [v86](https://github.com/copy/v86). Its `econos` command fetches a current, read-only summary from the shared kernel's version 1 export. The browser host serves only fixed lab assets and `/snapshot.txt`; it holds the kernel URL and makes the export request. The guest does not receive an admin token or start another economy.

## Run the local prototype

Run preparation, the server, and browser checks in a Linux development environment. Keep downloaded assets and dependencies outside the source checkout:

```sh
python3 lab/prepare_assets.py --output /path/to/lab-assets
python3 lab/serve.py --assets /path/to/lab-assets --kernel-url https://your-kernel.example/export --port 8765
```

Open `http://localhost:8765/`, select **Boot Linux**, and wait for **Linux ready**. Enter `econos` in the guest command field to read a new summary. The guest connects to the local lab server through v86's [fetch network backend](https://github.com/copy/v86/blob/master/docs/networking.md); the server fetches the configured kernel export. The page and server bind to localhost by default. The server returns an error when the kernel export is unavailable or has an unexpected format.

The asset preparation script pins `v86@0.5.472` and SHA-256 checksums for the emulator, BIOS, and Linux boot image. The guest command is a tiny generated initramfs overlay on top of the downloaded Linux image. None of those binaries are committed to this repository.

## Measurements and platform choice

Measurements on 2026-10-21 used one Linux ARM64 verifier, Playwright 1.64.1, the current shared kernel export, and three sequential `econos` queries per browser. The queries returned advancing kernel steps in each browser. The browser test used a text input and Enter to send each command, and recorded no page errors. These are local development measurements, not a capacity or public hosting benchmark.

| Browser | Boot to ready prompt | Assets transferred | Three guest queries |
| --- | ---: | ---: | --- |
| Chromium | 23.6 s | 12.0 MiB | passed |
| Firefox | 10.1 s | 12.0 MiB | passed |
| WebKit | 17.0 s | 12.0 MiB | passed |

The final Chromium run measured 35.41 process CPU seconds and 583.69 MiB summed browser-process RSS after the queries. Chrome's page metrics reported 23.99 s of task duration and 7.93 MiB of JavaScript heap. Earlier Chromium runs ranged from 557 to 610 MiB RSS, and one boot took 32.6 s under verifier load; resource use and startup vary. The 128 MiB assigned to guest RAM is included in browser process memory, so do not add it to RSS. Asset transfer is the page's resource-timing total for emulator, BIOS, and Linux downloads, rounded to one decimal MiB. The CPU figure sums the browser processes' reported CPU time, so it can exceed elapsed time when processes run in parallel. Run `node lab/measure.mjs chromium`, `firefox`, or `webkit` against the local server to repeat the interaction check.

The alternatives were screened from their upstream documentation, not deployed or benchmarked here:

| Option | Fit for this experiment | Distribution and operation |
| --- | --- | --- |
| [v86](https://github.com/copy/v86) | Boots a Linux kernel in the browser and supports the guest-to-host query tested above. | v86 is BSD-2-Clause. The boot image still needs a source and license inventory before redistribution. |
| [WebVM](https://github.com/leaningtech/webvm) | Offers a Linux-compatible browser environment; no EconOS guest prototype was built. | Its repository is Apache-2.0, while the CheerpX engine has separate [usage terms](https://github.com/leaningtech/webvm#licensing). Review those terms before self-hosting or choosing it. |
| [Apache Guacamole](https://guacamole.apache.org/doc/gug/guacamole-architecture.html) | Could expose a hosted Linux desktop, but would introduce a remote desktop stack for this single read-only query. | Requires a web application, `guacd` proxy, and remote desktop server; no deployment was tested. |

## Decision gate

Keep the lab separate and local. The `econos` command works, but its snapshot summary is already visible in the web desktop and export. The measured startup, transfer, and memory costs have no demonstrated research benefit yet. Continue toward a distributable Linux image only when a named experiment needs guest tools that improve on the desktop, and after documenting the Linux image's source, build configuration, component licenses, and redistribution rights. The downloaded boot image is a test input, not a release artifact.
