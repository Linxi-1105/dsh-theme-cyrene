# Contributing

Thanks for helping improve the theme.

## Ground rules

- This is an unofficial, non-commercial fan project. Do not add official game
  assets, extracted models, leaked content, or anything that implies official
  endorsement.
- Character fan art is **not** covered by the MIT license. Do not relicense it.
- Code contributions are accepted under the MIT license (see `LICENSE`).
- Keep the theme Web-only. Do not add telemetry, analytics, or network calls.

## Local checks

```powershell
node --check index.js
node --check client.js
npm pack --dry-run
```

## Pull requests

- Keep changes focused; describe what you changed and why.
- Do not reformat unrelated code.
- If you change artwork, include the source/author and the license terms.
- If you change the Host half, test `?cyrene=off` and a normal boot.
