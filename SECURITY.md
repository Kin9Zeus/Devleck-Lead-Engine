# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Use GitHub's private reporting instead: **Security → Report a vulnerability** on this
repository, or write to contact@devleck.com. Include what you found, how to reproduce it
and the impact you think it has. You can expect an acknowledgement within a few days.

## Scope

- The local dashboard server and its HTTP endpoints (it is designed to run on the user's machine).
- Handling of the lead database and the exclusion list.
- Server-Sent Events streaming of research runs.

## How secrets are handled

No secret is stored in this repository. Keys and tokens live only in the hosting platform's
environment variables, and environment files (`.env`, `.env.*`) are git-ignored. The
variables the project reads are documented in the README. Secret scanning and push
protection are enabled on this repository.
