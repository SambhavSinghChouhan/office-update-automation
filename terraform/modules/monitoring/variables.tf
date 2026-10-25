variable "name_prefix" { type = string }
variable "lambda_function_names" { type = map(string) }
variable "tags" {
  type    = map(string)
  default = {}
}
