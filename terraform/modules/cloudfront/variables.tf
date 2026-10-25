variable "name_prefix" { type = string }
variable "bucket_name" { type = string }
variable "bucket_arn" { type = string }
variable "bucket_regional_domain_name" { type = string }
variable "price_class" {
  description = "CloudFront price class; PriceClass_100 limits edge locations and cost."
  type        = string
  default     = "PriceClass_100"
  validation {
    condition     = contains(["PriceClass_100", "PriceClass_200", "PriceClass_All"], var.price_class)
    error_message = "price_class must be a valid CloudFront price class."
  }
}
variable "cache_policy_id" {
  description = "AWS managed CachingOptimized policy ID."
  type        = string
  default     = "658327ea-f89d-4fab-a63d-7e88639e58f6"
}
variable "aliases" {
  type    = list(string)
  default = []
}
variable "acm_certificate_arn" {
  type    = string
  default = ""
}
variable "tags" {
  type    = map(string)
  default = {}
}
