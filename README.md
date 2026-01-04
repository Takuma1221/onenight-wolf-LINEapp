# 🐺 ワンナイト人狼 LINE Bot

LINE Botで動作するワンナイト人狼ゲームシステムです。

## 📋 できること

### ゲーム機能
- **ワンナイト人狼**の完全自動進行
- **3〜8人**でプレイ可能
- **ランダム役職配分**（人狼、占い師、市民）
- **場札システム**（プレイヤー数+2枚のカード構成）
- **自動タイマー管理**（夜フェーズ、議論フェーズ）
- **投票システム**と**結果判定**

### 役職
- **人狼** - 人狼チーム。自分以外が追放されれば勝利
- **占い師** - 市民チーム。1人を占い、人狼か否かを知る
- **市民** - 市民チーム。特殊能力なし

### ゲームフロー
1. **参加募集** - GMが「ゲーム開始」でルーム作成、参加者がボタンで参加
2. **募集終了** - GMが「募集終了」で確定
3. **自動配役** - 参加者数に応じた役職をランダム配分
4. **夜フェーズ** - 占い師が占い対象を選択（30秒）
5. **議論フェーズ** - 全員で議論（5分、延長可能）
6. **投票フェーズ** - 追放者を投票
7. **結果発表** - 勝敗判定と役職公開

### テスト機能
- **ダミープレイヤー**機能で1人でもテスト可能
- `テスト開始 5` で5人プレイをシミュレート

## 🏗️ システム構成

### 技術スタック
- **Next.js 16** (App Router)
- **TypeScript 5**
- **Prisma 6** (ORM)
- **MySQL** (データベース)
- **LINE Messaging API** (@line/bot-sdk)
- **Tailwind CSS 4**

### データベース (MySQL)

#### テーブル構成

**Room** - ゲームルーム
```prisma
model Room {
  id        String   @id           // ルームID
  mode      String   @default("onenight")  // ゲームモード（固定）
  status    String                 // recruiting/night/day/voting/finished
  createdAt DateTime @default(now())
}
```

**Player** - プレイヤー情報
```prisma
model Player {
  id          Int      @id @default(autoincrement())
  lineUserId  String                // LINE ユーザーID
  displayName String                // 表示名
  roomId      String                // 所属ルームID
  role        String?               // 役職（人狼/占い師/市民）
  alive       Boolean  @default(true)
  createdAt   DateTime @default(now())
}
```

**Vote** - 投票記録
```prisma
model Vote {
  id        Int      @id @default(autoincrement())
  roomId    String                  // ルームID
  voter     String                  // 投票者のlineUserId
  target    String                  // 投票先のlineUserId
  createdAt DateTime @default(now())
}
```

### ディレクトリ構造

```
wolf-nextjs/
├── app/
│   ├── api/webhook/
│   │   └── route.ts          # LINE Webhook エンドポイント
│   ├── globals.css           # グローバルスタイル
│   ├── layout.tsx            # レイアウト
│   └── page.tsx              # トップページ（説明のみ）
├── lib/
│   ├── game/
│   │   ├── actionHandlers.ts      # 占い・投票処理
│   │   ├── assignmentHandlers.ts  # 役職配分処理
│   │   ├── controlHandlers.ts     # GM制御（募集終了等）
│   │   ├── gameHandlers.ts        # ゲーム開始・終了
│   │   ├── gameState.ts           # ゲーム状態管理
│   │   ├── lineClient.ts          # LINE API クライアント
│   │   ├── phaseHandlers.ts       # フェーズ管理
│   │   ├── resultHandlers.ts      # 結果判定
│   │   └── types.ts               # 型定義
│   ├── prisma.ts              # Prisma クライアント
│   └── roleDistribution.ts    # 役職配分ロジック
└── prisma/
    └── schema.prisma          # データベーススキーマ
```

## 🚀 セットアップ

### 必要なもの
- Node.js 20以上
- MySQL 8.0以上
- LINE Developers アカウント
- ngrok（ローカル開発時）

### 1. 環境変数設定

`.env` ファイルを作成：

```bash
# LINE Messaging API
LINE_CHANNEL_ACCESS_TOKEN=your_channel_access_token
LINE_CHANNEL_SECRET=your_channel_secret

# Database
DATABASE_URL="mysql://user:password@localhost:3306/wolf_game"
```

### 2. データベース準備

```bash
# Prisma マイグレーション実行
npx prisma migrate dev

# または既存DBに同期
npx prisma db push
```

### 3. 依存関係インストール

```bash
npm install
```

### 4. 開発サーバー起動

```bash
npm run dev
```

## 🌐 ngrok でローカルテスト

ローカル環境でLINE Webhookを受信するには**ngrok**を使用します。

