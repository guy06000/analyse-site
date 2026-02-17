import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle,
  AlertTriangle,
  XCircle,
  Store,
  ChevronDown,
  ChevronUp,
  Globe,
  FileText,
  Pencil,
  ExternalLink,
  Wrench,
  Loader2,
  ImageIcon,
  Save,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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

/* ── Simple list (for basic detailList strings) ── */
function DetailList({ items }) {
  const [open, setOpen] = useState(false);

  if (!items || items.length === 0) return null;

  return (
    <div className="mt-1.5">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        {open ? 'Masquer' : 'Voir'} les {items.length} détails
      </button>
      {open && (
        <ul className="mt-1.5 max-h-80 overflow-y-auto rounded border bg-muted/30 px-3 py-2 text-sm space-y-0.5">
          {items.map((item, i) => (
            <li key={i} className={`whitespace-pre-line ${item.startsWith('✓') ? 'text-green-600' : item.startsWith('✗') ? 'text-red-500' : item.startsWith('💡') || item.startsWith('⚠️') ? 'text-amber-600' : 'text-muted-foreground'}`}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ── Translation task cards (structured per-page view) ── */
function TranslationTasks({ tasks }) {
  const [open, setOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(10);

  if (!tasks || tasks.length === 0) return null;

  const visibleTasks = tasks.slice(0, visibleCount);
  const hasMore = visibleCount < tasks.length;

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        {open ? 'Masquer' : 'Voir'} les {tasks.length} pages
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          {visibleTasks.map((task, i) => (
            <div
              key={i}
              className="rounded-lg border bg-card overflow-hidden"
            >
              {/* Header : product name + path */}
              <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 border-b">
                <span className="font-semibold text-sm truncate">{task.title}</span>
                <span className="text-xs text-muted-foreground shrink-0">{task.path}</span>
              </div>

              <div className="px-3 py-2 space-y-2">
                {/* Available languages */}
                {task.available.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs text-muted-foreground w-10 shrink-0">OK :</span>
                    {task.available.map((lang) => (
                      <Badge
                        key={lang}
                        className="bg-green-100 text-green-700 hover:bg-green-100 text-xs px-1.5 py-0"
                      >
                        {lang}
                      </Badge>
                    ))}
                  </div>
                )}

                {/* Missing languages */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs text-red-500 font-medium w-10 shrink-0">
                    {task.missing.length}
                  </span>
                  {task.missing.map((lang) => (
                    <Badge
                      key={lang}
                      variant="outline"
                      className="text-xs text-red-600 border-red-300 px-1.5 py-0"
                    >
                      {lang}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          ))}

          {/* Load more button */}
          {hasMore && (
            <button
              onClick={() => setVisibleCount((c) => c + 20)}
              className="w-full py-2 text-sm font-medium text-blue-600 hover:text-blue-800 border border-dashed rounded-lg hover:bg-blue-50 transition-colors"
            >
              Charger 20 de plus ({tasks.length - visibleCount} restants)
            </button>
          )}

          {!hasMore && tasks.length > 10 && (
            <p className="text-center text-xs text-muted-foreground py-1">
              {tasks.length} / {tasks.length} affichés
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Deep scan cards (untranslated content details) ── */
function DetailCards({ cards }) {
  const [open, setOpen] = useState(false);

  if (!cards || cards.length === 0) return null;

  const totalItems = cards.reduce((sum, c) => sum + c.items.length, 0);

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        {open ? 'Masquer' : 'Voir'} les {totalItems} corrections
      </button>
      {open && (
        <div className="mt-2 max-h-[500px] overflow-y-auto space-y-3">
          {cards.map((card, i) => (
            <div
              key={i}
              className="rounded-lg border border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/30 overflow-hidden"
            >
              {/* Card header */}
              <div className="flex items-center gap-2 bg-red-100/60 dark:bg-red-900/30 px-3 py-2 border-b border-red-200 dark:border-red-900">
                <Globe className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0" />
                <span className="font-semibold text-sm text-red-800 dark:text-red-200">
                  {card.title}
                </span>
                <Badge className="bg-red-200 text-red-800 hover:bg-red-200 dark:bg-red-800 dark:text-red-200 text-xs">
                  version {card.lang}
                </Badge>
                <span className="text-xs text-red-500 dark:text-red-400 ml-auto">
                  {card.path}
                </span>
              </div>

              {/* Card body */}
              <div className="divide-y divide-red-100 dark:divide-red-900">
                {card.items.map((item, j) => (
                  <div key={j} className="px-3 py-2.5 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="text-sm font-medium">{item.element}</span>
                      <Badge variant="outline" className="text-xs text-orange-600 border-orange-300">
                        {item.detectedLang}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground bg-white dark:bg-black/20 rounded px-2 py-1.5 border border-dashed border-muted-foreground/30 italic">
                      &quot;{item.text}&quot;
                    </p>
                    <div className="flex items-start gap-1.5">
                      <Pencil className="h-3 w-3 mt-0.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span className="text-xs text-emerald-700 dark:text-emerald-300">{item.fix}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Editable image alt text ── */
function ImageAltEditor({ images, shopifyConfig, onSaveAlt, altSaving, altResults }) {
  const [open, setOpen] = useState(false);
  const [altValues, setAltValues] = useState({});

  if (!images || images.length === 0 || !shopifyConfig || !onSaveAlt) return null;

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        <ImageIcon className="h-3.5 w-3.5" />
        {open ? 'Masquer' : 'Modifier'} les alt ({images.length} images)
      </button>

      {open && (
        <div className="mt-2 space-y-2 max-h-[500px] overflow-y-auto">
          {images.map((img) => {
            const isSaving = altSaving?.[img.imageId];
            const result = altResults?.[img.imageId];
            const saved = result?.success;

            return (
              <div
                key={img.imageId}
                className="flex items-center gap-3 rounded-lg border p-2 bg-muted/30"
              >
                {/* Thumbnail */}
                <img
                  src={img.src}
                  alt=""
                  className="h-[60px] w-[60px] rounded border object-cover shrink-0 bg-white"
                  loading="lazy"
                />

                {/* Info + input */}
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground truncate">{img.productTitle}</span>
                    <span className="shrink-0">pos. {img.position}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="text"
                      placeholder="Texte alternatif..."
                      value={altValues[img.imageId] ?? ''}
                      onChange={(e) =>
                        setAltValues((prev) => ({ ...prev, [img.imageId]: e.target.value }))
                      }
                      disabled={saved || isSaving}
                      className="h-8 text-sm flex-1"
                    />
                    {saved ? (
                      <span className="inline-flex items-center gap-1 text-sm text-green-600 font-medium shrink-0">
                        <CheckCircle className="h-3.5 w-3.5" />
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50 shrink-0"
                        onClick={() =>
                          onSaveAlt(img.productId, img.imageId, altValues[img.imageId] || '')
                        }
                        disabled={isSaving || !altValues[img.imageId]?.trim()}
                      >
                        {isSaving ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Save className="h-3 w-3" />
                        )}
                      </Button>
                    )}
                  </div>
                  {result && !result.success && result.error && (
                    <p className="text-xs text-red-500">{result.error}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Fix button component ── */
function FixButton({ fixAction, shopifyConfig, onFix, fixingId, fixResults }) {
  if (!fixAction || !shopifyConfig || !onFix) return null;

  const fixResult = fixResults?.[fixAction.id];
  const isFixing = fixingId === fixAction.id;

  if (fixResult?.success) {
    return (
      <span className="inline-flex items-center gap-1 text-sm text-green-600 font-medium">
        <CheckCircle className="h-3.5 w-3.5" />
        Corrigé !
      </span>
    );
  }

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <Button
        size="sm"
        variant="outline"
        className="h-7 gap-1 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
        onClick={() => onFix(fixAction)}
        disabled={isFixing}
      >
        {isFixing ? (
          <>
            <Loader2 className="h-3 w-3 animate-spin" />
            Correction...
          </>
        ) : (
          <>
            <Wrench className="h-3 w-3" />
            {fixAction.label}
          </>
        )}
      </Button>
      {fixResult && !fixResult.success && fixResult.error && (
        <p className="text-xs text-red-500">{fixResult.error}</p>
      )}
    </div>
  );
}

/* ── Main component ── */
export function CheckDetails({ category, shopifyConfig, onFix, fixingId, fixResults, onSaveAlt, altSaving, altResults }) {
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
                {check.fixAction && (
                  <FixButton
                    fixAction={check.fixAction}
                    shopifyConfig={shopifyConfig}
                    onFix={onFix}
                    fixingId={fixingId}
                    fixResults={fixResults}
                  />
                )}
              </div>
              <p className="mt-1 text-sm text-muted-foreground break-all whitespace-pre-line">
                {check.detail}
              </p>
              <DetailList items={check.detailList} />
              <ImageAltEditor
                images={check.editableImages}
                shopifyConfig={shopifyConfig}
                onSaveAlt={onSaveAlt}
                altSaving={altSaving}
                altResults={altResults}
              />
              <TranslationTasks tasks={check.translationTasks} />
              <DetailCards cards={check.detailCards} />
              {check.recommendation && (
                <div className="mt-1 text-sm text-blue-600 dark:text-blue-400 whitespace-pre-line">
                  → {check.recommendation}
                </div>
              )}
              {check.shopifyFix && (
                <div className="mt-1.5 flex items-start gap-1.5 rounded bg-emerald-50 px-2 py-1.5 dark:bg-emerald-950">
                  <Store className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <p className="text-sm text-emerald-700 dark:text-emerald-300">
                    {check.shopifyFix}
                  </p>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
