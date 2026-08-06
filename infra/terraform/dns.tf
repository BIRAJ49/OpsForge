resource "cloudflare_dns_record" "opsforge" {
  zone_id = var.cloudflare_zone_id
  name    = var.domain_name
  type    = "A"
  content = aws_eip.opsforge.public_ip
  ttl     = 1
  proxied = true
}
