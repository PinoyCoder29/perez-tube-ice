import crypto from "crypto";
import {
  DeliveryStatus,
  DeliveryPaymentType,
  PaymentMethod,
  Prisma,
} from "@prisma/client";

import { prisma, type Tx } from "@/lib/db/prisma";
import { HttpError } from "@/lib/errors";
import { D, num, sum } from "@/lib/money";
import { audit } from "@/lib/audit";
import {
  zonedTimeToUtc,
  getTimezone,
  resolveRange,
  parseYmd,
} from "@/lib/date";
import { STAFF_USERNAME } from "@/lib/constants";
import type { Actor } from "@/lib/auth";
import { createSaleTx, nextReference, voidSaleTx } from "./sales.service";
import { recordDebtPaymentTx } from "./payments.service";

export interface DeliveryInput {
  customerId: string;
  scheduledDate: string;
  scheduledTime?: string | null;
  items: {
    priceOptionId: string;
    quantity: number;
  }[];
  deliveryFee?: string;
  paymentType: DeliveryPaymentType;
  instructions?: string | null;
  assign?: boolean;
}

export interface DeliveryPaymentLine {
  method: PaymentMethod;
  amount: string;
  reference?: string | null;
  notes?: string | null;
}

const OPEN: DeliveryStatus[] = ["PENDING", "ASSIGNED", "OUT_FOR_DELIVERY"];

function schedule(date: string, time?: string | null) {
  const [y, m, d] = date.split("-").map(Number);
  const [h, mi] = time ? time.split(":").map(Number) : [0, 0];

  return {
    scheduledAt: zonedTimeToUtc(y, m, d, h, mi, getTimezone()),
    hasTime: Boolean(time),
  };
}

async function buildItems(
  tx: Tx,
  items: { priceOptionId: string; quantity: number }[],
) {
  if (!items.length) {
    throw new HttpError(400, "An order must contain at least one item.");
  }

  const qty = new Map<string, number>();

  for (const item of items) {
    if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0) {
      throw new HttpError(400, "Invalid item quantity.");
    }

    qty.set(
      item.priceOptionId,
      (qty.get(item.priceOptionId) ?? 0) + item.quantity,
    );
  }

  const ids = [...qty.keys()];

  const opts = await tx.priceOption.findMany({
    where: { id: { in: ids } },
    include: { product: true },
  });

  if (opts.length !== ids.length) {
    throw new HttpError(400, "One or more items no longer exist.");
  }

  return opts.map((option) => {
    if (!option.active || !option.product.active) {
      throw new HttpError(
        400,
        `"${option.product.name} ${option.label}" is not available.`,
      );
    }

    const quantity = qty.get(option.id)!;

    return {
      productId: option.productId,
      priceOptionId: option.id,
      productNameSnapshot: option.product.name,
      packageTypeSnapshot: option.packageType,
      labelSnapshot: option.label,
      unitPrice: option.sellingPrice,
      quantity,
      lineTotal: option.sellingPrice.mul(quantity),
    };
  });
}

async function staffUserId(tx: Tx): Promise<string> {
  const staff = await tx.user.findUnique({
    where: { username: STAFF_USERNAME },
  });

  if (!staff) {
    throw new HttpError(
      503,
      "Staff identity is not set up. Run the database seed.",
    );
  }

  return staff.id;
}

/**
 * IMPORTANT:
 * Payment.paymentType and Payment.paymentReference are the
 * field names reported by the current generated Prisma client.
 *
 * Do not use paymentMethod, reference, or createdAt here
 * unless those fields actually exist in your Prisma schema.
 */
