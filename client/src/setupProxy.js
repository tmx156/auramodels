// Dev-server proxy override. Only active when REACT_APP_API_URL is set (e.g. to
// run against a server on a non-default port); otherwise the "proxy" field in
// package.json (localhost:5000) applies as before.
const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function (app) {
  const target = process.env.REACT_APP_API_URL;
  if (!target) return;
  app.use(['/api', '/uploads', '/socket.io'], createProxyMiddleware({ target, changeOrigin: true, ws: true }));
};
