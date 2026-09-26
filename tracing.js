const { NodeSDK } = require('@opentelemetry/sdk-node');
const { ConsoleSpanExporter, SimpleSpanProcessor } = require('@opentelemetry/sdk-trace-base');

// Inicializador de OpenTelemetry: exporta cada span a la consola.
const sdk = new NodeSDK({
  serviceName: 'devsecops-lab',
  spanProcessors: [new SimpleSpanProcessor(new ConsoleSpanExporter())],
});

sdk.start();

module.exports = sdk;
