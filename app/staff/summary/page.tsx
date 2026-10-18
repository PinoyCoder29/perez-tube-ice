'use client';
import { DailyView } from '@/components/dashboard/DailyView';

export default function StaffSummary() {
  return (
    <div>
      <h1 className="h5 fw-bold mb-3">Daily summary</h1>
      <DailyView />
    </div>
  );
}