export const deliveryInclude = {
  customer: {
    select: {
      id: true,
      name: true,
      phone: true,
      address: true,
      landmark: true,
    },
  },

  items: true,

  assignedStaff: {
    select: {
      name: true,
    },
  },

  sale: {
    select: {
      id: true,
      transactionNumber: true,
      totalAmount: true,
      amountPaid: true,
      paymentStatus: true,
      status: true,

      allocations: {
        where: {
          payment: {
            status: "ACTIVE",
          },
        },

        select: {
          allocatedAmount: true,

          payment: {
            select: {
              paymentType: true,
              paymentReference: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.DeliveryInclude;

type DeliveryRow = Prisma.DeliveryGetPayload<{
  include: typeof deliveryInclude;
}>;

/* -------------------------------------------------------------------------- */
/* CREATE DELIVERY                                                            */
/* -------------------------------------------------------------------------- */

export async function createDelivery(input: DeliveryInput, actorId: string) {
  return prisma.$transaction(async (tx) => {
    const customer = await tx.customer.findUnique({
      where: { id: input.customerId },
    });

    if (!customer || !customer.active) {
      throw new HttpError(400, "Customer not found or inactive.");
    }

    const items = await buildItems(tx, input.items);

    const { scheduledAt, hasTime } = schedule(
      input.scheduledDate,
      input.scheduledTime,
    );

    const deliveryFee = D(input.deliveryFee ?? "0");

    if (deliveryFee.lt(0)) {
      throw new HttpError(400, "Delivery fee cannot be negative.");
    }

    const delivery = await tx.delivery.create({
      data: {
        orderNumber: await nextReference(tx, "DL"),
        customerId: customer.id,

        addressSnapshot: customer.landmark
          ? `${customer.address} (${customer.landmark})`
          : customer.address,

        phoneSnapshot: customer.phone,
        scheduledAt,
        hasTime,
        deliveryFee,
        paymentType: input.paymentType,
        instructions: input.instructions ?? null,

        status: input.assign ? "ASSIGNED" : "PENDING",

        assignedStaffId: input.assign ? await staffUserId(tx) : null,

        createdById: actorId,

        items: {
          create: items,
        },
      },

      include: deliveryInclude,
    });

    await audit(tx, {
      actorId,
      action: "DELIVERY_CREATE",
      entityType: "Delivery",
      entityId: delivery.id,

      newValues: {
        orderNumber: delivery.orderNumber,
        customerId: customer.id,
        status: delivery.status,
      },
    });

    return delivery;
  });
}

/* -------------------------------------------------------------------------- */
/* UPDATE DELIVERY                                                            */
/* -------------------------------------------------------------------------- */

export async function updateDelivery(
  id: string,
  patch: Partial<DeliveryInput>,
  actorId: string,
) {
  return prisma.$transaction(async (tx) => {
    const delivery = await tx.delivery.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!delivery) {
      throw new HttpError(404, "Delivery not found.");
    }

    if (
      ["DELIVERED", "CANCELLED"].includes(delivery.status) ||
      delivery.saleId
    ) {
      throw new HttpError(
        409,
        "Orders that are completed, cancelled, or already invoiced cannot be edited.",
      );
    }

    const data: Prisma.DeliveryUpdateInput = {};

    if (patch.scheduledDate) {
      Object.assign(data, schedule(patch.scheduledDate, patch.scheduledTime));
    }

    if (patch.deliveryFee !== undefined) {
      const fee = D(patch.deliveryFee);

      if (fee.lt(0)) {
        throw new HttpError(400, "Delivery fee cannot be negative.");
      }

      data.deliveryFee = fee;
    }

    if (patch.paymentType) {
      data.paymentType = patch.paymentType;
    }

    if (patch.instructions !== undefined) {
      data.instructions = patch.instructions;
    }

    if (patch.items) {
      const items = await buildItems(tx, patch.items);

      await tx.deliveryItem.deleteMany({
        where: { deliveryId: id },
      });

      data.items = {
        create: items,
      };
    }

    const updated = await tx.delivery.update({
      where: { id },
      data,
      include: deliveryInclude,
    });

    await audit(tx, {
      actorId,
      action: "DELIVERY_UPDATE",
      entityType: "Delivery",
      entityId: id,
      previousValues: delivery,
      newValues: updated,
    });

    return updated;
  });
}

/* -------------------------------------------------------------------------- */
/* DELIVERY PAYMENT HELPERS                                                   */
/* -------------------------------------------------------------------------- */

function itemsAsSale(delivery: {
  items: {
    priceOptionId: string;
    quantity: number;
    unitPrice: Prisma.Decimal;
  }[];
}) {
  return delivery.items.map((item) => ({
    priceOptionId: item.priceOptionId,
    quantity: item.quantity,
    unitPriceOverride: item.unitPrice,
  }));
}

/**
 * Records a payment against a delivery.
 *
 * First payment:
 *   Creates the sale and records the payment.
 *
 * Subsequent payments:
 *   Records additional payments against the existing sale.
 *
 * Idempotency keys prevent duplicate payment submissions.
 */
export async function recordDeliveryPayment(
  id: string,
  body: { idempotencyKey: string } & DeliveryPaymentLine,
  actor: Actor,
) {
  if (!body.idempotencyKey.trim()) {
    throw new HttpError(400, "An idempotency key is required.");
  }

  const amount = D(body.amount);

  if (amount.lte(0)) {
    throw new HttpError(400, "Payment amount must be greater than zero.");
  }

  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`
        SELECT id
        FROM "Delivery"
        WHERE id = ${id}
        FOR UPDATE
      `;

      const seen = await tx.payment.findUnique({
        where: {
          idempotencyKey: body.idempotencyKey,
        },
      });

      if (seen) {
        return {
          delivery: await getDeliveryTx(tx, id),
          duplicate: true,
        };
      }

      const delivery = await tx.delivery.findUnique({
        where: { id },
        include: {
          items: true,
          sale: true,
        },
      });

      if (!delivery) {
        throw new HttpError(404, "Delivery not found.");
      }

      if (delivery.status === "CANCELLED") {
        throw new HttpError(409, "This order was cancelled.");
      }

      const itemsTotal = sum(delivery.items.map((item) => item.lineTotal));

      const orderTotal = itemsTotal.plus(delivery.deliveryFee);

      if (!delivery.saleId) {
        if (amount.gt(orderTotal)) {
          throw new HttpError(
            400,
            `Payment is more than the order total (${orderTotal.toFixed(2)}).`,
          );
        }

        const sale = await createSaleTx(
          tx,
          {
            customerId: delivery.customerId,
            items: itemsAsSale(delivery),

            payments: [
              {
                method: body.method,
                amount: body.amount,
                reference: body.reference,
                notes: body.notes,
                idempotencyKey: body.idempotencyKey,
              },
            ],

            deliveryFee: delivery.deliveryFee.toString(),
            notes: `Delivery ${delivery.orderNumber}`,
          },
          actor.id,
          { allowInactive: true },
        );

        await tx.delivery.update({
          where: { id },
          data: { saleId: sale.id },
        });
      } else {
        if (delivery.sale?.status === "VOIDED") {
          throw new HttpError(
            409,
            "The sale linked to this order was voided. Ask the Admin.",
          );
        }

        await recordDebtPaymentTx(
          tx,
          {
            idempotencyKey: body.idempotencyKey,
            customerId: delivery.customerId,
            amount: body.amount,
            method: body.method,
            notes: body.notes,
            reference: body.reference,
            saleId: delivery.saleId,
          },
          actor.id,
        );
      }

      await audit(tx, {
        actorId: actor.id,
        action: "DELIVERY_PAYMENT",
        entityType: "Delivery",
        entityId: id,

        newValues: {
          amount: amount.toString(),
          method: body.method,
          reference: body.reference,
        },
      });

      return {
        delivery: await getDeliveryTx(tx, id),
        duplicate: false,
      };
    },
    { timeout: 20000 },
  );
}

/* -------------------------------------------------------------------------- */
/* GET DELIVERY                                                               */
/* -------------------------------------------------------------------------- */

async function getDeliveryTx(tx: Tx, id: string) {
  const delivery = await tx.delivery.findUniqueOrThrow({
    where: { id },
    include: deliveryInclude,
  });

  return derive(delivery, new Map());
}

/* -------------------------------------------------------------------------- */
/* DELIVERY STATUS TRANSITIONS                                                */
/* -------------------------------------------------------------------------- */

const FROM: Record<string, DeliveryStatus[]> = {
  ASSIGNED: ["PENDING", "FAILED"],
  OUT_FOR_DELIVERY: ["PENDING", "ASSIGNED"],
  FAILED: ["PENDING", "ASSIGNED", "OUT_FOR_DELIVERY"],
  PENDING: ["ASSIGNED", "FAILED"],
};

export async function changeDeliveryStatus(
  id: string,
  body: {
    status: DeliveryStatus;
    reason?: string | null;
    payments?: DeliveryPaymentLine[];
    idempotencyKey?: string;
  },
  actor: Actor,
) {
  const { status } = body;

  if (["PENDING", "ASSIGNED"].includes(status) && actor.role !== "ADMIN") {
    throw new HttpError(403, "Only Admin can do that.");
  }

  if ((status === "FAILED" || status === "CANCELLED") && !body.reason?.trim()) {
    throw new HttpError(400, "Please give a reason.");
  }

  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`
        SELECT id
        FROM "Delivery"
        WHERE id = ${id}
        FOR UPDATE
      `;

      const delivery = await tx.delivery.findUnique({
        where: { id },
        include: {
          items: true,
          sale: true,
        },
      });

      if (!delivery) {
        throw new HttpError(404, "Delivery not found.");
      }

      /* ------------------------------ DELIVERED ----------------------------- */

      if (status === "DELIVERED") {
        if (!OPEN.includes(delivery.status)) {
          throw new HttpError(
            409,
            "This delivery cannot be completed (already delivered, failed, or cancelled).",
          );
        }

        const staffId =
          delivery.assignedStaffId ??
          (actor.role === "STAFF" ? actor.id : await staffUserId(tx));

        const payments = body.payments ?? [];

        for (const payment of payments) {
          const paymentAmount = D(payment.amount);

          if (paymentAmount.lte(0)) {
            throw new HttpError(
              400,
              "Payment amounts must be greater than zero.",
            );
          }
        }

        const paymentKey = body.idempotencyKey ?? crypto.randomUUID();

        await tx.delivery.update({
          where: { id },
          data: {
            status: "DELIVERED",
            deliveredAt: new Date(),
            deliveredById: actor.id,
            assignedStaffId: staffId,
          },
        });

        if (!delivery.saleId) {
          const sale = await createSaleTx(
            tx,
            {
              customerId: delivery.customerId,
              items: itemsAsSale(delivery),

              payments: payments.map((payment, index) => ({
                ...payment,
                idempotencyKey: `${paymentKey}:${index}`,
              })),

              deliveryFee: delivery.deliveryFee.toString(),
              notes: `Delivery ${delivery.orderNumber}`,
            },
            actor.id,
            { allowInactive: true },
          );

          await tx.delivery.update({
            where: { id },
            data: { saleId: sale.id },
          });
        } else {
          if (delivery.sale?.status === "VOIDED") {
            throw new HttpError(
              409,
              "The sale linked to this order was voided. Ask the Admin.",
            );
          }

          for (const [index, payment] of payments.entries()) {
            await recordDebtPaymentTx(
              tx,
              {
                idempotencyKey: `${paymentKey}:${index}`,
                customerId: delivery.customerId,
                amount: payment.amount,
                method: payment.method,
                notes: payment.notes,
                reference: payment.reference,
                saleId: delivery.saleId,
              },
              actor.id,
            );
          }
        }

        await audit(tx, {
          actorId: actor.id,
          action: "DELIVERY_COMPLETE",
          entityType: "Delivery",
          entityId: id,

          newValues: {
            payments,
          },
        });

        return getDeliveryTx(tx, id);
      }

      /* ------------------------------ CANCELLED ----------------------------- */

      if (status === "CANCELLED") {
        if (delivery.status === "DELIVERED") {
          throw new HttpError(
            409,
            "A delivered order cannot be cancelled here. Ask the Admin to reverse it.",
          );
        }

        if (delivery.status === "CANCELLED") {
          throw new HttpError(409, "Already cancelled.");
        }

        let saleReversed = false;

        if (delivery.saleId && delivery.sale?.status === "COMPLETED") {
          await voidSaleTx(
            tx,
            delivery.saleId,
            `Order ${delivery.orderNumber} cancelled: ${body.reason}`,
            actor.id,
            { cascadeDebtPayments: true },
          );

          saleReversed = true;
        }

        await tx.delivery.update({
          where: { id },
          data: {
            status: "CANCELLED",
            cancelReason: body.reason,
            cancelledAt: new Date(),
            cancelledById: actor.id,
          },
        });

        await audit(tx, {
          actorId: actor.id,
          action: "DELIVERY_CANCEL",
          entityType: "Delivery",
          entityId: id,

          previousValues: {
            status: delivery.status,
          },

          newValues: {
            status: "CANCELLED",
            reason: body.reason,
            saleReversed,
          },
        });

        return getDeliveryTx(tx, id);
      }

      /* --------------------------- OTHER STATUSES ---------------------------- */

      if (!FROM[status]?.includes(delivery.status)) {
        throw new HttpError(
          409,
          `Cannot move this delivery from ${delivery.status
            .toLowerCase()
            .replace(/_/g, " ")} to ${status
            .toLowerCase()
            .replace(/_/g, " ")}.`,
        );
      }

      const data: Prisma.DeliveryUpdateInput = {
        status,
        statusReason: body.reason ?? null,
      };

      if (status === "ASSIGNED" || status === "OUT_FOR_DELIVERY") {
        data.assignedStaff = {
          connect: {
            id: await staffUserId(tx),
          },
        };
      }

      if (status === "PENDING") {
        data.assignedStaff = {
          disconnect: true,
        };
      }

      await tx.delivery.update({
        where: { id },
        data,
      });

      await audit(tx, {
        actorId: actor.id,
        action: "DELIVERY_STATUS",
        entityType: "Delivery",
        entityId: id,

        previousValues: {
          status: delivery.status,
        },

        newValues: {
          status,
          reason: body.reason,
        },
      });

      return getDeliveryTx(tx, id);
    },
    { timeout: 20000 },
  );
}

/* -------------------------------------------------------------------------- */
/* REVERSE DELIVERED ORDER                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Admin-only correction for a delivery that was already delivered.
 *
 * The API route calling this function must enforce ADMIN authorization.
 */
export async function reverseDelivery(
  id: string,
  reason: string,
  actorId: string,
) {
  if (!reason.trim()) {
    throw new HttpError(400, "Please provide a reversal reason.");
  }

  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`
        SELECT id
        FROM "Delivery"
        WHERE id = ${id}
        FOR UPDATE
      `;

      const delivery = await tx.delivery.findUnique({
        where: { id },
        include: { sale: true },
      });

      if (!delivery) {
        throw new HttpError(404, "Delivery not found.");
      }

      if (delivery.status !== "DELIVERED") {
        throw new HttpError(409, "Only delivered orders need a reversal.");
      }

      if (delivery.saleId && delivery.sale?.status === "COMPLETED") {
        await voidSaleTx(
          tx,
          delivery.saleId,
          `Delivery ${delivery.orderNumber} reversed: ${reason}`,
          actorId,
          { cascadeDebtPayments: true },
        );
      }

      await tx.delivery.update({
        where: { id },
        data: {
          status: "CANCELLED",
          cancelReason: `Reversed by Admin: ${reason}`,
          cancelledAt: new Date(),
          cancelledById: actorId,
        },
      });

      await audit(tx, {
        actorId,
        action: "DELIVERY_REVERSE",
        entityType: "Delivery",
        entityId: id,

        previousValues: {
          status: "DELIVERED",
        },

        newValues: {
          status: "CANCELLED",
          reason,
        },
      });

      return getDeliveryTx(tx, id);
    },
    { timeout: 20000 },
  );
}

