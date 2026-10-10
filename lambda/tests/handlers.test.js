const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { handler: health } = require('../health');

function loadOrder({ fail = false, queue = 'https://sqs.example.test/orders' } = {}) {
  const messages = [];
  const context = {
    exports: {}, Buffer,
    process: { env: { QUEUE_URL: queue, AWS_REGION: 'us-east-1' } },
    console: { error() {} },
    require(name) {
      if (name !== '@aws-sdk/client-sqs') return require(name);
      return {
        SQSClient: class {
          async send(command) {
            if (fail) throw new Error('SQS unavailable');
            messages.push(command.input);
            return { MessageId: 'test-message' };
          }
        },
        SendMessageCommand: class { constructor(input) { this.input = input; } },
      };
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../create-order.js'), 'utf8'), context);
  return { handler: context.exports.handler, messages };
}

test('health devuelve 200 con fecha ISO y estado ok', async () => {
  const response = await health();
  const body = JSON.parse(response.body);
  assert.equal(response.statusCode, 200);
  assert.equal(body.status, 'ok');
  assert.equal(new Date(body.timestamp).toISOString(), body.timestamp);
});

test('pedido válido devuelve 201 y encola exactamente el pedido retornado', async () => {
  const { handler, messages } = loadOrder();
  const response = await handler({ body: JSON.stringify({ productId: 'sku-100', amount: 25 }) });
  assert.equal(response.statusCode, 201);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].QueueUrl, 'https://sqs.example.test/orders');
  const order = JSON.parse(response.body).order;
  assert.deepEqual(JSON.parse(messages[0].MessageBody), order);
  assert.equal(order.productId, 'sku-100');
  assert.equal(order.amount, 25);
  assert.match(order.orderId, /^API-/);
});

for (const [name, body] of [
  ['datos incompletos', '{"productId":"sku-100"}'],
  ['JSON inválido', '{'],
  ['null', 'null'],
  ['importe negativo', '{"productId":"sku-100","amount":-1}'],
  ['importe como texto', '{"productId":"sku-100","amount":"25"}'],
  ['producto vacío', '{"productId":" ","amount":25}'],
]) {
  test(`${name}: devuelve 400 sin enviar a SQS`, async () => {
    const { handler, messages } = loadOrder();
    assert.equal((await handler({ body })).statusCode, 400);
    assert.equal(messages.length, 0);
  });
}

test('acepta el cuerpo base64 de API Gateway', async () => {
  const { handler, messages } = loadOrder();
  const body = Buffer.from('{"productId":"sku-100","amount":25}').toString('base64');
  assert.equal((await handler({ body, isBase64Encoded: true })).statusCode, 201);
  assert.equal(messages.length, 1);
});

test('un fallo de SQS devuelve 500 y nunca informa éxito', async () => {
  const { handler, messages } = loadOrder({ fail: true });
  assert.equal((await handler({ body: '{"productId":"sku-100","amount":25}' })).statusCode, 500);
  assert.equal(messages.length, 0);
});

test('sin QUEUE_URL devuelve 500 sin enviar', async () => {
  const { handler, messages } = loadOrder({ queue: '' });
  assert.equal((await handler({ body: '{"productId":"sku-100","amount":25}' })).statusCode, 500);
  assert.equal(messages.length, 0);
});
