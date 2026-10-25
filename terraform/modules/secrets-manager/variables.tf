variable "name_prefix" { type = string }
variable "gemini_secret_name" { type = string }
variable "teams_secret_name" { type = string }
variable "recovery_window_in_days" {
  type    = number
  default = 30
  validation {
    condition     = var.recovery_window_in_days >= 7 && var.recovery_window_in_days <= 30
    error_message = "Secrets Manager recovery window must be between 7 and 30 days."
  }
}
variable "tags" {
  type    = map(string)
  default = {}
}
