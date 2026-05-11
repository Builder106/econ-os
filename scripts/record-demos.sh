#!/usr/bin/env bash
# Record the three E2E scenarios as GIFs, in BOTH dark and light themes,
# for the README.
#
# Runs in RECORD_DEMOS=1 mode (see playwright.config.js): full video, 1920x1080
# viewport, 600 ms slowMo. RECORD_THEME=dark|light pins the headless browser's
# prefers-color-scheme so the dashboard's system-theme detection resolves the
# right way. ffmpegs the captured webms down to 960px-wide, 12 fps GIFs and
# parks them in docs/media/ as `{label}-{theme}.gif`.
#
# Usage:
#   ./scripts/record-demos.sh                # both themes (6 GIFs total)
#   ./scripts/record-demos.sh dark           # dark theme only (3 GIFs)
#   ./scripts/record-demos.sh light          # light theme only (3 GIFs)
#
# Idempotent: re-running overwrites the GIFs with fresh footage.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="${REPO_DIR}/docs/media"
RESULTS_DIR="${REPO_DIR}/test-results"

mkdir -p "${OUT_DIR}"

# Theme selection from optional first arg.
case "${1:-both}" in
    dark)  THEMES=(dark)  ;;
    light) THEMES=(light) ;;
    both|"") THEMES=(dark light) ;;
    *) echo "usage: $0 [dark|light|both]" >&2; exit 1 ;;
esac

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
for theme in "${THEMES[@]}"; do
    echo "===================="
    echo "[demo] theme=${theme}"
    echo "===================="

    for i in "${!SPECS[@]}"; do
        spec="${SPECS[$i]}"
        label="${LABELS[$i]}-${theme}"
        echo "[demo] recording: ${spec}"
        rm -rf "${RESULTS_DIR}"
        RECORD_DEMOS=1 RECORD_THEME="${theme}" \
            npx playwright test --grep "${spec}" >/dev/null 2>&1 || true

        webm=$(find "${RESULTS_DIR}" -name "video.webm" -type f -print0 2>/dev/null \
            | xargs -0 ls -t 2>/dev/null | head -n1)
        if [ -z "${webm}" ] || [ ! -s "${webm}" ]; then
            echo "[demo] no webm captured for: ${spec} [${theme}] — skipping"; continue
        fi

        gif="${OUT_DIR}/${label}.gif"
        echo "[demo]   converting → ${gif}"
        # Two-pass palettegen + paletteuse for cleaner colors than single-pass.
        # -ss 1.5 trims the first 1.5s of unavoidable browser pre-paint frames.
        palette="$(mktemp -t demo-palette).png"
        ffmpeg -y -hide_banner -loglevel error -ss 1.5 -i "${webm}" \
            -vf "fps=12,scale=1200:-1:flags=lanczos,palettegen=stats_mode=diff" "${palette}"
        ffmpeg -y -hide_banner -loglevel error -ss 1.5 -i "${webm}" -i "${palette}" \
            -filter_complex "fps=12,scale=1200:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5" \
            "${gif}"
        rm -f "${palette}"

        echo "[demo]   $(du -h "${gif}" | cut -f1)"
    done
done

rm -rf "${RESULTS_DIR}"
echo
echo "[demo] done. GIFs in ${OUT_DIR}/"
ls -lh "${OUT_DIR}"
