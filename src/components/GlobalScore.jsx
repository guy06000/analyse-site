import { Progress } from '@/components/ui/progress';

function getScoreColor(score) {
  if (score >= 80) return 'text-green-600';
  if (score >= 50) return 'text-orange-500';
  return 'text-red-500';
}

function getProgressColor(score) {
  if (score >= 80) return '[&>div]:bg-green-500';
  if (score >= 50) return '[&>div]:bg-orange-500';
  return '[&>div]:bg-red-500';
}

function getScoreEmoji(score) {
  if (score >= 80) return '';
  if (score >= 50) return '';
  return '';
}

export function GlobalScore({ score }) {
  return (
    <div className="rounded-lg border bg-card p-6 text-center">
      <p className="text-sm text-muted-foreground">Score global</p>
      <div className="mt-2 flex items-center justify-center gap-3">
        <span className="text-4xl">{getScoreEmoji(score)}</span>
        <span className={`text-5xl font-bold ${getScoreColor(score)}`}>
          {score}
        </span>
        <span className="text-2xl text-muted-foreground">/100</span>
      </div>
      <Progress
        value={score}
        className={`mx-auto mt-4 h-3 max-w-md ${getProgressColor(score)}`}
      />
    </div>
  );
}