/* -------------------------------------------------------------------------- */
/* DERIVED PAYMENT STATUS                                                     */
/* -------------------------------------------------------------------------- */

export type PayStatus = "UNPAID" | "PARTIAL" | "PAID";

/**
 * Payment status is calculated from the active sale.
 * Cancelled deliveries do not have an outstanding balance.
 *
 * The current Payment model does not expose createdAt in the
 * Prisma fields shown in your error, so lastPaymentAt remains null.
 */
function derive(delivery: DeliveryRow, names: Map<string, string>) {
  const itemsTotal = sum(delivery.items.map((item) => item.lineTotal));

  const calculatedOrderTotal = itemsTotal.plus(delivery.deliveryFee);

  const liveSale = delivery.sale?.status === "COMPLETED" ? delivery.sale : null;

  const paid = liveSale ? liveSale.amountPaid : D(0);

  const total = liveSale ? liveSale.totalAmount : calculatedOrderTotal;

  const due =
    delivery.status === "CANCELLED"
      ? D(0)
      : total.minus(paid).lt(0)
        ? D(0)
        : total.minus(paid);

  const paymentStatus: PayStatus = paid.lte(0)
    ? "UNPAID"
    : paid.gte(total)
      ? "PAID"
      : "PARTIAL";

  const methods = new Map<string, number>();

  for (const allocation of liveSale?.allocations ?? []) {
    const method = String(allocation.payment.paymentType);

    methods.set(
      method,
      (methods.get(method) ?? 0) + num(allocation.allocatedAmount),
    );
  }

  const references = (liveSale?.allocations ?? [])
    .map((allocation) => allocation.payment.paymentReference)
    .filter((reference): reference is string => Boolean(reference));

  return {
    ...delivery,

    itemsTotal,
    orderTotal: total,
    amountPaid: paid,
    amountDue: due,
    amountToCollect: due,
    paymentStatus,

    paymentMethods: [...methods.entries()].map(([method, amount]) => ({
      method,
      amount,
    })),

    gcashAmount: methods.get("GCASH") ?? 0,
    cashAmount: methods.get("CASH") ?? 0,

    lastPaymentAt: null,
    references,

    deliveredByName: delivery.deliveredById
      ? (names.get(delivery.deliveredById) ?? null)
      : null,

    cancelledByName: delivery.cancelledById
      ? (names.get(delivery.cancelledById) ?? null)
      : null,
  };
}

