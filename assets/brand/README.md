# tuur brand assets

Generated from the high-res sources in `source/` by `pnpm brand` (`scripts/build-brand-assets.mjs`, needs `sharp` and `potrace`; install them ad hoc, they are not workspace dependencies). The mark geometry is also emitted to `packages/ui/src/mark.generated.ts`.

- `logo/` wordmark "tuur": `tuur-wordmark-{red,black,white}.{svg,png}`
- `mark/` heart-pin mark (the "v"): `tuur-mark-{red,white}.{svg,png}`
- `app/` `icon-ios-1024.png`, `adaptive-icon-foreground.png`, `adaptive-icon-monochrome.png`, `splash-mark.png`, `notification-icon.png`, favicons, `apple-touch-icon.png`

Brand red is `#ED0516`. SVGs are auto-traced from raster sources; replace them with the designers' original vectors when available.
