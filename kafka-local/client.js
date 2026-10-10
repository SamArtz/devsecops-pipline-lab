const { Kafka, Partitioners } = require('kafkajs');

const topic = 'order-events';
function createKafka(clientId) {
  return new Kafka({
    clientId,
    brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(',').map((s) => s.trim()),
  });
}

async function ensureTopic(kafka) {
  const admin = kafka.admin();
  try {
    await admin.connect();
    await admin.createTopics({
      waitForLeaders: true,
      topics: [{ topic, numPartitions: 1, replicationFactor: 1 }],
    });
  } finally {
    await admin.disconnect();
  }
}

module.exports = { createKafka, ensureTopic, topic, Partitioners };
