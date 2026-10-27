# genju-battle

**[最新版で遊ぶ — 幻獣闘記](https://kpkarin.github.io/genju-battle/)**

18体の幻獣から三体を選び、四つの技・特性・装備を組み合わせるターン制バトルゲームです。AI戦と、合言葉を使う友だち対戦に対応しています。

- 手持ちカードの「技・特性・装備」で設定ウィンドウを開きます。
- 幻獣図鑑のカードを押すと、能力・役割・特性を確認して編成へ追加できます。
- 「編成の記録」で3つの保存枠を使用できます。編集中の内容は同じブラウザへ自動保存します。
- 戦闘中は四つの技の下に「気を溜める」と「幻獣」を表示します。「幻獣」から双方の一覧と交代を操作できます。
- 一覧の幻獣を長押しすると、特性・持ち物・能力値と能力変化を確認できます。「詳細」ボタンでも開けます。
- 音設定・遊び方・友だち対戦・ログ履歴は、必要なときだけ開けます。

ゲーム本体は `index.html`、音源は `assets/audio/` にあります。ビルド不要で、GitHub Pagesはmainブランチのルートを公開しています。ローカルでは `python3 -m http.server 8000` で配信できます。

## ドキュメント

- [物理・特殊と幻獣の役割](docs/battle-stats.md)
- [連続技・相性反転・身代わりの調整](docs/balance-update.md)
- [やせ我慢・滅びの唄・編成保存](docs/stoic-perish-storage.md)
- [技のモーション](docs/move-motions.md)
- [UIと操作の更新](docs/ui-overhaul.md)
- [スマホの戦闘画面・幻獣ウィンドウ](docs/compact-battle.md)

## 確認

Node.jsで `node tests/baseline.mjs` など `tests/` 内の各 `.mjs` を実行できます。ブラウザの表示・操作確認と、ゲームエンジンのVMテストは分けて記録しています。

## 音源

戦闘BGM「イクスゲイナー」／ [MusMus](https://musmus.main.jp/)

勝利音「Jingle#24」／ **BGM：hitoshi by Senses Circuit** ([Senses Circuit](https://www.senses-circuit.com/))
