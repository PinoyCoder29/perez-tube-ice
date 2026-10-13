import Link from 'next/link';
import { ShieldCheck, ShoppingCart, Snowflake } from 'lucide-react';

export default function Landing() {
  return (
    <main className="landing">
      <div className="container py-5">
        <div className="text-center mb-5">
          <Snowflake size={40} aria-hidden className="mb-2" style={{ color: 'var(--ice)' }} />
          <h1 className="mb-1">PEREZ ICE</h1>
          <p className="lead mb-0" style={{ color: '#cfe0f1' }}>Ice Sales and Delivery Management System</p>
        </div>
        <div className="row g-4 justify-content-center">
          <div className="col-12 col-md-6 col-lg-5">
            <div className="entry-card">
              <div className="entry-icon"><ShieldCheck size={32} aria-hidden /></div>
              <h2 className="h4 fw-bold mb-0">Admin</h2>
              <p className="text-muted-2 flex-grow-1 mb-2">Manage sales, products, customers, debts, deliveries, expenses, and reports.</p>
              <Link href="/admin/login" className="btn btn-primary btn-lg">Admin Login</Link>
            </div>
          </div>
          <div className="col-12 col-md-6 col-lg-5">
            <div className="entry-card">
              <div className="entry-icon"><ShoppingCart size={32} aria-hidden /></div>
              <h2 className="h4 fw-bold mb-0">Staff</h2>
              <p className="text-muted-2 flex-grow-1 mb-2">Record sales, customer purchases, deliveries, and daily expenses.</p>
              <Link href="/staff/pos" className="btn btn-outline-primary btn-lg">Open Staff POS</Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
