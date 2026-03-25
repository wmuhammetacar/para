import { withDbTransaction } from '../db.js';
import { recordAuditLog } from '../utils/audit.js';
import { badRequest, notFound } from '../utils/httpErrors.js';
import { getUserPlanSnapshot, listPlans } from '../utils/plans.js';
import {
  expireOldPlanChangeRequests,
  getPlanChangeRequestById,
  getPlanChangeRequestForUser,
  getUserPlanRecord,
  insertPlanChangeRequest,
  markPlanChangeRequestApplied,
  markPlanChangeRequestExpired,
  markPlanChangeRequestPaid,
  updateUserPlanCode
} from '../utils/dashboardRepository.js';

export async function getPlanSnapshotWorkflow(userId) {
  const snapshot = await getUserPlanSnapshot(userId);
  const availablePlans = listPlans();

  return {
    currentPlan: snapshot.plan,
    monthRange: snapshot.monthRange,
    usage: snapshot.metrics,
    availablePlans
  };
}

export async function createPlanChangeRequestWorkflow({ req, userId, planCode, ttlMinutes }) {
  const existing = await getUserPlanRecord(userId);
  if (!existing) {
    throw badRequest('Kullanici bulunamadi.');
  }

  if (existing.plan_code === planCode) {
    throw badRequest('Secilen paket zaten aktif.', [{ field: 'planCode', rule: 'differentFromCurrent' }]);
  }

  await expireOldPlanChangeRequests(userId);

  const insertResult = await insertPlanChangeRequest(userId, planCode, ttlMinutes);
  const createdRequest = await getPlanChangeRequestForUser(insertResult.id, userId);

  if (!createdRequest) {
    throw badRequest('Plan degisikligi talebi olusturulamadi.');
  }

  await recordAuditLog({
    req,
    userId,
    eventType: 'PLAN_CHANGE_REQUEST_CREATED',
    resourceType: 'billing_plan_change_request',
    resourceId: String(createdRequest.id),
    metadata: {
      targetPlanCode: createdRequest.target_plan_code,
      status: createdRequest.status,
      expiresAt: createdRequest.expires_at
    }
  });

  return {
    id: createdRequest.id,
    userId,
    targetPlanCode: createdRequest.target_plan_code,
    status: createdRequest.status,
    createdAt: createdRequest.created_at,
    expiresAt: createdRequest.expires_at
  };
}

export async function confirmPlanChangeRequestWorkflow({ req, requestId, paymentReference, isExpired }) {
  const billingRequest = await getPlanChangeRequestById(requestId);
  if (!billingRequest) {
    throw notFound('Plan degisikligi talebi bulunamadi.');
  }

  if (billingRequest.status === 'applied') {
    throw badRequest('Bu plan degisikligi talebi zaten uygulandi.');
  }

  if (isExpired(billingRequest.expires_at)) {
    if (billingRequest.status === 'pending') {
      await markPlanChangeRequestExpired(billingRequest.id);
    }

    throw badRequest('Plan degisikligi talebinin suresi dolmus.');
  }

  if (billingRequest.status !== 'pending') {
    throw badRequest('Bu plan degisikligi talebi bu asamada onaylanamaz.');
  }

  await markPlanChangeRequestPaid(billingRequest.id, paymentReference);

  await recordAuditLog({
    req,
    userId: billingRequest.user_id,
    eventType: 'PLAN_CHANGE_PAYMENT_CONFIRMED',
    resourceType: 'billing_plan_change_request',
    resourceId: String(billingRequest.id),
    metadata: {
      targetPlanCode: billingRequest.target_plan_code,
      paymentReference
    }
  });

  const updated = await getPlanChangeRequestById(billingRequest.id);

  return {
    id: updated.id,
    userId: updated.user_id,
    targetPlanCode: updated.target_plan_code,
    status: updated.status,
    paymentReference: updated.payment_reference,
    createdAt: updated.created_at,
    paidAt: updated.paid_at,
    expiresAt: updated.expires_at
  };
}

export async function applyPlanChangeWorkflow({ req, userId, planCode, planChangeRequestId, isExpired }) {
  const existing = await getUserPlanRecord(userId);
  if (!existing) {
    throw badRequest('Kullanici bulunamadi.');
  }

  const billingRequest = await getPlanChangeRequestForUser(planChangeRequestId, userId);
  if (!billingRequest) {
    throw notFound('Plan degisikligi talebi bulunamadi.');
  }

  if (billingRequest.target_plan_code !== planCode) {
    throw badRequest('Talep edilen paket ile odeme talebi uyusmuyor.', [
      { field: 'planCode', rule: 'mustMatchRequest' }
    ]);
  }

  if (isExpired(billingRequest.expires_at)) {
    if (billingRequest.status === 'pending') {
      await markPlanChangeRequestExpired(billingRequest.id);
    }

    throw badRequest('Plan degisikligi talebinin suresi dolmus.');
  }

  if (billingRequest.status !== 'paid') {
    throw badRequest('Plan degisikligi icin once odemenin onaylanmasi gerekir.', [
      { field: 'planChangeRequestId', rule: 'mustBePaid' }
    ]);
  }

  await withDbTransaction(async () => {
    if (existing.plan_code !== planCode) {
      await updateUserPlanCode(userId, planCode);

      await recordAuditLog({
        req,
        userId,
        eventType: 'PLAN_UPDATED',
        resourceType: 'user',
        resourceId: String(userId),
        metadata: {
          oldPlanCode: existing.plan_code || 'starter',
          newPlanCode: planCode,
          planChangeRequestId: billingRequest.id,
          paymentReference: billingRequest.payment_reference || null
        }
      });
    }

    await markPlanChangeRequestApplied(billingRequest.id);
  });

  return getPlanSnapshotWorkflow(userId);
}
