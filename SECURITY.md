# Security policy

## Supported versions

Security fixes are applied to the latest release on the `main` branch. Older
release lines are not guaranteed to receive security patches.

## Architecture

CloudDeck separates the browser-facing panel from privileged host operations:

- The Next.js panel runs as the unprivileged `clouddeck` user.
- The Go agent is the only privileged process.
- The agent listens on `127.0.0.1:9090` by default and must never be exposed to
  the public network.
- The panel authenticates agent requests with the shared
  `X-CloudDeck-Agent-Token` header.
- `/v1/health` is intentionally public for liveness checks; all other agent
  routes require the token outside explicitly configured development mode.
- Mutations use validated operation inputs, explicit command argument arrays,
  atomic state writes, and JSONL audit entries.

The public panel should be served over HTTPS. The installer binds the panel to
`0.0.0.0:2083` for initial access, but production deployments should use an
HTTPS reverse proxy on ports 80/443 and keep the agent on localhost.

## Reporting a vulnerability

Please do not disclose security vulnerabilities in public issues. Use GitHub's
private vulnerability reporting for this repository when available. Include:

- the affected release or commit;
- deployment and operating-system details;
- clear reproduction steps or a proof of concept;
- impact and any required privileges.

Reports are investigated privately and fixes may be released without
immediately publishing exploit details.
