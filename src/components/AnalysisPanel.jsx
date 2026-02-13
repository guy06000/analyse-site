import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { GlobalScore } from './GlobalScore';
import { ScoreCard } from './ScoreCard';
import { CheckDetails } from './CheckDetails';

export function AnalysisPanel({ data, loading, error }) {
  const [selectedCategory, setSelectedCategory] = useState(null);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="mt-3 text-muted-foreground">Analyse en cours...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-red-600 font-medium">Erreur</p>
        <p className="mt-1 text-sm text-red-500">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        <p>Entrez une URL et lancez l'analyse pour voir les résultats.</p>
      </div>
    );
  }

  const categories = Object.values(data.categories);

  return (
    <div className="space-y-6">
      <GlobalScore score={data.score} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((category) => (
          <ScoreCard
            key={category.name}
            category={category}
            onClick={() =>
              setSelectedCategory(
                selectedCategory?.name === category.name ? null : category
              )
            }
          />
        ))}
      </div>

      {selectedCategory && (
        <div className="rounded-lg border bg-card p-6">
          <CheckDetails category={selectedCategory} />
        </div>
      )}
    </div>
  );
}
