'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Activity, BarChart3, Boxes, CalendarDays, CreditCard, FileText, KeyRound, LayoutDashboard, LogOut, Menu, MoreHorizontal, Package, Receipt, Settings, ShoppingCart, Snowflake, Truck, Users, Wallet } from 'lucide-react';
import { api } from '@/lib/client/api';

const NAV = [
  { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/sales', label: 'POS / Sales History', icon: Receipt },
  { href: '/admin/daily', label: 'Daily Sales Calendar', icon: CalendarDays },
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
// Mobile bottom bar: four primary destinations + More (drawer).
const PRIMARY = [
  { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard, match: ['/admin/dashboard'] },
  { href: '/admin/sales', label: 'Sales', icon: Receipt, match: ['/admin/sales', '/admin/daily'] },
  { href: '/admin/deliveries', label: 'Deliveries', icon: Truck, match: ['/admin/deliveries'] },
  { href: '/admin/customers', label: 'Customers', icon: Users, match: ['/admin/customers', '/admin/debts'] },
];
const PRIMARY_HREFS = new Set(PRIMARY.flatMap((p) => p.match));

export default function AdminShell({ userName, children }: { userName: string; children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);

  async function logout() {
    await api('/api/auth/logout', { method: 'POST', body: {} }).catch(() => {});
    router.replace('/admin/login');
    router.refresh();
  }
  const moreActive = !PRIMARY.some((p) => p.match.some((m) => path.startsWith(m)));

  return (
    <>
      <div className="admin-topbar">
        <button className="btn btn-sm btn-outline-light" aria-label="Open menu" onClick={() => setOpen(true)}><Menu size={18} /></button>
        <strong>PEREZ ICE</strong>
      </div>
      {open && <div className="sidebar-scrim" onClick={() => setOpen(false)} />}
      <aside className={`sidebar ${open ? 'open' : ''}`} aria-label="Admin navigation">
        <div className="brand"><Snowflake size={22} style={{ color: 'var(--ice)' }} aria-hidden /> PEREZ ICE</div>
        <nav>
          {NAV.map((n) => {
            const Icon = n.icon;
            const active = path === n.href || path.startsWith(n.href + '/');
            return (
              <Link key={n.href} href={n.href} className={`nav-item ${active ? 'active' : ''} ${PRIMARY_HREFS.has(n.href) ? 'primary-only' : ''}`} aria-current={active ? 'page' : undefined}>
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
      <nav className="admin-bottom" aria-label="Primary navigation">
        {PRIMARY.map((n) => {
          const Icon = n.icon;
          const active = n.match.some((m) => path.startsWith(m));
          return (
            <Link key={n.href} href={n.href} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined}>
              <Icon size={20} aria-hidden />{n.label}
            </Link>
          );
        })}
        <button className={moreActive || open ? 'active' : ''} onClick={() => setOpen(true)} aria-label="More menu" aria-expanded={open} style={{ color: moreActive ? 'var(--navy-2)' : undefined }}>
          <MoreHorizontal size={20} aria-hidden />More
        </button>
      </nav>
    </>
  );
}
