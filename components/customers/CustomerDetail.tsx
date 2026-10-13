"use client";
import { useState, type ReactNode } from "react";
import { Phone } from "lucide-react";
import { useFetch, type Json } from "@/lib/client/api";
import { Modal } from "@/components/ui/Modal";
import {
  EmptyState,
  ErrorNote,
  StatusBadge,
  TableSkeleton,
} from "@/components/ui/common";
import { formatDate, formatDateTime, formatPeso } from "@/lib/formatting";
import { telHref } from "@/lib/phone";
import { DELIVERY_STATUS_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/constants";
import { DebtPaymentModal } from "./DebtPaymentModal";

export function CustomerDetail({
  id,
  onClose,
  extraActions,
  onChanged,
}: {
  id: string;
  onClose: () => void;
  extraActions?: (c: Json) => ReactNode;
  onChanged?: () => void;
}) {
  const { data, loading, error, reload } = useFetch<Json>(
    `/api/customers/${id}`,
  );
  const [paying, setPaying] = useState(false);
  const c = data?.customer;
  const s = data?.summary;

  return (
    <Modal title={c?.name ?? "Customer"} onClose={onClose} size="xl">
      <ErrorNote message={error} />
      {loading && !data ? (
        <TableSkeleton />
      ) : c && s ? (
        <>
          <div className="d-flex flex-wrap gap-3 justify-content-between mb-3">
            <div>
              <a
                className="btn btn-outline-primary btn-sm mb-2"
                href={telHref(c.phone)}
              >
                <Phone size={14} aria-hidden /> Call {c.phone}
              </a>
              <div>
                {c.address}
                {c.landmark ? ` (${c.landmark})` : ""}
              </div>
              {c.notes && (
                <div className="small text-muted-2">Notes: {c.notes}</div>
              )}
              {!c.active && <StatusBadge status="CANCELLED" label="Inactive" />}
            </div>
            <div className="d-flex gap-2 flex-wrap align-items-start">
              {Number(s.outstandingBalance) > 0 && (
                <button
                  className="btn btn-success"
                  onClick={() => setPaying(true)}
                >
                  Receive payment
                </button>
              )}
              {extraActions?.(c)}
            </div>
          </div>
          <div className="row g-2 mb-4">
            {[
              ["Total purchases", s.totalPurchases],
              ["Total payments", s.totalPayments],
              ["Outstanding balance", s.outstandingBalance],
            ].map(([l, v]) => (
              <div className="col-12 col-md-4" key={l as string}>
                <div className="card kpi">
                  <div className="kpi-label">{l}</div>
                  <div className="kpi-value">{formatPeso(v as string)}</div>
                </div>
              </div>
            ))}
          </div>
          <h6>Transaction history</h6>
          {data.sales.length === 0 ? (
            <EmptyState title="No purchases yet." />
          ) : (
            <div className="table-responsive mb-4">
              <table className="table table-sm align-middle">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Transaction</th>
                    <th>Products</th>
                    <th className="text-end">Total</th>
                    <th>Method</th>
                    <th className="text-end">Paid</th>
                    <th className="text-end">Remaining</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.sales.map((t: Json) => (
                    <tr key={t.id}>
                      <td>{formatDateTime(t.createdAt)}</td>
                      <td>
                        <a
                          href={`/receipt/${t.id}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {t.transactionNumber}
                        </a>
                      </td>
                      <td>
                        {t.items
                          .map(
                            (i: Json) =>
                              `${i.quantity}× ${i.productNameSnapshot} ${i.labelSnapshot}`,
                          )
                          .join(", ")}
                      </td>
                      <td className="text-end money">
                        {formatPeso(t.totalAmount)}
                      </td>
                      <td>
                        {[
                          ...new Set(
                            t.payments
                              .filter((p: Json) => p.status === "ACTIVE")
                              .map(
                                (p: Json) =>
                                  PAYMENT_METHOD_LABELS[p.paymentMethod],
                              ),
                          ),
                        ].join(", ") || "Credit"}
                      </td>
                      <td className="text-end money">
                        {formatPeso(t.amountPaid)}
                      </td>
                      <td className="text-end money">
                        {t.status === "VOIDED"
                          ? "—"
                          : formatPeso(
                              Number(t.totalAmount) - Number(t.amountPaid),
                            )}
                      </td>
                      <td>
                        <StatusBadge
                          status={
                            t.status === "VOIDED" ? "VOIDED" : t.paymentStatus
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <h6>Payments made</h6>
          {data.payments.length === 0 ? (
            <div className="text-muted-2 small mb-3">No payments yet.</div>
          ) : (
            <div className="table-responsive mb-4">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Reference</th>
                    <th>Type</th>
                    <th>Method</th>
                    <th className="text-end">Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.payments.map((p: Json) => (
                    <tr key={p.id}>
                      <td>{formatDateTime(p.createdAt)}</td>
                      <td>{p.paymentReference}</td>
                      <td>
                        {p.paymentType === "DEBT_PAYMENT"
                          ? "Debt payment"
                          : `Sale ${p.sale?.transactionNumber ?? ""}`}
                      </td>
                      <td>{PAYMENT_METHOD_LABELS[p.paymentMethod]}</td>
                      <td className="text-end money">{formatPeso(p.amount)}</td>
                      <td>
                        <StatusBadge status={p.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <h6>Delivery history</h6>
          {data.deliveries.length === 0 ? (
            <div className="text-muted-2 small">No deliveries.</div>
          ) : (
            <ul className="list-unstyled small mb-0">
              {data.deliveries.map((d: Json) => (
                <li key={d.id} className="py-1 border-bottom">
                  {formatDate(d.scheduledAt)} —{" "}
                  {DELIVERY_STATUS_LABELS[d.status]} —{" "}
                  {d.items
                    .map(
                      (i: Json) =>
                        `${i.quantity}× ${i.productNameSnapshot} ${i.labelSnapshot}`,
                    )
                    .join(", ")}
                </li>
              ))}
            </ul>
          )}
          {paying && (
            <DebtPaymentModal
              customer={c}
              balance={s.outstandingBalance}
              onClose={() => setPaying(false)}
              onDone={() => {
                setPaying(false);
                reload();
                onChanged?.();
              }}
            />
          )}
        </>
      ) : null}
    </Modal>
  );
}
