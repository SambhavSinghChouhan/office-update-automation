variable "bucket_name" {
  description = "Globally unique private frontend bucket name."
  type        = string
}
variable "force_destroy" {
  description = "Delete bucket objects when removing the frontend stack. Enable only for an explicit destroy operation."
  type        = bool
  default     = false
}
variable "tags" {
  type    = map(string)
  default = {}
}
