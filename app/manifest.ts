import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ХЕ.СЧЁТ — калькулятор хлебных единиц",
    short_name: "ХЕ.СЧЁТ",
    description:
      "Приблизительный расчёт ХЕ по фото или текстовому описанию через Gemini.",
    start_url: "/",
    display: "standalone",
    background_color: "#f4efe5",
    theme_color: "#f4efe5",
    orientation: "portrait-primary",
    lang: "ru",
    categories: ["health", "utilities"],
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
