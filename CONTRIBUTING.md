# Contributing to Proofrail for OpenClaw

Thanks for helping improve Proofrail.

## Before You Open a PR

- keep changes focused
- prefer the smallest fix that closes the issue
- keep public-facing text in English
- avoid introducing host-specific private paths, credentials, or deployment notes
- run the local validation lane before asking for review

## Local Validation

From the repository root:

```bash
npm install
npm run typecheck
npm run smoke
npm test
npm pack --dry-run
```

## Contribution Guidelines

- explain what changed and why
- include reproduction and validation notes for bug fixes
- update docs when behavior or configuration changes
- do not mix unrelated refactors into a bug-fix PR
- keep reviewer-facing diffs small and easy to audit

## Security Issues

If your report is security-sensitive, please use the private reporting path described in `SECURITY.md` instead of opening a public issue.
