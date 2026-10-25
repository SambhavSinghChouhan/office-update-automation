variable "name_prefix" { type = string }
variable "session_api_lambda_arn" { type = string }
variable "cognito_client_id" { type = string }
variable "cognito_issuer_url" { type = string }
variable "allowed_origins" { type = list(string) }
variable "routes" {
  description = "Authenticated API Gateway HTTP API routes, including method and path."
  type        = list(string)
  default     = ["GET /sessions", "POST /sessions", "GET /sessions/{sessionId}", "PUT /sessions/{sessionId}", "POST /sessions/{sessionId}/retry"]
  validation {
    condition     = length(var.routes) > 0 && alltrue([for route in var.routes : can(regex("^(GET|POST|PUT|PATCH|DELETE) /", route))])
    error_message = "Every route must start with an HTTP method and a path."
  }
}
variable "log_retention_days" {
  type    = number
  default = 30
}
variable "tags" {
  type    = map(string)
  default = {}
}
