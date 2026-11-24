# Security Policy

## Supported versions

| Version | Supported |
| :------ | :-------- |
| 1.x     | ✅        |

## Reporting a vulnerability

Please **do not** open a public issue for security problems. Use GitHub's private
[security advisory](https://github.com/huayuehua15-netizen/yin-shi/security/advisories/new)
flow instead. Include:

- the affected endpoint or component,
- a minimal reproduction (request payload or file sample),
- the impact you believe it has.

You can expect an initial response within 72 hours. Once a fix is ready, the
advisory will be published with credit unless you prefer to stay anonymous.

## Security model

Cadence is designed to run as a **single-tenant, self-hosted demo**:

- Recordings, transcripts, coaching notes, and exports stay on the host filesystem
  (`CADENCE_DATA_DIR`). Nothing is uploaded anywhere except to the AI provider you
  explicitly configure.
- API keys are read from the server environment only. They are never embedded in
  the client bundle or returned by any endpoint.
- Uploaded audio is validated by extension/MIME, capped at 25 MB, stored under a
  sanitized filename, and streamed through a path-traversal-guarded handler.
- `X-Content-Type-Options`, `Referrer-Policy`, and a restrictive `Permissions-Policy`
  are set on every response; API responses are marked `Cache-Control: no-store`.
- There is **no authentication layer**. Do not expose an instance with real
  customer recordings to the public internet without putting it behind an
  authenticating reverse proxy.

## Out of scope

- Denial-of-service through oversized or malformed audio beyond the documented
  25 MB limit.
- Issues that require a compromised host or a leaked `GEMINI_API_KEY`.
- Prompt-injection content inside transcripts that only affects coaching text
  quality, not code execution.
