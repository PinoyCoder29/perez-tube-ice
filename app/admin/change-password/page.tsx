import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import ChangePasswordForm from './form';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const u = await getSessionUser();
  if (!u) redirect('/admin/login');
  return <ChangePasswordForm forced={u.mustChangePassword} />;
}