type Derived = ReturnType<typeof derive>;

/* -------------------------------------------------------------------------- */
/* DELIVERY LIST FILTERS                                                      */
/* -------------------------------------------------------------------------- */

export type DeliveryTab =
  | "all"
  | "pending"
  | "out"
  | "delivered"
  | "unpaid"
  | "partial"
  | "paid"
  | "gcash"
  | "cancelled";

const TAB_TEST: Record<DeliveryTab, (delivery: Derived) => boolean> = {
  all: () => true,

  pending: (delivery) =>
    delivery.status === "PENDING" || delivery.status === "ASSIGNED",

  out: (delivery) => delivery.status === "OUT_FOR_DELIVERY",

  delivered: (delivery) => delivery.status === "DELIVERED",

  unpaid: (delivery) =>
    delivery.status !== "CANCELLED" && delivery.paymentStatus === "UNPAID",

  partial: (delivery) =>
    delivery.status !== "CANCELLED" && delivery.paymentStatus === "PARTIAL",

  paid: (delivery) =>
    delivery.status !== "CANCELLED" && delivery.paymentStatus === "PAID",

  gcash: (delivery) =>
    delivery.status !== "CANCELLED" && delivery.gcashAmount > 0,

  cancelled: (delivery) => delivery.status === "CANCELLED",
};

