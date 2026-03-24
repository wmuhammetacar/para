export function buildErrorBody(code, message, details) {
  const error = {
    code,
    message
  };

  if (details !== undefined) {
    error.details = details;
  }

  return {
    success: false,
    error
  };
}

export function sendError(res, status, code, message, details) {
  return res.status(status).json(buildErrorBody(code, message, details));
}
