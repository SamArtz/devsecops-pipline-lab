terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

   backend "s3" {
    bucket         = "adrian-terraform-state-lab3-2026"
    key            = "static-site/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "terraform-locks"
    encrypt        = true
  }
}

provider "aws" {
  region = "us-east-1"
}

locals {
  workspace_aliases = {
    default = "dev"
  }

  environment_name = lookup(
    local.workspace_aliases,
    terraform.workspace,
    terraform.workspace
  )

  bucket_names = {
    dev     = "adrian-devsecops-lab3-4-2026"
    staging = "adrian-devsecops-lab-staging-2026"
    prod    = "adrian-devsecops-lab-prod-2026"
  }

  environment_settings = {
    dev = {
      tags = {
        Criticidad = "baja"
      }
    }

    staging = {
      tags = {
        Criticidad = "media"
      }
    }

    prod = {
      tags = {
        Criticidad = "alta"
      }
    }
  }
}

module "site" {
  source          = "../../modules/static-site"
  bucket_name     = local.bucket_names[local.environment_name]
  index_file_path = "${path.module}/../../website/index.html"
  environment     = local.environment_name
  tags            = local.environment_settings[local.environment_name].tags
}

