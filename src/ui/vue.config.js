const path = require('path'); 
module.exports = {
  configureWebpack: {
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
        '@explorers': path.resolve(__dirname, 'src/components/explorers'),
        '@utils': path.resolve(__dirname, 'src/utils')
      }
    }
  },
  devServer: {
    proxy: {
      '/api': {
        target: 'http://localhost:80',
        changeOrigin: true,
      },
    },
  },
  outputDir: 'dist',
  assetsDir: 'assets',
  publicPath: '/',
  
  chainWebpack: config => {
    config.plugin('copy').tap(args => {
      args[0].patterns[0].globOptions = {
        ...args[0].patterns[0].globOptions,
        ignore: ['**/.*', '**/index.html'] 
      }
      return args
    })
  }
};
