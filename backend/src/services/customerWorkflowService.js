import { withDbTransaction } from '../db.js';
import { recordAuditLog } from '../utils/audit.js';
import { businessRule, notFound } from '../utils/httpErrors.js';
import {
  deleteCustomer,
  getCustomerById,
  insertCustomer,
  updateCustomer
} from '../utils/customerRepository.js';
import { assertPlanLimit } from '../utils/plans.js';

export async function createCustomerWorkflow({ req, userId, customer }) {
  const created = await withDbTransaction(async () => {
    await assertPlanLimit(userId, 'customer_create');

    const customerId = await insertCustomer(userId, customer);
    return getCustomerById(userId, customerId);
  });

  await recordAuditLog({
    req,
    userId,
    eventType: 'CUSTOMER_CREATED',
    resourceType: 'customer',
    resourceId: String(created.id),
    metadata: {
      name: created.name,
      email: created.email || null
    }
  });

  return created;
}

export async function updateCustomerWorkflow({ req, userId, customerId, customer }) {
  const updatedAny = await updateCustomer(userId, customerId, customer);
  if (!updatedAny) {
    throw notFound('Musteri bulunamadi.');
  }

  const updated = await getCustomerById(userId, customerId);

  await recordAuditLog({
    req,
    userId,
    eventType: 'CUSTOMER_UPDATED',
    resourceType: 'customer',
    resourceId: String(customerId),
    metadata: {
      name: updated?.name || null,
      email: updated?.email || null
    }
  });

  return updated;
}

export async function deleteCustomerWorkflow({ req, userId, customerId }) {
  try {
    const deleted = await deleteCustomer(userId, customerId);
    if (!deleted) {
      throw notFound('Musteri bulunamadi.');
    }
  } catch (error) {
    if (error?.message?.includes('FOREIGN KEY')) {
      throw businessRule('Bu musteriye bagli teklif/fatura oldugu icin silinemez.');
    }

    throw error;
  }

  await recordAuditLog({
    req,
    userId,
    eventType: 'CUSTOMER_DELETED',
    resourceType: 'customer',
    resourceId: String(customerId)
  });
}
