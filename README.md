# Streamdeck Claude Quota

Claude Code の 5 時間クォーター使用率を Stream Deck のキーに表示するローカルプラグイン。

| 表示要素 | 内容 |
|---|---|
| 中央 | Claude 公式ブランドマーク（オレンジ星型） |
| 上部 | パーセント表示（例 `6%`） |
| 下部 | 5h ブロックリセットまでの残り時間（例 `3h 46m`） |
| 背景 | 使用率に応じて下から上へオレンジバー |
| 更新間隔 | 5 分（**ボタン押下で即時更新**） |

データソースは `claude` CLI を PTY で起動して `/usage` コマンドを実行し、レンダリング結果をスクレイプ。**Claude Code の `/usage` と完全一致する値**が取れる。

## なぜ ccusage じゃないのか

`ccusage` の `--token-limit max` は過去の最大使用量を上限と仮定した推定値で、Anthropic 側の実際のクォーター上限とは無関係。実値が 5% でも 50% と表示するなど大幅にズレるため、PTY scrape 方式に変更した（[steipete/codexbar](https://github.com/steipete/codexbar) の `ClaudeStatusProbe.swift` と同じアプローチ）。

---

## エンドユーザー向けインストール

1. `com.asuka.claude-quota.streamDeckPlugin` を入手（リポジトリのリリース or `npm run pack` 成果物）
2. ファイルをダブルクリック → Stream Deck アプリのインストールダイアログ → 「Install」
3. Stream Deck アプリの右サイドバー → **Claude Quota** カテゴリ → **Claude 5h Quota** を任意のキーにドラッグ
4. 数秒〜10秒で最初の表示が出る（PTY 経由で `claude` を起動するため初回は時間がかかる）

### 動作要件

- macOS 12+（`/usr/bin/expect` 必須、macOS 標準同梱）
- Stream Deck アプリ 6.5+
- `claude` CLI が以下のいずれかにあること:
  - `~/.local/bin/claude`（Anthropic 公式インストーラのデフォルト）
  - `/opt/homebrew/bin/claude`
  - `/usr/local/bin/claude`
  - `PATH` 上のどこか
- Claude Code にログイン済み（`/usage` が動く状態）

Node や ccusage の追加インストールは不要。

---

## 開発者向けセットアップ

### 1. 依存解決

```bash
git clone <this-repo>
cd streamdeck-claude-quota
npm install              # dev tools のみ（rollup, typescript, @elgato/streamdeck）
```

ランタイム依存はゼロ。実行時は `expect` と `claude` CLI に依存するだけ。

### 2. ビルド

```bash
npm run build            # rollup で src/plugin.ts → com.asuka.claude-quota.sdPlugin/bin/plugin.js
```

`@elgato/streamdeck` は plugin.js にインライン化される。

### 3. Stream Deck にリンク

```bash
npx streamdeck dev
npm run link
npm run restart
```

### 4. ホットリロード開発

```bash
npm run watch            # rollup -w + 自動 streamdeck restart
```

### 5. 配布パッケージ生成

```bash
npm run pack             # → com.asuka.claude-quota.streamDeckPlugin (約 120KB)
```

中身:
- `manifest.json`
- `bin/plugin.js`（rollup でバンドル済み、~94KB）
- `scripts/probe-usage.exp`（expect スクリプト）
- `imgs/`（Claude マーク + Stream Deck 必須アイコン）

### 6. 開発時の SVG プレビュー

```bash
node scripts/preview.mjs
```

ただし `scripts/preview.mjs` は ccusage ベースで残してあり、現バージョンの probe とは別経路。SVG のレイアウト確認用途のみ。

---

## アーキテクチャ

```
[5 分ごと or ボタン押下]
    ↓
[expect が claude CLI を PTY で起動]
    ↓ "/usage" を送信
[Claude Code が Anthropic API を叩いて表示]
    ↓ PTY 出力をキャプチャ
[probe.ts がプロセス管理、parse.ts が ANSI 除去 + 正規表現で抽出]
    ↓ percent / resetText / resetMinutes
[svg-builder.ts → 動的 SVG 生成]
    ↓ data:image/svg+xml;base64,...
[action.setImage()]
    ↓
[Stream Deck Plus XL のキー]
```

PTY 経由で `claude` を毎回新規起動するため、1 回の取得に約 10 秒かかる。これが 5 分間隔ポーリングを採用する理由。

## ファイル構成

```
streamdeck-claude-quota/
├── package.json                              ← dev tools のみ
├── tsconfig.json
├── rollup.config.mjs
├── README.md
├── src/                                      ← TypeScript ソース
│   ├── plugin.ts                             ← エントリポイント
│   ├── actions/claude-quota.ts               ← SingletonAction + setInterval(5min)
│   ├── probe.ts                              ← expect プロセスの起動・タイムアウト・リトライ管理
│   ├── parse.ts                              ← ANSI 除去 + /usage 出力の解析（純粋関数、単体テスト対象）
│   ├── settings.ts                           ← Property Inspector 設定の解決
│   └── svg-builder.ts                        ← 動的 SVG 生成
├── tests/
│   ├── parse.test.ts                         ← node:test による解析テスト
│   └── fixtures/usage-cc-2.1.162.raw         ← 実機キャプチャ（ANSI 生出力）
└── com.asuka.claude-quota.sdPlugin/          ← プラグイン本体（self-contained）
    ├── manifest.json                         ← Stream Deck メタデータ
    ├── package.json                          ← {} 同然（ランタイム依存ゼロ）
    ├── bin/plugin.js                         ← rollup 成果物
    ├── scripts/probe-usage.exp               ← PTY scrape 用 expect スクリプト
    ├── ui/inspector.html                     ← Property Inspector
    └── imgs/                                 ← Claude マーク + Stream Deck 必須アイコン
```

## テスト

```bash
node --test tests/
```

実機の PTY キャプチャ（`tests/fixtures/*.raw`）をフィクスチャにした解析テスト。Claude Code の UI 変更で解析が壊れた場合は、`scripts/probe-usage.exp` を手動実行して新しいキャプチャをフィクスチャに追加 → テストで RED を確認 → `src/parse.ts` を修正、の流れで直す。

## ログ

- 共通ログ: `~/Library/Logs/ElgatoStreamDeck/StreamDeck.log`
- プラグイン専用: `~/Library/Application Support/com.elgato.StreamDeck/Plugins/com.asuka.claude-quota.sdPlugin/logs/com.asuka.claude-quota.0.log`

成功時の例:
```
2026-04-28T09:33:45Z INFO  updated: 5h=6% reset=3h 46m 7d=8%
```

## 既知の制約

- **macOS 専用**（Windows は `expect` が標準同梱でないため）。Windows 対応するなら `node-pty` 等への置き換えが必要
- **初回・各更新ごとに ~13秒**（claude CLI の起動時間）
- claude のターミナル UI が変わると解析が壊れる可能性あり（codexbar も同じリスク）

### 実際に壊れた例: Claude Code 2.1.x（2026-05-19頃）

CC 2.1.x で TUI レンダラーが相対カーソル移動（`ESC[nC`）から**絶対列指定（`ESC[nG`）**に変わり、単語間がスペースではなく `ESC[nG` で描画されるようになった（例: `Esc\x1b[7Gto\x1b[10Gcancel`）。これにより:

1. expect スクリプトの `"Esc to cancel"` 照合が永久に不一致 → タイムアウト
2. ANSI 除去時に単語が連結（`Currentsession`）→ 正規表現が不一致

2026-06-04 修正済み（`ESC[nG` → スペース変換、expect 照合の緩和、タイムアウト 35s → 75s）。同種の破損が起きたら上記「テスト」のフローで対処。

## 謝辞

PTY scrape のアイデアは [steipete/codexbar](https://github.com/steipete/codexbar) から。Claude マークは [LobeHub icons](https://lobehub.com/icons/claude) のミラーから取得。

## ライセンス

MIT
