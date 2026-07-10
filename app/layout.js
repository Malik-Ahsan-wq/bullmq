import { Inter } from "next/font/google";
import "./globals.css";
import FcmToast from "./components/FcmToast";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata = {
  title: "Todo List with BullMQ",
  description: "A Next.js todo list with Redis and BullMQ email queue",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        {children}
        <FcmToast />
      </body>
    </html>
  );
}
