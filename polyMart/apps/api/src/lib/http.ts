export class HttpError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

export function badRequest(message: string) {
  return new HttpError(400, message);
}

export function unauthorized(message = "Authentication required.") {
  return new HttpError(401, message);
}

export function forbidden(message = "Forbidden.") {
  return new HttpError(403, message);
}

export function notFound(message = "Not found.") {
  return new HttpError(404, message);
}

export function conflict(message: string) {
  return new HttpError(409, message);
}
