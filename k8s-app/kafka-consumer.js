const fs = require('node:fs');
const { createKafka, ensureTopic, topic } = require('./client');
const readyFile = '/tmp/billing-consumer-ready';

async function main() {
  const kafka = createKafka('devsecops-lab-consumer');
  await ensureTopic(kafka);
  const consumer = kafka.consumer({ groupId: 'billing-service-group' });
  let finish;
  const done = new Promise((resolve) => { finish = resolve; });
  const notReady = () => fs.rmSync(readyFile, { force: true });
  const stop = () => finish();
  consumer.on(consumer.events.GROUP_JOIN, () => fs.writeFileSync(readyFile, 'ready'));
  consumer.on(consumer.events.DISCONNECT, notReady);
  consumer.on(consumer.events.CRASH, ({ payload }) => {
    notReady();
    if (!payload.restart) finish(payload.error);
  });
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  try {
    await consumer.connect();
    await consumer.subscribe({ topic, fromBeginning: true });
    console.log('Escuchando el tópico order-events...');
    await consumer.run({
      eachMessage: async ({ partition, message }) => {
        const order = JSON.parse(message.value.toString());
        console.log(`[billing-service] Orden recibida desde la partición ${partition}: ${order.orderId} ($${order.amount})`);
      },
    });
    const error = await done;
    if (error) throw error;
  } finally {
    notReady();
    process.removeListener('SIGTERM', stop);
    process.removeListener('SIGINT', stop);
    await consumer.disconnect();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
