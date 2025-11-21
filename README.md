# swa-github-discussion-cleanup

GitHub Action that deletes expired Azure Static Web Apps (SWA) invitation Discussions. It is designed to complement [`swa-github-role-sync`](https://github.com/nuitsjp/swa-github-role-sync) workflows by cleaning up temporary invite threads once the expiration window passes.

## Usage

```yaml
name: Cleanup SWA Discussions
on:
  schedule:
    - cron: '0 4 * * *'
  workflow_dispatch:

jobs:
  cleanup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: recursive

      - name: Delete expired discussions
        uses: ./actions/discussion-cleanup
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          target-repo: nuitsjp/swa-github-role-sync
          discussion-category-name: 'Announcements'
          expiration-hours: 24
          cleanup-mode: ${{ github.event_name == 'workflow_dispatch' && 'immediate' || 'expiration' }}
```

### Inputs

| Input | Required | Default | Description |
| --- | --- | --- | --- |
| `github-token` | ✅ | – | Token with `discussions:write` permission on the target repo. |
| `target-repo` | ❌ | Current repo | Repository whose discussions should be purged. |
| `discussion-category-name` | ✅ | – | Discussion category that stores invite threads. |
| `expiration-hours` | ❌ | `168` | Hours after creation to consider a discussion expired. |
| `discussion-title-template` | ❌ | `SWA access invite for @{login} ({swaName}) - {date}` | Template used when matching invitation threads. |
| `cleanup-mode` | ❌ | `expiration` | Set to `immediate` to delete all matching discussions regardless of age. |

### Outputs

| Output | Description |
| --- | --- |
| `deleted-count` | Number of discussions removed in the run. |

## Development

```bash
npm install
npm run package
```

Commit the generated files under `dist/` so GitHub Actions runners do not need to install dependencies.