/* -------------------------------------------------------------------------- */
/* DELIVERY TOTALS                                                            */
/* -------------------------------------------------------------------------- */

export function deliveryTotals(rows: Derived[]) {
  const live = rows.filter((delivery) => delivery.status !== "CANCELLED");

  const round2 = (value: number) => Math.round(value * 100) / 100;

  return {
    orders: rows.length,

    delivered: rows.filter((delivery) => delivery.status === "DELIVERED")
      .length,

    unpaidAmount: round2(
      live
        .filter((delivery) => delivery.paymentStatus === "UNPAID")
        .reduce((total, delivery) => total + num(delivery.amountDue), 0),
    ),

    partialAmount: round2(
      live
        .filter((delivery) => delivery.paymentStatus === "PARTIAL")
        .reduce((total, delivery) => total + num(delivery.amountDue), 0),
    ),

    paidAmount: round2(
      live
        .filter((delivery) => delivery.paymentStatus === "PAID")
        .reduce((total, delivery) => total + num(delivery.amountPaid), 0),
    ),

    gcashAmount: round2(
      live.reduce((total, delivery) => total + delivery.gcashAmount, 0),
    ),
  };
}

/* -------------------------------------------------------------------------- */
/* LIST DELIVERIES                                                            */
/* -------------------------------------------------------------------------- */

