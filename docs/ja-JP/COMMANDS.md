# GSD コマンドリファレンス

> コマンド構文、フラグ、オプション、使用例の完全なリファレンスです。機能の詳細については[機能リファレンス](FEATURES.md)を、ワークフローのチュートリアルについては[ユーザーガイド](USER-GUIDE.md)をご覧ください。

---

## コマンド構文

- **Claude Code / Gemini / Copilot:** `/gsd-command-name [args]`
- **OpenCode / Kilo:** `/gsd-command-name [args]`
- **Codex:** `$gsd-command-name [args]`

---

## コアワークフローコマンド

### `/gsd-new-project`

詳細なコンテキスト収集を行い、新しいプロジェクトを初期化します。

| フラグ | 説明 |
|------|-------------|
| `--auto @file.md` | ドキュメントから自動抽出し、対話的な質問をスキップ |

**前提条件:** 既存の `.planning/PROJECT.md` がないこと
**生成物:** `PROJECT.md`、`REQUIREMENTS.md`、`ROADMAP.md`、`STATE.md`、`config.json`、`research/`、`CLAUDE.md`

```bash
/gsd-new-project                    # 対話モード
/gsd-new-project --auto @prd.md     # PRDから自動抽出
```

---

### `/gsd-new-workspace`

リポジトリのコピーと独立した `.planning/` ディレクトリを持つ分離されたワークスペースを作成します。

| フラグ | 説明 |
|------|-------------|
| `--name <name>` | ワークスペース名（必須） |
| `--repos repo1,repo2` | カンマ区切りのリポジトリパスまたは名前 |
| `--path /target` | 対象ディレクトリ（デフォルト: `~/gsd-workspaces/<name>`） |
| `--strategy worktree\|clone` | コピー戦略（デフォルト: `worktree`） |
| `--branch <name>` | チェックアウトするブランチ（デフォルト: `workspace/<name>`） |
| `--auto` | 対話的な質問をスキップ |

**ユースケース:**
- マルチリポ: リポジトリのサブセットを分離されたGSD状態で作業
- 機能の分離: `--repos .` で現在のリポジトリのworktreeを作成

**生成物:** `WORKSPACE.md`、`.planning/`、リポジトリコピー（worktreeまたはclone）

```bash
/gsd-new-workspace --name feature-b --repos hr-ui,ZeymoAPI
/gsd-new-workspace --name feature-b --repos . --strategy worktree  # 同一リポジトリの分離
/gsd-new-workspace --name spike --repos api,web --strategy clone   # フルクローン
```

---

### `/gsd-list-workspaces`

アクティブなGSDワークスペースとそのステータスを一覧表示します。

**スキャン対象:** `~/gsd-workspaces/` 内の `WORKSPACE.md` マニフェスト
**表示内容:** 名前、リポジトリ数、戦略、GSDプロジェクトのステータス

```bash
/gsd-list-workspaces
```

---

### `/gsd-remove-workspace`

ワークスペースを削除し、git worktreeをクリーンアップします。

| 引数 | 必須 | 説明 |
|----------|----------|-------------|
| `<name>` | はい | 削除するワークスペース名 |

**安全性:** コミットされていない変更があるリポジトリの削除を拒否します。名前の確認が必要です。

```bash
/gsd-remove-workspace feature-b
```

---

### `/gsd-discuss-phase`

計画の前に実装に関する意思決定を記録します。

| 引数 | 必須 | 説明 |
|----------|----------|-------------|
| `N` | いいえ | フェーズ番号（デフォルトは現在のフェーズ） |

| フラグ | 説明 |
|------|-------------|
| `--auto` | すべての質問で推奨デフォルトを自動選択 |
| `--batch` | 質問を一つずつではなくバッチ取り込みでグループ化 |
| `--analyze` | ディスカッション中にトレードオフ分析を追加 |
| `--chain` | discuss → plan → execute を1つのフローで自動チェーン (v1.31) |
| `--power` | 準備済み回答ファイルから一括入力で質問に回答 (v1.32) |

**前提条件:** `.planning/ROADMAP.md` が存在すること
**生成物:** `{phase}-CONTEXT.md`、`{phase}-DISCUSSION-LOG.md`（監査証跡）

