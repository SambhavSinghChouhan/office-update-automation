resource "aws_secretsmanager_secret" "gemini" {
  name                    = var.gemini_secret_name
  description             = "Gemini API credential for ${var.name_prefix}"
  recovery_window_in_days = var.recovery_window_in_days
  tags                    = var.tags
  lifecycle { prevent_destroy = true }
}

resource "aws_secretsmanager_secret" "teams" {
  name                    = var.teams_secret_name
  description             = "Microsoft Teams integration credential for ${var.name_prefix}"
  recovery_window_in_days = var.recovery_window_in_days
  tags                    = var.tags
  lifecycle { prevent_destroy = true }
}

output "gemini_secret_arn" { value = aws_secretsmanager_secret.gemini.arn }
output "teams_secret_arn" { value = aws_secretsmanager_secret.teams.arn }
output "secret_arns" { value = [aws_secretsmanager_secret.gemini.arn, aws_secretsmanager_secret.teams.arn] }
