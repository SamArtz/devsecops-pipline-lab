const express = require('express');
const os = require('node:os');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  let requestCount = 0;

  app.get('/health', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.get('/', (req, res) => {
    requestCount += 1;
    res.set('Cache-Control', 'no-store');
    res.status(200).json({
      message: 'DevSecOps Lab - Status API',
      hostname: os.hostname(),
      requestCount,
    });
  });

  return app;
}

if (require.main === module) {
  const port = process.env.PORT || 3000;
  const server = createApp().listen(port, '0.0.0.0', () => {
    console.log(`Status API escuchando en el puerto ${port}`);
  });
  const shutdown = () => {
    console.log('Cerrando Status API...');
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 25000).unref();
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

module.exports = { createApp };
