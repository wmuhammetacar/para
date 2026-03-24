import jwt from 'jsonwebtoken';
import { sendError } from '../utils/response.js';

export function authenticate(req, res, next) {
  const authHeader = req.headers.authorization || '';

  if (!authHeader.startsWith('Bearer ')) {
    sendError(res, 401, 'UNAUTHORIZED', 'Bu islem icin giris yapmalisiniz.');
    return;
  }

  const token = authHeader.slice(7);
  const jwtSecret = process.env.JWT_SECRET;

  if (!jwtSecret) {
    sendError(res, 500, 'CONFIG_ERROR', 'JWT ayari eksik.');
    return;
  }

  try {
    const payload = jwt.verify(token, jwtSecret);
    req.user = payload;
    next();
  } catch (error) {
    sendError(res, 401, 'INVALID_TOKEN', 'Oturum gecersiz.');
  }
}
