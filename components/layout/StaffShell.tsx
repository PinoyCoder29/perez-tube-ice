'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CalendarDays, CreditCard, Home, MoreHorizontal, ReceiptText, ShoppingCart, Snowflake, Truck, Users, Wallet, X } from 'lucide-react';

const MAIN = [
  { href: '/staff/pos', label: 'POS', icon: ShoppingCart },
  { href: '/staff/deliveries', label: 'Deliveries', icon: Truck },
  { href: '/staff/customers', label: 'Customers', icon: Users },
  { href: '/staff/debts', label: 'Utang / Pay', icon: CreditCard },
];
const MORE = [
  { href: '/staff/transactions', label: "Today's Transactions", icon: ReceiptText },
  { href: '/staff/expenses', label: 'Expenses', icon: Wallet },
  { href: '/staff/summary', label: 'Daily Summary & Calendar', icon: CalendarDays },
];

export default function StaffShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  const all = [...MAIN, ...MORE];
  const moreActive = MORE.some((n) => path.startsWith(n.href));
  return (
    <>
      <header className="staff-top">
        <div className="container-fluid d-flex align-items-center gap-3 py-2" style={{ maxWidth: 1200 }}>
          <Link href="/" className="text-white text-decoration-none fw-bold d-flex align-items-center gap-2" aria-label="Home">
            <Snowflake size={20} style={{ color: 'var(--ice)' }} aria-hidden /> PEREZ ICE
          </Link>
          <nav className="desk-links d-flex gap-1 ms-2" aria-label="Staff navigation">
            {all.map((n) => {
              const Icon = n.icon;
              const active = path.startsWith(n.href);
              return (
                <Link key={n.href} href={n.href} className={`link ${active ? 'active' : ''}`} aria-current={active ? 'page' : undefined}>
                  <Icon size={16} aria-hidden /> {n.label.replace(' & Calendar', '').replace("Today's ", '')}
                </Link>
              );
            })}
          </nav>
          <Link href="/" className="link ms-auto text-decoration-none" style={{ color: '#cfe0f1' }} aria-label="Exit Staff mode"><Home size={18} /></Link>
        </div>
      </header>
      <main className="staff-main">{children}</main>
      <nav className="bottom-nav" aria-label="Staff navigation">
        {MAIN.map((n) => {
          const Icon = n.icon;
          const active = path.startsWith(n.href);
          return (
            <Link key={n.href} href={n.href} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined}>
              <Icon size={20} aria-hidden />{n.label}
            </Link>
          );
        })}
        <button className={moreActive || open ? 'active' : ''} onClick={() => setOpen(true)} aria-expanded={open} aria-label="More menu"><MoreHorizontal size={20} aria-hidden />More</button>
      </nav>
      {open && (
        <>
          <div className="sidebar-scrim" onClick={() => setOpen(false)} style={{ zIndex: 1044 }} />
          <aside className="drawer-staff" aria-label="More">
            <div className="d-flex justify-content-between align-items-center mb-2"><strong className="text-white">More</strong><button aria-label="Close menu" onClick={() => setOpen(false)}><X size={20} /></button></div>
            {MORE.map((n) => {
              const Icon = n.icon;
              return <Link key={n.href} href={n.href} className={path.startsWith(n.href) ? 'active' : ''}><Icon size={20} aria-hidden /> {n.label}</Link>;
            })}
            <Link href="/"><Home size={20} aria-hidden /> Exit Staff mode</Link>
          </aside>
        </>
      )}
    </>
  );
}
