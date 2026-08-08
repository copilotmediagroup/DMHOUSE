import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  MapPin,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserRound,
  XCircle
} from 'lucide-react';
import {FormEvent, useCallback, useEffect, useMemo, useState} from 'react';
import {
  Card,
  Field,
  Pill,
  PrimaryButton,
  SecondaryButton,
  inputClass
} from '../../components/Primitives';
import {supabase} from '../../lib/supabase';
import {usePortfolioStore} from '../../store/PortfolioStore';

type Employee={
  id:string;
  full_name:string;
  is_active:boolean;
};

type Territory={
  id:string;
  company_id:string;
  employee_id:string;
  territory_name:string;
  center_address:string;
  center_latitude:number;
  center_longitude:number;
  radius_miles:number;
  starts_at:string;
  expires_at:string|null;
  status:'created'|'active'|'expired'|'disabled';
  created_by:string|null;
  created_at:string;
  updated_at:string;
};

const radiusOptions=[5,10,25,50,100];

function dateInputValue(date:Date){
  const offset=date.getTimezoneOffset();
  const adjusted=new Date(date.getTime()-offset*60000);
  return adjusted.toISOString().slice(0,10);
}

function addDays(days:number){
  const d=new Date();
  d.setDate(d.getDate()+days);
  return dateInputValue(d);
}

function niceDate(value:string|null){
  if(!value)return 'No expiration';

  return new Intl.DateTimeFormat('en-US',{
    month:'short',
    day:'numeric',
    year:'numeric'
  }).format(new Date(value));
}

function remainingDays(value:string|null){
  if(!value)return null;

  const ms=new Date(value).getTime()-Date.now();
  return Math.max(0,Math.ceil(ms/86400000));
}

function effectiveStatus(t:Territory){
  if(t.status==='disabled')return 'disabled';

  if(t.expires_at&&new Date(t.expires_at).getTime()<Date.now()){
    return 'expired';
  }

  if(new Date(t.starts_at).getTime()>Date.now()){
    return 'created';
  }

  return 'active';
}

async function geocodeLocation(location:string){
  const url=new URL('https://nominatim.openstreetmap.org/search');

  url.searchParams.set('q',location);
  url.searchParams.set('format','jsonv2');
  url.searchParams.set('limit','1');
  url.searchParams.set('addressdetails','1');
  url.searchParams.set('countrycodes','us');

  const response=await fetch(url.toString(),{
    headers:{
      Accept:'application/json'
    }
  });

  if(!response.ok){
    throw new Error('Unable to resolve that territory location.');
  }

  const payload=await response.json();

  if(!Array.isArray(payload)||!payload.length){
    throw new Error(
      'Location not recognized. Enter a US city, ZIP code, county, or address.'
    );
  }

  const result=payload[0];
  const latitude=Number(result.lat);
  const longitude=Number(result.lon);

  if(!Number.isFinite(latitude)||!Number.isFinite(longitude)){
    throw new Error('Location lookup did not return valid coordinates.');
  }

  return {
    latitude,
    longitude,
    formattedAddress:String(result.display_name||location)
  };
}

