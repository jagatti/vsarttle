# arttle

PS2「ラクガキ王国」風の 1vs1 オンライン対戦ゲームです。自分で描いた絵からステータスを算出し、WebRTC DataChannel で対戦します。

## 構成

- `/frontend`: Next.js (App Router) + Canvas API + PeerJS (P2P シグナリング)
- `/signaling-server`: Node.js + WebSocket シグナリング（ローカル開発用。本番は不要）

## 主な仕様

- 6桁ルーム番号を発行し、マッチング前は100秒で期限切れ
- 300秒おえかき（完成ボタンで早期確定、時間切れで自動確定）
- 絵のピクセル解析（サイズ・色数・線距離・色傾向）でステータス算出
- 5秒制限の同時行動ターン制バトル（未選択時は自動選択）
- 行動: こうげき / 弱まほう(最大PP20%) / 強まほう(最大PP40%) / バリア / チャージ
- 前ターンの同カテゴリ行動は選択不可、PP不足のまほうは選択不可
- P2P切断時は30秒猶予後に敗北扱い

## 遊び方（Vercel デプロイ済みの場合）

1. **URL を開く** → `https://vsarttle.vercel.app/`
2. **ニックネームを入力 → 「ルーム作成」ボタン**
3. **表示された 6 桁のルーム番号を友達に教える**
4. **友達も同じ URL でルーム番号を入力 → 「入室」ボタン**

> シグナリングサーバーの設定は一切不要です。[PeerJS](https://peerjs.com/) の無料クラウドサーバー経由で P2P 接続を確立します。

## ローカル開発

```bash
cd frontend
npm install
npm run dev
```

ブラウザで `http://localhost:3000` を開き、別タブで同ルーム番号に参加すると 1vs1 対戦できます。

> **注意:** 別タブ間の WebRTC DataChannel は同一ブラウザでは動作しない場合があります。別ブラウザまたは別デバイスで試してください。

### シグナリングサーバー（オプション・ローカルのみ）

```bash
cd signaling-server
npm install
npm run dev
```

デフォルト `ws://localhost:8080` で起動します。フロントエンドからは環境変数で切り替え可能ですが、本番環境では不要です。

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

## デプロイ（Vercel）

1. [Vercel](https://vercel.com/) でリポジトリをインポートする
2. **Project Settings > General > Root Directory** に **`frontend`** を入力して「Save」をクリックする
   > ここを設定しないと "No Next.js version detected" エラーが発生します
3. 「Deployments」タブから「Redeploy」を実行する（または `main` ブランチへ push する）

> **環境変数は一切不要**。`NEXT_PUBLIC_SIGNALING_SERVER_URL` を設定しなくても動作します。
