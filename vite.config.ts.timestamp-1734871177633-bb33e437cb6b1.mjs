// vite.config.ts
import { defineConfig, loadEnv } from "file:///C:/Development/twitch-badge-collector-v2/node_modules/vite/dist/node/index.js";
import fs from "fs";
import path from "path";
import react from "file:///C:/Development/twitch-badge-collector-v2/node_modules/@vitejs/plugin-react/dist/index.mjs";
import { crx } from "file:///C:/Development/twitch-badge-collector-v2/node_modules/@crxjs/vite-plugin/dist/index.mjs";
import { viteStaticCopy } from "file:///C:/Development/twitch-badge-collector-v2/node_modules/vite-plugin-static-copy/dist/index.js";
import zipPack from "file:///C:/Development/twitch-badge-collector-v2/node_modules/vite-plugin-zip-pack/dist/esm/index.mjs";
import { resolve } from "path";

// manifest.json
var manifest_default = {
  manifest_version: 3,
  name: "__MSG_ExtensionName__",
  description: "__MSG_ExtensionDesc__",
  default_locale: "en",
  version: "2.14.1",
  action: {
    default_icon: {
      "128": "src/assets/icon.png"
    },
    default_popup: "src/popup/popup.html"
  },
  icons: {
    "128": "src/assets/icon.png"
  },
  content_scripts: [
    {
      matches: [
        "*://*.twitch.tv/*"
      ],
      exclude_matches: [
        "*://passport.twitch.tv/*",
        "*://gql.twitch.tv/*"
      ],
      all_frames: true,
      js: [
        "src/contentScript/twitch/content-script.tsx"
      ],
      css: [
        "twitchContentScript.css"
      ]
    },
    {
      matches: [
        "*://chzzk.naver.com/*"
      ],
      all_frames: true,
      js: [
        "src/contentScript/chzzk/content-script.tsx"
      ],
      css: [
        "chzzkContentScript.css"
      ]
    }
  ],
  background: {
    service_worker: "src/background/background.ts"
  },
  permissions: [
    "storage",
    "webNavigation"
  ],
  host_permissions: [
    "*://*.twitch.tv/*",
    "*://chzzk.naver.com/*"
  ],
  web_accessible_resources: [
    {
      resources: [
        "src/assets/icon.png",
        "src/assets/bmc-button.svg"
      ],
      matches: [
        "*://*.twitch.tv/*",
        "*://chzzk.naver.com/*"
      ]
    }
  ]
};

