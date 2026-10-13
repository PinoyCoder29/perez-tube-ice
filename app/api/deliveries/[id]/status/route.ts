import { route, parseJson } from '@/lib/api';
import { deliveryStatusBody } from '@/lib/validation';
import { getActor } from '@/lib/auth';
import { changeDeliveryStatus } from '@/services/deliveries.service';

export const POST = route(async (req, { params }) => {
  const actor = await getActor();
  const b = await parseJson(req, deliveryStatusBody);
  return changeDeliveryStatus(params.id, b, actor);
});
