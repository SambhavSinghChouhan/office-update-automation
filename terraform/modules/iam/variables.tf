variable "name_prefix" { type = string }
variable "region" { type = string }
variable "account_id" { type = string }
variable "partition" {
  type    = string
  default = "aws"
}
variable "table_arn" { type = string }
variable "table_index_arn" { type = string }
variable "integration_secret_arns" { type = list(string) }
variable "schedule_group_arn" { type = string }
variable "tags" {
  type    = map(string)
  default = {}
}
