output "firewall_id" {
  description = "Contabo firewall ID. Keep this with the Terraform state."
  value       = contabo_firewall.maintenance.id
}

output "firewall_status" {
  description = "Current Contabo firewall status."
  value       = contabo_firewall.maintenance.status
}

output "recovery_instance_id" {
  description = "On-demand recovery VPS ID, or null when recovery provisioning is disabled."
  value       = var.recovery_instance_enabled ? contabo_instance.recovery[0].id : null
}

output "recovery_public_ipv4" {
  description = "On-demand recovery VPS primary public IPv4, or null when recovery provisioning is disabled."
  value       = var.recovery_instance_enabled ? contabo_instance.recovery[0].ip_config[0].v4[0].ip : null
}

output "recovery_public_ipv6" {
  description = "On-demand recovery VPS primary public IPv6, or null when IPv6 is not assigned or recovery provisioning is disabled."
  value       = var.recovery_instance_enabled ? try(contabo_instance.recovery[0].ip_config[0].v6[0].ip, null) : null
}
