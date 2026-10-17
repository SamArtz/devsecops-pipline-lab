const { Kafka, Partitioners } = require('kafkajs');
const topic = 'order-events';

function createKafka(clientId) {
  const brokers = (process.env.KAFKA_BROKERS || 'kafka:9092').split(',').map((s) => s.trim());
  console.log(`Service Discovery: brokers=${brokers.join(',')}`);
  return new Kafka({ clientId, brokers });
}

async function ensureTopic(kafka) {
  const admin = kafka.admin();
  try {
    await admin.connect();
    if (!(await admin.listTopics()).includes(topic)) {
      await admin.createTopics({
        waitForLeaders: true,
        topics: [{ topic, numPartitions: 1, replicationFactor: 1 }],
      });
    }
  } finally {
    await admin.disconnect();
  }
}

module.exports = { createKafka, ensureTopic, topic, Partitioners };
