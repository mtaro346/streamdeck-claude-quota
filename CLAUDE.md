# streamdeck-claude-quota

project_stage: internal

自分専用だが日常的に使う Stream Deck プラグイン。外部ユーザーはいない。

## データソースの制約（重要）

`/api/oauth/usage` は**アカウント単位でレート制限**されており（実測で概ね 30 req/h）、この枠は
Claude Code CLI 本体や CodexBar など、同じエンドポイントを読む他のツールと共有される。
特に **`claude` を起動するだけでこの枠を 1 消費する**。

そのため:

- Fable（model-scoped weekly）は**この API からしか取れない**。TUI パース側は `fablePercent: null` 固定。
  CLI の `/usage` 画面でも per-model は同じ壁に当たり "Per-model breakdown unavailable (rate limited)" になる。
- 429 を受けたら **TUI フォールバックを走らせてはいけない**。`claude` 起動が枠をさらに消費し、
  失敗するほどリクエストが増える自己増殖ループになる（2026-08-03〜04 に実際に発生し、4日間 429 が解けなかった）。
- ポーリング間隔には `MIN_POLL_SECONDS`（300秒）の下限がある。UI の下限だけでなく `resolveSettings` で
  クランプしているので、古いプロファイルが 60 秒を持っていても枠を割らない。
