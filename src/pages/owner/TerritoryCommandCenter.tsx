import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock3,
  History,
  MapPinned,
  RefreshCw,
  ShieldCheck,
  UserRound,
  Users
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useState
} from 'react';

import {supabase} from '../../lib/supabase';
import {usePortfolioStore} from '../../store/PortfolioStore';
import TerritoryManagement from './TerritoryManagement';


type TerritoryIntelligence={
  market_key:string;
  territory_name:string;
  center_address:string;
  center_latitude:number;
  center_longitude:number;
  radius_miles:number;

  assignment_count:number;
  employee_count:number;

  current_territory_id:string|null;
  current_employee_id:string|null;
  current_employee_name:string|null;
  current_status:string;

  current_starts_at:string|null;
  current_expires_at:string|null;

  last_employee_id:string|null;
  last_employee_name:string|null;

  last_started_at:string|null;
  last_worked_at:string|null;

  days_since_last_worked:number;
  cooldown_days:number;

  recommended_next_assignment_at:string|null;

  recommendation:
    |'ACTIVE'
    |'SCHEDULED'
    |'READY'
    |'COOLING'
    |string;
};


type RegistryRow={
  territory_id:string;
  employee_id:string;
  territory_name:string;
  market_key:string;
  starts_at:string;
  expires_at:string|null;
  assignment_status:string;
};


type Employee={
  id:string;
  full_name:string;
  is_active:boolean;
};


function niceDate(value:string|null|undefined){
  if(!value)return '—';

  return new Intl.DateTimeFormat(
    'en-US',
    {
      month:'short',
      day:'numeric',
      year:'numeric'
    }
  ).format(new Date(value));
}


function remainingDays(value:string|null|undefined){
  if(!value)return null;

  const diff=
    new Date(value).getTime()
    -
    Date.now();

  return Math.max(
    0,
    Math.ceil(diff/86400000)
  );
}


function recommendationStyle(
  recommendation:string
){
  switch(recommendation){

    case 'ACTIVE':
      return {
        label:'Active',
        badge:
          'border-emerald-200 bg-emerald-50 text-emerald-700',
        icon:
          <ShieldCheck size={14}/>
      };

    case 'SCHEDULED':
      return {
        label:'Scheduled',
        badge:
          'border-blue-200 bg-blue-50 text-blue-700',
        icon:
          <CalendarClock size={14}/>
      };

    case 'READY':
      return {
        label:'Ready to assign',
        badge:
          'border-emerald-200 bg-emerald-50 text-emerald-700',
        icon:
          <CheckCircle2 size={14}/>
      };

    case 'COOLING':
      return {
        label:'Cooling',
        badge:
          'border-amber-200 bg-amber-50 text-amber-700',
        icon:
          <Clock3 size={14}/>
      };

    default:
      return {
        label:recommendation||'Unknown',
        badge:
          'border-slate-200 bg-slate-50 text-slate-600',
        icon:
          <AlertTriangle size={14}/>
      };
  }
}


function StatCard({
  label,
  value,
  detail,
  tone='slate'
}:{
  label:string;
  value:string|number;
  detail:string;
  tone?:'slate'|'blue'|'emerald'|'amber';
}){

  const tones={
    slate:
      'border-slate-200 bg-white',
    blue:
      'border-blue-100 bg-blue-50/40',
    emerald:
      'border-emerald-100 bg-emerald-50/40',
    amber:
      'border-amber-100 bg-amber-50/40'
  };

  return (
    <div
      className={`rounded-2xl border p-5 ${tones[tone]}`}
    >
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
        {label}
      </p>

      <p className="mt-3 text-3xl font-bold tracking-tight text-slate-950">
        {value}
      </p>

      <p className="mt-2 text-sm text-slate-500">
        {detail}
      </p>
    </div>
  );
}


