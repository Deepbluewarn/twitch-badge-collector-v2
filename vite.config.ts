import { defineConfig } from 'vite'
import fs from 'fs'
import path from 'path';
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import zipPack from "vite-plugin-zip-pack";
import { resolve } from 'path';
import manifest from './manifest.json'

export default defineConfig(() => {
  const isWatch = process.argv.includes('--watch')
  const build_for = process.env.VITE_BUILD_FOR;
  const manifestJSON = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf-8'));

  return {
    build: {
      minify: false,
      rollupOptions: {
        input: {
          welcome: resolve(__dirname, 'src', 'welcome', 'welcome.html'),
          setting: resolve(__dirname, 'src', 'setting', 'setting.html'),
        }
      }
    },
    plugins: [
      react(),
      crx({ manifest }),

      viteStaticCopy({
        targets: [
          {
            src: 'dist/manifest.json',
            dest: '',
            transform: (buffer) => {
              return modify(build_for, buffer);
            }
          }
        ]
      }),
      isWatch ? null : (
        zipPack({
          outDir: './versions',
          outFileName: `tbc-${manifestJSON.version}-${build_for}.zip`
        })
      )
    ],
  }
})

function modify(build_for: string, buffer: string) {
  const manifest = JSON.parse(buffer.toString());
  const isFirefox = build_for === 'firefox';

  if(isFirefox) {
    manifest.manifest_version = 2;
    manifest.background = {
      "scripts": [manifest.background.service_worker]
    }
    manifest.browser_action = manifest.action;
    delete manifest.action;
    delete manifest.host_permissions;
    manifest.permissions.push('*://*.badgecollector.dev/*');
    manifest.permissions.push('*://*.twitch.tv/*');
    manifest.web_accessible_resources = [
      "src/assets/icon.png",
      "src/assets/bmc-button.svg"
    ]
    manifest.browser_specific_settings = {
      gecko: {
        id: 'tbcextension@gmail.com'
      }
    }
  }

  return JSON.stringify(manifest, null, 2);
}