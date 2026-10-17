const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const { createApp } = require('../server');

test('API HTTP: health, contador independiente de probes y rutas', async (t) => {
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;

  const health = await fetch(`${base}/health`);
  assert.equal(health.status, 200);
  const body = await health.json();
  assert.equal(body.status, 'ok');
  assert.equal(new Date(body.timestamp).toISOString(), body.timestamp);

  for (let count = 1; count <= 3; count += 1) {
    const response = await fetch(base);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const status = await response.json();
    assert.equal(status.message, 'DevSecOps Lab - Status API');
    assert.equal(status.hostname, os.hostname());
    assert.equal(status.requestCount, count);
    assert.equal((await fetch(`${base}/health`)).status, 200);
  }

  assert.equal((await fetch(`${base}/missing`)).status, 404);
});
