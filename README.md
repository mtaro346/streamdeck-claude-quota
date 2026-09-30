# Streamdeck Claude Quota

Claude Code の **5 時間ブロック**・**週次（Current week / all models）**・**モデル別週次（Fable など）**の使用率を、Stream Deck のキーに 3 段の横バーで並べて表示するローカルプラグイン。背面にはうっすら Claude ロゴのウォーターマークが入り、どのツールのクオータかひと目でわかる。

| 表示要素 | 内容 |
|---|---|
| 上段 `5H` | 5 時間ブロックの太いピル型バー。タイトル左寄せ・パーセント右寄せをバー内に大きく表示 |
| 中段 `7D` | 週次（全モデル）。同レイアウト |
| 下段 `F` | モデル別週次枠（usage API の `weekly_scoped`、Fable など）。枠がないプランでは `—` |
| 文字 | 25px の太字＋黒縁取り（二度描き方式。Stream Deck のレンダラは filter/tspan 非対応のため）。タイトルは各バー色の淡いトーン、%は白 |
| 色 | 5H=オレンジ `#d97757`、7D=アンバー `#e0a34e`、F=バイオレット `#a78bfa`。バーは半透明（トラック 50%／フィル 85%）で背面の Claude ロゴが透ける |
| 更新間隔 | 5 分（下限。**ボタン押下で即時更新**）。複数キー設置時はスナップショットを共有し API 負荷を増やさない |

リセットまでの残り時間はテキストでは非表示（データは取得済みで、`countdown` としてレンダラまで流れている）。

データソースは Claude Code の **OAuth usage API** のみ（トークンは Keychain の `Claude Code-credentials` から、`-a "$USER"` 指定 → アカウント指定なし → `~/.claude/.credentials.json` の順に探す）。`claude` CLI を起動するフォールバックは持たない（起動のたびに Claude 側の枠を消費するため。v0.6.0 で削除）。色・更新間隔は Property Inspector から変更可能。

## なぜ ccusage じゃないのか

