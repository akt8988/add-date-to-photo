import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const base = process.env.BASE_PATH || "/";

export default defineConfig({
  base,
  worker: {
    format: "es",
  },
  optimizeDeps: {
    exclude: ["heic-to"],
  },
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      devOptions: { enabled: false },
      includeAssets: ["favicon.svg", "apple-touch-icon.png", "pwa-192.png", "pwa-512.png"],
      manifest: {
        name: "写真一括日付スタンプ",
        short_name: "日付スタンプ",
        description: "クォーツデート風の日付を写真に焼き込みます",
        lang: "ja",
        display: "standalone",
        start_url: base,
        scope: base,
        theme_color: "#000000",
        background_color: "#000000",
        icons: [
          {
            src: "pwa-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "pwa-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "pwa-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: [
          "**/*.{css,html,woff2,otf,svg,png,ico,webmanifest}",
          "assets/index-*.js",
        ],
        globIgnores: ["**/worker-*.js"],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
});
