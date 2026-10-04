const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
  entry: {
    background: './src/background/service-worker.ts',
    options: './src/pages/options.ts',
    review: './src/pages/review.ts',
    popup: './src/pages/popup.ts',
    'content-binance': './src/content/binance.ts',
    'content-okx': './src/content/okx.ts',
    'content-gate': './src/content/gate.ts',
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    clean: true,
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: 'public', to: '.' },
        { from: 'src/pages/*.html', to: '[name][ext]' },
        { from: 'src/pages/*.css', to: '[name][ext]' },
      ],
    }),
  ],
};
