export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
      <main className="flex flex-col items-center justify-center gap-8 p-8 text-center">
        <h1 className="text-4xl font-bold text-zinc-900 dark:text-zinc-50">
          🐺 ワンナイト人狼 Bot
        </h1>
        <p className="text-lg text-zinc-600 dark:text-zinc-400">
          LINE Botで動作するワンナイト人狼ゲームシステム
        </p>
        <div className="rounded-lg bg-zinc-100 dark:bg-zinc-900 p-6 max-w-md">
          <h2 className="text-xl font-semibold mb-4 text-zinc-900 dark:text-zinc-50">
            ご利用方法
          </h2>
          <div className="space-y-3 text-left">
            <p className="text-sm text-zinc-700 dark:text-zinc-300">
              <span className="font-bold text-zinc-900 dark:text-zinc-50">1. まずBotを友だち登録してください</span><br />
              LINEアプリでQRコードを読み取るか、Bot IDを検索して友だち追加してください。
            </p>
            <p className="text-sm text-zinc-700 dark:text-zinc-300">
              <span className="font-bold text-zinc-900 dark:text-zinc-50">2. グループに招待</span><br />
              友だち登録後、Botをグループに招待してゲームを開始できます。
            </p>
            <p className="text-sm text-zinc-700 dark:text-zinc-300">
              <span className="font-bold text-zinc-900 dark:text-zinc-50">3. 「ゲーム開始」と送信</span><br />
              グループで「ゲーム開始」と送るとゲームが始まります。
            </p>
            <p className="text-sm text-zinc-700 dark:text-zinc-300">
              <span className="font-bold text-zinc-900 dark:text-zinc-50">� 設定コマンド</span><br />
              GMが「設定」と送ると、夜フェーズの時間（30〜90秒）を変更できます。デフォルトは45秒です。
            </p>
            <p className="text-sm text-zinc-700 dark:text-zinc-300">
              <span className="font-bold text-zinc-900 dark:text-zinc-50">💬 便利なコマンド</span><br />
              議論フェーズ中に「残り時間」「時間」「残り」のいずれかを送ると、残り時間を確認できます。
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
