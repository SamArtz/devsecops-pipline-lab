const { randomUUID } = require('node:crypto');
const { createKafka, ensureTopic, topic, Partitioners } = require('./client');

async function main() {
  const kafka = createKafka('devsecops-lab-producer');
  await ensureTopic(kafka);
  const producer = kafka.producer({ createPartitioner: Partitioners.DefaultPartitioner });
  try {
    await producer.connect();
    const order = { orderId: `KAFKA-${randomUUID()}`, productId: 'sku-100', amount: 25 };
    await producer.send({ topic, messages: [{ key: order.orderId, value: JSON.stringify(order) }] });
    console.log('Evento publicado en Kafka:', JSON.stringify(order));
  } finally {
    await producer.disconnect();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
