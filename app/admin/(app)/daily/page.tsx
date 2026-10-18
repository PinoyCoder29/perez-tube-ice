'use client';
import { PageHeader } from '@/components/ui/common';
import { DailyView } from '@/components/dashboard/DailyView';

export default function AdminDaily() {
  return (
    <div>
      <PageHeader title="Daily Sales Calendar" subtitle="Pick any day — today, yesterday, earlier dates or a future delivery date." />
      <DailyView admin />
    </div>
  );
}
