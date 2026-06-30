import "./globals.css";

export const metadata = {
  title: "Todo List with BullMQ",
  description: "A Next.js todo list with Redis and BullMQ email queue",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
