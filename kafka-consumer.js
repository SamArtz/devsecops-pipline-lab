const { createKafka, ensureTopic, topic } = require('./kafka-local/client');

async function main() {
  const kafka = createKafka('devsecops-lab-consumer');
  await ensureTopic(kafka);
  const groupId = process.env.KAFKA_GROUP_ID || 'billing-service-group';
  const consumer = kafka.consumer({ groupId });
  const once = process.argv.includes('--once');
  let finish;
  let timer;
  const done = new Promise((resolve) => { finish = resolve; });
  const stop = () => finish('signal');
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    await consumer.connect();
    await consumer.subscribe({ topic, fromBeginning: true });
    console.log(`Escuchando ${topic}, grupo ${groupId} (Ctrl+C para salir)...`);
    await consumer.run({
      eachMessage: async ({ partition, message }) => {
        const order = JSON.parse(message.value.toString());
        console.log(`[billing-service] Orden recibida desde la partición ${partition}: ${order.orderId} ($${order.amount})`);
        if (once) finish('message');
      },
    });
    if (once) timer = setTimeout(() => finish('timeout'), 30000);
    if (await done === 'timeout') throw new Error('No se recibió un evento Kafka en 30 segundos.');
  } finally {
    clearTimeout(timer);
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
    await consumer.disconnect();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
