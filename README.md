# arttle

PS2「ラクガキ王国」風の 1vs1 オンライン対戦ゲームです。自分で描いた絵からステータスを算出し、WebRTC DataChannel で対戦します。

## 構成

- `/frontend`: Next.js (App Router) + Canvas API
- `/signaling-server`: Node.js + WebSocket シグナリング

## 主な仕様

- 6桁ルーム番号を発行し、マッチング前は100秒で期限切れ
- 300秒おえかき（完成ボタンで早期確定、時間切れで自動確定）
- 絵のピクセル解析（サイズ・色数・線距離・色傾向）でステータス算出
- 5秒制限の同時行動ターン制バトル（未選択時は自動選択）
- 行動: こうげき / 弱まほう(最大PP20%) / 強まほう(最大PP40%) / バリア / チャージ
- 前ターンの同カテゴリ行動は選択不可、PP不足のまほうは選択不可
- P2P切断時は30秒猶予後に敗北扱い

## ローカル開発

### 1) シグナリングサーバー

```bash
cd signaling-server
npm install
npm run dev
```

デフォルト `ws://localhost:8080` で起動します。

### 2) フロントエンド

```bash
cd frontend
cp .env.local.example .env.local
npm install
npm run dev
```

`/frontend/.env.local`:

```env
NEXT_PUBLIC_SIGNALING_SERVER_URL=ws://localhost:8080
```

ブラウザで `http://localhost:3000` を開き、別タブで同ルーム番号に参加すると 1vs1 対戦できます。

## テスト / 検証

```bash
cd frontend
npm run test
npm run lint
npm run build
```

```bash
cd signaling-server
npm run build
```

## デプロイ

### フロントエンド（Vercel）

- プロジェクトルート: `frontend`
- 環境変数: `NEXT_PUBLIC_SIGNALING_SERVER_URL=wss://<signaling-domain>`

### シグナリングサーバー（Railway など）

- プロジェクトルート: `signaling-server`
- 起動コマンド: `npm run dev`（本番は `npm run build && npm run start` 推奨）
- 環境変数: `PORT`（プラットフォーム指定値）
