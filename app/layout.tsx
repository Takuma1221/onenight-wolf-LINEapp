import './globals.css';
import type { Metadata } from 'next';
import { Shippori_Mincho } from 'next/font/google';

const shippori = Shippori_Mincho({
  weight: ['400', '600', '800'],
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: '人狼ゲーム',
  description: 'LINE Bot 人狼ゲーム',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja" className={shippori.className}>
      <body className="bg-[#050a14] text-[#e0e0e0] min-h-screen flex justify-center">
        <div className="w-full max-w-[480px] relative flex flex-col min-h-screen">
          {children}
        </div>
      </body>
    </html>
  );
}
