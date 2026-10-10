const test = require('node:test');
const assert = require('node:assert/strict');
const { fanoutOnce } = require('../sns-fanout-consumer');

const order = { orderId: 'API-test', productId: 'sku-200', amount: 40 };
const valid = { MessageId: 'message-1', ReceiptHandle: 'receipt-1', Body: JSON.stringify(order) };

function setup(messages = [valid], { publishFails = false, deleteFails = false } = {}) {
  const calls = [];
  return {
    calls,
    options: {
      queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/orders',
      topicArn: 'arn:aws:sns:us-east-1:123456789012:orders',
      logger: { log() {}, error() {} },
      sqsClient: {
        async send(command) {
          calls.push(command);
          if (command.constructor.name === 'ReceiveMessageCommand') return { Messages: messages };
          if (deleteFails) throw new Error('Delete unavailable');
          return {};
        },
      },
      snsClient: {
        async send(command) {
          calls.push(command);
          if (publishFails) throw new Error('SNS unavailable');
          return { MessageId: 'published-1' };
        },
      },
    },
  };
}

test('publica el pedido completo y después elimina usando el ReceiptHandle original', async () => {
  const { calls, options } = setup();
  assert.deepEqual(await fanoutOnce(options), { received: 1, published: 1, deleted: 1, failed: 0 });
  assert.deepEqual(calls.map((c) => c.constructor.name), ['ReceiveMessageCommand', 'PublishCommand', 'DeleteMessageCommand']);
  assert.deepEqual(JSON.parse(calls[1].input.Message), order);
  assert.equal(calls[1].input.TopicArn, options.topicArn);
  assert.equal(calls[2].input.ReceiptHandle, valid.ReceiptHandle);
  assert.equal(calls[2].input.QueueUrl, options.queueUrl);
});

test('si SNS falla, conserva el mensaje de origen', async () => {
  const { calls, options } = setup([valid], { publishFails: true });
  assert.deepEqual(await fanoutOnce(options), { received: 1, published: 0, deleted: 0, failed: 1 });
  assert.equal(calls.some((c) => c.constructor.name === 'DeleteMessageCommand'), false);
});

test('si falla el borrado, informa la publicación y el fallo sin fingir éxito completo', async () => {
  const { options } = setup([valid], { deleteFails: true });
  assert.deepEqual(await fanoutOnce(options), { received: 1, published: 1, deleted: 0, failed: 1 });
});

test('un mensaje inválido no se publica ni elimina y no bloquea los pedidos válidos', async () => {
  const { calls, options } = setup([{ ...valid, Body: '{' }, valid]);
  assert.deepEqual(await fanoutOnce(options), { received: 2, published: 1, deleted: 1, failed: 1 });
  assert.equal(calls.filter((c) => c.constructor.name === 'PublishCommand').length, 1);
});

test('rechaza cuerpos null y pedidos incompletos sin eliminarlos', async () => {
  for (const body of ['null', '{}', '{"orderId":"id","productId":"sku","amount":-1}']) {
    const { calls, options } = setup([{ ...valid, Body: body }]);
    assert.equal((await fanoutOnce(options)).failed, 1);
    assert.equal(calls.length, 1);
  }
});

test('la cola vacía no publica ni elimina mensajes', async () => {
  const { calls, options } = setup([]);
  assert.deepEqual(await fanoutOnce(options), { received: 0, published: 0, deleted: 0, failed: 0 });
  assert.equal(calls.length, 1);
});

test('configuración incompleta falla antes de contactar AWS', async () => {
  const { calls, options } = setup();
  await assert.rejects(fanoutOnce({ ...options, topicArn: '' }), /QUEUE_URL y TOPIC_ARN/);
  assert.equal(calls.length, 0);
});