// vite.config.ts
var __vite_injected_original_dirname = "C:\\Development\\twitch-badge-collector-v2";
var vite_config_default = defineConfig((mode) => {
  process.env = { ...process.env, ...loadEnv(mode.mode, process.cwd()) };
  const isWatch = process.argv.includes("--watch");
  const build_for = process.env.VITE_BUILD_FOR;
  const manifestJSON = JSON.parse(fs.readFileSync(path.join(__vite_injected_original_dirname, "manifest.json"), "utf-8"));
  return {
    build: {
      minify: false,
      rollupOptions: {
        input: {
          welcome: resolve(__vite_injected_original_dirname, "src", "welcome", "welcome.html"),
          setting: resolve(__vite_injected_original_dirname, "src", "setting", "setting.html")
        }
      },
      sourcemap: true
      // Source map generation must be turned on
    },
    plugins: [
      react(),
      crx({ manifest: manifest_default }),
      viteStaticCopy({
        targets: [
          {
            src: "dist/manifest.json",
            dest: "",
            transform: (buffer) => {
              return modify(build_for, buffer);
            }
          }
        ]
      }),
      isWatch ? null : zipPack({
        outDir: "./versions",
        outFileName: `tbc2-${manifestJSON.version}-${build_for}.zip`
      })
    ],
    resolve: {
      alias: {
        "@utils": "/src/utils",
        "@components": "/src/components",
        "@interfaces": "/src/interfaces",
        "@hooks": "/src/hooks",
        "@style": "/src/style"
      }
    }
  };
});
function modify(build_for, buffer) {
  const manifest = JSON.parse(buffer.toString());
  const isFirefox = build_for === "firefox";
  if (isFirefox) {
    manifest.manifest_version = 2;
    manifest.background = {
      "scripts": [manifest.background.service_worker],
      "type": "module"
    };
    manifest.browser_action = manifest.action;
    delete manifest.action;
    delete manifest.host_permissions;
    manifest.permissions.push("*://*.badgecollector.dev/*");
    manifest.permissions.push("*://*.twitch.tv/*");
    manifest.permissions.push("tabs");
    manifest.web_accessible_resources = [
      "src/assets/icon.png",
      "src/assets/bmc-button.svg"
    ];
    manifest.browser_specific_settings = {
      gecko: {
        id: "tbcextension@gmail.com"
      }
    };
  }
  const war = manifest.web_accessible_resources;
  manifest.web_accessible_resources = war.map((v) => {
    return { ...v, use_dynamic_url: false };
  });
  return JSON.stringify(manifest, null, 2);
}
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiLCAibWFuaWZlc3QuanNvbiJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiY29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2Rpcm5hbWUgPSBcIkM6XFxcXERldmVsb3BtZW50XFxcXHR3aXRjaC1iYWRnZS1jb2xsZWN0b3ItdjJcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIkM6XFxcXERldmVsb3BtZW50XFxcXHR3aXRjaC1iYWRnZS1jb2xsZWN0b3ItdjJcXFxcdml0ZS5jb25maWcudHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL0M6L0RldmVsb3BtZW50L3R3aXRjaC1iYWRnZS1jb2xsZWN0b3ItdjIvdml0ZS5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcsIGxvYWRFbnYgfSBmcm9tICd2aXRlJ1xyXG5pbXBvcnQgZnMgZnJvbSAnZnMnXHJcbmltcG9ydCBwYXRoIGZyb20gJ3BhdGgnO1xyXG5pbXBvcnQgcmVhY3QgZnJvbSAnQHZpdGVqcy9wbHVnaW4tcmVhY3QnXHJcbmltcG9ydCB7IGNyeCB9IGZyb20gJ0Bjcnhqcy92aXRlLXBsdWdpbidcclxuaW1wb3J0IHsgdml0ZVN0YXRpY0NvcHkgfSBmcm9tICd2aXRlLXBsdWdpbi1zdGF0aWMtY29weSdcclxuaW1wb3J0IHppcFBhY2sgZnJvbSBcInZpdGUtcGx1Z2luLXppcC1wYWNrXCI7XHJcbmltcG9ydCB7IHJlc29sdmUgfSBmcm9tICdwYXRoJztcclxuaW1wb3J0IG1hbmlmZXN0IGZyb20gJy4vbWFuaWZlc3QuanNvbidcclxuXHJcbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZygobW9kZSkgPT4ge1xyXG4gIHByb2Nlc3MuZW52ID0gey4uLnByb2Nlc3MuZW52LCAuLi5sb2FkRW52KG1vZGUubW9kZSwgcHJvY2Vzcy5jd2QoKSl9O1xyXG4gIGNvbnN0IGlzV2F0Y2ggPSBwcm9jZXNzLmFyZ3YuaW5jbHVkZXMoJy0td2F0Y2gnKVxyXG4gIGNvbnN0IGJ1aWxkX2ZvciA9IHByb2Nlc3MuZW52LlZJVEVfQlVJTERfRk9SO1xyXG4gIGNvbnN0IG1hbmlmZXN0SlNPTiA9IEpTT04ucGFyc2UoZnMucmVhZEZpbGVTeW5jKHBhdGguam9pbihfX2Rpcm5hbWUsICdtYW5pZmVzdC5qc29uJyksICd1dGYtOCcpKTtcclxuXHJcbiAgcmV0dXJuIHtcclxuICAgIGJ1aWxkOiB7XHJcbiAgICAgIG1pbmlmeTogZmFsc2UsXHJcbiAgICAgIHJvbGx1cE9wdGlvbnM6IHtcclxuICAgICAgICBpbnB1dDoge1xyXG4gICAgICAgICAgd2VsY29tZTogcmVzb2x2ZShfX2Rpcm5hbWUsICdzcmMnLCAnd2VsY29tZScsICd3ZWxjb21lLmh0bWwnKSxcclxuICAgICAgICAgIHNldHRpbmc6IHJlc29sdmUoX19kaXJuYW1lLCAnc3JjJywgJ3NldHRpbmcnLCAnc2V0dGluZy5odG1sJyksXHJcbiAgICAgICAgfVxyXG4gICAgICB9LFxyXG4gICAgICBzb3VyY2VtYXA6IHRydWUsIC8vIFNvdXJjZSBtYXAgZ2VuZXJhdGlvbiBtdXN0IGJlIHR1cm5lZCBvblxyXG4gICAgfSxcclxuICAgIHBsdWdpbnM6IFtcclxuICAgICAgcmVhY3QoKSxcclxuICAgICAgY3J4KHsgbWFuaWZlc3QgfSksXHJcblxyXG4gICAgICB2aXRlU3RhdGljQ29weSh7XHJcbiAgICAgICAgdGFyZ2V0czogW1xyXG4gICAgICAgICAge1xyXG4gICAgICAgICAgICBzcmM6ICdkaXN0L21hbmlmZXN0Lmpzb24nLFxyXG4gICAgICAgICAgICBkZXN0OiAnJyxcclxuICAgICAgICAgICAgdHJhbnNmb3JtOiAoYnVmZmVyKSA9PiB7XHJcbiAgICAgICAgICAgICAgcmV0dXJuIG1vZGlmeShidWlsZF9mb3IsIGJ1ZmZlcik7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgIH1cclxuICAgICAgICBdXHJcbiAgICAgIH0pLFxyXG4gICAgICBpc1dhdGNoID8gbnVsbCA6IChcclxuICAgICAgICB6aXBQYWNrKHtcclxuICAgICAgICAgIG91dERpcjogJy4vdmVyc2lvbnMnLFxyXG4gICAgICAgICAgb3V0RmlsZU5hbWU6IGB0YmMyLSR7bWFuaWZlc3RKU09OLnZlcnNpb259LSR7YnVpbGRfZm9yfS56aXBgXHJcbiAgICAgICAgfSlcclxuICAgICAgKSxcclxuICAgIF0sXHJcbiAgICByZXNvbHZlOiB7XHJcbiAgICAgIGFsaWFzOiB7XHJcbiAgICAgICAgJ0B1dGlscyc6ICcvc3JjL3V0aWxzJyxcclxuICAgICAgICAnQGNvbXBvbmVudHMnOiAnL3NyYy9jb21wb25lbnRzJyxcclxuICAgICAgICAnQGludGVyZmFjZXMnOiAnL3NyYy9pbnRlcmZhY2VzJyxcclxuICAgICAgICAnQGhvb2tzJzogJy9zcmMvaG9va3MnLFxyXG4gICAgICAgICdAc3R5bGUnOiAnL3NyYy9zdHlsZScsXHJcbiAgICAgIH0sXHJcbiAgICB9XHJcbiAgfVxyXG59KVxyXG5cclxuZnVuY3Rpb24gbW9kaWZ5KGJ1aWxkX2Zvcjogc3RyaW5nLCBidWZmZXI6IHN0cmluZykge1xyXG4gIGNvbnN0IG1hbmlmZXN0ID0gSlNPTi5wYXJzZShidWZmZXIudG9TdHJpbmcoKSk7XHJcbiAgY29uc3QgaXNGaXJlZm94ID0gYnVpbGRfZm9yID09PSAnZmlyZWZveCc7XHJcblxyXG4gIGlmKGlzRmlyZWZveCkge1xyXG4gICAgbWFuaWZlc3QubWFuaWZlc3RfdmVyc2lvbiA9IDI7XHJcbiAgICBtYW5pZmVzdC5iYWNrZ3JvdW5kID0ge1xyXG4gICAgICBcInNjcmlwdHNcIjogW21hbmlmZXN0LmJhY2tncm91bmQuc2VydmljZV93b3JrZXJdLFxyXG4gICAgICBcInR5cGVcIjogXCJtb2R1bGVcIlxyXG4gICAgfVxyXG4gICAgbWFuaWZlc3QuYnJvd3Nlcl9hY3Rpb24gPSBtYW5pZmVzdC5hY3Rpb247XHJcbiAgICBkZWxldGUgbWFuaWZlc3QuYWN0aW9uO1xyXG4gICAgZGVsZXRlIG1hbmlmZXN0Lmhvc3RfcGVybWlzc2lvbnM7XHJcbiAgICBtYW5pZmVzdC5wZXJtaXNzaW9ucy5wdXNoKCcqOi8vKi5iYWRnZWNvbGxlY3Rvci5kZXYvKicpO1xyXG4gICAgbWFuaWZlc3QucGVybWlzc2lvbnMucHVzaCgnKjovLyoudHdpdGNoLnR2LyonKTtcclxuICAgIG1hbmlmZXN0LnBlcm1pc3Npb25zLnB1c2goJ3RhYnMnKTtcclxuICAgIG1hbmlmZXN0LndlYl9hY2Nlc3NpYmxlX3Jlc291cmNlcyA9IFtcclxuICAgICAgXCJzcmMvYXNzZXRzL2ljb24ucG5nXCIsXHJcbiAgICAgIFwic3JjL2Fzc2V0cy9ibWMtYnV0dG9uLnN2Z1wiXHJcbiAgICBdXHJcbiAgICBtYW5pZmVzdC5icm93c2VyX3NwZWNpZmljX3NldHRpbmdzID0ge1xyXG4gICAgICBnZWNrbzoge1xyXG4gICAgICAgIGlkOiAndGJjZXh0ZW5zaW9uQGdtYWlsLmNvbSdcclxuICAgICAgfVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgY29uc3Qgd2FyID0gbWFuaWZlc3Qud2ViX2FjY2Vzc2libGVfcmVzb3VyY2VzXHJcblxyXG4gIG1hbmlmZXN0LndlYl9hY2Nlc3NpYmxlX3Jlc291cmNlcyA9IHdhci5tYXAodiA9PiB7XHJcbiAgICByZXR1cm4geyAuLi52LCB1c2VfZHluYW1pY191cmw6IGZhbHNlIH1cclxuICB9KVxyXG5cclxuICByZXR1cm4gSlNPTi5zdHJpbmdpZnkobWFuaWZlc3QsIG51bGwsIDIpO1xyXG59IiwgIntcclxuICAgIFwibWFuaWZlc3RfdmVyc2lvblwiOiAzLFxyXG4gICAgXCJuYW1lXCI6IFwiX19NU0dfRXh0ZW5zaW9uTmFtZV9fXCIsXHJcbiAgICBcImRlc2NyaXB0aW9uXCI6IFwiX19NU0dfRXh0ZW5zaW9uRGVzY19fXCIsXHJcbiAgICBcImRlZmF1bHRfbG9jYWxlXCI6IFwiZW5cIixcclxuICAgIFwidmVyc2lvblwiOiBcIjIuMTQuMVwiLFxyXG4gICAgXCJhY3Rpb25cIjoge1xyXG4gICAgICAgIFwiZGVmYXVsdF9pY29uXCI6IHtcclxuICAgICAgICAgICAgXCIxMjhcIjogXCJzcmMvYXNzZXRzL2ljb24ucG5nXCJcclxuICAgICAgICB9LFxyXG4gICAgICAgIFwiZGVmYXVsdF9wb3B1cFwiOiBcInNyYy9wb3B1cC9wb3B1cC5odG1sXCJcclxuICAgIH0sXHJcbiAgICBcImljb25zXCI6IHtcclxuICAgICAgICBcIjEyOFwiOiBcInNyYy9hc3NldHMvaWNvbi5wbmdcIlxyXG4gICAgfSxcclxuICAgIFwiY29udGVudF9zY3JpcHRzXCI6IFtcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIFwibWF0Y2hlc1wiOiBbXHJcbiAgICAgICAgICAgICAgICBcIio6Ly8qLnR3aXRjaC50di8qXCJcclxuICAgICAgICAgICAgXSxcclxuICAgICAgICAgICAgXCJleGNsdWRlX21hdGNoZXNcIjogW1xyXG4gICAgICAgICAgICAgICAgXCIqOi8vcGFzc3BvcnQudHdpdGNoLnR2LypcIixcclxuICAgICAgICAgICAgICAgIFwiKjovL2dxbC50d2l0Y2gudHYvKlwiXHJcbiAgICAgICAgICAgIF0sXHJcbiAgICAgICAgICAgIFwiYWxsX2ZyYW1lc1wiIDogdHJ1ZSxcclxuICAgICAgICAgICAgXCJqc1wiOiBbXHJcbiAgICAgICAgICAgICAgICBcInNyYy9jb250ZW50U2NyaXB0L3R3aXRjaC9jb250ZW50LXNjcmlwdC50c3hcIlxyXG4gICAgICAgICAgICBdLFxyXG4gICAgICAgICAgICBcImNzc1wiOiBbXHJcbiAgICAgICAgICAgICAgICBcInR3aXRjaENvbnRlbnRTY3JpcHQuY3NzXCJcclxuICAgICAgICAgICAgXVxyXG4gICAgICAgIH0sXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICBcIm1hdGNoZXNcIjogW1xyXG4gICAgICAgICAgICAgICAgXCIqOi8vY2h6emsubmF2ZXIuY29tLypcIlxyXG4gICAgICAgICAgICBdLFxyXG4gICAgICAgICAgICBcImFsbF9mcmFtZXNcIiA6IHRydWUsXHJcbiAgICAgICAgICAgIFwianNcIjogW1xyXG4gICAgICAgICAgICAgICAgXCJzcmMvY29udGVudFNjcmlwdC9jaHp6ay9jb250ZW50LXNjcmlwdC50c3hcIlxyXG4gICAgICAgICAgICBdLFxyXG4gICAgICAgICAgICBcImNzc1wiOiBbXHJcbiAgICAgICAgICAgICAgICBcImNoenprQ29udGVudFNjcmlwdC5jc3NcIlxyXG4gICAgICAgICAgICBdXHJcbiAgICAgICAgfVxyXG4gICAgXSxcclxuICAgIFwiYmFja2dyb3VuZFwiOiB7XHJcbiAgICAgICAgXCJzZXJ2aWNlX3dvcmtlclwiOiBcInNyYy9iYWNrZ3JvdW5kL2JhY2tncm91bmQudHNcIlxyXG4gICAgfSxcclxuICAgIFwicGVybWlzc2lvbnNcIjogW1xyXG4gICAgICAgIFwic3RvcmFnZVwiLFxyXG4gICAgICAgIFwid2ViTmF2aWdhdGlvblwiXHJcbiAgICBdLFxyXG4gICAgXCJob3N0X3Blcm1pc3Npb25zXCI6IFtcclxuICAgICAgICBcIio6Ly8qLnR3aXRjaC50di8qXCIsXHJcbiAgICAgICAgXCIqOi8vY2h6emsubmF2ZXIuY29tLypcIlxyXG4gICAgXSxcclxuICAgIFwid2ViX2FjY2Vzc2libGVfcmVzb3VyY2VzXCI6IFtcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIFwicmVzb3VyY2VzXCI6IFtcclxuICAgICAgICAgICAgICAgIFwic3JjL2Fzc2V0cy9pY29uLnBuZ1wiLFxyXG4gICAgICAgICAgICAgICAgXCJzcmMvYXNzZXRzL2JtYy1idXR0b24uc3ZnXCJcclxuICAgICAgICAgICAgXSxcclxuICAgICAgICAgICAgXCJtYXRjaGVzXCI6IFtcclxuICAgICAgICAgICAgICAgIFwiKjovLyoudHdpdGNoLnR2LypcIixcclxuICAgICAgICAgICAgICAgIFwiKjovL2NoenprLm5hdmVyLmNvbS8qXCJcclxuICAgICAgICAgICAgXVxyXG4gICAgICAgIH1cclxuICAgIF1cclxufSJdLAogICJtYXBwaW5ncyI6ICI7QUFBZ1QsU0FBUyxjQUFjLGVBQWU7QUFDdFYsT0FBTyxRQUFRO0FBQ2YsT0FBTyxVQUFVO0FBQ2pCLE9BQU8sV0FBVztBQUNsQixTQUFTLFdBQVc7QUFDcEIsU0FBUyxzQkFBc0I7QUFDL0IsT0FBTyxhQUFhO0FBQ3BCLFNBQVMsZUFBZTs7O0FDUHhCO0FBQUEsRUFDSSxrQkFBb0I7QUFBQSxFQUNwQixNQUFRO0FBQUEsRUFDUixhQUFlO0FBQUEsRUFDZixnQkFBa0I7QUFBQSxFQUNsQixTQUFXO0FBQUEsRUFDWCxRQUFVO0FBQUEsSUFDTixjQUFnQjtBQUFBLE1BQ1osT0FBTztBQUFBLElBQ1g7QUFBQSxJQUNBLGVBQWlCO0FBQUEsRUFDckI7QUFBQSxFQUNBLE9BQVM7QUFBQSxJQUNMLE9BQU87QUFBQSxFQUNYO0FBQUEsRUFDQSxpQkFBbUI7QUFBQSxJQUNmO0FBQUEsTUFDSSxTQUFXO0FBQUEsUUFDUDtBQUFBLE1BQ0o7QUFBQSxNQUNBLGlCQUFtQjtBQUFBLFFBQ2Y7QUFBQSxRQUNBO0FBQUEsTUFDSjtBQUFBLE1BQ0EsWUFBZTtBQUFBLE1BQ2YsSUFBTTtBQUFBLFFBQ0Y7QUFBQSxNQUNKO0FBQUEsTUFDQSxLQUFPO0FBQUEsUUFDSDtBQUFBLE1BQ0o7QUFBQSxJQUNKO0FBQUEsSUFDQTtBQUFBLE1BQ0ksU0FBVztBQUFBLFFBQ1A7QUFBQSxNQUNKO0FBQUEsTUFDQSxZQUFlO0FBQUEsTUFDZixJQUFNO0FBQUEsUUFDRjtBQUFBLE1BQ0o7QUFBQSxNQUNBLEtBQU87QUFBQSxRQUNIO0FBQUEsTUFDSjtBQUFBLElBQ0o7QUFBQSxFQUNKO0FBQUEsRUFDQSxZQUFjO0FBQUEsSUFDVixnQkFBa0I7QUFBQSxFQUN0QjtBQUFBLEVBQ0EsYUFBZTtBQUFBLElBQ1g7QUFBQSxJQUNBO0FBQUEsRUFDSjtBQUFBLEVBQ0Esa0JBQW9CO0FBQUEsSUFDaEI7QUFBQSxJQUNBO0FBQUEsRUFDSjtBQUFBLEVBQ0EsMEJBQTRCO0FBQUEsSUFDeEI7QUFBQSxNQUNJLFdBQWE7QUFBQSxRQUNUO0FBQUEsUUFDQTtBQUFBLE1BQ0o7QUFBQSxNQUNBLFNBQVc7QUFBQSxRQUNQO0FBQUEsUUFDQTtBQUFBLE1BQ0o7QUFBQSxJQUNKO0FBQUEsRUFDSjtBQUNKOzs7QURwRUEsSUFBTSxtQ0FBbUM7QUFVekMsSUFBTyxzQkFBUSxhQUFhLENBQUMsU0FBUztBQUNwQyxVQUFRLE1BQU0sRUFBQyxHQUFHLFFBQVEsS0FBSyxHQUFHLFFBQVEsS0FBSyxNQUFNLFFBQVEsSUFBSSxDQUFDLEVBQUM7QUFDbkUsUUFBTSxVQUFVLFFBQVEsS0FBSyxTQUFTLFNBQVM7QUFDL0MsUUFBTSxZQUFZLFFBQVEsSUFBSTtBQUM5QixRQUFNLGVBQWUsS0FBSyxNQUFNLEdBQUcsYUFBYSxLQUFLLEtBQUssa0NBQVcsZUFBZSxHQUFHLE9BQU8sQ0FBQztBQUUvRixTQUFPO0FBQUEsSUFDTCxPQUFPO0FBQUEsTUFDTCxRQUFRO0FBQUEsTUFDUixlQUFlO0FBQUEsUUFDYixPQUFPO0FBQUEsVUFDTCxTQUFTLFFBQVEsa0NBQVcsT0FBTyxXQUFXLGNBQWM7QUFBQSxVQUM1RCxTQUFTLFFBQVEsa0NBQVcsT0FBTyxXQUFXLGNBQWM7QUFBQSxRQUM5RDtBQUFBLE1BQ0Y7QUFBQSxNQUNBLFdBQVc7QUFBQTtBQUFBLElBQ2I7QUFBQSxJQUNBLFNBQVM7QUFBQSxNQUNQLE1BQU07QUFBQSxNQUNOLElBQUksRUFBRSwyQkFBUyxDQUFDO0FBQUEsTUFFaEIsZUFBZTtBQUFBLFFBQ2IsU0FBUztBQUFBLFVBQ1A7QUFBQSxZQUNFLEtBQUs7QUFBQSxZQUNMLE1BQU07QUFBQSxZQUNOLFdBQVcsQ0FBQyxXQUFXO0FBQ3JCLHFCQUFPLE9BQU8sV0FBVyxNQUFNO0FBQUEsWUFDakM7QUFBQSxVQUNGO0FBQUEsUUFDRjtBQUFBLE1BQ0YsQ0FBQztBQUFBLE1BQ0QsVUFBVSxPQUNSLFFBQVE7QUFBQSxRQUNOLFFBQVE7QUFBQSxRQUNSLGFBQWEsUUFBUSxhQUFhLE9BQU8sSUFBSSxTQUFTO0FBQUEsTUFDeEQsQ0FBQztBQUFBLElBRUw7QUFBQSxJQUNBLFNBQVM7QUFBQSxNQUNQLE9BQU87QUFBQSxRQUNMLFVBQVU7QUFBQSxRQUNWLGVBQWU7QUFBQSxRQUNmLGVBQWU7QUFBQSxRQUNmLFVBQVU7QUFBQSxRQUNWLFVBQVU7QUFBQSxNQUNaO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFDRixDQUFDO0FBRUQsU0FBUyxPQUFPLFdBQW1CLFFBQWdCO0FBQ2pELFFBQU0sV0FBVyxLQUFLLE1BQU0sT0FBTyxTQUFTLENBQUM7QUFDN0MsUUFBTSxZQUFZLGNBQWM7QUFFaEMsTUFBRyxXQUFXO0FBQ1osYUFBUyxtQkFBbUI7QUFDNUIsYUFBUyxhQUFhO0FBQUEsTUFDcEIsV0FBVyxDQUFDLFNBQVMsV0FBVyxjQUFjO0FBQUEsTUFDOUMsUUFBUTtBQUFBLElBQ1Y7QUFDQSxhQUFTLGlCQUFpQixTQUFTO0FBQ25DLFdBQU8sU0FBUztBQUNoQixXQUFPLFNBQVM7QUFDaEIsYUFBUyxZQUFZLEtBQUssNEJBQTRCO0FBQ3RELGFBQVMsWUFBWSxLQUFLLG1CQUFtQjtBQUM3QyxhQUFTLFlBQVksS0FBSyxNQUFNO0FBQ2hDLGFBQVMsMkJBQTJCO0FBQUEsTUFDbEM7QUFBQSxNQUNBO0FBQUEsSUFDRjtBQUNBLGFBQVMsNEJBQTRCO0FBQUEsTUFDbkMsT0FBTztBQUFBLFFBQ0wsSUFBSTtBQUFBLE1BQ047QUFBQSxJQUNGO0FBQUEsRUFDRjtBQUVBLFFBQU0sTUFBTSxTQUFTO0FBRXJCLFdBQVMsMkJBQTJCLElBQUksSUFBSSxPQUFLO0FBQy9DLFdBQU8sRUFBRSxHQUFHLEdBQUcsaUJBQWlCLE1BQU07QUFBQSxFQUN4QyxDQUFDO0FBRUQsU0FBTyxLQUFLLFVBQVUsVUFBVSxNQUFNLENBQUM7QUFDekM7IiwKICAibmFtZXMiOiBbXQp9Cg==
