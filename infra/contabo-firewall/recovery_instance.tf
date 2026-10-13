data "contabo_image" "recovery" {
  count = (
    var.recovery_instance_enabled && trimspace(var.recovery_instance_image_id) != ""
  ) ? 1 : 0

  id = var.recovery_instance_image_id

  lifecycle {
    postcondition {
      condition = (
        self.standard_image &&
        lower(self.os_type) == "linux" &&
        strcontains(lower(self.name), "ubuntu") &&
        strcontains(self.version, "24.04")
      )
      error_message = "The recovery image must be a standard Linux Ubuntu 24.04 image."
    }
  }
}

resource "contabo_instance" "recovery" {
  count = var.recovery_instance_enabled ? 1 : 0

  display_name = var.recovery_instance_display_name
  product_id   = var.recovery_instance_product_id
  region       = var.recovery_instance_region
  period       = var.recovery_instance_period
  image_id     = var.recovery_instance_image_id
  default_user = "root"
  user_data = trimspace(var.recovery_ssh_public_key_path) != "" ? templatefile(
    "${path.module}/cloud-init-recovery.yaml.tftpl",
    { ssh_public_key = trimspace(file(pathexpand(var.recovery_ssh_public_key_path))) }
  ) : ""

  lifecycle {
    prevent_destroy = true

    precondition {
      condition = (
        trimspace(var.recovery_instance_image_id) != "" &&
        length(data.contabo_image.recovery) == 1 &&
        trimspace(var.recovery_ssh_public_key_path) != "" &&
        can(file(pathexpand(var.recovery_ssh_public_key_path)))
      )
      error_message = "Recovery creation requires a valid Ubuntu 24.04 image ID and a readable public SSH key file."
    }
  }
}
