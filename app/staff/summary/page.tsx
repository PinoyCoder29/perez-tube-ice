"use client";

import { useFetch } from "@/lib/client/api";
import { formatPeso, formatQty } from "@/lib/formatting";
import { ErrorNote, Skeleton } from "@/components/ui/common";

type SummaryData = Record<string, number>;

type SummaryRow = [
  label: string,
  value: string | number | null | undefined,
  hint?: string,
];

export default function StaffSummary() {
  const { data: s, error } = useFetch<SummaryData>("/api/staff/summary", {
    pollMs: 30000,
  });

  const rows: SummaryRow[] = [
    ["Total sales today", s ? formatPeso(s.totalSales) : undefined],
    ["Transactions", s?.transactions],
    [
      "Cash & digital collected",
      s ? formatPeso(s.cashCollections) : undefined,
      "Includes payments on old utang",
    ],
    ["New credit (utang) given", s ? formatPeso(s.creditSales) : undefined],
    ["Debt payments received", s ? formatPeso(s.debtCollections) : undefined],
    ["Expenses recorded", s ? formatPeso(s.expenses) : undefined],
    [
      "Net cash flow",
      s ? formatPeso(s.netCashFlow) : undefined,
      "Collected minus expenses",
    ],
    ["Sacks sold", s ? formatQty(s.sacksSold) : undefined],
    ["Total outstanding utang", s ? formatPeso(s.outstandingDebt) : undefined],
  ];

  return (
    <div>
      <h1 className="h5 fw-bold mb-3">Today's summary</h1>

      <ErrorNote message={error} />

      <div className="row g-3">
        {rows.map(([label, value, hint]) => (
          <div className="col-6 col-lg-4" key={label}>
            <div className="card kpi">
              <div className="kpi-label">{label}</div>

              {value == null ? (
                <Skeleton h={28} w="60%" />
              ) : (
                <div className="kpi-value">{value}</div>
              )}

              {hint && <div className="small text-muted-2">{hint}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
