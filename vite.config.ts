import { defineConfig, loadEnv } from 'vite'
import fs from 'fs'
import path from 'path';
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import zipPack from "vite-plugin-zip-pack";
import { resolve } from 'path';
import manifest from './manifest.json'

export default defineConfig((mode) => {
  process.env = {...process.env, ...loadEnv(mode.mode, process.cwd())};
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
      },
      sourcemap: true, // Source map generation must be turned on
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
          outFileName: `tbc2-${manifestJSON.version}-${build_for}.zip`
        })
      ),
    ],
    resolve: {
      alias: {
        '@utils': '/src/utils',
        '@components': '/src/components',
        '@interfaces': '/src/interfaces',
        '@hooks': '/src/hooks',
        '@style': '/src/style',
      },
    }
  }
})

function modify(build_for: string, buffer: string) {
  const manifest = JSON.parse(buffer.toString());
  const isFirefox = build_for === 'firefox';

  if(isFirefox) {
    manifest.manifest_version = 2;
    manifest.background = {
      "scripts": [manifest.background.service_worker],
      "type": "module"
    }
    manifest.browser_action = manifest.action;
    delete manifest.action;
    delete manifest.host_permissions;
    manifest.permissions.push('*://*.badgecollector.dev/*');
    manifest.permissions.push('*://*.twitch.tv/*');
    manifest.permissions.push('tabs');
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