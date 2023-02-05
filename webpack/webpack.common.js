const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");
const srcDir = path.join(__dirname, "..", "src");

const build_for = process.env.BUILD_FOR;

console.log("[build] env.build_for : ", build_for);

function modify(buffer) {
  const manifest = JSON.parse(buffer.toString());
  const isFirefox = build_for === 'firefox';

  if(isFirefox) {
    manifest.manifest_version = 2;
    manifest.background = {
      "scripts": ["js/background.js"]
    }
    manifest.browser_action = manifest.action;
    delete manifest.action;
    delete manifest.host_permissions;
    manifest.permissions.push('*://*.badgecollector.dev/*');
    manifest.permissions.push('*://*.twitch.tv/*');
    manifest.web_accessible_resources = [
      "js/overrideFetch.js",
      "icon.png"
    ]
    manifest.browser_specific_settings = {
      gecko: {
        id: 'tbcextension@gmail.com'
      }
    }
  }

  return JSON.stringify(manifest, null, 2);;
}

module.exports = {
  entry: {
    popup: path.join(srcDir, "popup.tsx"),
    setting: path.join(srcDir, "SettingPage.tsx"),
    background: path.join(srcDir, "background.ts"),
    twitch_content_script: path.join(srcDir, "twitchContentScript.tsx"),
    remote_content_script: path.join(srcDir, "remoteContentScript.ts"),
    overrideFetch: path.join(srcDir, "overrideFetch.ts"),
  },
  output: {
    path: path.join(__dirname, "../dist/js"),
    filename: "[name].js",
  },
  optimization: {
    splitChunks: {
      name: "vendor",
      chunks(chunk) {
        return chunk.name !== "background";
      },
    },
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: "ts-loader",
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: [".ts", ".tsx", ".js"],
    fallback: {
      url: require.resolve("url/"),
      http: require.resolve("stream-http"),
      https: require.resolve("https-browserify"),
      stream: require.resolve("stream-browserify"),
      assert: require.resolve("assert/"),
      zlib: require.resolve("browserify-zlib"),
      buffer: require.resolve("buffer/"),
    },
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        {
          from: ".",
          to: "../",
          context: "public",
          priority: 1
        },
        {
          from: './manifest.json',
          to: '../manifest.json',
          context: 'public',
          transform(content, absoluteFrom) {
            return modify(content);
          },
          force: true,
          priority: 2
        }
      ],
      options: {},
    }),
  ],
};
