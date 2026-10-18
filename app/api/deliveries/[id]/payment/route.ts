import { route, parseJson } from '@/lib/api';
import { deliveryPaymentBody } from '@/lib/validation';
import { getActor } from '@/lib/auth';
import { recordDeliveryPayment } from '@/services/deliveries.service';

// Records a real payment (cash / GCash) against a delivery order. Status is derived from payment records only.
export const POST = route(async (req, { params }) => {
  const actor = await getActor();
  const b = await parseJson(req, deliveryPaymentBody);
  return recordDeliveryPayment(params.id, b, actor);
});
