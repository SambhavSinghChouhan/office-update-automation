variable "name_prefix" { type = string }
variable "region" { type = string }
variable "callback_urls" { type = list(string) }
variable "logout_urls" { type = list(string) }
variable "domain_prefix" {
  description = "Optional globally unique Cognito hosted UI prefix. Leave empty when the app uses Cognito SDK sign-in directly."
  type        = string
  default     = ""
}
variable "mfa_configuration" {
  type    = string
  default = "OPTIONAL"
  validation {
    condition     = contains(["OFF", "OPTIONAL", "ON"], var.mfa_configuration)
    error_message = "mfa_configuration must be OFF, OPTIONAL, or ON."
  }
}
variable "deletion_protection" {
  type    = bool
  default = true
}
variable "tags" {
  type    = map(string)
  default = {}
}
