import type { ErrorRequestHandler } from 'express';

/** One bounded JSON boundary for framework, upload and unexpected route failures. */
export const jsonErrorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  if (res.headersSent) { next(error); return; }
  const status = error?.code === 'LIMIT_FILE_SIZE' ? 413 : error?.type === 'entity.parse.failed' ? 400
    : Number.isInteger(error?.status) && error.status >= 400 && error.status < 600 ? error.status : 500;
  const message = error?.code === 'LIMIT_FILE_SIZE' ? 'The uploaded file exceeds the allowed size.'
    : error?.type === 'entity.parse.failed' ? 'The request body is not valid JSON.'
    : status === 500 ? 'The operation could not be completed. Check the saved resource state before repeating a command.' : 'The request could not be completed.';
  res.status(status).json({ error: message, code: status === 500 ? 'INTERNAL_OPERATION_FAILED' : 'INVALID_REQUEST' });
};
