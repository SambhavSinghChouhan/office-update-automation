variable "bucket_name" {
  description = "Globally unique private frontend bucket name."
  type        = string
}
variable "tags" {
  type    = map(string)
  default = {}
}
