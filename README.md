# swa-github-discussion-cleanup

[日本語](README.ja.md)

GitHub Action that deletes expired Azure Static Web Apps (SWA) invitation Discussions. It is designed to complement [`swa-github-role-sync`](https://github.com/nuitsjp/swa-github-role-sync) workflows by cleaning up temporary invite threads once the expiration window passes.

> **Note**
> Operational workflows are maintained in [`nuitsjp/swa-github-role-sync-ops`](https://github.com/nuitsjp/swa-github-role-sync-ops). This repository only hosts the Action code itself.

## Overview

When `swa-github-role-sync` creates Discussions containing SWA invitation links, these Discussions remain even after the links expire. This can cause user confusion when they accidentally access expired links.

This Action searches for Discussions in a specified category, compares their creation date with the expiration time, and automatically deletes expired Discussions.

## Core Features

- **Automatic deletion of expired Discussions**: Deletes Discussions created more than expiration-hours ago
- **Title pattern matching**: Only deletes Discussions matching the template pattern
- **Immediate deletion mode**: Can delete all matching Discussions immediately on `workflow_dispatch`
- **Flexible scheduled execution**: Runs periodically via cron to maintain a clean state

## Prerequisites

- GitHub Discussions must be enabled
- Workflow must have `discussions: write` permission
- Token used as `github-token` must have permission to delete Discussions in the target repository

## Quick Start

Create `.github/workflows/cleanup-discussions.yml`:

```yaml
name: Cleanup expired discussions

on:
  schedule:
    - cron: '0 0 * * *' # Daily execution
  workflow_dispatch:

jobs:
  cleanup:
    runs-on: ubuntu-latest
    permissions:
      discussions: write
    steps:
      - name: Delete expired discussions
        uses: nuitsjp/swa-github-discussion-cleanup@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          discussion-category-name: 'Announcements'
          expiration-hours: 168
          cleanup-mode: ${{ github.event_name == 'workflow_dispatch' && 'immediate' || 'expiration' }}
```

## Inputs

| Input                       | Required | Default                                               | Description                                                              |
| --------------------------- | -------- | ----------------------------------------------------- | ------------------------------------------------------------------------ |
| `github-token`              | ✅       | –                                                     | Token with `discussions:write` permission on the target repo.            |
| `target-repo`               | ❌       | Current repo                                          | Repository whose discussions should be purged (`owner/repo` format).     |
| `discussion-category-name`  | ✅       | –                                                     | Discussion category that stores invite threads.                          |
| `expiration-hours`          | ❌       | `168`                                                 | Hours after creation to consider a discussion expired.                   |
| `discussion-title-template` | ❌       | `SWA access invite for @{login} ({swaName}) - {date}` | Template used when matching invitation threads.                          |
| `cleanup-mode`              | ❌       | `expiration`                                          | Set to `immediate` to delete all matching discussions regardless of age. |

## Outputs

| Output          | Description                               |
| --------------- | ----------------------------------------- |
| `deleted-count` | Number of discussions removed in the run. |

## Usage Notes

- Use the same `discussion-title-template` as configured in `swa-github-role-sync`
- We recommend setting `expiration-hours` to match `invitation-expiration-hours` in `swa-github-role-sync`
- Be careful with `cleanup-mode: immediate` as it will delete ALL matching Discussions immediately

## Workflow Patterns

### Pattern 1: Regular cleanup

Automatically delete expired Discussions daily at midnight:

```yaml
on:
  schedule:
    - cron: '0 0 * * *'

jobs:
  cleanup:
    runs-on: ubuntu-latest
    permissions:
      discussions: write
    steps:
      - uses: nuitsjp/swa-github-discussion-cleanup@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          discussion-category-name: 'Announcements'
          expiration-hours: 168
```

### Pattern 2: Immediate deletion on manual execution

```yaml
on:
  schedule:
    - cron: '0 0 * * *'
  workflow_dispatch:

jobs:
  cleanup:
    runs-on: ubuntu-latest
    permissions:
      discussions: write
    steps:
      - uses: nuitsjp/swa-github-discussion-cleanup@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          discussion-category-name: 'Announcements'
          expiration-hours: 168
          cleanup-mode: ${{ github.event_name == 'workflow_dispatch' && 'immediate' || 'expiration' }}
```

### Pattern 3: Delete Discussions in another repository

```yaml
jobs:
  cleanup:
    runs-on: ubuntu-latest
    permissions:
      discussions: write
    steps:
      - uses: nuitsjp/swa-github-discussion-cleanup@v1
        with:
          github-token: ${{ secrets.PAT_TOKEN }} # PAT required
          target-repo: 'my-org/other-repo'
          discussion-category-name: 'Announcements'
          expiration-hours: 168
```

## Troubleshooting

| Issue                                        | Cause and Solution                                                           |
| -------------------------------------------- | ---------------------------------------------------------------------------- |
| `Category "..." not found`                   | Category name doesn't match or Discussions are disabled. Check Settings.     |
| `403 Resource not accessible by integration` | Insufficient `github-token` permissions. Check workflow `permissions` block. |
| Deleted count is 0                           | Title template doesn't match or no expired Discussions exist.                |

## Development

```bash
npm install
npm run package
```

Commit the generated files under `dist/` so GitHub Actions runners do not need to install dependencies.

## License

MIT License. See `LICENSE` for details.