```bash
/gsd-discuss-phase 1                # フェーズ1の対話的ディスカッション
/gsd-discuss-phase 3 --auto         # フェーズ3でデフォルトを自動選択
/gsd-discuss-phase --batch          # 現在のフェーズのバッチモード
/gsd-discuss-phase 2 --analyze      # トレードオフ分析付きディスカッション
```

### `/gsd-plan-phase`

フェーズの調査、計画、検証を行います。

| 引数 | 必須 | 説明 |
|----------|----------|-------------|
| `N` | いいえ | フェーズ番号（デフォルトは次の未計画フェーズ） |

| フラグ | 説明 |
|------|-------------|
| `--auto` | 対話的な確認をスキップ |
| `--research` | RESEARCH.mdが存在しても強制的に再調査 |
| `--skip-research` | ドメイン調査ステップをスキップ |
| `--gaps` | ギャップ解消モード（VERIFICATION.mdを読み込み、調査をスキップ） |
| `--skip-verify` | プランチェッカーの検証ループをスキップ |
| `--prd <file>` | discuss-phaseの代わりにPRDファイルをコンテキストとして使用 |
| `--reviews` | REVIEWS.mdのクロスAIレビューフィードバックで再計画 |

**前提条件:** `.planning/ROADMAP.md` が存在すること
**生成物:** `{phase}-RESEARCH.md`、`{phase}-{N}-PLAN.md`、`{phase}-VALIDATION.md`

```bash
/gsd-plan-phase 1                   # フェーズ1の調査＋計画＋検証
/gsd-plan-phase 3 --skip-research   # 調査なしで計画（馴染みのあるドメイン）
/gsd-plan-phase --auto              # 非対話型の計画
```

---

### `/gsd-execute-phase`

フェーズ内のすべてのプランをウェーブベースの並列化で実行するか、特定のウェーブを実行します。

| 引数 | 必須 | 説明 |
|----------|----------|-------------|
| `N` | **はい** | 実行するフェーズ番号 |
| `--wave N` | いいえ | フェーズ内のウェーブ `N` のみを実行 |

**前提条件:** フェーズにPLAN.mdファイルがあること
**生成物:** プランごとの `{phase}-{N}-SUMMARY.md`、gitコミット、フェーズ完了時に `{phase}-VERIFICATION.md`

```bash
/gsd-execute-phase 1                # フェーズ1を実行
/gsd-execute-phase 1 --wave 2       # ウェーブ2のみを実行
```

---

### `/gsd-verify-work`

自動診断付きのユーザー受入テスト。

| 引数 | 必須 | 説明 |
|----------|----------|-------------|
| `N` | いいえ | フェーズ番号（デフォルトは最後に実行されたフェーズ） |

**前提条件:** フェーズが実行済みであること
**生成物:** `{phase}-UAT.md`、問題が見つかった場合は修正プラン

```bash
/gsd-verify-work 1                  # フェーズ1のUAT
```

### `/gsd-complete-milestone`

マイルストーンをアーカイブし、リリースをタグ付けします。

**前提条件:** マイルストーン監査が完了していること（推奨）
**生成物:** `MILESTONES.md` エントリ、gitタグ

```bash
/gsd-complete-milestone
```

### `/gsd-new-milestone`

次のバージョンサイクルを開始します。

| 引数 | 必須 | 説明 |
|----------|----------|-------------|
| `name` | いいえ | マイルストーン名 |
| `--reset-phase-numbers` | いいえ | 新しいマイルストーンをフェーズ1から開始し、ロードマップ作成前に古いフェーズディレクトリをアーカイブ |

**前提条件:** 前のマイルストーンが完了していること
**生成物:** 更新された `PROJECT.md`、新しい `REQUIREMENTS.md`、新しい `ROADMAP.md`

```bash
/gsd-new-milestone                  # 対話モード
/gsd-new-milestone "v2.0 Mobile"    # 名前付きマイルストーン
/gsd-new-milestone --reset-phase-numbers "v2.0 Mobile"  # マイルストーン番号を1からリスタート
```

---

## フェーズ管理コマンド

### `/gsd-add-phase`

ロードマップに新しいフェーズを追加します。

```bash
/gsd-add-phase                      # 対話型 — フェーズの説明を入力
```

### `/gsd-insert-phase`

