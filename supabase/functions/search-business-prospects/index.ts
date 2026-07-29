import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const DEFAULT_EXTRACTOR_URL = 'https://cloud.gmapsextractor.com/api/v2/search';
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const GEOCODER_USER_AGENT = 'DataMarketHouseSalesOS/1.3.3 (info@debtpaper.com)';

type JsonRecord = Record<string, unknown>;
type SupabaseClient = ReturnType<typeof createClient>;

type LocationResolution = {
  latitude: number;
  longitude: number;
  formattedLocation: string;
  cacheHit: boolean;
};

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Method not allowed.' }, 405);
  }

  let admin: SupabaseClient | null = null;
  let searchId: string | null = null;

  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization) throw new Error('Missing authorization header.');

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const extractorToken = Deno.env.get('GMAPS_EXTRACTOR_API_TOKEN');
    const extractorUrl = Deno.env.get('GMAPS_EXTRACTOR_API_URL') || DEFAULT_EXTRACTOR_URL;

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      throw new Error('Required Supabase environment variables are missing.');
    }
    if (!extractorToken) {
      throw new Error('GMAPS_EXTRACTOR_API_TOKEN is not configured.');
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) throw new Error('Unauthorized employee session.');

    const user = authData.user;
    const { data: profile, error: profileError } = await userClient
      .from('profiles')
      .select('company_id, role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) throw new Error('Employee profile could not be found.');
    if (profile.role !== 'employee') throw new Error('Employee access is required.');
    if (!profile.company_id) throw new Error('Employee is not connected to a company.');

    const body = await readJsonBody(request);
    const query = cleanString(body.query || body.businessType || body.business_type);
    const location = cleanString(body.location);
    const requestedLimit = normalizeLimit(body.limit);

    if (!query) throw new Error('Business type is required.');
    if (!location) throw new Error('Location is required.');

    const resolved = await resolveLocation(admin, location);
    const mapLocation = `@${resolved.latitude},${resolved.longitude},11z`;

    const { data: searchRecord, error: searchError } = await admin
      .from('prospect_searches')
      .insert({
        company_id: profile.company_id,
        employee_id: user.id,
        query,
        location,
        requested_limit: requestedLimit,
        status: 'running',
      })
      .select('id')
      .single();

    if (searchError || !searchRecord) {
      throw new Error(searchError?.message || 'Unable to create prospect search record.');
    }
    searchId = searchRecord.id;

    console.log('Dynamic Maps search', {
      query,
      enteredLocation: location,
      resolvedLocation: resolved.formattedLocation,
      ll: mapLocation,
      cacheHit: resolved.cacheHit,
    });

    const providerResults: JsonRecord[] = [];
    let providerRequestId: string | null = null;
    const maximumPages = Math.min(Math.ceil(requestedLimit / 10), 20);

    for (let page = 1; page <= maximumPages; page += 1) {
      const response = await fetch(extractorUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${extractorToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          q: query,
          page,
          ll: mapLocation,
          hl: 'en',
          gl: 'us',
          extra: true,
        }),
      });

      const responseText = await response.text();
      const payload = parseJson(responseText);

      if (!response.ok) {
        throw new Error(
          extractProviderError(payload) ||
            responseText ||
            `G Maps Extractor returned HTTP ${response.status}.`,
        );
      }

      if (!providerRequestId) {
        providerRequestId = nullableString(
          deepFindValue(payload, ['request_id', 'requestId', 'id']),
        );
      }

      const pageResults = extractBusinessRecords(payload);
      console.log(`Extractor page ${page}`, { results: pageResults.length });

      if (!pageResults.length) break;
      providerResults.push(...pageResults);
      if (providerResults.length >= requestedLimit) break;
    }

    const { data: existingAgencies, error: agenciesError } = await admin
      .from('agencies')
      .select('id,name,domain,website,phone,address')
      .eq('company_id', profile.company_id);

    if (agenciesError) throw new Error(agenciesError.message);

    const rows = providerResults
      .slice(0, requestedLimit)
      .map((item) =>
        normalizeProspect(
          item,
          searchRecord.id,
          profile.company_id,
          user.id,
          existingAgencies || [],
        ),
      );

    if (rows.length) {
      const { error: insertError } = await admin.from('prospect_search_results').insert(rows);
      if (insertError) throw new Error(insertError.message);
    }

    const completedAt = new Date().toISOString();
    const { error: completionError } = await admin
      .from('prospect_searches')
      .update({
        status: 'completed',
        result_count: rows.length,
        provider_request_id: providerRequestId,
        failure_reason: null,
        completed_at: completedAt,
      })
      .eq('id', searchRecord.id);

    if (completionError) throw new Error(completionError.message);

    const { data: results, error: resultsError } = await userClient
      .from('prospect_search_results')
      .select('*')
      .eq('search_id', searchRecord.id)
      .order('created_at', { ascending: true });

    if (resultsError) throw new Error(resultsError.message);

    return jsonResponse({
      ok: true,
      searchId: searchRecord.id,
      enteredLocation: location,
      resolvedLocation: resolved.formattedLocation,
      ll: mapLocation,
      resultCount: results?.length || 0,
      results: results || [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Prospect search failed.';
    console.error('search-business-prospects error:', message);

    if (admin && searchId) {
      await admin
        .from('prospect_searches')
        .update({
          status: 'failed',
          failure_reason: message,
          completed_at: new Date().toISOString(),
        })
        .eq('id', searchId);
    }

    return jsonResponse({ ok: false, error: message }, 400);
  }
});