export default function TerritoryManagement(){
  const {profile}=usePortfolioStore();

  const [employees,setEmployees]=useState<Employee[]>([]);
  const [territories,setTerritories]=useState<Territory[]>([]);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');

  const [employeeId,setEmployeeId]=useState('');
  const [location,setLocation]=useState('');
  const [territoryName,setTerritoryName]=useState('');
  const [radiusMiles,setRadiusMiles]=useState(25);
  const [startsAt,setStartsAt]=useState(dateInputValue(new Date()));
  const [expiresAt,setExpiresAt]=useState(addDays(30));

  const refresh=useCallback(async()=>{
    if(!profile?.company_id)return;

    setLoading(true);
    setError('');

    try{
      const [employeeResult,territoryResult]=await Promise.all([
        supabase
          .from('profiles')
          .select('id,full_name,is_active')
          .eq('company_id',profile.company_id)
          .eq('role','employee')
          .order('full_name'),

        supabase
          .from('employee_territories')
          .select('*')
          .eq('company_id',profile.company_id)
          .order('created_at',{ascending:false})
      ]);

      if(employeeResult.error)throw employeeResult.error;
      if(territoryResult.error)throw territoryResult.error;

      setEmployees((employeeResult.data||[]) as Employee[]);
      setTerritories((territoryResult.data||[]) as Territory[]);

    }catch(e){
      setError(e instanceof Error?e.message:'Unable to load territories.');
    }finally{
      setLoading(false);
    }
  },[profile?.company_id]);

  useEffect(()=>{
    void refresh();
  },[refresh]);

  useEffect(()=>{
    if(!employeeId&&employees.length){
      const firstActive=employees.find(x=>x.is_active)||employees[0];
      setEmployeeId(firstActive.id);
    }
  },[employees,employeeId]);

  const activeTerritories=useMemo(
    ()=>territories.filter(t=>effectiveStatus(t)==='active'),
    [territories]
  );

  const employeesCovered=useMemo(
    ()=>new Set(
      activeTerritories.map(t=>t.employee_id)
    ).size,
    [activeTerritories]
  );

  const unassignedEmployees=useMemo(
    ()=>employees.filter(
      employee=>
        employee.is_active&&
        !activeTerritories.some(t=>t.employee_id===employee.id)
    ),
    [employees,activeTerritories]
  );

  async function createTerritory(event:FormEvent){
    event.preventDefault();

    if(!profile?.company_id||!profile.id){
      setError('Owner profile is not ready.');
      return;
    }

    if(!employeeId){
      setError('Select an employee.');
      return;
    }

    if(!location.trim()){
      setError('Enter the territory location.');
      return;
    }

    setBusy(true);
    setError('');
    setMessage('');

    try{
      const resolved=await geocodeLocation(location.trim());

      const selectedEmployee=employees.find(x=>x.id===employeeId);

      const name=
        territoryName.trim()||
        `${selectedEmployee?.full_name||'Employee'} · ${location.trim()}`;

      const startIso=new Date(`${startsAt}T00:00:00`).toISOString();

      const expirationIso=
        expiresAt
          ?new Date(`${expiresAt}T23:59:59`).toISOString()
          :null;

      if(
        expirationIso&&
        new Date(expirationIso).getTime()<=new Date(startIso).getTime()
      ){
        throw new Error('Expiration must be after the territory start date.');
      }

      const {error:insertError}=await supabase
        .from('employee_territories')
        .insert({
          company_id:profile.company_id,
          employee_id:employeeId,
          territory_name:name,
          center_address:resolved.formattedAddress,
          center_latitude:resolved.latitude,
          center_longitude:resolved.longitude,
          radius_miles:radiusMiles,
          starts_at:startIso,
          expires_at:expirationIso,
          status:'active',
          created_by:profile.id,
          updated_at:new Date().toISOString()
        });

      if(insertError)throw insertError;

      setMessage(`Territory assigned to ${selectedEmployee?.full_name||'employee'}.`);
      setLocation('');
      setTerritoryName('');

      await refresh();

    }catch(e){
      setError(e instanceof Error?e.message:'Unable to assign territory.');
    }finally{
      setBusy(false);
    }
  }

  async function setStatus(
    territory:Territory,
    status:'active'|'disabled'
  ){
    setBusy(true);
    setError('');
    setMessage('');

    try{
      const {error:updateError}=await supabase
        .from('employee_territories')
        .update({
          status,
          updated_at:new Date().toISOString()
        })
        .eq('id',territory.id);

      if(updateError)throw updateError;

      setMessage(
        status==='active'
          ?`${territory.territory_name} activated.`
          :`${territory.territory_name} disabled.`
      );

      await refresh();

    }catch(e){
      setError(e instanceof Error?e.message:'Unable to update territory.');
    }finally{
      setBusy(false);
    }
  }

  async function extendTerritory(territory:Territory,days:number){
    setBusy(true);
    setError('');
    setMessage('');

    try{
      const base=
        territory.expires_at&&
        new Date(territory.expires_at).getTime()>Date.now()
          ?new Date(territory.expires_at)
          :new Date();

      base.setDate(base.getDate()+days);

      const {error:updateError}=await supabase
        .from('employee_territories')
        .update({
          expires_at:base.toISOString(),
          status:'active',
          updated_at:new Date().toISOString()
        })
        .eq('id',territory.id);

      if(updateError)throw updateError;

      setMessage(`${territory.territory_name} extended ${days} days.`);
      await refresh();

    }catch(e){
      setError(e instanceof Error?e.message:'Unable to extend territory.');
    }finally{
      setBusy(false);
    }
  }

  async function removeTerritory(territory:Territory){
    const confirmed=window.confirm(
      `Remove "${territory.territory_name}"? The employee will immediately lose this territory assignment.`
    );

    if(!confirmed)return;

    setBusy(true);
    setError('');
    setMessage('');

    try{
      const {error:deleteError}=await supabase
        .from('employee_territories')
        .delete()
        .eq('id',territory.id);

      if(deleteError)throw deleteError;

      setMessage('Territory removed.');
      await refresh();

    }catch(e){
      setError(e instanceof Error?e.message:'Unable to remove territory.');
    }finally{
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1380px] p-5 md:p-8 lg:p-10">
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold text-blue-600">
            Owner territory control
          </p>

          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            Sales territories
          </h1>

          <p className="mt-2 max-w-3xl text-slate-500">
            Control exactly where each employee can prospect. Territory
            enforcement will happen before any Google Maps extractor request.
          </p>
        </div>

        <SecondaryButton
          onClick={()=>void refresh()}
          disabled={loading||busy}
        >
          <RefreshCw className="mr-2" size={17}/>
          Refresh
        </SecondaryButton>
      </header>

      {message&&(
        <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">
          {message}
        </div>
      )}

      {error&&(
        <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}

      <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Active territories"
          value={String(activeTerritories.length)}
          detail="Currently available for prospecting"
        />

        <Metric
          label="Employees covered"
          value={String(employeesCovered)}
          detail={`${employees.filter(x=>x.is_active).length} active employees`}
        />

        <Metric
          label="Unassigned employees"
          value={String(unassignedEmployees.length)}
          detail="Cannot prospect after enforcement goes live"
          warning={unassignedEmployees.length>0}
        />

        <Metric
          label="Default coverage"
          value="25 mi"
          detail="Owner can choose 5–100 miles"
        />
      </div>

      <div className="mt-7 grid gap-6 xl:grid-cols-[420px_1fr]">
        <Card className="p-6">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-50 text-blue-600">
              <Plus size={20}/>
            </div>

            <div>
              <h2 className="font-semibold">Assign territory</h2>
              <p className="text-sm text-slate-500">
                Owner-controlled prospecting access
              </p>
            </div>
          </div>

          <form onSubmit={createTerritory} className="mt-6 space-y-5">
            <Field label="Employee">
              <select
                className={inputClass}
                value={employeeId}
                onChange={e=>setEmployeeId(e.target.value)}
                required
              >
                <option value="">Select employee</option>

                {employees.map(employee=>(
                  <option
                    key={employee.id}
                    value={employee.id}
                    disabled={!employee.is_active}
                  >
                    {employee.full_name||'Employee'}
                    {!employee.is_active?' · inactive':''}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="Territory location"
              hint="City, ZIP code, county, or full US address"
            >
              <input
                className={inputClass}
                value={location}
                onChange={e=>setLocation(e.target.value)}
                placeholder="Tampa, FL"
                required
              />
            </Field>

            <Field
              label="Territory name"
              hint="Optional. DMHOUSE creates one automatically if blank."
            >
              <input
                className={inputClass}
                value={territoryName}
                onChange={e=>setTerritoryName(e.target.value)}
                placeholder="Tampa Metro"
              />
            </Field>

            <Field label="Radius">
              <select
                className={inputClass}
                value={radiusMiles}
                onChange={e=>setRadiusMiles(Number(e.target.value))}
              >
                {radiusOptions.map(radius=>(
                  <option key={radius} value={radius}>
                    {radius} miles
                  </option>
                ))}
              </select>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Starts">
                <input
                  className={inputClass}
                  type="date"
                  value={startsAt}
                  onChange={e=>setStartsAt(e.target.value)}
                  required
                />
              </Field>

              <Field label="Expires">
                <input
                  className={inputClass}
                  type="date"
                  value={expiresAt}
                  onChange={e=>setExpiresAt(e.target.value)}
                />
              </Field>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[30,60,90].map(days=>(
                <button
                  type="button"
                  key={days}
                  onClick={()=>setExpiresAt(addDays(days))}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:border-blue-300 hover:text-blue-700"
                >
                  {days} days
                </button>
              ))}
            </div>

            <PrimaryButton
              type="submit"
              disabled={busy||loading||!employees.length}
              className="w-full"
            >
              <MapPin className="mr-2" size={17}/>
              {busy?'Saving…':'Assign Territory'}
            </PrimaryButton>

            {!employees.length&&!loading&&(
              <p className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-700">
                No employee profiles are available yet.
              </p>
            )}
          </form>
        </Card>

        <div>
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">Territory assignments</h2>
              <p className="mt-1 text-sm text-slate-500">
                Employees may have more than one active territory.
              </p>
            </div>

            <Pill tone="blue">
              {territories.length} total
            </Pill>
          </div>

          <div className="space-y-4">
            {territories.map(territory=>{
              const employee=employees.find(x=>x.id===territory.employee_id);
              const status=effectiveStatus(territory);
              const days=remainingDays(territory.expires_at);

              return (
                <Card key={territory.id} className="overflow-hidden">
                  <div className="p-5 md:p-6">
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex gap-4">
                        <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${
                          status==='active'
                            ?'bg-emerald-50 text-emerald-600'
                            :status==='disabled'
                              ?'bg-red-50 text-red-600'
                              :'bg-slate-100 text-slate-500'
                        }`}>
                          <MapPin size={21}/>
                        </div>

                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-semibold">
                              {territory.territory_name}
                            </h3>

                            <Pill
                              tone={
                                status==='active'
                                  ?'success'
                                  :status==='disabled'
                                    ?'danger'
                                    :status==='created'
                                      ?'blue'
                                      :'neutral'
                              }
                            >
                              {status}
                            </Pill>
                          </div>

                          <p className="mt-1 text-sm text-slate-500">
                            {territory.center_address}
                          </p>

                          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
                            <span className="inline-flex items-center gap-2 text-slate-700">
                              <UserRound size={15} className="text-slate-400"/>
                              {employee?.full_name||'Employee'}
                            </span>

                            <span className="inline-flex items-center gap-2 text-slate-700">
                              <ShieldCheck size={15} className="text-slate-400"/>
                              {Number(territory.radius_miles)} mile radius
                            </span>

                            <span className="inline-flex items-center gap-2 text-slate-700">
                              <CalendarDays size={15} className="text-slate-400"/>
                              {niceDate(territory.starts_at)} → {niceDate(territory.expires_at)}
                            </span>

                            {days!==null&&status==='active'&&(
                              <span className="inline-flex items-center gap-2 text-slate-700">
                                <Clock3 size={15} className="text-slate-400"/>
                                {days} days remaining
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {status==='disabled'?(
                          <SecondaryButton
                            disabled={busy}
                            onClick={()=>void setStatus(territory,'active')}
                          >
                            <CheckCircle2 className="mr-2" size={16}/>
                            Activate
                          </SecondaryButton>
                        ):(
                          <SecondaryButton
                            disabled={busy}
                            onClick={()=>void setStatus(territory,'disabled')}
                          >
                            <XCircle className="mr-2" size={16}/>
                            Disable
                          </SecondaryButton>
                        )}

                        <SecondaryButton
                          disabled={busy}
                          onClick={()=>void extendTerritory(territory,30)}
                        >
                          +30 Days
                        </SecondaryButton>

                        <button
                          type="button"
                          disabled={busy}
                          onClick={()=>void removeTerritory(territory)}
                          className="inline-flex items-center rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                        >
                          <Trash2 className="mr-2" size={16}/>
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}

            {!territories.length&&!loading&&(
              <Card className="grid min-h-64 place-items-center p-10 text-center">
                <div>
                  <MapPin className="mx-auto text-slate-300" size={42}/>
                  <h3 className="mt-4 text-lg font-semibold">
                    No territories assigned
                  </h3>
                  <p className="mt-2 text-sm text-slate-500">
                    Assign the first employee territory using the Owner controls.
                  </p>
                </div>
              </Card>
            )}

            {loading&&(
              <Card className="p-8 text-center text-slate-500">
                Loading territory assignments…
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  detail,
  warning=false
}:{
  label:string;
  value:string;
  detail:string;
  warning?:boolean;
}){
  return (
    <Card className="p-5">
      <p className="text-xs font-bold uppercase tracking-[.14em] text-slate-400">
        {label}
      </p>

      <p className={`mt-2 text-3xl font-semibold ${
        warning?'text-amber-600':'text-slate-950'
      }`}>
        {value}
      </p>

      <p className="mt-2 text-sm text-slate-500">
        {detail}
      </p>
    </Card>
  );
}