小数番号を使用して、フェーズ間に緊急の作業を挿入します。

| 引数 | 必須 | 説明 |
|----------|----------|-------------|
| `N` | いいえ | このフェーズ番号の後に挿入 |

```bash
/gsd-insert-phase 3                 # フェーズ3と4の間に挿入 → 3.1を作成
```

### `/gsd-remove-phase`

将来のフェーズを削除し、後続のフェーズの番号を振り直します。

| 引数 | 必須 | 説明 |
|----------|----------|-------------|
| `N` | いいえ | 削除するフェーズ番号 |

```bash
/gsd-remove-phase 7                 # フェーズ7を削除、8→7、9→8等に番号振り直し
```

### `/gsd-research-phase`

詳細なエコシステム調査のみを実行します（単体機能 — 通常は `/gsd-plan-phase` を使用してください）。

| 引数 | 必須 | 説明 |
|----------|----------|-------------|
| `N` | いいえ | フェーズ番号 |

```bash
/gsd-research-phase 4               # フェーズ4のドメインを調査
```

### `/gsd-validate-phase`

遡及的にNyquistバリデーションのギャップを監査・補填します。

| 引数 | 必須 | 説明 |
|----------|----------|-------------|
| `N` | いいえ | フェーズ番号 |

```bash
/gsd-validate-phase 2               # フェーズ2のテストカバレッジを監査
```

---

## ナビゲーションコマンド

### `/gsd-progress`

ステータスと次のステップを表示します。

```bash
/gsd-progress                       # "今どこにいる？次は何？"
```

### `/gsd-resume-work`

前回のセッションから完全なコンテキストを復元します。

```bash
/gsd-resume-work                    # コンテキストリセットまたは新しいセッション後に使用
```

### `/gsd-pause-work`

フェーズの途中で中断する際にコンテキストのハンドオフを保存します。

```bash
/gsd-pause-work                     # continue-here.mdを作成
```

### `/gsd-help`

すべてのコマンドと使用ガイドを表示します。

```bash
/gsd-help                           # クイックリファレンス
```

---

## ユーティリティコマンド

### `/gsd-quick`

GSDの保証付きでアドホックタスクを実行します。

| フラグ | 説明 |
|------|-------------|
| `--full` | プランチェック（2回のイテレーション）＋実行後検証を有効化 |
| `--discuss` | 軽量な事前計画ディスカッション |
| `--research` | 計画前にフォーカスされたリサーチャーを起動 |

フラグは組み合わせ可能です。

```bash
/gsd-quick                          # 基本的なクイックタスク
/gsd-quick --discuss --research     # ディスカッション＋調査＋計画
/gsd-quick --full                   # プランチェックと検証付き
/gsd-quick --discuss --research --full  # すべてのオプションステージ
```

### `/gsd-add-todo`

後で取り組むアイデアやタスクをキャプチャします。

| 引数 | 必須 | 説明 |
|----------|----------|-------------|
| `description` | いいえ | Todoの説明 |

```bash
/gsd-add-todo "Consider adding dark mode support"
```

### `/gsd-check-todos`

保留中のTodoを一覧表示し、取り組むものを選択します。

```bash
/gsd-check-todos
```

### `/gsd-profile-user`

Claude Codeのセッション分析から8つの次元（コミュニケーションスタイル、意思決定パターン、デバッグアプローチ、UXプリファレンス、ベンダー選択、フラストレーションのトリガー、学習スタイル、説明の深さ）にわたる開発者行動プロファイルを生成します。Claudeのレスポンスをパーソナライズするアーティファクトを生成します。

| フラグ | 説明 |
|------|-------------|
| `--questionnaire` | セッション分析の代わりに対話型アンケートを使用 |
| `--refresh` | セッションを再分析してプロファイルを再生成 |

**生成されるアーティファクト:**
- `USER-PROFILE.md` — 完全な行動プロファイル
- `/gsd-dev-preferences` コマンド — 任意のセッションでプリファレンスをロード
- `CLAUDE.md` プロファイルセクション — Claude Codeが自動検出

```bash
/gsd-profile-user                   # セッションを分析してプロファイルを構築
/gsd-profile-user --questionnaire   # 対話型アンケートのフォールバック
/gsd-profile-user --refresh         # 新鮮な分析からの再生成
```