async function resolveLocation(admin: SupabaseClient, location: string): Promise<LocationResolution> {
  const normalizedLocation = normalizeLocationKey(location);

  const { data: cached, error: cacheReadError } = await admin
    .from('prospect_location_cache')
    .select('latitude,longitude,formatted_location')
    .eq('normalized_location', normalizedLocation)
    .maybeSingle();

  if (cacheReadError) throw new Error(cacheReadError.message);

  if (cached) {
    await admin
      .from('prospect_location_cache')
      .update({ last_used_at: new Date().toISOString() })
      .eq('normalized_location', normalizedLocation);

    return {
      latitude: Number(cached.latitude),
      longitude: Number(cached.longitude),
      formattedLocation: cached.formatted_location || location,
      cacheHit: true,
    };
  }

  const url = new URL(NOMINATIM_URL);
  url.searchParams.set('q', location);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('countrycodes', 'us');

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'User-Agent': GEOCODER_USER_AGENT,
    },
  });

  const text = await response.text();
  const payload = parseJson(text);

  if (!response.ok) {
    throw new Error(`Location lookup returned HTTP ${response.status}.`);
  }

  if (!Array.isArray(payload) || !payload.length) {
    throw new Error(`Location not recognized: "${location}". Enter a US city, state, ZIP code, or full address.`);
  }

  const candidate = asRecord(payload[0]);
  const latitude = Number(candidate.lat);
  const longitude = Number(candidate.lon);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error('Location lookup did not return valid coordinates.');
  }

  const formattedLocation = cleanString(candidate.display_name) || location;
  const now = new Date().toISOString();

  const { error: cacheWriteError } = await admin.from('prospect_location_cache').upsert(
    {
      normalized_location: normalizedLocation,
      entered_location: location,
      formatted_location: formattedLocation,
      latitude,
      longitude,
      provider: 'openstreetmap_nominatim',
      provider_payload: candidate,
      updated_at: now,
      last_used_at: now,
    },
    { onConflict: 'normalized_location' },
  );

  if (cacheWriteError) throw new Error(cacheWriteError.message);

  return { latitude, longitude, formattedLocation, cacheHit: false };
}

function normalizeProspect(
  item: JsonRecord,
  searchId: string,
  companyId: string,
  employeeId: string,
  existing: JsonRecord[],
) {
  const name =
    nullableString(
      deepFindValue(item, [
        'title',
        'name',
        'business_name',
        'businessName',
        'company_name',
        'companyName',
        'place_name',
      ]),
    ) || 'Unnamed business';

  const website = nullableString(
    deepFindValue(item, ['website', 'site', 'web', 'business_website']),
  );
  const domain = normalizeDomain(website);
  const phone = nullableString(
    deepFindValue(item, ['phone', 'phone_number', 'phoneNumber', 'telephone']),
  );
  const address = nullableString(
    deepFindValue(item, ['address', 'full_address', 'fullAddress', 'formatted_address']),
  );
  const email = extractEmail(item);
  const providerPlaceId = nullableString(
    deepFindValue(item, ['place_id', 'placeId', 'google_place_id', 'cid', 'data_id', 'fid']),
  );

  const matched =
    existing.find((agency) => {
      const agencyDomain = normalizeDomain(agency.domain || agency.website);
      const domainMatch = Boolean(domain && agencyDomain && domain === agencyDomain);
      const phoneMatch = Boolean(phone && agency.phone && digits(phone) === digits(agency.phone));
      const identityMatch =
        compact(name) === compact(agency.name) &&
        Boolean(address) &&
        compact(address) === compact(agency.address);
      return domainMatch || phoneMatch || identityMatch;
    }) || null;

  return {
    company_id: companyId,
    search_id: searchId,
    employee_id: employeeId,
    provider_place_id: providerPlaceId,
    name,
    category: nullableString(
      deepFindValue(item, ['category', 'type', 'business_category', 'main_category']),
    ),
    address,
    city: nullableString(deepFindValue(item, ['city', 'locality'])),
    state: nullableString(deepFindValue(item, ['state', 'region', 'administrative_area'])),
    phone,
    website,
    domain,
    email,
    source_url: nullableString(
      deepFindValue(item, ['url', 'link', 'google_maps_url', 'googleMapsUrl', 'maps_url']),
    ),
    rating: numberValue(deepFindValue(item, ['rating', 'stars'])),
    review_count: integerValue(
      deepFindValue(item, ['reviews', 'review_count', 'reviewCount', 'reviews_count']),
    ),
    latitude: numberValue(deepFindValue(item, ['latitude', 'lat'])),
    longitude: numberValue(deepFindValue(item, ['longitude', 'lng', 'lon'])),
    duplicate_status: matched
      ? 'existing'
      : !phone && !website && !email
        ? 'missing_contact'
        : 'new',
    matched_agency_id: matched?.id || null,
    raw_data: item,
  };
}

