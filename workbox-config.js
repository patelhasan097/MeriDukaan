module.exports = {
  globDirectory:   '.',
  globPatterns:    ['*.{html,css,json}', 'js/*.js', 'icons/*.png'],
  globIgnores:     ['node_modules/**', 'workbox-config.js', 'SETUP.md'],
  swDest:          'sw.js',
  swSrc:           'sw-src.js',    // custom handlers merged in
  injectManifest: false,           // use generateSW mode
  runtimeCaching: [
    // Google Fonts — CacheFirst 365 days
    {
      urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com/,
      handler:    'CacheFirst',
      options:    { cacheName: 'md-fonts', expiration: { maxEntries: 20, maxAgeSeconds: 31536000 } }
    },
    // CDN libs (Chart.js, jsPDF, Tabler Icons) — StaleWhileRevalidate
    {
      urlPattern: /^https:\/\/(cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|www\.gstatic\.com\/firebasejs)/,
      handler:    'StaleWhileRevalidate',
      options:    { cacheName: 'md-cdn', expiration: { maxEntries: 40, maxAgeSeconds: 604800 } }
    }
  ]
};
