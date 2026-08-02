import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Eye, FileSpreadsheet, LockKeyhole, Search } from 'lucide-react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Card, Pill, SecondaryButton, inputClass } from '../../components/Primitives';
import { usePortfolioStore } from '../../store/PortfolioStore';

type CsvData = { headers: string[]; rows: string[][] };

function parseCsv(text: string): CsvData {
  const records: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];

    if (character === '"') {
      if (quoted && next === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      row.push(field);
      field = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && next === '\n') index += 1;
      row.push(field);
      field = '';
      if (row.some((value) => value.length > 0)) records.push(row);
      row = [];
    } else {
      field += character;
    }
  }

  if (field.length || row.length) {
    row.push(field);
    if (row.some((value) => value.length > 0)) records.push(row);
  }

  const headers = records.shift() || [];
  const width = Math.max(headers.length, ...records.map((record) => record.length), 0);
  const normalizedHeaders = Array.from({ length: width }, (_, index) => headers[index] || `Column ${index + 1}`);
  const rows = records.map((record) => Array.from({ length: width }, (_, index) => record[index] || ''));
  return { headers: normalizedHeaders, rows };
}

export default function MaskedPortfolioPreview() {
  const { portfolioId } = useParams();
  const { portfolios, getDownloadUrl, profile } = usePortfolioStore();
  const portfolio = portfolios.find((item) => item.id === portfolioId);
  const [data, setData] = useState<CsvData>({ headers: [], rows: [] });
  const [query, setQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(500);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!portfolio?.maskedFile) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError('');
      try {
        const url = await getDownloadUrl(portfolio.id, 'masked');
        if (!url) throw new Error('The approved masked file is unavailable.');
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) throw new Error('The masked file could not be opened.');
        const text = await response.text();
        if (!cancelled) setData(parseCsv(text));
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Unable to preview the masked file.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [portfolio?.id, portfolio?.maskedFile?.id, getDownloadUrl]);

  const filteredRows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return data.rows;
    return data.rows.filter((row) => row.some((value) => value.toLowerCase().includes(normalized)));
  }, [data.rows, query]);

  useEffect(() => setVisibleCount(500), [query, portfolioId]);

  if (profile?.role === 'buyer') return <Navigate to="/buyer" replace />;
  if (!portfolio) return <div className="p-10">Portfolio not found.</div>;

  return (
    <div className="min-h-screen bg-[#f4f7fb] p-5 md:p-8 lg:p-10">
      <div className="mx-auto max-w-[1600px]">
        <Link to="/employee/portfolio" className="inline-flex items-center text-sm font-semibold text-slate-500 hover:text-slate-900">
          <ArrowLeft className="mr-2" size={17} /> Back to portfolio
        </Link>

        <header className="mt-6 flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
          <div>
            <div className="flex flex-wrap items-center gap-2"><Pill tone="success">Employee view</Pill><Pill>Masked data only</Pill></div>
            <h1 className="mt-3 text-3xl font-semibold">{portfolio.name}</h1>
            <p className="mt-2 text-slate-500">Study the complete approved sales file before discussing it with a buyer.</p>
          </div>
          <Card className="flex max-w-xl gap-3 border-blue-100 bg-blue-50 p-4">
            <LockKeyhole className="shrink-0 text-blue-700" size={21} />
            <div><p className="text-sm font-semibold text-blue-950">View-only workspace</p><p className="mt-1 text-xs leading-5 text-blue-800">No download or export action is available here. Access is temporary and the original unmasked portfolio remains owner-controlled.</p></div>
          </Card>
        </header>

        <div className="mt-7 grid gap-5 md:grid-cols-4">
          <Card className="p-5"><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">File</p><p className="mt-2 truncate font-semibold">{portfolio.maskedFile?.name || 'Not uploaded'}</p></Card>
          <Card className="p-5"><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Rows loaded</p><p className="mt-2 text-2xl font-semibold">{data.rows.length.toLocaleString()}</p></Card>
          <Card className="p-5"><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Columns</p><p className="mt-2 text-2xl font-semibold">{data.headers.length}</p></Card>
          <Card className="p-5"><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Portfolio accounts</p><p className="mt-2 text-2xl font-semibold">{portfolio.accountCount.toLocaleString()}</p></Card>
        </div>

        <Card className="mt-6 overflow-hidden">
          <div className="flex flex-col gap-4 border-b border-slate-200 p-5 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-50 text-emerald-700"><FileSpreadsheet size={22} /></div><div><p className="font-semibold">Masked portfolio viewer</p><p className="text-xs text-slate-500">Search runs across every loaded row.</p></div></div>
            <label className="relative w-full md:max-w-md"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} /><input className={`${inputClass} pl-10`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search any account field" /></label>
          </div>

          {loading ? <div className="grid min-h-96 place-items-center text-sm text-slate-500">Opening secure masked file…</div> : error ? <div className="m-6 rounded-2xl bg-rose-50 p-5 text-sm font-medium text-rose-700">{error}</div> : !portfolio.maskedFile ? <div className="grid min-h-96 place-items-center text-center"><div><Eye className="mx-auto text-slate-300" size={36}/><p className="mt-3 font-semibold">No masked file available</p><p className="mt-1 text-sm text-slate-500">The owner must upload and approve the employee-visible masked CSV.</p></div></div> : (
            <>
              <div className="max-h-[68vh] overflow-auto" onContextMenu={(event) => event.preventDefault()}>
                <table className="min-w-full border-separate border-spacing-0 text-left text-xs">
                  <thead className="sticky top-0 z-10 bg-slate-900 text-white">
                    <tr><th className="sticky left-0 z-20 border-r border-slate-700 bg-slate-900 px-3 py-3 text-center">#</th>{data.headers.map((header, index) => <th key={`${header}-${index}`} className="whitespace-nowrap border-r border-slate-700 px-4 py-3 font-semibold">{header}</th>)}</tr>
                  </thead>
                  <tbody>
                    {filteredRows.slice(0, visibleCount).map((row, rowIndex) => <tr key={rowIndex} className="odd:bg-white even:bg-slate-50 hover:bg-blue-50"><td className="sticky left-0 border-b border-r border-slate-200 bg-inherit px-3 py-2 text-center font-semibold text-slate-400">{rowIndex + 1}</td>{row.map((value, columnIndex) => <td key={columnIndex} className="max-w-80 whitespace-nowrap border-b border-r border-slate-200 px-4 py-2 text-slate-700" title={value}>{value || '—'}</td>)}</tr>)}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-col gap-3 border-t border-slate-200 p-4 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
                <span>Showing {Math.min(visibleCount, filteredRows.length).toLocaleString()} of {filteredRows.length.toLocaleString()} matching rows</span>
                {visibleCount < filteredRows.length && <SecondaryButton onClick={() => setVisibleCount((count) => count + 500)}>Load 500 more rows</SecondaryButton>}
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
