variable "name_prefix" { type = string }
variable "artifact_bucket_name" { type = string }
variable "execution_role_arns" { type = map(string) }
variable "log_retention_days" {
  type    = number
  default = 30
}
variable "tracing_mode" {
  type    = string
  default = "PassThrough"
  validation {
    condition     = contains(["Active", "PassThrough"], var.tracing_mode)
    error_message = "tracing_mode must be Active or PassThrough."
  }
}
variable "tags" {
  type    = map(string)
  default = {}
}
variable "functions" {
  description = "Function definitions. ZIPs must already exist in artifact_bucket_name before apply."
  type = map(object({
    description           = string
    runtime               = string
    handler               = string
    s3_key                = string
    s3_object_version     = optional(string)
    source_code_hash      = optional(string)
    memory_size           = number
    timeout               = number
    environment_variables = map(string)
  }))
  validation {
    condition     = length(var.functions) > 0 && alltrue([for f in values(var.functions) : f.timeout >= 1 && f.timeout <= 900 && f.memory_size >= 128 && f.memory_size <= 10240])
    error_message = "At least one Lambda function is required; timeout must be 1-900 seconds and memory 128-10240 MB."
  }
}
