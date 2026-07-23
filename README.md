# Streamdeck Claude Quota

Claude Code の **5 時間ブロック**・**週次（Current week / all models）**・**モデル別週次（Fable など）**の使用率を、Stream Deck のキーに 3 段の横バーで並べて表示するローカルプラグイン。背面にはうっすら Claude ロゴのウォーターマークが入り、どのツールのクオータかひと目でわかる。

| 表示要素 | 内容 |
|---|---|
| 上段 `5H` | 5 時間ブロックの太いピル型バー。タイトル左寄せ・パーセント右寄せをバー内に大きく表示 |
| 中段 `7D` | 週次（全モデル）。同レイアウト |
| 下段 `F` | モデル別週次枠（usage API の `weekly_scoped`、Fable など）。枠がないプランでは `—` |
| 文字 | 25px の太字＋黒縁取り（二度描き方式。Stream Deck のレンダラは filter/tspan 非対応のため）。タイトルは各バー色の淡いトーン、%は白 |
| 色 | 5H=オレンジ `#d97757`、7D=アンバー `#e0a34e`、F=バイオレット `#a78bfa`。バーは半透明（トラック 50%／フィル 85%）で背面の Claude ロゴが透ける |
| 更新間隔 | 1 分（**ボタン押下で即時更新**）。複数キー設置時はスナップショットを共有し API 負荷を増やさない |

リセットまでの残り時間はテキストでは非表示（データは取得済みで、`countdown` としてレンダラまで流れている）。

データソースは 2 系統。一次ソースは Claude Code の **OAuth usage API**（Keychain の `Claude Code-credentials` トークンを利用。Fable 専用枠はここからのみ取得可能）。API が失敗（429 など）した場合は従来どおり `claude` CLI を PTY で起動して `/usage` をスクレイプするフォールバックが動く。色・更新間隔は Property Inspector から変更可能。

## なぜ ccusage じゃないのか

