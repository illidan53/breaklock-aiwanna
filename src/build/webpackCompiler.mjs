import webpack from "webpack";
import MiniCssExtractPlugin from "mini-css-extract-plugin";
import path from "path";
import * as sass from 'sass';
import { buildFolder, rootFolder } from "./paths.mjs";
import { getL10nData, playerDictionary } from './i18n.mjs';

const english = (await getL10nData()).find(locale => locale.code === 'en');
if (!english) throw new Error('English fallback dictionary is required');

const extractSass = new MiniCssExtractPlugin({
  filename: "[name].css",
});

const config = {
  context: path.resolve(rootFolder, './src'),
  entry: {
    app: './app.js',
    bootstrap: './platform/i18n-bootstrap.js',
  },
  output: {
    path: buildFolder,
    filename: '[name].js',
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        use: [{
          loader: 'babel-loader',
          options: { presets: ['@babel/preset-env'] }
        }],
      },
      {
        test: /\.scss$/,
        use: [
          {
            loader: MiniCssExtractPlugin.loader,
          },
          {
            loader: 'css-loader',
            options: { url: false },
          },
          {
            loader: 'sass-loader',
            options: { implementation: sass, api: 'modern' },
          },
        ],
      }
    ]
  },
  plugins: [
    extractSass,
    new webpack.DefinePlugin({ __BREAKLOCK_I18N_KEYS__: JSON.stringify(Object.keys(playerDictionary(english.data))) }),
  ]
};

export const productionCompiler = webpack({
  ...config,
  mode: 'production',
});

export const developmentCompiler = webpack({
  ...config,
  mode: 'development',
});
