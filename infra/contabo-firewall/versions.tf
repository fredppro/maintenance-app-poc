terraform {
  required_version = ">= 1.5.0"

  required_providers {
    contabo = {
      source  = "contabo/contabo"
      version = "= 0.1.44"
    }
  }
}

provider "contabo" {}
