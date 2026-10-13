'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ClipboardList, CreditCard, Home, ReceiptText, ShoppingCart, Snowflake, Truck, Users, Wallet } from 'lucide-react';

const NAV = [
  { href: '/staff/pos', label: 'POS', icon: ShoppingCart },
  { href: '/staff/customers', label: 'Customers', icon: Users },
  { href: '/staff/transactions', label: 'Today', icon: ReceiptText },
  { href: '/staff/debts', label: 'Utang', icon: CreditCard },
  { href: '/staff/deliveries', label: 'Deliveries', icon: Truck },
  { href: '/staff/expenses', label: 'Expenses', icon: Wallet },
  { href: '/staff/summary', label: 'Summary', icon: ClipboardList },
];

export default function StaffShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <>
      <header className="staff-top">
        <div className="container-fluid d-flex align-items-center gap-3 py-2" style={{ maxWidth: 1200 }}>
          <Link href="/" className="text-white text-decoration-none fw-bold d-flex align-items-center gap-2" aria-label="Home">
            <Snowflake size={20} style={{ color: 'var(--ice)' }} aria-hidden /> PEREZ ICE
          </Link>
          <nav className="desk-links d-flex gap-1 ms-2" aria-label="Staff navigation">
            {NAV.map((n) => {
              const Icon = n.icon;
              const active = path.startsWith(n.href);
              return (
                <Link key={n.href} href={n.href} className={`link ${active ? 'active' : ''}`} aria-current={active ? 'page' : undefined}>
                  <Icon size={16} aria-hidden /> {n.label}
                </Link>
              );
            })}
          </nav>
          <Link href="/" className="link ms-auto text-decoration-none" style={{ color: '#cfe0f1' }} aria-label="Exit Staff mode"><Home size={18} /></Link>
        </div>
      </header>
      <main className="staff-main">{children}</main>
      <nav className="bottom-nav" aria-label="Staff navigation">
        {NAV.map((n) => {
          const Icon = n.icon;
          const active = path.startsWith(n.href);
          return (
            <Link key={n.href} href={n.href} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined}>
              <Icon size={20} aria-hidden />
              {n.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
