variable "iam_user_name" {
  description = "github-actions-devsecops"
  type        = string
  default     = "github-actions-devsecops"
}

variable "alert_email" {
  description = "Correo que recibirá las alertas de CloudWatch"
  type        = string
}