import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'fs'
import path from 'path'

// Generate a unified version timestamp for cache-burst polling
const version = Date.now().toString()

// Simple inline plugin to emit version.json to the dist directory
const generateVersionPlugin = () => ({
  name: 'generate-version-json',
  writeBundle(options: any) {
    const filePath = path.resolve(options.dir || 'dist', 'version.json');
    fs.writeFileSync(filePath, JSON.stringify({ version }));
  }
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    generateVersionPlugin()
  ],
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(version)
  },
  server: {
    host: true, // Listen on all local IPs (allow mobile network testing)
    allowedHosts: ['loose-sloths-try.loca.lt', '.loca.lt'],
  },
})
