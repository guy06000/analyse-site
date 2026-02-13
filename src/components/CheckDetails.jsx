import { Badge } from '@/components/ui/badge';
import { CheckCircle, AlertTriangle, XCircle } from 'lucide-react';

const statusConfig = {
  success: {
    icon: CheckCircle,
    color: 'text-green-600',
    badge: 'bg-green-100 text-green-800 hover:bg-green-100',
    label: 'OK',
  },
  warning: {
    icon: AlertTriangle,
    color: 'text-orange-500',
    badge: 'bg-orange-100 text-orange-800 hover:bg-orange-100',
    label: 'Attention',
  },
  error: {
    icon: XCircle,
    color: 'text-red-500',
    badge: 'bg-red-100 text-red-800 hover:bg-red-100',
    label: 'Erreur',
  },
};

export function CheckDetails({ category }) {
  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold">{category.name}</h3>
      {category.checks.map((check, index) => {
        const config = statusConfig[check.status];
        const Icon = config.icon;
        return (
          <div
            key={index}
            className="flex items-start gap-3 rounded-lg border p-3"
          >
            <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${config.color}`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium">{check.name}</span>
                <Badge variant="secondary" className={config.badge}>
                  {check.value}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground break-all">
                {check.detail}
              </p>
              {check.recommendation && (
                <p className="mt-1 text-sm text-blue-600 dark:text-blue-400">
                  → {check.recommendation}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
