# Security considerations

- Authentication is on by default. Empty credentials prevent startup.
- Disabling authentication binds to loopback only; use it only for local development.
- Enable TRUST_PROXY=1 only behind a trusted, verified reverse proxy.
- Use HTTPS for remote deployments and a least-privilege database identity.
- No private data, credentials, production hostnames or historical Git metadata should be copied into the public repo.
- The in-process rate limiter and advisory locks serialise app writers but do not constrain independent database clients that bypass the lock.
- Public live demonstrations should use isolated synthetic state, not the private production database.
