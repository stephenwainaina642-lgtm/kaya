export class AppError extends Error {
  status: number;
  code: string;
  details?: Record<string, unknown>;

  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function invalid(fields: Record<string, string>): AppError {
  return new AppError(422, 'VALIDATION_FAILED', 'Validation failed', { fields });
}

export function notFound(what: string): AppError {
  return new AppError(404, 'NOT_FOUND', `${what} not found`);
}

export function forbidden(message = 'Forbidden'): AppError {
  return new AppError(403, 'FORBIDDEN', message);
}

export function unauthorized(message = 'Unauthorized'): AppError {
  return new AppError(401, 'UNAUTHORIZED', message);
}

export function locked(message: string): AppError {
  return new AppError(423, 'ACCOUNT_LOCKED', message);
}

export function conflict(message: string, code = 'CONFLICT'): AppError {
  return new AppError(409, code, message);
}

export function planUpgradeRequired(message: string, requiredPlan: string): AppError {
  return new AppError(403, 'PLAN_UPGRADE_REQUIRED', message, { requiredPlan });
}
