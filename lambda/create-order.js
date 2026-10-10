const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
const { randomUUID } = require('node:crypto');

const sqsClient = new SQSClient({ region: process.env.AWS_REGION || 'us-east-1' });
const respond = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

exports.handler = async (event) => {
  let body;
  try {
    const raw = event.isBase64Encoded
      ? Buffer.from(event.body || '', 'base64').toString('utf8')
      : event.body || '{}';
    body = JSON.parse(raw);
  } catch {
    return respond(400, { error: 'El cuerpo de la solicitud debe ser JSON válido' });
  }

  if (!body || typeof body.productId !== 'string' || !body.productId.trim()
      || typeof body.amount !== 'number' || !Number.isFinite(body.amount) || body.amount <= 0) {
    return respond(400, { error: 'Se requieren los campos productId y amount',
      detail: 'productId debe ser texto no vacío y amount un número mayor que cero' });
  }

  const order = {
    orderId: `API-${randomUUID()}`,
    productId: body.productId.trim(),
    amount: body.amount,
  };

  try {
    if (!process.env.QUEUE_URL) throw new Error('MissingQueueConfiguration');
    await sqsClient.send(new SendMessageCommand({
      QueueUrl: process.env.QUEUE_URL,
      MessageBody: JSON.stringify(order),
    }));
  } catch {
    console.error('No se pudo encolar el pedido');
    return respond(500, { error: 'No se pudo procesar la orden' });
  }

  return respond(201, { message: 'Orden recibida', order });
};
