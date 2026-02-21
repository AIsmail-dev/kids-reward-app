import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Kids Tasks App',
        short_name: 'KidsApp',
        description: 'Kids Rewards Task Manager',
        theme_color: '#ffffff',
        icons: [
          {
            src: '/icon.png',
            sizes: '1024x1024',
            type: 'image/png'
          }
        ]
      }
    })
  ]
})
