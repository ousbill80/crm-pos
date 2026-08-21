import { Loader2 } from 'lucide-react';

export function LoadingState({ label }: { label: string }) {
  return (
    <p className="loading-state">
      <Loader2 size={15} className="loading-state-spinner" />
      {label}
    </p>
  );
}
