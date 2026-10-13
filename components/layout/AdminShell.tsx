'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { BarChart3, Boxes, CreditCard, FileText, KeyRound, LayoutDashboard, LogOut, Menu, Package, Receipt, Settings, Snowflake, Truck, Users, Wallet, Activity, ShoppingCart } from 'lucide-react';
import { api } from '@/lib/client/api';

const NAV = [
  { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/sales', label: 'POS / Sales History', icon: Receipt },
  { href: '/admin/products', label: 'Products & Pricing', icon: Package },
  { href: '/admin/customers', label: 'Customers', icon: Users },
  { href: '/admin/debts', label: 'Utang / Debt Management', icon: CreditCard },
  { href: '/admin/payments', label: 'Payments & Collections', icon: Wallet },
  { href: '/admin/deliveries', label: 'Deliveries', icon: Truck },
  { href: '/admin/expenses', label: 'Expenses', icon: FileText },
  { href: '/admin/inventory', label: 'Inventory', icon: Boxes },
  { href: '/admin/reports', label: 'Reports', icon: BarChart3 },
  { href: '/admin/activity', label: 'Staff Activity', icon: Activity },
  { href: '/admin/settings', label: 'Settings', icon: Settings },
];

export default function AdminShell({ userName, children }: { userName: string; children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function logout() {
    await api('/api/auth/logout', { method: 'POST', body: {} }).catch(() => {});
    router.replace('/admin/login');
    router.refresh();
  }

  return (
    <>
      <div className="admin-topbar">
        <button className="btn btn-sm btn-outline-light" aria-label="Open menu" onClick={() => setOpen(true)}><Menu size={18} /></button>
        <strong className="letter-spacing">PEREZ ICE</strong>
      </div>
      {open && <div className="sidebar-scrim" onClick={() => setOpen(false)} />}
      <aside className={`sidebar ${open ? 'open' : ''}`} aria-label="Admin navigation">
        <div className="brand"><Snowflake size={22} style={{ color: 'var(--ice)' }} aria-hidden /> PEREZ ICE</div>
        <nav>
          {NAV.map((n) => {
            const Icon = n.icon;
            const active = path === n.href || path.startsWith(n.href + '/');
            return (
              <Link key={n.href} href={n.href} className={`nav-item ${active ? 'active' : ''}`} onClick={() => setOpen(false)} aria-current={active ? 'page' : undefined}>
                <Icon size={18} aria-hidden /> {n.label}
              </Link>
            );
          })}
          <hr className="border-secondary my-2" />
          <Link href="/staff/pos" className="nav-item" target="_blank"><ShoppingCart size={18} aria-hidden /> Open Staff POS</Link>
          <Link href="/admin/change-password" className="nav-item"><KeyRound size={18} aria-hidden /> Change password</Link>
          <button className="nav-item" onClick={logout}><LogOut size={18} aria-hidden /> Logout</button>
        </nav>
        <div className="px-3 pb-3 small" style={{ color: '#8fa7c2' }}>Signed in as {userName}</div>
      </aside>
      <main className="admin-main">{children}</main>
    </>
  );
}
