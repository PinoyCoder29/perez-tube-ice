"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  CreditCard,
  Home,
  MoreHorizontal,
  ReceiptText,
  ShoppingCart,
  Snowflake,
  Truck,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { InstallApp } from "@/components/pwa/InstallApp";

const MAIN = [
  { href: "/staff/pos", label: "POS", icon: ShoppingCart },
  { href: "/staff/deliveries", label: "Deliveries", icon: Truck },
  { href: "/staff/customers", label: "Customers", icon: Users },
  { href: "/staff/debts", label: "Utang / Pay", icon: CreditCard },
];

const MORE = [
  {
    href: "/staff/transactions",
    label: "Today's Transactions",
    icon: ReceiptText,
  },
  {
    href: "/staff/expenses",
    label: "Expenses",
    icon: Wallet,
  },
  {
    href: "/staff/summary",
    label: "Daily Summary & Calendar",
    icon: CalendarDays,
  },
];

export default function StaffShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const path = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [path]);

  const all = [...MAIN, ...MORE];

  const moreActive = MORE.some((n) => path.startsWith(n.href));

  const title = all.find((n) => path.startsWith(n.href))?.label ?? "Perez Ice";

  return (
    <>
      {/* Desktop top navigation: hidden on mobile */}
      <header className="staff-top d-none d-lg-block">
        <div
          className="container-fluid d-flex align-items-center gap-3 py-2"
          style={{ maxWidth: 1200 }}
        >
          <Link
            href="/"
            className="text-white text-decoration-none fw-bold d-flex align-items-center gap-2"
            aria-label="Home"
          >
            <Snowflake size={20} style={{ color: "var(--ice)" }} aria-hidden />
            PEREZ ICE
          </Link>

          <nav
            className="desk-links d-flex gap-1 ms-2"
            aria-label="Staff navigation"
          >
            {all.map((n) => {
              const Icon = n.icon;
              const active = path.startsWith(n.href);

              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`link ${active ? "active" : ""}`}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon size={16} aria-hidden />{" "}
                  {n.label.replace(" & Calendar", "").replace("Today's ", "")}
                </Link>
              );
            })}
          </nav>

          <Link
            href="/"
            className="link ms-auto text-decoration-none"
            style={{ color: "#cfe0f1" }}
            aria-label="Exit Staff mode"
          >
            <Home size={18} aria-hidden />
          </Link>
        </div>
      </header>

      {/* Main content */}
      <main className="staff-main">
        {/* Mobile page heading */}
        <div className="d-lg-none px-3 pt-3 pb-2">
          <div className="small text-muted-2 d-flex align-items-center gap-1">
            <Snowflake size={14} style={{ color: "var(--ice)" }} aria-hidden />
            PEREZ ICE
          </div>
          <h1 className="h5 mb-0 mt-1">{title}</h1>
        </div>

        {children}
      </main>

      {/* Fixed mobile bottom navigation */}
      <nav className="bottom-nav" aria-label="Staff navigation">
        {MAIN.map((n) => {
          const Icon = n.icon;
          const active = path.startsWith(n.href);

          return (
            <Link
              key={n.href}
              href={n.href}
              className={active ? "active" : ""}
              aria-current={active ? "page" : undefined}
            >
              <Icon size={20} aria-hidden />
              <span>{n.label}</span>
            </Link>
          );
        })}

        <button
          type="button"
          className={moreActive || open ? "active" : ""}
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label="More menu"
        >
          <MoreHorizontal size={20} aria-hidden />
          <span>More</span>
        </button>
      </nav>

      {/* More menu drawer */}
      {open && (
        <>
          <div
            className="sidebar-scrim"
            onClick={() => setOpen(false)}
            style={{ zIndex: 1044 }}
          />

          <aside
            className="drawer-staff"
            role="dialog"
            aria-modal="true"
            aria-label="More menu"
            style={{ zIndex: 1045 }}
          >
            <div className="d-flex justify-content-between align-items-center mb-2">
              <strong className="text-white">More</strong>

              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
              >
                <X size={20} />
              </button>
            </div>

            {MORE.map((n) => {
              const Icon = n.icon;
              const active = path.startsWith(n.href);

              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={active ? "active" : ""}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon size={20} aria-hidden /> {n.label}
                </Link>
              );
            })}

            <Link href="/">
              <Home size={20} aria-hidden /> Exit Staff mode
            </Link>

            <div
              className="mt-3 p-2 rounded-3"
              style={{ background: "rgba(255,255,255,.08)" }}
            >
              <InstallApp compact />
            </div>
          </aside>
        </>
      )}
    </>
  );
}