function extractBusinessRecords(payload: unknown): JsonRecord[] {
  const preferred = findPreferredResultArray(payload);
  if (preferred.length) return preferred;

  const arrays: unknown[][] = [];
  collectArrays(payload, arrays, 0);

  let best: JsonRecord[] = [];
  let bestScore = -1;
  for (const candidate of arrays) {
    const records = candidate.filter(isRecord) as JsonRecord[];
    if (!records.length) continue;
    const score = scoreBusinessArray(records);
    if (score > bestScore) {
      bestScore = score;
      best = records;
    }
  }
  return best;
}

function findPreferredResultArray(payload: unknown): JsonRecord[] {
  const record = asRecord(payload);
  const keys = ['results', 'data', 'businesses', 'places', 'items', 'local_results', 'search_results'];
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) return value.filter(isRecord) as JsonRecord[];
    const nested = asRecord(value);
    for (const nestedKey of keys) {
      if (Array.isArray(nested[nestedKey])) {
        return (nested[nestedKey] as unknown[]).filter(isRecord) as JsonRecord[];
      }
    }
  }
  return [];
}

function collectArrays(value: unknown, output: unknown[][], depth: number) {
  if (depth > 5) return;
  if (Array.isArray(value)) {
    output.push(value);
    for (const item of value) collectArrays(item, output, depth + 1);
    return;
  }
  if (isRecord(value)) {
    for (const nested of Object.values(value)) collectArrays(nested, output, depth + 1);
  }
}

function scoreBusinessArray(records: JsonRecord[]): number {
  const keys = [
    'title',
    'name',
    'business_name',
    'address',
    'phone',
    'website',
    'category',
    'rating',
    'place_id',
  ];
  return records.slice(0, 5).reduce((score, record) => {
    return (
      score +
      keys.reduce(
        (itemScore, key) => itemScore + (deepFindValue(record, [key]) != null ? 10 : 0),
        0,
      )
    );
  }, records.length);
}

function extractEmail(item: JsonRecord): string | null {
  const direct = nullableString(
    deepFindValue(item, ['email', 'business_email', 'contact_email']),
  );
  if (direct?.includes('@')) return direct;

  const emails = deepFindValue(item, ['emails']);
  if (Array.isArray(emails)) {
    const found = emails.find((value) => typeof value === 'string' && value.includes('@'));
    return nullableString(found);
  }
  return null;
}

function deepFindValue(value: unknown, keys: string[], depth = 0): unknown {
  if (depth > 5 || value == null) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = deepFindValue(item, keys, depth + 1);
      if (found != null && found !== '') return found;
    }
    return null;
  }
  if (!isRecord(value)) return null;
  for (const key of keys) {
    const candidate = value[key];
    if (candidate != null && candidate !== '') return candidate;
  }
  for (const nested of Object.values(value)) {
    const found = deepFindValue(nested, keys, depth + 1);
    if (found != null && found !== '') return found;
  }
  return null;
}

function extractProviderError(payload: unknown): string | null {
  if (typeof payload === 'string') return payload.trim() || null;
  return nullableString(deepFindValue(payload, ['error', 'message', 'detail', 'description']));
}

async function readJsonBody(request: Request): Promise<JsonRecord> {
  try {
    const body = await request.json();
    if (!isRecord(body)) throw new Error();
    return body;
  } catch {
    throw new Error('Request body must contain valid JSON.');
  }
}

function normalizeLimit(value: unknown): number {
  const parsed = Number(value);
  return [25, 50, 100, 200].includes(parsed) ? parsed : 25;
}

function normalizeLocationKey(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, ' ').replace(/[^a-z0-9, -]/g, '');
}

function normalizeDomain(value: unknown): string | null {
  const text = cleanString(value);
  if (!text) return null;
  try {
    const url = text.startsWith('http://') || text.startsWith('https://') ? text : `https://${text}`;
    return new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return text.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0].toLowerCase() || null;
  }
}

function cleanString(value: unknown): string {
  return value == null ? '' : String(value).trim();
}

function nullableString(value: unknown): string | null {
  const text = cleanString(value);
  return text || null;
}

function compact(value: unknown): string {
  return cleanString(value).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function digits(value: unknown): string {
  return cleanString(value).replace(/\D/g, '');
}

function numberValue(value: unknown): number | null {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function integerValue(value: unknown): number | null {
  const parsed = numberValue(value);
  return parsed == null ? null : Math.trunc(parsed);
}

function parseJson(value: string): unknown {
  if (!value.trim()) return {};
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function asRecord(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
