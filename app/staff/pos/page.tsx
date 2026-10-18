"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Minus,
  Plus,
  Printer,
  Trash2,
  Wallet,
  ReceiptText,
  CreditCard,
} from "lucide-react";

import { api, newKey, useFetch, type Json } from "@/lib/client/api";
import { formatDateTime, formatPeso, formatQty } from "@/lib/formatting";
import {
  PACKAGE_LABELS,
  PAYMENT_METHOD_LABELS,
  DIGITAL_METHODS,
} from "@/lib/constants";
import { CustomerPicker } from "@/components/customers/CustomerPicker";
import { EmptyState, ErrorNote, Spinner } from "@/components/ui/common";
import { useToast } from "@/components/ui/providers";

interface Line {
  key: string;
  priceOptionId?: string;
  productId?: string;
  customPrice?: string;
  productName: string;
  label: string;
  unitCents: number;
  quantity: number;
}

type Mode = "CASH" | "DIGITAL" | "CREDIT" | "SPLIT";

const cents = (v: string | number) => Math.round((Number(v) || 0) * 100);
const peso = (c: number) => (c / 100).toFixed(2);

function Clock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(timer);
  }, []);

  return <span>{formatDateTime(now)}</span>;
}

export default function PosPage() {
  const toast = useToast();

  const products = useFetch<Json[]>("/api/products");
  const summary = useFetch<Json>("/api/staff/summary", { pollMs: 30000 });
  const cfg = useFetch<Json>("/api/settings");

  const [activeId, setActiveId] = useState<string | null>(null);
  const [cart, setCart] = useState<Line[]>([]);
  const [customer, setCustomer] = useState<Json | null>(null);

  const [mode, setMode] = useState<Mode>("CASH");
  const [digital, setDigital] = useState("GCASH");
  const [tendered, setTendered] = useState("");
  const [paidNow, setPaidNow] = useState("");
  const [paidMethod, setPaidMethod] = useState("CASH");
  const [splitCash, setSplitCash] = useState("");
  const [splitDigital, setSplitDigital] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState(() => newKey());
  const [done, setDone] = useState<Json | null>(null);

  const [customOpen, setCustomOpen] = useState(false);
  const [customProduct, setCustomProduct] = useState("");
  const [customPrice, setCustomPrice] = useState("");
  const [customQty, setCustomQty] = useState(1);

  // Tube Ice first, Crushed Ice second, then all other products.
  // Sorting a copy prevents changes to the original fetched array.
  const list = useMemo(() => {
    return [...(products.data ?? [])].sort((a, b) => {
      const getOrder = (name: unknown) => {
        const productName = String(name ?? "")
          .trim()
          .toLowerCase();

        if (productName.includes("tube ice")) return 0;
        if (productName.includes("crushed ice")) return 1;

        return 2;
      };

      return getOrder(a.name) - getOrder(b.name);
    });
  }, [products.data]);

  const active = list.find((p) => p.id === activeId) ?? list[0];

  const customProd = list.find((p) => p.id === (customProduct || active?.id));

  const maxCustom = Number(cfg.data?.customPriceMax ?? 5000);

  const customOk =
    /^\d{1,7}(\.\d{1,2})?$/.test(customPrice) &&
    Number(customPrice) > 0 &&
    Number(customPrice) <= maxCustom;

  function addCustom() {
    if (!customOk || !customProd) return;

    setDone(null);

    setCart((current) => [
      ...current,
      {
        key: `custom-${Date.now()}-${current.length}`,
        productId: customProd.id,
        customPrice: Number(customPrice).toFixed(2),
        productName: customProd.name,
        label: `Custom ₱${Number(customPrice).toFixed(2)}`,
        unitCents: cents(customPrice),
        quantity: customQty,
      },
    ]);

    setCustomPrice("");
    setCustomQty(1);
    setCustomOpen(false);
  }

  const totalC = useMemo(
    () =>
      cart.reduce((total, line) => total + line.unitCents * line.quantity, 0),
    [cart],
  );

  // Calculate payments for the selected payment mode.
  const pay = useMemo(() => {
    const lines: { method: string; cents: number }[] = [];
    let problem: string | null = null;

    if (mode === "CASH") {
      lines.push({ method: "CASH", cents: totalC });
    } else if (mode === "DIGITAL") {
      lines.push({ method: digital, cents: totalC });
    } else if (mode === "CREDIT") {
      const amount = cents(paidNow);

      if (amount > totalC) {
        problem = "Amount paid is more than the total.";
      }

      if (amount > 0) {
        lines.push({ method: paidMethod, cents: amount });
      }
    } else {
      const cashAmount = cents(splitCash);
      const digitalAmount = cents(splitDigital);

      if (cashAmount + digitalAmount > totalC) {
        problem = "Payments are more than the total.";
      }

      if (cashAmount > 0) {
        lines.push({ method: "CASH", cents: cashAmount });
      }

      if (digitalAmount > 0) {
        lines.push({ method: digital, cents: digitalAmount });
      }
    }

    const paid = lines.reduce((total, line) => total + line.cents, 0);
    const balance = totalC - paid;

    if (!problem && balance > 0 && !customer) {
      problem = "Select a customer — unpaid amounts are recorded as utang.";
    }

    if (!problem && mode === "CREDIT" && !customer) {
      problem = "Select a customer for credit.";
    }

    return { lines, paid, balance, problem };
  }, [
    mode,
    digital,
    paidNow,
    paidMethod,
    splitCash,
    splitDigital,
    totalC,
    customer,
  ]);

  function addPrice(product: Json, option: Json) {
    setDone(null);

    setCart((current) => {
      const existingIndex = current.findIndex((line) => line.key === option.id);

      if (existingIndex >= 0) {
        return current.map((line, index) =>
          index === existingIndex
            ? { ...line, quantity: line.quantity + 1 }
            : line,
        );
      }

      return [
        ...current,
        {
          key: option.id,
          priceOptionId: option.id,
          productName: product.name,
          label: option.label,
          unitCents: cents(option.sellingPrice),
          quantity: 1,
        },
      ];
    });
  }

  const setQty = (id: string, difference: number) => {
    setCart((current) =>
      current.map((line) =>
        line.key === id
          ? {
              ...line,
              quantity: Math.max(1, Math.min(1000, line.quantity + difference)),
            }
          : line,
      ),
    );
  };

  const remove = (id: string) => {
    setCart((current) => current.filter((line) => line.key !== id));
  };

  function reset() {
    setCart([]);
    setCustomer(null);
    setMode("CASH");
    setTendered("");
    setPaidNow("");
    setPaidMethod("CASH");
    setSplitCash("");
    setSplitDigital("");
    setDigital("GCASH");
    setError(null);
    setKey(newKey());
    setCustomPrice("");
    setCustomQty(1);
    setCustomOpen(false);
  }

  async function confirm() {
    if (busy || cart.length === 0 || pay.problem) return;

    setBusy(true);
    setError(null);

    try {
      const result = await api<Json>("/api/sales", {
        body: {
          idempotencyKey: key,
          customerId: customer?.id ?? null,
          items: cart.map((line) =>
            line.priceOptionId
              ? {
                  priceOptionId: line.priceOptionId,
                  quantity: line.quantity,
                }
              : {
                  productId: line.productId,
                  customUnitPrice: line.customPrice,
                  quantity: line.quantity,
                },
          ),
          payments: pay.lines.map((line) => ({
            method: line.method,
            amount: peso(line.cents),
          })),
        },
      });

      const expectedTotal = peso(totalC);

      if (Number(result.sale.totalAmount).toFixed(2) !== expectedTotal) {
        toast(
          `Prices were updated — the sale total is ${formatPeso(result.sale.totalAmount)}.`,
          "info",
        );
      }

      setDone({
        ...result.sale,
        previousBalance: customer?.outstandingBalance,
      });

      reset();
      summary.reload();
      products.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const change =
    mode === "CASH" && cents(tendered) > totalC ? cents(tendered) - totalC : 0;

  const s = summary.data;

  return (
    <div>
      <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
        <div className="me-auto">
          <h1 className="h5 fw-bold mb-0">Staff POS</h1>
          <div className="small text-muted-2">
            <Clock />
          </div>
        </div>

        <div className="d-flex gap-2 flex-wrap">
          {[
            ["Sales today", s ? formatPeso(s.totalSales) : "…"],
            ["Transactions", s ? s.transactions : "…"],
            ["Sacks sold", s ? formatQty(s.sacksSold) : "…"],
          ].map(([label, value]) => (
            <div key={label as string} className="card px-3 py-1">
              <div className="small text-muted-2">{label}</div>
              <div className="fw-bold money">{value}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="d-flex gap-2 flex-wrap mb-3">
        <Link className="btn btn-outline-primary btn-sm" href="/staff/expenses">
          <Wallet size={14} aria-hidden /> Record expense
        </Link>

        <Link
          className="btn btn-outline-primary btn-sm"
          href="/staff/transactions"
        >
          <ReceiptText size={14} aria-hidden /> Today&apos;s transactions
        </Link>

        <Link className="btn btn-outline-primary btn-sm" href="/staff/debts">
          <CreditCard size={14} aria-hidden /> Today&apos;s debts
        </Link>
      </div>

      {done && (
        <div
          className="alert alert-success d-flex flex-wrap align-items-center gap-3"
          role="status"
        >
          <CheckCircle2 aria-hidden />

          <div className="me-auto">
            <strong>
              Sale {done.transactionNumber} saved —{" "}
              {formatPeso(done.totalAmount)}
            </strong>

            {Number(done.totalAmount) > Number(done.amountPaid) && (
              <div className="small">
                Unpaid (utang):{" "}
                {formatPeso(Number(done.totalAmount) - Number(done.amountPaid))}
              </div>
            )}
          </div>

          <a
            className="btn btn-sm btn-outline-success"
            href={`/receipt/${done.id}`}
            target="_blank"
            rel="noreferrer"
          >
            <Printer size={14} aria-hidden /> Receipt
          </a>
        </div>
      )}

      <div className="row g-3">
        <div className="col-12 col-lg-7">
          {products.loading && !products.data ? (
            <Spinner />
          ) : (
            <ErrorNote message={products.error} />
          )}

          {list.length > 0 && (
            <>
              <div className="product-tabs mb-3" role="tablist">
                {list.map((product) => (
                  <button
                    key={product.id}
                    role="tab"
                    aria-selected={product.id === active?.id}
                    className={`product-tab ${
                      product.id === active?.id ? "active" : ""
                    }`}
                    onClick={() => setActiveId(product.id)}
                  >
                    {product.name}
                  </button>
                ))}
              </div>

              {active && active.priceOptions.length === 0 && (
                <EmptyState
                  title="No price buttons yet"
                  text="Ask the Admin to add prices for this product."
                />
              )}

              <div className="price-grid">
                {active?.priceOptions.map((option: Json) => (
                  <button
                    key={option.id}
                    className="price-btn"
                    onClick={() => addPrice(active, option)}
                    aria-label={`${active.name} ${option.label}`}
                  >
                    {option.label}
                    <small>
                      {option.packageType !== "RETAIL"
                        ? PACKAGE_LABELS[option.packageType]
                        : (option.unitDescription ?? "")}
                    </small>
                  </button>
                ))}
              </div>

              {cfg.data?.allowStaffCustomPrice !== false && (
                <div className="mt-3">
                  <button
                    className="btn btn-outline-primary"
                    aria-expanded={customOpen}
                    onClick={() => {
                      setCustomOpen((current) => !current);
                      setCustomProduct(active?.id ?? "");
                    }}
                  >
                    Custom price
                  </button>

                  {customOpen && (
                    <div className="card mt-2">
                      <div className="card-body">
                        <div className="row g-2 align-items-end">
                          <div className="col-12 col-sm-4">
                            <label
                              className="form-label small mb-1"
                              htmlFor="cp-prod"
                            >
                              Product
                            </label>

                            <select
                              id="cp-prod"
                              className="form-select"
                              value={customProduct || active?.id}
                              onChange={(event) =>
                                setCustomProduct(event.target.value)
                              }
                            >
                              {list.map((product) => (
                                <option key={product.id} value={product.id}>
                                  {product.name}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="col-6 col-sm-3">
                            <label
                              className="form-label small mb-1"
                              htmlFor="cp-price"
                            >
                              Price (₱)
                            </label>

                            <input
                              id="cp-price"
                              className="form-control"
                              inputMode="decimal"
                              value={customPrice}
                              onChange={(event) =>
                                setCustomPrice(event.target.value)
                              }
                            />
                          </div>

                          <div className="col-6 col-sm-2">
                            <label
                              className="form-label small mb-1"
                              htmlFor="cp-qty"
                            >
                              Qty
                            </label>

                            <input
                              id="cp-qty"
                              type="number"
                              min={1}
                              className="form-control"
                              value={customQty}
                              onChange={(event) =>
                                setCustomQty(
                                  Math.max(
                                    1,
                                    Math.min(
                                      1000,
                                      Number(event.target.value) || 1,
                                    ),
                                  ),
                                )
                              }
                            />
                          </div>

                          <div className="col-12 col-sm-3">
                            <button
                              className="btn btn-primary w-100"
                              disabled={!customOk}
                              onClick={addCustom}
                            >
                              Add to sale
                            </button>
                          </div>
                        </div>

                        <div className="small mt-2 text-muted-2">
                          {customPrice && !customOk ? (
                            <span className="text-danger">
                              Enter a price above ₱0 and up to{" "}
                              {formatPeso(maxCustom)}.
                            </span>
                          ) : customOk ? (
                            <>
                              Unit {formatPeso(Number(customPrice))} ×{" "}
                              {customQty} ={" "}
                              <strong>
                                {formatPeso(Number(customPrice) * customQty)}
                              </strong>
                            </>
                          ) : (
                            "Use this when no price button matches. It does not change the price buttons."
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {!products.loading && list.length === 0 && !products.error && (
            <EmptyState title="No products available" />
          )}
        </div>

        <div className="col-12 col-lg-5">
          <div className="card">
            <div className="card-body">
              <div className="mb-3">
                <CustomerPicker
                  value={customer}
                  onChange={setCustomer}
                  placeholder="Customer (optional for cash)…"
                />
              </div>

              {cart.length === 0 ? (
                <div className="text-muted-2 text-center py-3">
                  Tap a price to start a sale.
                </div>
              ) : (
                cart.map((line) => (
                  <div className="cart-line" key={line.key}>
                    <div className="flex-grow-1">
                      <div className="fw-semibold">
                        {line.productName} — {line.label}
                      </div>

                      <div className="small text-muted-2 money">
                        {formatPeso(line.unitCents / 100)} × {line.quantity} ={" "}
                        {formatPeso((line.unitCents * line.quantity) / 100)}
                      </div>
                    </div>

                    <button
                      className="qty-btn"
                      aria-label="Decrease quantity"
                      onClick={() => setQty(line.key, -1)}
                    >
                      <Minus size={16} />
                    </button>

                    <strong style={{ minWidth: 24, textAlign: "center" }}>
                      {line.quantity}
                    </strong>

                    <button
                      className="qty-btn"
                      aria-label="Increase quantity"
                      onClick={() => setQty(line.key, 1)}
                    >
                      <Plus size={16} />
                    </button>

                    <button
                      className="qty-btn text-danger"
                      aria-label="Remove item"
                      onClick={() => remove(line.key)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))
              )}

              <div className="d-flex justify-content-between align-items-center my-3">
                <span className="fw-semibold">Total</span>
                <span className="cart-total">{formatPeso(totalC / 100)}</span>
              </div>

              <div
                className="pay-modes mb-3"
                role="group"
                aria-label="Payment type"
              >
                {(
                  [
                    ["CASH", "Cash"],
                    ["DIGITAL", "GCash / digital"],
                    ["CREDIT", "Utang"],
                    ["SPLIT", "Split"],
                  ] as [Mode, string][]
                ).map(([paymentMode, label]) => (
                  <button
                    key={paymentMode}
                    className={`pay-mode ${
                      mode === paymentMode ? "active" : ""
                    }`}
                    onClick={() => setMode(paymentMode)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {mode === "CASH" && (
                <div className="mb-3">
                  <label className="form-label small mb-1" htmlFor="tend">
                    Cash received (optional, to compute change)
                  </label>

                  <input
                    id="tend"
                    className="form-control"
                    inputMode="decimal"
                    value={tendered}
                    onChange={(event) => setTendered(event.target.value)}
                  />

                  {change > 0 && (
                    <div className="mt-1 fw-semibold">
                      Change: {formatPeso(change / 100)}
                    </div>
                  )}
                </div>
              )}

              {(mode === "DIGITAL" || mode === "SPLIT") && (
                <div className="mb-3">
                  <label className="form-label small mb-1" htmlFor="dig">
                    Digital method
                  </label>

                  <select
                    id="dig"
                    className="form-select"
                    value={digital}
                    onChange={(event) => setDigital(event.target.value)}
                  >
                    {DIGITAL_METHODS.map((method) => (
                      <option key={method} value={method}>
                        {PAYMENT_METHOD_LABELS[method]}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {mode === "SPLIT" && (
                <div className="row g-2 mb-3">
                  <div className="col-6">
                    <label className="form-label small mb-1" htmlFor="sc">
                      Cash (₱)
                    </label>

                    <input
                      id="sc"
                      className="form-control"
                      inputMode="decimal"
                      value={splitCash}
                      onChange={(event) => setSplitCash(event.target.value)}
                    />
                  </div>

                  <div className="col-6">
                    <label className="form-label small mb-1" htmlFor="sd">
                      Digital (₱)
                    </label>

                    <input
                      id="sd"
                      className="form-control"
                      inputMode="decimal"
                      value={splitDigital}
                      onChange={(event) => setSplitDigital(event.target.value)}
                    />
                  </div>
                </div>
              )}

              {mode === "CREDIT" && (
                <div className="mb-3">
                  <div className="row g-2">
                    <div className="col-6">
                      <label className="form-label small mb-1" htmlFor="pn">
                        Paid now (₱, optional)
                      </label>

                      <input
                        id="pn"
                        className="form-control"
                        inputMode="decimal"
                        value={paidNow}
                        onChange={(event) => setPaidNow(event.target.value)}
                      />
                    </div>

                    <div className="col-6">
                      <label className="form-label small mb-1" htmlFor="pm">
                        Method
                      </label>

                      <select
                        id="pm"
                        className="form-select"
                        value={paidMethod}
                        onChange={(event) => setPaidMethod(event.target.value)}
                      >
                        {Object.entries(PAYMENT_METHOD_LABELS).map(
                          ([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ),
                        )}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {pay.balance > 0 && customer && cart.length > 0 && (
                <div className="small border rounded-3 p-2 mb-3 bg-light">
                  <div className="d-flex justify-content-between">
                    <span>Previous balance</span>
                    <span className="money">
                      {formatPeso(customer.outstandingBalance)}
                    </span>
                  </div>

                  <div className="d-flex justify-content-between">
                    <span>New purchase</span>
                    <span className="money">{formatPeso(totalC / 100)}</span>
                  </div>

                  <div className="d-flex justify-content-between">
                    <span>Amount paid</span>
                    <span className="money">{formatPeso(pay.paid / 100)}</span>
                  </div>

                  <div className="d-flex justify-content-between fw-bold">
                    <span>New balance</span>
                    <span className="money">
                      {formatPeso(
                        Number(customer.outstandingBalance) + pay.balance / 100,
                      )}
                    </span>
                  </div>
                </div>
              )}

              <ErrorNote message={error} />

              {pay.problem && cart.length > 0 && (
                <div className="text-danger small mb-2">{pay.problem}</div>
              )}

              <div className="d-flex gap-2 sticky-confirm bg-white py-2">
                <button
                  className="btn btn-light"
                  disabled={cart.length === 0 || busy}
                  onClick={() => {
                    setCart([]);
                    setError(null);
                    setDone(null);
                  }}
                >
                  Clear
                </button>

                <button
                  className="btn btn-success confirm-btn flex-grow-1"
                  disabled={busy || cart.length === 0 || !!pay.problem}
                  onClick={confirm}
                >
                  {busy
                    ? "Saving…"
                    : `Confirm Sale ${
                        cart.length ? formatPeso(totalC / 100) : ""
                      }`}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
