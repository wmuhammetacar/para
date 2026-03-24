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

function resolveIpAddress(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    const first = forwarded.split(',')[0]?.trim();
    return toNullableTrimmedString(first, 100);
  }

  return toNullableTrimmedString(req.ip || req.socket?.remoteAddress, 100);
}

function stringifyMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }

  try {
    const json = JSON.stringify(metadata);
    if (!json || json === '{}') {
      return null;
    }

    return json.length <= 4000 ? json : json.slice(0, 4000);
  } catch {
    return null;
  }
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
