data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"]

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"]
  }

  filter {
    name   = "architecture"
    values = ["x86_64"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

resource "aws_vpc" "opsforge" {
  cidr_block           = "10.42.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name        = "opsforge-${var.environment}-vpc"
    Environment = var.environment
  }
}

resource "aws_subnet" "public" {
  vpc_id                  = aws_vpc.opsforge.id
  cidr_block              = "10.42.1.0/24"
  availability_zone       = data.aws_availability_zones.available.names[0]
  map_public_ip_on_launch = false

  tags = {
    Name        = "opsforge-${var.environment}-public"
    Environment = var.environment
  }
}

resource "aws_internet_gateway" "opsforge" {
  vpc_id = aws_vpc.opsforge.id

  tags = {
    Name        = "opsforge-${var.environment}-igw"
    Environment = var.environment
  }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.opsforge.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.opsforge.id
  }

  tags = {
    Name        = "opsforge-${var.environment}-public"
    Environment = var.environment
  }
}

resource "aws_route_table_association" "public" {
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public.id
}

# This single-node K3s host requires internet egress for image registries,
# package repositories, certificate issuance, AWS APIs, and external services.
#trivy:ignore:AVD-AWS-0104
resource "aws_security_group" "opsforge" {
  name        = "opsforge-${var.environment}"
  description = "Public web access and restricted SSH for the OpsForge K3s node"
  vpc_id      = aws_vpc.opsforge.id

  dynamic "ingress" {
    for_each = var.enable_ssh_access ? [1] : []

    content {
      description = "Temporary SSH from administrator IP; disable after SSM verification"
      from_port   = 22
      to_port     = 22
      protocol    = "tcp"
      cidr_blocks = [var.ssh_allowed_cidr]
    }
  }

  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = var.cloudflare_ipv4_cidrs
  }

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = var.cloudflare_ipv4_cidrs
  }

  egress {
    description = "Allow outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name        = "opsforge-${var.environment}"
    Environment = var.environment
  }
}

resource "aws_key_pair" "opsforge" {
  key_name   = "opsforge-${var.environment}"
  public_key = var.ssh_public_key != null ? var.ssh_public_key : file(pathexpand(var.ssh_public_key_path))

  tags = {
    Name        = "opsforge-${var.environment}"
    Environment = var.environment
  }
}

resource "aws_instance" "opsforge" {
  ami                         = data.aws_ami.ubuntu.id
  instance_type               = var.instance_type
  subnet_id                   = aws_subnet.public.id
  vpc_security_group_ids      = [aws_security_group.opsforge.id]
  key_name                    = aws_key_pair.opsforge.key_name
  iam_instance_profile        = aws_iam_instance_profile.opsforge.name
  associate_public_ip_address = true
  user_data                   = file("${path.module}/scripts/install-k3s.sh")
  user_data_replace_on_change = true

  root_block_device {
    volume_type           = "gp3"
    volume_size           = var.root_volume_size
    encrypted             = true
    delete_on_termination = true
  }

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 2
  }

  tags = {
    Name        = "opsforge-${var.environment}"
    Environment = var.environment
  }
}

resource "aws_eip" "opsforge" {
  domain   = "vpc"
  instance = aws_instance.opsforge.id

  tags = {
    Name        = "opsforge-${var.environment}"
    Environment = var.environment
  }
}
