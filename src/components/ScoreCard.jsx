import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

export function ScoreCard({ category, onClick }) {
  return (
    <Card
      className="cursor-pointer transition-shadow hover:shadow-lg"
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {category.name}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-2">
          <span className={`text-3xl font-bold ${getScoreColor(category.score)}`}>
            {category.score}
          </span>
          <span className="text-muted-foreground mb-1">/100</span>
        </div>
        <Progress
          value={category.score}
          className={`mt-2 h-2 ${getProgressColor(category.score)}`}
        />
        <p className="mt-2 text-xs text-muted-foreground">
          {category.checks.length} points vérifiés
        </p>
      </CardContent>
    </Card>
  );
}
