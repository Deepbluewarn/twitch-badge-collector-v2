const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");
const srcDir = path.join(__dirname, "..", "src");

const build_for = process.env.BUILD_FOR;

console.log("[build] env.build_for : ", build_for);

function modify(buffer) {
  const manifest = JSON.parse(buffer.toString());
  const isFirefox = build_for === 'firefox';

  manifest.background = isFirefox ? {
    "scripts": ["js/background.js"]
  } : {
    "service_worker": 'js/background.js'
  }

  if(isFirefox){
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
