import {
  Building2,
  CheckCircle2,
  ExternalLink,
  Loader2,
  MapPinned,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Pill, PrimaryButton, SecondaryButton } from '../../components/Primitives';
import { supabase } from '../../lib/supabase';

type Result = {
  id: string;
  name: string;
  category: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  website: string | null;
  email: string | null;
  source_url: string | null;
  rating: number | null;
  review_count: number | null;
  duplicate_status: 'new' | 'existing' | 'possible_duplicate' | 'missing_contact';
  matched_agency_id: string | null;
  imported_agency_id: string | null;
};

const inputClass =
  'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100';

const searchTemplates = [
  'Debt collection agency',
  'Debt buyer',
  'Accounts receivable company',
  'Receivables management company',
  'Collection law firm',
];

export default function ProspectMode() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('Debt collection agency');
  const [location, setLocation] = useState('Florida');
  const [limit, setLimit] = useState(25);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [hasSearched, setHasSearched] = useState(false);

  const importable = useMemo(
    () => results.filter((result) => result.duplicate_status === 'new' && !result.imported_agency_id),
    [results],
  );

  async function runSearch(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setResults([]);
    setSelected(new Set());
    setHasSearched(true);

    const { data, error: invokeError } = await supabase.functions.invoke('search-business-prospects', {
      body: { query: query.trim(), location: location.trim(), limit },
    });

    if (invokeError || !data?.ok) {
      setError(data?.error || invokeError?.message || 'The agency search could not be completed.');
    } else {
      setResults(data.results || []);
    }

    setBusy(false);
  }

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function selectAllImportable() {
    setSelected(new Set(importable.map((result) => result.id)));
  }

  async function importSelected() {
    if (!selected.size) return;

    setImporting(true);
    setError('');
    let firstAgencyId = '';
    let successfulImports = 0;

    for (const resultId of selected) {
      const { data, error: importError } = await supabase.rpc('dmh_import_prospect_result', {
        p_result_id: resultId,
      });

      if (importError) {
        setError(importError.message);
        continue;
      }

      const agency = Array.isArray(data) ? data[0] : data;
      if (agency?.id) {
        successfulImports += 1;
        firstAgencyId ||= agency.id;
        setResults((current) =>
          current.map((result) =>
            result.id === resultId
              ? { ...result, imported_agency_id: agency.id, duplicate_status: 'existing' }
              : result,
          ),
        );
      }
    }

    const selectedCount = selected.size;
    setSelected(new Set());
    setImporting(false);

    if (successfulImports === 1 && selectedCount === 1 && firstAgencyId) {
      navigate(`/employee/agencies/${firstAgencyId}`);
    }
  }

  return (
    <div className="mx-auto max-w-7xl p-5 md:p-8 lg:p-10">
      <header className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
            <MapPinned size={15} /> Google Maps Prospect Discovery
          </div>
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">Find agencies through Maps.</h2>
          <p className="mt-3 max-w-3xl text-slate-500">
            Search for collection agencies and debt buyers, review the live business results, then import only the prospects you want into DMH Sales OS.
          </p>
        </div>
        <Pill tone="blue">Employee access only</Pill>
      </header>

      <Card className="overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50/70 px-6 py-4 md:px-8">
          <p className="text-sm font-semibold text-slate-800">Google business search</p>
          <p className="mt-1 text-xs text-slate-500">This calls the secured search-business-prospects Edge Function.</p>
        </div>

        <form onSubmit={runSearch} className="p-6 md:p-8">
          <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr_160px]">
            <label>
              <span className="mb-2 block text-sm font-semibold">Business type</span>
              <input
                className={inputClass}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Debt collection agency"
                required
              />
            </label>

            <label>
              <span className="mb-2 block text-sm font-semibold">Location</span>
              <input
                className={inputClass}
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                placeholder="Florida, Tampa, or 33619"
                required
              />
            </label>

            <label>
              <span className="mb-2 block text-sm font-semibold">Maximum results</span>
              <select className={inputClass} value={limit} onChange={(event) => setLimit(Number(event.target.value))}>
                {[25, 50, 100, 200].map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {searchTemplates.map((template) => (
              <button
                type="button"
                key={template}
                onClick={() => setQuery(template)}
                className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-blue-300 hover:text-blue-700"
              >
                {template}
              </button>
            ))}
          </div>

          <div className="mt-7 flex justify-end">
            <PrimaryButton type="submit" disabled={busy || !query.trim() || !location.trim()} className="min-w-52">
              {busy ? (
                <><Loader2 className="mr-2 animate-spin" size={18} />Searching Maps…</>
              ) : (
                <><Search className="mr-2" size={18} />Search Google Maps</>
              )}
            </PrimaryButton>
          </div>
        </form>
      </Card>

      {error && (
        <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
          {error}
        </div>
      )}

      {results.length > 0 && (
        <section className="mt-7">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-xl font-semibold">Maps results</h3>
              <p className="text-sm text-slate-500">{results.length} returned · {importable.length} ready to import</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <SecondaryButton type="button" onClick={selectAllImportable} disabled={!importable.length}>Select new</SecondaryButton>
              <PrimaryButton type="button" disabled={!selected.size || importing} onClick={importSelected}>
                {importing ? <Loader2 className="mr-2 animate-spin" size={17} /> : <Building2 className="mr-2" size={17} />}
                Import selected ({selected.size})
              </PrimaryButton>
            </div>
          </div>

          <div className="space-y-3">
            {results.map((result) => (
              <Card key={result.id} className={`p-5 transition ${selected.has(result.id) ? 'ring-2 ring-blue-500' : ''}`}>
                <div className="flex gap-4">
                  <input
                    type="checkbox"
                    aria-label={`Select ${result.name}`}
                    className="mt-1 h-5 w-5 accent-blue-600"
                    checked={selected.has(result.id)}
                    disabled={result.duplicate_status !== 'new' || Boolean(result.imported_agency_id)}
                    onChange={() => toggle(result.id)}
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-semibold">{result.name}</h4>
                      <ResultStatus result={result} />
                      {result.rating !== null && (
                        <Pill tone="neutral">★ {result.rating} · {result.review_count || 0} reviews</Pill>
                      )}
                    </div>

                    <p className="mt-1 text-sm text-slate-500">
                      {result.category || 'Business'}{result.address ? ` · ${result.address}` : ''}
                    </p>

                    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-700">
                      <span>{result.phone || 'No phone listed'}</span>
                      <span>{result.email || 'No public email listed'}</span>
                      {result.website && (
                        <a className="text-blue-600 hover:underline" href={result.website} target="_blank" rel="noreferrer">Website</a>
                      )}
                      {result.source_url && (
                        <a className="inline-flex items-center gap-1 text-blue-600 hover:underline" href={result.source_url} target="_blank" rel="noreferrer">
                          Open Maps record <ExternalLink size={13} />
                        </a>
                      )}
                    </div>
                  </div>

                  {result.matched_agency_id && (
                    <SecondaryButton type="button" onClick={() => navigate(`/employee/agencies/${result.matched_agency_id}`)}>
                      Open existing
                    </SecondaryButton>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {!busy && hasSearched && !results.length && !error && (
        <Card className="mt-7 p-8 text-center">
          <Search className="mx-auto text-slate-300" size={34} />
          <p className="mt-3 font-semibold">No businesses were returned.</p>
          <p className="mt-1 text-sm text-slate-500">Try a broader location or a different business type.</p>
        </Card>
      )}

      {!hasSearched && (
        <Card className="mt-7 flex items-start gap-4 p-6">
          <ShieldCheck className="mt-0.5 text-emerald-600" />
          <div>
            <p className="font-semibold">Search first. Import second.</p>
            <p className="mt-1 text-sm text-slate-500">
              Results are staged before import. Existing agencies are flagged so duplicate records are not created.
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}

function ResultStatus({ result }: { result: Result }) {
  if (result.imported_agency_id) {
    return <Pill tone="success"><CheckCircle2 className="mr-1" size={13} />Imported</Pill>;
  }
  if (result.duplicate_status === 'existing') return <Pill tone="warning">Already in DMH</Pill>;
  if (result.duplicate_status === 'possible_duplicate') return <Pill tone="warning">Possible duplicate</Pill>;
  if (result.duplicate_status === 'missing_contact') return <Pill tone="neutral">Missing contact</Pill>;
  return <Pill tone="success">New prospect</Pill>;
}
