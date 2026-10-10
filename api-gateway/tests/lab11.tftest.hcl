mock_provider "aws" {
  mock_resource "aws_apigatewayv2_api" {
    defaults = {
      execution_arn = "arn:aws:execute-api:us-east-1:123456789012:testapi"
      api_endpoint  = "https://testapi.execute-api.us-east-1.amazonaws.com"
    }
  }
  mock_resource "aws_iam_role" {
    defaults = {
      arn = "arn:aws:iam::123456789012:role/devsecops-lab-lambda-exec-role"
    }
  }
  mock_resource "aws_sqs_queue" {
    defaults = {
      arn = "arn:aws:sqs:us-east-1:123456789012:devsecops-lab-orders-api-queue"
      id  = "https://sqs.us-east-1.amazonaws.com/123456789012/devsecops-lab-orders-api-queue"
    }
  }
}

mock_provider "time" {}

run "http_api_contract" {
  command = apply

  assert {
    condition     = aws_apigatewayv2_route.post_orders.route_key == "POST /orders" && aws_apigatewayv2_route.get_health.route_key == "GET /health"
    error_message = "La API debe exponer las dos rutas del laboratorio."
  }

  assert {
    condition     = aws_lambda_function.create_order.environment[0].variables["QUEUE_URL"] == aws_sqs_queue.orders_api.id
    error_message = "La función de pedidos debe apuntar a la cola del laboratorio."
  }

  assert {
    condition     = jsondecode(aws_iam_role_policy.lambda_sqs_send.policy).Statement[0].Action == "sqs:SendMessage" && jsondecode(aws_iam_role_policy.lambda_sqs_send.policy).Statement[0].Resource == aws_sqs_queue.orders_api.arn
    error_message = "El rol de Lambda debe poder enviar exclusivamente a la cola de pedidos."
  }
}
