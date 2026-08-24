import { defineConfig } from 'vite'

// Port 3000 rather than Vite's default 5173, because supabase/config.toml already
// declares site_url = "http://127.0.0.1:3000" and Supabase Auth validates OAuth
// redirect targets against it. strictPort makes a busy port a hard failure instead
// of a silent hop to 3001, which would break the redirect without an obvious cause.
export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 3000,
    strictPort: true
  }
})