### ngrok とは
- ローカルサーバーを一時的にインターネットに公開するツール
- HTTPSのURLを自動生成してくれる
- LINE Messaging APIはHTTPSが必須なため必要

### 使い方

1. **ngrokをインストール**
   ```bash
   brew install ngrok
   # または https://ngrok.com/download
   ```

2. **ngrokを起動**（別ターミナルで）
   ```bash
   ngrok http 3000
   ```

3. **表示されたURLをコピー**
   ```
   Forwarding  https://xxxx-xx-xx-xxx-xxx.ngrok-free.app -> http://localhost:3000
   ```

4. **LINE Developers で Webhook URL を設定**
   ```
   https://xxxx-xx-xx-xxx-xxx.ngrok-free.app/api/webhook
   ```

5. **Webhook を有効化**して、Botアカウントを友だち追加

### 注意点
- ngrokの無料版はセッション終了時にURLが変わります
- 変更後は毎回LINE DevelopersでWebhook URLを更新する必要があります
- 本番環境では固定のドメインを使用してください

## 🎮 使い方

### 基本的な流れ

1. **LINE Botを友だち追加**

2. **GMがゲーム開始**
   ```
   ゲーム開始
   ```

3. **参加者が参加ボタンをタップ**
   - 表示される「参加する」ボタンを押す

4. **GMが募集を締め切り**
   ```
   募集終了
   ```

5. **GMがゲーム開始ボタンをタップ**
   - 自動的に役職が配分される
   - 各プレイヤーに個別メッセージで役職が通知される

6. **夜フェーズ（30秒）**
   - 占い師のみ、占い対象を選択

7. **議論フェーズ（5分）**
   - 全員で自由に議論
   - GMが「延長」で1分追加可能
   - GMが「議論終了」で強制終了も可能

8. **投票フェーズ**
   - ボタンで追放したい人を選択
   - 全員投票後、自動的に結果発表

9. **結果発表**
   - 投票結果と勝敗判定
   - 全員の役職が公開される

### テストプレイ

1人でテストする場合：

```
テスト開始 5
```
- ダミープレイヤー4人が自動追加される
- 通常と同じフローで進行（ダミーは自動行動なし）

### GM専用コマンド

- `ゲーム開始` - 新規ルーム作成
- `募集終了` - 参加者確定
- `延長` / `時間延長` - 議論時間を1分延長
- `議論終了` - 議論を強制終了して投票へ
- `ゲーム終了` - ゲームを強制終了
- `テスト開始 [人数]` - テストモード起動

## 📝 コードの主要ポイント

### ゲーム状態管理
```typescript
// メモリ内でゲーム状態を管理
export const activeRooms = new Map<string, RoomData>();
export const roleAssignments = new Map<string, Map<string, Role>>();
```

### Webhookハンドラー
```typescript
// app/api/webhook/route.ts
// LINEからのイベントを受信し、適切なハンドラーに振り分け
```

### 役職配分ロジック
```typescript
// lib/roleDistribution.ts
// プレイヤー数に応じた最適な役職構成を自動選択
// Fisher-Yatesアルゴリズムでシャッフル
```

### タイマー管理
```typescript
// lib/game/phaseHandlers.ts
// setTimeout で自動フェーズ遷移
// clearTimeout でキャンセル可能
```

## 🔧 カスタマイズ

### タイマー時間の変更

**夜フェーズ**（`lib/game/phaseHandlers.ts`）
```typescript
const NIGHT_DURATION = 30 * 1000; // 30秒
```

**議論フェーズ**（`lib/game/phaseHandlers.ts`）
```typescript
const DISCUSSION_DURATION = 5 * 60 * 1000; // 5分
```

### 役職構成の変更

`lib/roleDistribution.ts` の `ROLE_DISTRIBUTIONS` を編集：

```typescript
export const ROLE_DISTRIBUTIONS = {
  3: { '人狼': 1, '占い師': 1, '市民': 3 },
  // 人数ごとにカスタマイズ可能
};
```

## 🐛 トラブルシューティング

### Webhookが届かない
- ngrokが起動しているか確認
- LINE DevelopersでWebhook URLが正しいか確認
- Webhookが有効化されているか確認

### データベース接続エラー
- MySQLが起動しているか確認
- DATABASE_URLが正しいか確認
- `npx prisma db push` を実行

### タイマーが動かない
- サーバーが再起動していないか確認（メモリ内状態がリセットされる）
- 本番環境では永続化されたタイマーシステムの実装を推奨

## 📄 ライセンス

MIT License

---

**開発:** ワンナイト人狼ゲームシステム  
**バージョン:** 1.0.0  
**最終更新:** 2026年1月
