import { run } from '../db.js';

function toNullableTrimmedString(value, maxLength) {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = String(value).trim();
  if (!trimmed) {
    return null;
  }

  if (!maxLength || trimmed.length <= maxLength) {
    return trimmed;
  }

  return trimmed.slice(0, maxLength);
}

function maskEmail(value) {
  const text = String(value || '').trim();
  const atIndex = text.indexOf('@');
  if (atIndex <= 1) {
    return '***';
  }

  const first = text.slice(0, 1);
  const domain = text.slice(atIndex);
  return `${first}***${domain}`;
}

function maskPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) {
    return '***';
  }

  if (digits.length <= 4) {
    return `${'*'.repeat(Math.max(1, digits.length - 1))}${digits.slice(-1)}`;
  }

  return `${digits.slice(0, 2)}${'*'.repeat(Math.max(2, digits.length - 4))}${digits.slice(-2)}`;
}

function looksLikeEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function looksLikePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 10;
}

function maskByContext(value, parentKey) {
  const key = parentKey.toLowerCase();
  const text = String(value || '');

  if (key.includes('password') || key.includes('token') || key.includes('secret')) {
    return '[REDACTED]';
  }

  if (key.includes('email') || looksLikeEmail(text)) {
    return maskEmail(text);
  }

  if (
    key.includes('phone') ||
    key.includes('recipient') ||
    key.includes('contact') ||
    (key.includes('to') && looksLikePhone(text))
  ) {
    return maskPhone(text);
  }

  return text;
}

function sanitizeMetadata(metadata, parentKey = '') {
  if (metadata === null || metadata === undefined) {
    return metadata;
  }

  if (Array.isArray(metadata)) {
    return metadata.map((item) => sanitizeMetadata(item, parentKey));
  }

  if (typeof metadata !== 'object') {
    if (typeof metadata !== 'string') {
      return metadata;
    }

    return maskByContext(metadata, parentKey);
  }

  const redacted = {};
  for (const [key, value] of Object.entries(metadata)) {
    const normalizedKey = key.toLowerCase();
    if (normalizedKey.includes('password') || normalizedKey.includes('token') || normalizedKey.includes('secret')) {
      redacted[key] = '[REDACTED]';
      continue;
    }

    redacted[key] = sanitizeMetadata(value, normalizedKey);
  }

  return redacted;
}

function resolveIpAddress(req) {
  return toNullableTrimmedString(req.ip || req.socket?.remoteAddress, 100);
}

function stringifyMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }

  try {
    const sanitized = sanitizeMetadata(metadata);
    const json = JSON.stringify(sanitized);
    if (!json || json === '{}') {
      return null;
    }

    return json.length <= 4000 ? json : json.slice(0, 4000);
  } catch {
    return null;
  }
}

function normalizeRetentionDays(value, fallback = 90) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export async function purgeOldAuditLogs(retentionDays = process.env.AUDIT_LOG_RETENTION_DAYS) {
  const safeRetentionDays = normalizeRetentionDays(retentionDays, 90);
  const result = await run(
    `
    DELETE FROM audit_logs
    WHERE datetime(created_at) < datetime('now', ?)
    `,
    [`-${safeRetentionDays} day`]
  );

  return {
    retentionDays: safeRetentionDays,
    deleted: Number(result?.changes) || 0
  };
}

export async function recordAuditLog({
  req,
  userId = null,
  eventType,
  resourceType = null,
  resourceId = null,
  metadata = null
}) {
  const safeEventType = toNullableTrimmedString(eventType, 120);
  if (!safeEventType) {
    return;
  }

  const safeUserId = Number.isInteger(Number(userId)) ? Number(userId) : null;
  const safeRequestId = toNullableTrimmedString(req?.requestId, 100);
  const safeIp = resolveIpAddress(req || {});
  const safeUserAgent = toNullableTrimmedString(req?.headers?.['user-agent'], 255);
  const safeResourceType = toNullableTrimmedString(resourceType, 80);
  const safeResourceId = toNullableTrimmedString(resourceId, 80);
  const metadataJson = stringifyMetadata(metadata);

  try {
    await run(
      `
      INSERT INTO audit_logs (
        user_id,
        event_type,
        resource_type,
        resource_id,
        request_id,
        ip_address,
        user_agent,
        metadata_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [safeUserId, safeEventType, safeResourceType, safeResourceId, safeRequestId, safeIp, safeUserAgent, metadataJson]
    );
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Audit log write failed:', error);
  }
}
