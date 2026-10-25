variable "name_prefix" { type = string }
variable "schedule_group_name" { type = string }
variable "scheduler_role_arn" { type = string }
variable "scheduler_role_name" { type = string }
variable "report_processor_arn" { type = string }
variable "account_id" { type = string }
variable "partition" {
  type    = string
  default = "aws"
}
variable "region" { type = string }
variable "timezone" {
  type    = string
  default = "Asia/Kolkata"
}
variable "fallback_enabled" {
  type    = bool
  default = true
}
variable "maximum_event_age_seconds" {
  type    = number
  default = 3600
}
variable "maximum_retry_attempts" {
  type    = number
  default = 3
}
variable "tags" {
  type    = map(string)
  default = {}
}
