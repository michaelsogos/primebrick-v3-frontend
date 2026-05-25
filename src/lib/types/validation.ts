export enum ValidationResult {
  VALID = "VALID",
  NOT_VALID = "NOT_VALID",
  ERROR_API = "ERROR_API"
}

export type ValidationStatus = "idle" | "loading" | "valid" | "not-valid" | "api-error";
