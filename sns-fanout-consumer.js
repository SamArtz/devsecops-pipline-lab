const { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } = require('@aws-sdk/client-sqs');
const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');

async function fanoutOnce({ sqsClient, snsClient, queueUrl, topicArn, logger = console }) {
  if (!queueUrl || !topicArn) {
    throw new Error('Configura QUEUE_URL y TOPIC_ARN con los outputs de api-gateway.');
  }

  logger.log('Revisando la cola de pedidos de la API...');
  const { Messages = [] } = await sqsClient.send(new ReceiveMessageCommand({
    QueueUrl: queueUrl,
    MaxNumberOfMessages: 10,
    WaitTimeSeconds: 10,
    VisibilityTimeout: 60,
  }));

  let published = 0;
  let deleted = 0;
  let failed = 0;
  for (const message of Messages) {
    let order;
    let sent = false;
    try {
      order = JSON.parse(message.Body);
      if (!order || typeof order.orderId !== 'string' || !order.orderId.trim()
          || typeof order.productId !== 'string' || !order.productId.trim()
          || typeof order.amount !== 'number' || !Number.isFinite(order.amount) || order.amount <= 0
          || !message.ReceiptHandle) {
        throw new Error('El mensaje no contiene un pedido válido o su ReceiptHandle.');
      }

      // Nunca eliminar el mensaje de origen antes de que SNS confirme la publicación.
      await snsClient.send(new PublishCommand({
        TopicArn: topicArn,
        Message: JSON.stringify(order),
        Subject: 'NuevoPedido',
      }));
      sent = true;
      published += 1;
      logger.log(`[fan-out] Pedido ${order.orderId} republicado en SNS para todos los interesados.`);

      await sqsClient.send(new DeleteMessageCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: message.ReceiptHandle,
      }));
      deleted += 1;
    } catch (error) {
      failed += 1;
      logger.error(`[fan-out] ${sent ? 'Publicado, pero no eliminado de origen; un reintento puede duplicarlo' : 'No publicado; se conserva en origen'}: ${order?.orderId || message.MessageId || 'mensaje desconocido'}. ${error.message}`);
    }
  }

  if (Messages.length === 0) logger.log('No llegaron pedidos nuevos.');
  logger.log(`[resumen] recibidos=${Messages.length}, publicados=${published}, eliminados=${deleted}, fallidos=${failed}`);
  return { received: Messages.length, published, deleted, failed };
}

async function main() {
  const region = process.env.AWS_REGION || 'us-east-1';
  const sqsClient = new SQSClient({ region });
  const snsClient = new SNSClient({ region });
  try {
    const result = await fanoutOnce({
      sqsClient, snsClient,
      queueUrl: process.env.QUEUE_URL,
      topicArn: process.env.TOPIC_ARN,
    });
    if (result.failed) process.exitCode = 1;
  } finally {
    sqsClient.destroy();
    snsClient.destroy();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { fanoutOnce };
