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
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            このアプリケーションはLINE Webhook専用です。<br />
            LINEアプリから友達追加してご利用ください。
          </p>
        </div>
      </main>
    </div>
  );
}
