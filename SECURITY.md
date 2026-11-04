# Security

## Reporting

If you find a security issue in this theme, please open a private security advisory
on GitHub, or email the maintainer listed in `package.json`. Do not open a public
issue with exploit details before a fix is available.

## What this plugin does

- It is a Web-only DeepSeek Harness theme bundle.
- It does not collect, upload, or transmit personal data.
- It does not call `fetch`, `XMLHttpRequest`, WebSocket, or telemetry endpoints.
- Preferences are stored only in `localStorage['dsh.cyrene.v1']`.
- The Host half injects a boot cover and a JSON art payload into the Harness
  index HTML; it does not touch the agent, the model, credentials, or session
  data.

## Scope

This is an unofficial fan-made theme. It is not affiliated with, endorsed by,
or sponsored by DeepSeek or miHoYo / HoYoverse. Security reports about DeepSeek
Harness itself should go to the DeepSeek Harness project.
