# 持ち物のドット絵

全20種の持ち物と「なし」の21セル。オリジナルの48×48ピクセルの透明背景画像です。

- `items-v1.png`：6列×4行、288×192ピクセル。
- `atlas.json`：セルの順番と大きさ。index.html の ITEM_ICON_KEYS と一致させます。
- 再生成：Pillow を導入した開発環境で `python scripts/draw-items.py`。ゲーム自体にPythonは不要です。

装備選択は72px、編成カードは32px、戦闘中の幻獣詳細は72pxで表示。CSSのimage-rendering:pixelatedを使用します。アイコンは名前と併記し、装飾としてaria-hiddenにしています。ゲームの乱数・持ち物の効果・編成保存形式には影響しません。
