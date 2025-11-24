# swa-github-discussion-cleanup

[English](README.md)

Azure Static Web Apps (SWA) の招待Discussionの有効期限切れを自動削除するGitHub Actionです。[`swa-github-role-sync`](https://github.com/nuitsjp/swa-github-role-sync)と組み合わせて使用することで、招待リンクのライフサイクル管理を完結させることができます。

> **お知らせ**
> 運用ワークフローは [`nuitsjp/swa-github-role-sync-ops`](https://github.com/nuitsjp/swa-github-role-sync-ops) で管理されています。本リポジトリはAction本体のみを管理します。

## 概要

`swa-github-role-sync`アクションでSWAへの招待リンクを含むDiscussionが作成されますが、有効期限が切れた後もDiscussionが残り続けると、ユーザーが誤って期限切れのリ��クにアクセスして混乱する原因になります。

このActionは、指定したカテゴリー内のDiscussionを検索し、作成日時と有効期限時間を比較して、期限切れのDiscussionを自動的に削除します。

## 主な機能

- **期限切れDiscussionの自動削除**: 作成からexpiration-hours経過したDiscussionを削除
- **タイトルパターンマッチング**: テンプレートに一致するDiscussionのみを削除対象とする
- **即時削除モード**: `workflow_dispatch`実行時に全Discussionを即座に削除可能
- **柔軟なスケジュール実行**: cronで定期的に実行し、常にクリーンな状態を維持

## 前提条件

- GitHub Discussionsが有効化されていること
- workflowに`discussions: write`権限が付与されていること
- `github-token`として使用するトークンが対象リポジトリーのDiscussionを削除できること

## クイックスタート

`.github/workflows/cleanup-discussions.yml`を作成:

```yaml
name: Cleanup expired discussions

on:
  schedule:
    - cron: '0 0 * * *' # 毎日実行
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

## 入力パラメーター

| 名前                        | 必須 | デフォルト                                            | 説明                                                          |
| --------------------------- | ---- | ----------------------------------------------------- | ------------------------------------------------------------- |
| `github-token`              | ✅   | –                                                     | `discussions:write`権限を持つトークン                         |
| `target-repo`               | ❌   | 現在のリポジトリー                                    | 削除対象のリポジトリー（`owner/repo`形式）                    |
| `discussion-category-name`  | ✅   | –                                                     | 招待Discussionが含まれるカテゴリー名                          |
| `expiration-hours`          | ❌   | `168`                                                 | 作成からこの時間経過後に削除対象とする（時間）                |
| `discussion-title-template` | ❌   | `SWA access invite for @{login} ({swaName}) - {date}` | 削除対象を特定するためのタイトルテンプレート                  |
| `cleanup-mode`              | ❌   | `expiration`                                          | `expiration`（期限切れのみ）または`immediate`（即座に全削除） |

## 出力

| 名前            | 説明                 |
| --------------- | -------------------- |
| `deleted-count` | 削除したDiscussion数 |

## 使用上の注意

- `discussion-title-template`は`swa-github-role-sync`で使用したテンプレートと同じものを指定してください
- `expiration-hours`は`swa-github-role-sync`の`invitation-expiration-hours`と同じ値に設定することを推奨します
- `cleanup-mode`を`immediate`に設定すると、マッチするすべてのDiscussionが即座に削除されるため注意してください

## ワークフローパターン

### パターン1: 定期的なクリーンアップ

毎日深夜に期限切れDiscussionを自動削除:

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

### パターン2: 手動実行時は即座に全削除

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

### パターン3: 別リポジトリーのDiscussionを削除

```yaml
jobs:
  cleanup:
    runs-on: ubuntu-latest
    permissions:
      discussions: write
    steps:
      - uses: nuitsjp/swa-github-discussion-cleanup@v1
        with:
          github-token: ${{ secrets.PAT_TOKEN }} # PATが必要
          target-repo: 'my-org/other-repo'
          discussion-category-name: 'Announcements'
          expiration-hours: 168
```

## トラブルシューティング

| 問題                                         | 原因と対処                                                                    |
| -------------------------------------------- | ----------------------------------------------------------------------------- |
| `Category "..." not found`                   | カテゴリー名が一致していないか、Discussionsが無効。Settingsで確認してください |
| `403 Resource not accessible by integration` | `github-token`の権限不足。workflowの`permissions`ブロックを確認してください   |
| 削除件数が0                                  | タイトルテンプレートが一致していないか、期限切れDiscussionが存在しません      |

## 開発

```bash
npm install
npm run package
```

ビルド済みファイルを`dist/`配下にコミットすることで、GitHub Actionsランナーが依存関係をインストールする必要がなくなります。

## ライセンス

MIT License。詳細は`LICENSE`を参照してください。
