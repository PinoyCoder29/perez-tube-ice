import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import AdminShell from '@/components/layout/AdminShell';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const u = await getSessionUser();
  if (!u) redirect('/admin/login');
  if (u.mustChangePassword) redirect('/admin/change-password');
  return <AdminShell userName={u.name}>{children}</AdminShell>;
}
