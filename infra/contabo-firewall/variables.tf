variable "contabo_instance_id" {
  description = "Numeric Contabo instance ID for the existing VPS; do not use its public IP or subscription ID."
  type        = number
  nullable    = false

  validation {
    condition     = var.contabo_instance_id > 0 && floor(var.contabo_instance_id) == var.contabo_instance_id
    error_message = "contabo_instance_id must be the positive numeric ID of the existing VPS."
  }
}

variable "firewall_name" {
  description = "Name for the Contabo provider firewall."
  type        = string
  default     = "maintenance-prod-ingress"
  nullable    = false
}

variable "web_ipv4_source_cidrs" {
  description = "Explicit IPv4 source CIDRs allowed to reach TCP/80 and TCP/443."
  type        = set(string)
  nullable    = false

  validation {
    condition     = length(var.web_ipv4_source_cidrs) > 0
    error_message = "Choose at least one IPv4 source CIDR explicitly."
  }
}

variable "web_ipv6_source_cidrs" {
  description = "Explicit IPv6 source CIDRs allowed to reach TCP/80 and TCP/443. Set to [] to allow no IPv6 sources."
  type        = set(string)
  nullable    = false
}

variable "wireguard_ipv4_source_cidrs" {
  description = "Explicit IPv4 source CIDRs allowed to reach UDP/51820."
  type        = set(string)
  nullable    = false
}

variable "wireguard_ipv6_source_cidrs" {
  description = "Explicit IPv6 source CIDRs allowed to reach UDP/51820. Set to [] to allow no IPv6 sources."
  type        = set(string)
  nullable    = false
}

variable "recovery_instance_enabled" {
  description = "Create an on-demand recovery VPS. Keep true after creation; prevent_destroy guards accidental removal."
  type        = bool
  default     = false
  nullable    = false
}

variable "recovery_instance_display_name" {
  description = "Display name for the on-demand recovery VPS."
  type        = string
  default     = "maintenance-recovery"
  nullable    = false
}

variable "recovery_instance_product_id" {
  description = "Contabo product ID for the recovery VPS. Verify current product availability and price before applying."
  type        = string
  default     = "V153"
  nullable    = false
}

variable "recovery_instance_region" {
  description = "Contabo region for the recovery VPS."
  type        = string
  default     = "EU"
  nullable    = false
}

variable "recovery_instance_period" {
  description = "Initial Contabo contract period in months."
  type        = number
  default     = 1
  nullable    = false

  validation {
    condition     = contains([1, 3, 6, 12], var.recovery_instance_period)
    error_message = "The Contabo contract period must be 1, 3, 6, or 12 months."
  }
}

variable "recovery_instance_image_id" {
  description = "Contabo image ID; must resolve to a standard Ubuntu 24.04 Linux image."
  type        = string
  default     = ""
  nullable    = false
}

variable "recovery_ssh_public_key_path" {
  description = "Local path to the operator's public SSH key used by cloud-init. Never point this at a private key."
  type        = string
  default     = ""
  nullable    = false
}

variable "bootstrap_ssh_enabled" {
  description = "Temporarily allow provider-firewall TCP/22 from the required operator IPv4 /32 while bootstrapping the recovery VPS."
  type        = bool
  default     = false
  nullable    = false
}

variable "bootstrap_ssh_ipv4_source_cidrs" {
  description = "Exactly one operator IPv4 /32 allowed to bootstrap the recovery VPS; never use a broad range."
  type        = set(string)
  default     = []
  nullable    = false

  validation {
    condition = length(var.bootstrap_ssh_ipv4_source_cidrs) == 0 || (
      length(var.bootstrap_ssh_ipv4_source_cidrs) == 1 &&
      alltrue([
        for cidr in var.bootstrap_ssh_ipv4_source_cidrs :
        can(regex("/32$", cidr)) && can(cidrhost(cidr, 0))
      ])
    )
    error_message = "Bootstrap SSH source must be empty or exactly one valid IPv4 /32."
  }
}