`ccusage` の `--token-limit max` は過去の最大使用量を上限と仮定した推定値で、Anthropic 側の実際のクォーター上限とは無関係。実値が 5% でも 50% と表示するなど大幅にズレるため、PTY scrape 方式に変更した（[steipete/codexbar](https://github.com/steipete/codexbar) の `ClaudeStatusProbe.swift` と同じアプローチ）。

---

## インストール（ビルド不要・ダウンロードするだけ）

1. [**Releases ページ**](https://github.com/mtaro346/streamdeck-claude-quota/releases/latest)から `com.asuka.claude-quota.streamDeckPlugin` をダウンロード
2. ダウンロードしたファイルをダブルクリック → Stream Deck アプリのインストールダイアログ → 「Install」
3. Stream Deck アプリの右サイドバー → **Claude Quota** カテゴリ → **Claude Quota** を任意のキーにドラッグ
4. 10〜15秒ほどで最初の表示が出る（PTY 経由で `claude` を起動するため取得に時間がかかる）

以降は 1 分ごとに自動更新。**キーを押すと即時更新**される。

### アップデート方法

新しいバージョンの `.streamDeckPlugin` をダブルクリックするだけ（上書きインストールされる）。

### うまく表示されないとき

- キーに `ERR` が出る → `claude` CLI にログインしているか確認（ターミナルで `claude` を起動して `/usage` が表示されるか）
- 表示が止まった/おかしい → Claude Code のアップデートで UI が変わった可能性。[Issues](https://github.com/mtaro346/streamdeck-claude-quota/issues) へ報告を。ログは `~/Library/Application Support/com.elgato.StreamDeck/Plugins/com.asuka.claude-quota.sdPlugin/logs/` で確認できる

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

> **開発環境要件**: Node.js **22.6.0 以上**。`npm test` / `npm run preview` は `node --experimental-strip-types` で TypeScript を直読みするため（この機能は Node 22.6.0 で追加。Node 20 や 22.5 以下では不可）。なお**プラグイン実行時**は rollup でバンドル済みの `bin/plugin.js` を Stream Deck 同梱の Node 20 が実行するので、配布・実行時の要件は変わらない。

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
npm run preview          # 本番の svg-builder から /tmp/cq-*.svg を生成
```

`scripts/preview-all.mjs` は `src/svg-builder.ts` の `buildSvg` を直接呼ぶため、常に本番出力と一致する。PNG で確認するなら `rsvg-convert /tmp/cq-mid.svg -o /tmp/cq-mid.png` など。

---

## アーキテクチャ

```
[1 分ごと or ボタン押下]
    ↓
[expect が claude CLI を PTY で起動]
    ↓ "/usage" を送信
[Claude Code が Anthropic API を叩いて表示]
    ↓ PTY 出力をキャプチャ
[probe.ts がプロセス管理、parse.ts が ANSI 除去 + 正規表現で抽出]
    ↓ session/weekly の percent / resetText / resetMinutes
[svg-builder.ts → 2 段横バーの SVG を生成]
    ↓ data:image/svg+xml;base64,...
[action.setImage()]
    ↓
[Stream Deck Plus XL のキー]
```

PTY 経由で `claude` を毎回新規起動するため、1 回の取得に約 10〜13 秒（最悪 ~65 秒）かかる。更新間隔は 1 分だが、`inFlight` ガードで多重起動を防いでいるため、取得が長引いた場合はその周期の tick はスキップされる。

## ファイル構成

```
streamdeck-claude-quota/
├── package.json                              ← dev tools のみ
├── tsconfig.json
├── rollup.config.mjs
├── README.md
├── src/                                      ← TypeScript ソース
│   ├── plugin.ts                             ← エントリポイント
│   ├── actions/claude-quota.ts               ← SingletonAction + setInterval(1min)
│   ├── probe.ts                              ← expect プロセスの起動・タイムアウト・リトライ管理
│   ├── parse.ts                              ← ANSI 除去 + /usage 出力の解析（純粋関数、単体テスト対象）
│   ├── format.ts                             ← 残り時間の整形（session=時分 / weekly=日時、純粋関数）
│   ├── settings.ts                           ← Property Inspector 設定の解決
│   └── svg-builder.ts                        ← 2 段横バーの SVG 生成
├── tests/
│   ├── parse.test.ts                         ← node:test による解析テスト
│   ├── format.test.ts                        ← 残り時間整形のテスト
│   ├── svg-builder.test.ts                   ← SVG 出力のスモークテスト
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
npm test                 # node --test（TypeScript 直読み）
```

`node` の型ストリップで `.ts` を直接テストする。`src` 内の `.js` 指定 import を `.ts` に解決するため `scripts/register-ts.mjs`（resolve フック）を `--import` している。実機の PTY キャプチャ（`tests/fixtures/*.raw`）をフィクスチャにした解析テストに加え、`format` / `svg-builder` の単体テストを含む。Claude Code の UI 変更で解析が壊れた場合は、`scripts/probe-usage.exp` を手動実行して新しいキャプチャをフィクスチャに追加 → テストで RED を確認 → `src/parse.ts` を修正、の流れで直す。

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

## 更新履歴

| バージョン | 日付 | 内容 |
|---|---|---|
| v0.5.0 | 2026-07-23 | 5 時間ブロックに加え週次（Current week / all models）使用率も同一キーに 2 段横バーで表示。更新間隔を 5 分 → 1 分に短縮。`svg-builder` を全面刷新（縦ゲージ＋アイコンマスク → 横バー2段）、`format.ts` を日対応（`6d 3h`）に拡張、`format`/`svg-builder` テスト追加 |
| v0.4.0 | 2026-06-04 | Claude Code 2.1.x の TUI 描画変更（ESC[nG 絶対列指定）に対応。解析ロジックを `parse.ts` に分離しテスト追加。probe 高速化（~42s → ~13s）・タイムアウト拡大。ハードコードパス除去 |
| v0.3.0 | 2026-04-28 | 初版（PTY scrape 方式） |

## 謝辞

PTY scrape のアイデアは [steipete/codexbar](https://github.com/steipete/codexbar) から。Claude マークは [LobeHub icons](https://lobehub.com/icons/claude) のミラーから取得。

## ライセンス

MIT
