terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = "us-east-1"
}

module "site" {
  source          = "../../modules/static-site"
  bucket_name     = var.bucket_name
  index_file_path = "${path.module}/../../website/index.html"
  environment     = "dev"

  tags = {
    Equipo = "DevSecOps"
  }
}