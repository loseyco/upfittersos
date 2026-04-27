import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'UpfittersOS',
        short_name: 'Upfitters',
        description: 'Premium Operating System for Vehicle Upfitters',
        theme_color: '#121826',
        icons: [
          {
            src: '/favicon.png', // Generated UpfittersOS Icon
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: '/favicon.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
  server: {
    port: 4010,
    strictPort: true, // Fail if port is in use so we don't unexpectedly jump to another
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    }
  }
})

// Trigger Vite Restart due to new dependencies (Sonner)