## 診断コマンド

## ワークストリーム管理

### `/gsd-workstreams`

マイルストーンの異なる領域で並行作業するためのワークストリームを管理します。

**サブコマンド:**

| サブコマンド | 説明 |
|------------|-------------|
| `list` | すべてのワークストリームをステータス付きで一覧表示（サブコマンド未指定時のデフォルト） |
| `create <name>` | 新しいワークストリームを作成 |
| `status <name>` | 1つのワークストリームの詳細ステータス |
| `switch <name>` | アクティブなワークストリームを設定 |
| `progress` | 全ワークストリームの進捗サマリー |
| `complete <name>` | 完了したワークストリームをアーカイブ |
| `resume <name>` | ワークストリームでの作業を再開 |

**前提条件:** アクティブなGSDプロジェクト
**生成物:** `.planning/` 配下のワークストリームディレクトリ、ワークストリームごとの状態追跡

```bash
/gsd-workstreams                    # すべてのワークストリームを一覧表示
/gsd-workstreams create backend-api # 新しいワークストリームを作成
/gsd-workstreams switch backend-api # アクティブなワークストリームを設定
/gsd-workstreams status backend-api # 詳細ステータス
/gsd-workstreams progress           # ワークストリーム横断の進捗概要
/gsd-workstreams complete backend-api  # 完了したワークストリームをアーカイブ
/gsd-workstreams resume backend-api    # ワークストリームでの作業を再開
```

---

## 設定コマンド

### `/gsd-settings`

ワークフロートグルとモデルプロファイルの対話的な設定。

```bash
/gsd-settings                       # 対話型設定
```

### `/gsd-set-profile`

クイックプロファイル切り替え。

| 引数 | 必須 | 説明 |
|----------|----------|-------------|
| `profile` | **はい** | `quality`、`balanced`、`budget`、または `inherit` |

```bash
/gsd-set-profile budget             # budgetプロファイルに切り替え
/gsd-set-profile quality            # qualityプロファイルに切り替え
```

---

## ブラウンフィールドコマンド

## アップデートコマンド

### `/gsd-update`

変更履歴のプレビュー付きでGSDをアップデートします。

```bash
/gsd-update                         # アップデートを確認してインストール
```

### `/gsd-reapply-patches`

GSDアップデート後にローカルの変更を復元します。

```bash
/gsd-reapply-patches                # ローカルの変更をマージバック
```

---

## 高速＆インラインコマンド

## コード品質コマンド

### `/gsd-review`

外部AI CLIからのフェーズプランのクロスAIピアレビュー。

| 引数 | 必須 | 説明 |
|----------|----------|-------------|
| `--phase N` | **はい** | レビューするフェーズ番号 |

| フラグ | 説明 |
|------|-------------|
| `--gemini` | Gemini CLIレビューを含める |
| `--claude` | Claude CLIレビューを含める（別セッション） |
| `--codex` | Codex CLIレビューを含める |
| `--coderabbit` | CodeRabbitレビューを含める |
| `--opencode` | OpenCodeレビューを含める（GitHub Copilot経由） |
| `--qwen` | Qwen Codeレビューを含める（Alibaba Qwenモデル） |
| `--cursor` | Cursorエージェントレビューを含める |
| `--all` | 利用可能なすべてのCLIを含める |

**生成物:** `{phase}-REVIEWS.md` — `/gsd-plan-phase --reviews` で利用可能

```bash
/gsd-review --phase 3 --all
/gsd-review --phase 2 --gemini
```

---

### `/gsd-pr-branch`

`.planning/` のコミットをフィルタリングしてクリーンなPRブランチを作成します。

| 引数 | 必須 | 説明 |
|----------|----------|-------------|
| `target branch` | いいえ | ベースブランチ（デフォルト: `main`） |

**目的:** レビュアーにはコード変更のみを表示し、GSD計画アーティファクトは含めません。

```bash
/gsd-pr-branch                     # mainに対してフィルタリング
/gsd-pr-branch develop             # developに対してフィルタリング
```

## バックログ＆スレッドコマンド

## コミュニティコマンド

### `/gsd-join-discord`

Discordコミュニティの招待を開きます。

```bash
/gsd-join-discord
```
