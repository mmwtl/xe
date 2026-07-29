import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { PwaRegister } from "./components/pwa-register";
import "./globals.css";

export const metadata: Metadata = {
  title: "ХЕ.СЧЁТ — локальный калькулятор",
  description:
    "Приблизительный расчёт хлебных единиц по фото или описанию с помощью Gemini.",
  applicationName: "ХЕ.СЧЁТ",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "ХЕ.СЧЁТ",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f4efe5",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
