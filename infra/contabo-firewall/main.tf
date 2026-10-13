resource "contabo_firewall" "maintenance" {
  name        = var.firewall_name
  description = "Ingress policy for the maintenance production VPS"
  status      = "active"
  instance_ids = toset(concat(
    [var.contabo_instance_id],
    var.recovery_instance_enabled ? [tonumber(contabo_instance.recovery[0].id)] : []
  ))

  lifecycle {
    precondition {
      condition = !var.bootstrap_ssh_enabled || (
        var.recovery_instance_enabled &&
        length(var.bootstrap_ssh_ipv4_source_cidrs) == 1
      )
      error_message = "Temporary SSH access requires an enabled recovery instance and exactly one operator IPv4 /32."
    }
  }

  rules {
    inbound {
      protocol   = "tcp"
      action     = "accept"
      status     = "active"
      dest_ports = ["80", "443"]

      src_cidr {
        ipv4 = var.web_ipv4_source_cidrs
        ipv6 = var.web_ipv6_source_cidrs
      }
    }

    inbound {
      protocol   = "udp"
      action     = "accept"
      status     = "active"
      dest_ports = ["51820"]

      src_cidr {
        ipv4 = var.wireguard_ipv4_source_cidrs
        ipv6 = var.wireguard_ipv6_source_cidrs
      }
    }

    dynamic "inbound" {
      for_each = var.bootstrap_ssh_enabled ? [true] : []

      content {
        protocol   = "tcp"
        action     = "accept"
        status     = "active"
        dest_ports = ["22"]

        src_cidr {
          ipv4 = var.bootstrap_ssh_ipv4_source_cidrs
          ipv6 = []
        }
      }
    }
  }
}
