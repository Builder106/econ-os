#!/usr/bin/env bash
# Record three representative E2E specs as GIFs for the README.
#
# Runs in RECORD_DEMOS=1 mode (see playwright.config.js): full video, 1920x1080
# viewport, 600 ms slowMo so each action reads at human speed. Then ffmpegs the
# captured webms down to 960px-wide, 12 fps GIFs and parks them in docs/media/.
#
# Usage:
#   ./scripts/record-demos.sh
#
# Idempotent: re-running overwrites the existing GIFs with fresh footage.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="${REPO_DIR}/docs/media"
RESULTS_DIR="${REPO_DIR}/test-results"

mkdir -p "${OUT_DIR}"
rm -rf "${RESULTS_DIR}"

# The three specs that tell visual stories worth embedding:
#   1) boot → kernel goes LIVE         — proof-of-life for first-time visitors
#   2) admin tax propagation           — shell command → Policy Manager UI update
#   3) admin shock + broadcast event   — cross-window event surfacing
SPECS=(
    "renders live kernel feed"
    "tax command propagates"
    "shock fires a broadcast event"
)
LABELS=(
    "01-boot-and-live"
    "02-admin-tax-propagation"
    "03-admin-shock-broadcast"
)

cd "${REPO_DIR}"
for i in "${!SPECS[@]}"; do
    spec="${SPECS[$i]}"
    label="${LABELS[$i]}"
    echo "[demo] recording: ${spec}"
    RECORD_DEMOS=1 npx playwright test --grep "${spec}" >/dev/null 2>&1 || true

    # Pick up the freshest webm Playwright wrote.
    webm=$(find "${RESULTS_DIR}" -name "video.webm" -type f -print0 2>/dev/null \
        | xargs -0 ls -t 2>/dev/null | head -n1)
    if [ -z "${webm}" ] || [ ! -s "${webm}" ]; then
        echo "[demo] no webm captured for: ${spec} — skipping"; continue
    fi

    gif="${OUT_DIR}/${label}.gif"
    echo "[demo]   converting → ${gif}"
    # Lanczos downscale + low fps to stay under GitHub's 10MB attachment limit
    # while keeping motion legible. Two-pass palette-gen produces noticeably
    # cleaner colors than single-pass.
    #
    # -ss 1.5 skips the first ~1.5s of footage where the browser is still
    # showing its default white pre-paint state (before HTML/CSS parses).
    # Inline `<style>html,body{background:#0a0b0e}</style>` in index.html
    # narrows that window but doesn't eliminate frame-0 entirely.
    palette="$(mktemp -t demo-palette).png"
    ffmpeg -y -hide_banner -loglevel error -ss 1.5 -i "${webm}" \
        -vf "fps=12,scale=960:-1:flags=lanczos,palettegen=stats_mode=diff" "${palette}"
    ffmpeg -y -hide_banner -loglevel error -ss 1.5 -i "${webm}" -i "${palette}" \
        -filter_complex "fps=12,scale=960:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5" \
        "${gif}"
    rm -f "${palette}"

    rm -rf "${RESULTS_DIR}"
    echo "[demo]   $(du -h "${gif}" | cut -f1)"
done

echo
echo "[demo] done. GIFs in ${OUT_DIR}/"
ls -lh "${OUT_DIR}"