export default function TerritoryCommandCenter(){

  const {profile}=usePortfolioStore();

  const [markets,setMarkets]=
    useState<TerritoryIntelligence[]>([]);

  const [registry,setRegistry]=
    useState<RegistryRow[]>([]);

  const [employees,setEmployees]=
    useState<Employee[]>([]);

  const [loading,setLoading]=
    useState(true);

  const [error,setError]=
    useState('');

  const [lastRefresh,setLastRefresh]=
    useState<Date|null>(null);


  const load=useCallback(async()=>{

    if(!profile?.company_id){
      return;
    }

    setLoading(true);
    setError('');

    try{

      const [
        intelligenceResult,
        registryResult,
        employeeResult
      ]=
        await Promise.all([

          supabase.rpc(
            'dmh_owner_territory_intelligence',
            {
              p_cooldown_days:30
            }
          ),

          supabase
            .from(
              'territory_assignment_registry'
            )
            .select(
              'territory_id,employee_id,territory_name,market_key,starts_at,expires_at,assignment_status'
            )
            .eq(
              'company_id',
              profile.company_id
            )
            .order(
              'starts_at',
              {ascending:false}
            ),

          supabase
            .from('profiles')
            .select(
              'id,full_name,is_active'
            )
            .eq(
              'company_id',
              profile.company_id
            )
            .eq(
              'role',
              'employee'
            )
            .order(
              'full_name'
            )
        ]);


      if(intelligenceResult.error){
        throw intelligenceResult.error;
      }

      if(registryResult.error){
        throw registryResult.error;
      }

      if(employeeResult.error){
        throw employeeResult.error;
      }


      setMarkets(
        (
          intelligenceResult.data||[]
        ) as TerritoryIntelligence[]
      );

      setRegistry(
        (
          registryResult.data||[]
        ) as RegistryRow[]
      );

      setEmployees(
        (
          employeeResult.data||[]
        ) as Employee[]
      );

      setLastRefresh(
        new Date()
      );

    }catch(e){

      setError(
        e instanceof Error
          ?e.message
          :'Unable to load territory intelligence.'
      );

    }finally{

      setLoading(false);

    }

  },[profile?.company_id]);


  useEffect(()=>{

    void load();

  },[load]);


  /*
    Keep Command Center reasonably current when the Owner
    performs an assignment lower on the same page.
  */

  useEffect(()=>{

    const timer=
      window.setInterval(
        ()=>{
          void load();
        },
        15000
      );

    return ()=>{
      window.clearInterval(timer);
    };

  },[load]);


  const active=
    useMemo(
      ()=>markets.filter(
        x=>x.recommendation==='ACTIVE'
      ),
      [markets]
    );


  const scheduled=
    useMemo(
      ()=>markets.filter(
        x=>x.recommendation==='SCHEDULED'
      ),
      [markets]
    );


  const cooling=
    useMemo(
      ()=>markets.filter(
        x=>x.recommendation==='COOLING'
      ),
      [markets]
    );


  const ready=
    useMemo(
      ()=>markets.filter(
        x=>x.recommendation==='READY'
      ),
      [markets]
    );


  const activeEmployees=
    useMemo(
      ()=>employees.filter(
        x=>x.is_active
      ),
      [employees]
    );


  const employeesWithCurrentMarket=
    useMemo(
      ()=>new Set(
        active
          .map(
            x=>x.current_employee_id
          )
          .filter(Boolean)
      ).size,
      [active]
    );


  const historyByEmployee=
    useMemo(()=>{

      return employees
        .map(employee=>{

          const rows=
            registry.filter(
              row=>
                row.employee_id===
                employee.id
            );

          const marketCount=
            new Set(
              rows.map(
                row=>row.market_key
              )
            ).size;

          const activeCount=
            rows.filter(
              row=>
                row.assignment_status===
                'active'
            ).length;

          return {
            employee,
            assignments:rows.length,
            markets:marketCount,
            active:activeCount
          };

        })
        .filter(
          row=>row.assignments>0
        )
        .sort(
          (a,b)=>
            b.assignments-
            a.assignments
        );

    },[employees,registry]);


  return (
    <div className="space-y-8">

      {/* =====================================================
          COMMAND HEADER
      ====================================================== */}

      <section
        className="
          overflow-hidden rounded-[28px]
          bg-slate-950
          px-7 py-8
          text-white
          shadow-sm
          md:px-9
        "
      >

        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">

          <div>

            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-blue-300">
              <MapPinned size={16}/>
              Territory Command Center
            </div>

            <h1 className="mt-4 text-3xl font-bold tracking-tight md:text-4xl">
              Manage market coverage.
            </h1>

            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300 md:text-base">
              See who is working each market, what was worked recently,
              and when a territory should be assigned again.
            </p>

          </div>


          <button
            type="button"
            onClick={()=>void load()}
            disabled={loading}
            className="
              inline-flex items-center justify-center gap-2
              rounded-xl
              border border-white/15
              bg-white/10
              px-4 py-3
              text-sm font-semibold
              text-white
              transition
              hover:bg-white/15
              disabled:opacity-50
            "
          >
            <RefreshCw
              size={17}
              className={
                loading
                  ?'animate-spin'
                  :''
              }
            />

            Refresh Intelligence
          </button>

        </div>


        {lastRefresh&&(
          <p className="mt-5 text-xs text-slate-500">
            Last refreshed{' '}
            {lastRefresh.toLocaleTimeString()}
          </p>
        )}

      </section>


      {/* =====================================================
          ERROR
      ====================================================== */}

      {error&&(
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
          {error}
        </div>
      )}


      {/* =====================================================
          EXECUTIVE METRICS
      ====================================================== */}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">

        <StatCard
          label="Active markets"
          value={active.length}
          detail="Being worked now"
          tone="blue"
        />

        <StatCard
          label="Cooling down"
          value={cooling.length}
          detail="Recently worked markets"
          tone="amber"
        />

        <StatCard
          label="Ready"
          value={ready.length}
          detail="Eligible for reassignment"
          tone="emerald"
        />

        <StatCard
          label="Scheduled"
          value={scheduled.length}
          detail="Future assignments"
        />

        <StatCard
          label="Employees covered"
          value={`${employeesWithCurrentMarket}/${activeEmployees.length}`}
          detail="Active employees with territory"
        />

      </section>


      {/* =====================================================
          ACTIVE ASSIGNMENTS
      ====================================================== */}

      <section className="rounded-[24px] border border-slate-200 bg-white shadow-sm">

        <div className="flex flex-col gap-3 border-b border-slate-100 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">

          <div>
            <h2 className="text-lg font-bold text-slate-950">
              Current Market Coverage
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Territory assignments currently in force.
            </p>
          </div>

          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
            {active.length} active
          </span>

        </div>


        <div className="divide-y divide-slate-100">

          {active.map(market=>{

            const days=
              remainingDays(
                market.current_expires_at
              );

            return (
              <div
                key={market.market_key}
                className="grid gap-5 px-6 py-5 lg:grid-cols-[1.3fr_.8fr_.7fr_.7fr]"
              >

                <div>

                  <div className="flex flex-wrap items-center gap-2">

                    <p className="font-bold text-slate-950">
                      {market.territory_name}
                    </p>

                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                      <ShieldCheck size={13}/>
                      ACTIVE
                    </span>

                  </div>

                  <p className="mt-2 text-sm text-slate-500">
                    {market.center_address}
                  </p>

                  <p className="mt-2 text-xs font-medium text-slate-400">
                    {Number(market.radius_miles)} mile radius
                  </p>

                </div>


                <div>

                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                    Assigned to
                  </p>

                  <p className="mt-2 flex items-center gap-2 font-semibold text-slate-900">
                    <UserRound
                      size={16}
                      className="text-blue-500"
                    />

                    {market.current_employee_name||'Employee'}
                  </p>

                </div>


                <div>

                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                    Assignment
                  </p>

                  <p className="mt-2 text-sm font-semibold text-slate-900">
                    {niceDate(market.current_starts_at)}
                  </p>

                  <p className="mt-1 text-xs text-slate-500">
                    to {niceDate(market.current_expires_at)}
                  </p>

                </div>


                <div>

                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                    Remaining
                  </p>

                  <p className="mt-2 text-lg font-bold text-slate-950">
                    {days===null
                      ?'Open'
                      :`${days}d`
                    }
                  </p>

                </div>

              </div>
            );

          })}


          {!active.length&&!loading&&(
            <div className="px-6 py-12 text-center">

              <MapPinned
                size={28}
                className="mx-auto text-slate-300"
              />

              <p className="mt-3 font-semibold text-slate-700">
                No active territories
              </p>

              <p className="mt-1 text-sm text-slate-500">
                Assign a market using the controls below.
              </p>

            </div>
          )}

        </div>

      </section>


      {/* =====================================================
          MARKET MEMORY
      ====================================================== */}

      <section>

        <div className="mb-4">

          <h2 className="text-xl font-bold text-slate-950">
            Market Memory
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            DMHOUSE remembers who worked each territory and when.
          </p>

        </div>


        <div className="grid gap-4 xl:grid-cols-2">

          {[...cooling,...ready,...scheduled]
            .map(market=>{

              const style=
                recommendationStyle(
                  market.recommendation
                );

              const cooldownRemaining=
                market.recommendation==='COOLING'
                  ?Math.max(
                      0,
                      market.cooldown_days
                      -
                      market.days_since_last_worked
                    )
                  :0;

              return (
                <div
                  key={market.market_key}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                >

                  <div className="flex items-start justify-between gap-4">

                    <div>

                      <p className="font-bold text-slate-950">
                        {market.territory_name}
                      </p>

                      <p className="mt-1 text-sm text-slate-500">
                        {market.center_address}
                      </p>

                    </div>


                    <span
                      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold ${style.badge}`}
                    >
                      {style.icon}
                      {style.label}
                    </span>

                  </div>


                  <div className="mt-5 grid grid-cols-2 gap-4 border-t border-slate-100 pt-4 sm:grid-cols-4">

                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                        Last employee
                      </p>

                      <p className="mt-1 text-sm font-semibold text-slate-800">
                        {market.last_employee_name||'—'}
                      </p>
                    </div>


                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                        Last worked
                      </p>

                      <p className="mt-1 text-sm font-semibold text-slate-800">
                        {niceDate(market.last_worked_at)}
                      </p>
                    </div>


                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                        Assignments
                      </p>

                      <p className="mt-1 text-sm font-semibold text-slate-800">
                        {market.assignment_count}
                      </p>
                    </div>


                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                        Employees
                      </p>

                      <p className="mt-1 text-sm font-semibold text-slate-800">
                        {market.employee_count}
                      </p>
                    </div>

                  </div>


                  {market.recommendation==='COOLING'&&(
                    <div className="mt-4 rounded-xl bg-amber-50 px-4 py-3">

                      <p className="text-sm font-semibold text-amber-800">
                        Wait approximately {cooldownRemaining} more day{cooldownRemaining===1?'':'s'} before assigning again.
                      </p>

                      <p className="mt-1 text-xs text-amber-700">
                        Recommended next assignment: {niceDate(market.recommended_next_assignment_at)}
                      </p>

                    </div>
                  )}


                  {market.recommendation==='READY'&&(
                    <div className="mt-4 rounded-xl bg-emerald-50 px-4 py-3">

                      <p className="text-sm font-semibold text-emerald-800">
                        This market has completed its cooldown and is ready to work again.
                      </p>

                    </div>
                  )}

                </div>
              );

            })}

        </div>

      </section>


      {/* =====================================================
          EMPLOYEE × TERRITORY HISTORY
      ====================================================== */}

      <section className="rounded-[24px] border border-slate-200 bg-white shadow-sm">

        <div className="border-b border-slate-100 px-6 py-5">

          <div className="flex items-center gap-2">

            <Users
              size={19}
              className="text-blue-600"
            />

            <h2 className="text-lg font-bold text-slate-950">
              Employee Territory History
            </h2>

          </div>

          <p className="mt-2 text-sm text-slate-500">
            Historical market coverage by employee.
          </p>

        </div>


        <div className="divide-y divide-slate-100">

          {historyByEmployee.map(row=>(

            <div
              key={row.employee.id}
              className="grid gap-4 px-6 py-4 sm:grid-cols-[1.4fr_.6fr_.6fr_.6fr]"
            >

              <div>

                <p className="font-semibold text-slate-900">
                  {row.employee.full_name}
                </p>

                <p className="mt-1 text-xs text-slate-500">
                  {row.employee.is_active
                    ?'Active employee'
                    :'Inactive employee'
                  }
                </p>

              </div>


              <div>

                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                  Assignments
                </p>

                <p className="mt-1 text-lg font-bold text-slate-900">
                  {row.assignments}
                </p>

              </div>


              <div>

                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                  Markets
                </p>

                <p className="mt-1 text-lg font-bold text-slate-900">
                  {row.markets}
                </p>

              </div>


              <div>

                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                  Active
                </p>

                <p className="mt-1 text-lg font-bold text-slate-900">
                  {row.active}
                </p>

              </div>

            </div>

          ))}


          {!historyByEmployee.length&&!loading&&(
            <div className="px-6 py-10 text-center text-sm text-slate-500">
              Territory history will appear as assignments are created.
            </div>
          )}

        </div>

      </section>


      {/* =====================================================
          EXISTING TERRITORY MANAGEMENT
          PRESERVED IN FULL
      ====================================================== */}

      <section>

        <div className="mb-4 flex items-center gap-2">

          <History
            size={19}
            className="text-slate-500"
          />

          <div>

            <h2 className="text-xl font-bold text-slate-950">
              Territory Controls
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Existing assignment controls are preserved below.
            </p>

          </div>

        </div>

        <TerritoryManagement/>

      </section>

    </div>
  );
}
