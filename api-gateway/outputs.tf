output "api_url" {
  description = "URL base de la API; agregar /health o /orders"
  value       = aws_apigatewayv2_api.orders_api.api_endpoint
}

output "queue_url" {
  description = "Cola de pedidos que se reutiliza en el Laboratorio 12"
  value       = aws_sqs_queue.orders_api.id
}

output "billing_queue_url" {
  description = "Cola de facturación suscrita al tema SNS"
  value       = aws_sqs_queue.billing.id
}

output "shipping_queue_url" {
  description = "Cola de envíos suscrita al tema SNS"
  value       = aws_sqs_queue.shipping.id
}
