variable "table_name" { type = string }
variable "deletion_protection_enabled" {
  type    = bool
  default = true
}
variable "point_in_time_recovery_enabled" {
  type    = bool
  default = true
}
variable "tags" {
  type    = map(string)
  default = {}
}
