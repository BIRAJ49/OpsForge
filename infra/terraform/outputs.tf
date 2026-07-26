output "public_ip" {
  description = "Elastic public IPv4 address of the OpsForge server."
  value       = aws_eip.opsforge.public_ip
}

output "instance_id" {
  description = "EC2 instance ID of the OpsForge server."
  value       = aws_instance.opsforge.id
}

output "ssh_command" {
  description = "Command for connecting to the OpsForge server over SSH."
  value       = "ssh -i ${trimsuffix(var.ssh_public_key_path, ".pub")} ubuntu@${aws_eip.opsforge.public_ip}"
}