`ccusage` の `--token-limit max` は過去の最大使用量を上限と仮定した推定値で、Anthropic 側の実際のクォーター上限とは無関係。実値が 5% でも 50% と表示するなど大幅にズレるため、当初は PTY scrape 方式を採った（[steipete/codexbar](https://github.com/steipete/codexbar) の `ClaudeStatusProbe.swift` と同じアプローチ）。

---

## インストール（ビルド不要・ダウンロードするだけ）

1. [**Releases ページ**](https://github.com/mtaro346/streamdeck-claude-quota/releases/latest)から `com.asuka.claude-quota.streamDeckPlugin` をダウンロード
2. ダウンロードしたファイルをダブルクリック → Stream Deck アプリのインストールダイアログ → 「Install」
3. Stream Deck アプリの右サイドバー → **Claude Quota** カテゴリ → **Claude Quota** を任意のキーにドラッグ
4. 数秒で最初の表示が出る

以降は 5 分ごとに自動更新。**キーを押すと即時更新**される。

### アップデート方法

新しいバージョンの `.streamDeckPlugin` をダブルクリックするだけ（上書きインストールされる）。

### うまく表示されないとき

- キーに `ERR` が出る → Claude Code にログインしているか確認。OAuth トークンが期限切れの間は取得しない（Claude Code を一度使えば CLI 側が更新する）
- 表示が止まった/おかしい → [Issues](https://github.com/mtaro346/streamdeck-claude-quota/issues) へ報告を。ログは `~/Library/Application Support/com.elgato.StreamDeck/Plugins/com.asuka.claude-quota.sdPlugin/logs/` で確認できる

### 動作要件

- macOS 12+
- Stream Deck アプリ 6.5+
- Claude Code にログイン済み（Keychain の `Claude Code-credentials`、または `~/.claude/.credentials.json` に OAuth トークンがある状態）

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

ランタイム依存はゼロ。

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
- `imgs/`（Claude マーク + Stream Deck 必須アイコン）

### 6. 開発時の SVG プレビュー

```bash
npm run preview          # 本番の svg-builder から /tmp/cq-*.svg を生成
```

`scripts/preview-all.mjs` は `src/svg-builder.ts` の `buildSvg` を直接呼ぶため、常に本番出力と一致する。PNG で確認するなら `rsvg-convert /tmp/cq-mid.svg -o /tmp/cq-mid.png` など。

---

## アーキテクチャ

```
[5 分ごと or ボタン押下]
    ↓
[usage-api.ts: Keychain（-a "$USER" 指定 → 指定なし）→ 認証情報ファイルの順に OAuth トークンを取得]
    ↓ GET https://api.anthropic.com/api/oauth/usage
[parseUsageApiResponse: 5H / 7D / モデル別週次（Fable）の percent / resetMinutes]
    ↓
[svg-builder.ts → 3 段横バーの SVG を生成]
    ↓
[action.setImage()]
```

429 を受けたら `backoff.ts` の `RateLimitGate` で一定時間取得を止め、直前の表示を残す。

## ファイル構成

```
streamdeck-claude-quota/
├── src/
│   ├── plugin.ts                             ← エントリポイント
│   ├── actions/claude-quota.ts               ← SingletonAction（ポーリング/スピナー/描画）
│   ├── probe.ts                              ← usage API 呼び出し + 429 時の一時停止
│   ├── usage-api.ts                          ← トークン取得・API 呼び出し・レスポンス解析
│   ├── backoff.ts                            ← 429 後の一時停止（RateLimitGate）
│   ├── format.ts                             ← 残り時間の整形
│   ├── settings.ts                           ← Property Inspector 設定の解決
│   └── svg-builder.ts                        ← 3 段横バーの SVG 生成
├── tests/                                    ← usage-api / backoff / format / settings / svg-builder
└── com.asuka.claude-quota.sdPlugin/          ← プラグイン本体（manifest / bin / ui / imgs）
```

## テスト

```bash
npm test                 # node --test（TypeScript 直読み）
```

`src` 内の `.js` 指定 import を `.ts` に解決するため `scripts/register-ts.mjs`（resolve フック）を `--import` している。

## ログ

- 共通ログ: `~/Library/Logs/ElgatoStreamDeck/StreamDeck.log`
- プラグイン専用: `~/Library/Application Support/com.elgato.StreamDeck/Plugins/com.asuka.claude-quota.sdPlugin/logs/com.asuka.claude-quota.0.log`

成功時の例:
```
2026-04-28T09:33:45Z INFO  updated: 5h=6% reset=3h 46m 7d=8%
```

## 既知の制約

- `/api/oauth/usage` の JSON は非公開仕様なので、将来変わる可能性がある
- OAuth トークンの更新は Claude Code 任せ。長時間 Claude Code を使わずトークンが切れている間は直前の表示のまま

## 更新履歴

| バージョン | 日付 | 内容 |
|---|---|---|
| v0.6.0 | 2026-09-30 | `claude` を PTY で起動する TUI フォールバックを削除（usage API のみ）。Keychain は Claude Code と同じ `-a "$USER"` の項目を優先して読む |
| v0.5.0 | 2026-07-23 | 5 時間ブロックに加え週次（Current week / all models）使用率も同一キーに 2 段横バーで表示。更新間隔を 5 分 → 1 分に短縮。`svg-builder` を全面刷新（縦ゲージ＋アイコンマスク → 横バー2段）、`format.ts` を日対応（`6d 3h`）に拡張、`format`/`svg-builder` テスト追加 |
| v0.4.0 | 2026-06-04 | Claude Code 2.1.x の TUI 描画変更（ESC[nG 絶対列指定）に対応。解析ロジックを `parse.ts` に分離しテスト追加。probe 高速化（~42s → ~13s）・タイムアウト拡大。ハードコードパス除去 |
| v0.3.0 | 2026-04-28 | 初版（PTY scrape 方式） |

## 謝辞

PTY scrape のアイデアは [steipete/codexbar](https://github.com/steipete/codexbar) から。Claude マークは [LobeHub icons](https://lobehub.com/icons/claude) のミラーから取得。

## ライセンス

MIT