export async function listDeliveries(filters: {
  tab?: DeliveryTab;
  q?: string | null;
  date?: string | null;
  period?: "today" | "week" | "month" | "year" | "custom";
  from?: string | null;
  to?: string | null;
  customerId?: string | null;
}) {
  const range =
    filters.date && parseYmd(filters.date)
      ? resolveRange("custom", {
          from: filters.date,
          to: filters.date,
        })
      : filters.period
        ? resolveRange(filters.period, {
            from: filters.from,
            to: filters.to,
          })
        : null;

  const query = filters.q?.trim();

  const where: Prisma.DeliveryWhereInput = {
    ...(range
      ? {
          scheduledAt: {
            gte: range.start,
            lt: range.end,
          },
        }
      : {
          OR: [
            {
              status: {
                in: OPEN,
              },
            },
            {
              scheduledAt: {
                gte: new Date(Date.now() - 14 * 86400000),
              },
            },
          ],
        }),

    ...(filters.customerId
      ? {
          customerId: filters.customerId,
        }
      : {}),

    ...(query
      ? {
          AND: [
            {
              OR: [
                {
                  orderNumber: {
                    contains: query,
                    mode: "insensitive",
                  },
                },

                {
                  addressSnapshot: {
                    contains: query,
                    mode: "insensitive",
                  },
                },

                {
                  customer: {
                    name: {
                      contains: query,
                      mode: "insensitive",
                    },
                  },
                },

                {
                  customer: {
                    phone: {
                      contains: query.replace(/[\s\-]/g, ""),
                    },
                  },
                },
              ],
            },
          ],
        }
      : {}),
  };

  const [rows, users] = await Promise.all([
    prisma.delivery.findMany({
      where,
      include: deliveryInclude,
      orderBy: [
        {
          scheduledAt: "asc",
        },
      ],
      take: 500,
    }),

    prisma.user.findMany({
      select: {
        id: true,
        name: true,
      },
    }),
  ]);

  const names = new Map(users.map((user) => [user.id, user.name]));

  const base = rows.map((delivery) => derive(delivery, names));

  // Open deliveries first, earliest scheduled delivery first.
  // Finished deliveries follow, newest scheduled delivery first.
  base.sort((a, b) => {
    const aOpen = OPEN.includes(a.status) ? 0 : 1;
    const bOpen = OPEN.includes(b.status) ? 0 : 1;

    if (aOpen !== bOpen) {
      return aOpen - bOpen;
    }

    return aOpen === 0
      ? a.scheduledAt.getTime() - b.scheduledAt.getTime()
      : b.scheduledAt.getTime() - a.scheduledAt.getTime();
  });

  const tab = filters.tab ?? "all";

  const filtered = base.filter(TAB_TEST[tab]);

  const counts = Object.fromEntries(
    (Object.keys(TAB_TEST) as DeliveryTab[]).map((key) => [
      key,
      base.filter(TAB_TEST[key]).length,
    ]),
  ) as Record<DeliveryTab, number>;

  return {
    rows: filtered,
    totals: deliveryTotals(filtered),
    counts,
    tab,
  };
}

export { deliveryInclude as _include };
