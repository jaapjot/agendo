import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Search, Store } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { Card } from '../components/ui/Card';
import { inputClasses } from '../components/ui/Field';
import { Skeleton } from '../components/ui/Spinner';
import { EmptyState, ErrorState } from '../components/ui/States';
import { api } from '../lib/api';
import type { DirectoryEntry } from '../lib/types';
import { useDebouncedValue } from '../lib/use-debounced-value';
import { useDocumentTitle } from '../lib/use-document-title';

export function ExplorePage() {
  useDocumentTitle('Explorar profesionales');
  // The search lives in the URL, so results can be shared and survive a reload.
  const [params, setParams] = useSearchParams();
  const search = params.get('q') ?? '';
  const debouncedSearch = useDebouncedValue(search.trim());

  const query = useQuery({
    queryKey: ['directory', debouncedSearch],
    queryFn: () =>
      api.get<{ professionals: DirectoryEntry[] }>(
        `/professionals?q=${encodeURIComponent(debouncedSearch)}`,
      ),
    placeholderData: (previous) => previous,
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
        Encontrá un profesional
      </h1>
      <p className="mt-2 text-slate-600">
        Buscá por nombre o por servicio y reservá en el horario que te quede cómodo.
      </p>

      <div className="relative mt-8">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-slate-400"
          aria-hidden="true"
        />
        <input
          type="search"
          value={search}
          onChange={(event) =>
            setParams(event.target.value ? { q: event.target.value } : {}, { replace: true })
          }
          placeholder="Ej.: corte, kinesiología, clases de inglés…"
          className={`${inputClasses} h-12 w-full pl-10 text-base`}
          aria-label="Buscar profesionales"
        />
      </div>

      <div className="mt-8">
        {query.isPending ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : query.data.professionals.length === 0 ? (
          <EmptyState
            icon={Store}
            title={
              debouncedSearch
                ? 'No encontramos resultados'
                : 'Todavía no hay profesionales disponibles'
            }
            description={
              debouncedSearch
                ? 'Probá con otra palabra.'
                : 'Cuando un profesional cargue sus servicios y horarios, va a aparecer acá.'
            }
          />
        ) : (
          <ul className="space-y-3">
            {query.data.professionals.map((pro) => (
              <li key={pro.slug}>
                <Link to={`/p/${pro.slug}`} className="group block">
                  <Card className="flex items-center gap-4 p-5 transition-shadow group-hover:shadow-md group-hover:ring-brand-200">
                    <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-lg font-semibold text-brand-800">
                      {pro.businessName.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="font-semibold text-slate-900">{pro.businessName}</h2>
                      {pro.description && (
                        <p className="mt-0.5 line-clamp-1 text-sm text-slate-600">
                          {pro.description}
                        </p>
                      )}
                      <p className="mt-1 truncate text-xs text-slate-500">
                        {pro.services.map((s) => s.name).join(' · ')}
                      </p>
                    </div>
                    <ArrowRight
                      className="size-5 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-700"
                      aria-hidden="true"
                    />
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
