# Desktop asset sources

Every drawn asset in the desktop starts in this folder. The 2D marks come from Glaxnimate and the wallpapers from Blender. Edit the source here, then export to the path listed.

| Source | Made with | Used as | Export | Budget | Size |
| --- | --- | --- | --- | --- | --- |
| `icons.svg` | Glaxnimate (`glaxnimate_create_svg`) | App icons, layout glyphs and bar glyphs, one `<symbol>` each, colored with `currentColor` | Imported raw by `src/dom.ts` and inlined once as a sprite | 12 KB | 6.7 KB |
| `mark.svg` | Glaxnimate | Splash mark, favicon | Imported raw by `src/splash.ts`; copied to `public/favicon.svg` | 2 KB | 0.7 KB |
| `wordmark.svg` | Glaxnimate `text_to_path` with Azeret Mono 700 | Splash wordmark | Imported raw by `src/splash.ts` | 4 KB | 2.5 KB |
| `mark.svg` at 180 px | Glaxnimate CLI render | Apple touch icon | `public/apple-touch-icon.png` | 8 KB | 4.6 KB |
| `og.svg` | Glaxnimate (`create_svg` plus `text_to_path` for the tagline) | Link preview | Glaxnimate CLI render to `public/og.png` | 120 KB | 34 KB |
| `wallpaper.blend` | Blender 5.2, Cycles, scene `econos-wall` | Wallpaper behind empty workspaces, the splash and the 404 page | `public/wall-dark.webp`, `public/wall-light.webp` (2560x1440, WebP quality 78) | 350 KB each | 147 KB, 267 KB |

## Notes

- The mark is a Lorenz curve below the line of equality, inside a double rule. The hatching between them is drawn as separate segments, not a clip path, because the Glaxnimate renderer drops clip paths.
- The wallpaper is an engine-turned plate: three bands of rosette curves (`r = R + a sin(nθ + φ)`, with the phase swept over a full period) as thin tubes on a metal plane, lit by a low area light and a soft top fill. The dark render uses blued steel at exposure −1.6; the light render uses bright nickel with darker grooves at exposure +0.25. Both come from the same scene.
- Static forms: every mark is static by default. The splash draws the mark's curve on once while the socket opens; with reduced motion it shows the finished mark.
- Render the PNGs from the SVG sources with the Glaxnimate CLI: `glaxnimate og.svg --render og.png --frame 0`.
