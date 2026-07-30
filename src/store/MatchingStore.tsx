import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { usePortfolioStore } from './PortfolioStore';
import { useAgencyStore } from './AgencyStore';

export type BuyerPreference={
 id:string; agencyId:string; productTypes:string[]; states:string[]; minAccountAgeMonths?:number; maxAccountAgeMonths?:number;
 minAverageBalance?:number; maxAverageBalance?:number; minAccountCount?:number; maxAccountCount?:number; minPrice?:number; maxPrice?:number;
 preferredCreditors:string[]; paperQualities:string[]; buyingFrequency:string; lastPurchaseAt?:string; notes:string;
};
export type PortfolioMatchProfile={id:string;portfolioId:string;productType:string;states:string[];accountAgeMonths?:number;averageBalance?:number;paperQuality:string;saleRestrictions:string};
export type PortfolioMatch={id?:string;portfolioId:string;agencyId:string;score:number;strength:'strong'|'moderate'|'weak';reasons:string[];status:string;assignedEmployeeId?:string;lastContactedAt?:string};
export type EmployeeOption={id:string;name:string};

type Store={
 preferences:BuyerPreference[]; profiles:PortfolioMatchProfile[]; matches:PortfolioMatch[]; employees:EmployeeOption[]; loading:boolean; error:string;
 refresh:()=>Promise<void>; saveBuyerPreference:(agencyId:string,input:Partial<BuyerPreference>)=>Promise<void>; savePortfolioProfile:(portfolioId:string,input:Partial<PortfolioMatchProfile>)=>Promise<void>;
 recalculate:(portfolioId?:string)=>Promise<void>; updateMatch:(portfolioId:string,agencyId:string,patch:Partial<PortfolioMatch>)=>Promise<void>;
};
const Context=createContext<Store|null>(null);
const nums=(v:any)=>v===null||v===undefined?undefined:Number(v);
const clean=(a?:string[])=>Array.from(new Set((a||[]).map(x=>x.trim()).filter(Boolean)));
const overlap=(a:string[],b:string[])=>a.some(x=>b.map(y=>y.toLowerCase()).includes(x.toLowerCase()));

export function MatchingProvider({children}:{children:ReactNode}){
 const {profile:authProfile,portfolios}=usePortfolioStore(); const {agencies}=useAgencyStore();
 const [preferences,setPreferences]=useState<BuyerPreference[]>([]);const [profiles,setProfiles]=useState<PortfolioMatchProfile[]>([]);const [matches,setMatches]=useState<PortfolioMatch[]>([]);const [employees,setEmployees]=useState<EmployeeOption[]>([]);const [loading,setLoading]=useState(true);const [error,setError]=useState('');
 const refresh=useCallback(async()=>{if(!authProfile){setLoading(false);return;}setLoading(true);setError('');try{
  const [p1,p2,p3,p4]=await Promise.all([
   supabase.from('buyer_preferences').select('*').eq('company_id',authProfile.company_id),
   supabase.from('portfolio_match_profiles').select('*').eq('company_id',authProfile.company_id),
   supabase.from('portfolio_matches').select('*').eq('company_id',authProfile.company_id),
   supabase.from('profiles').select('id,full_name,role,is_active').eq('company_id',authProfile.company_id).eq('role','employee').eq('is_active',true)
  ]);for(const r of [p1,p2,p3,p4])if(r.error)throw r.error;
  setPreferences((p1.data||[]).map((r:any)=>({id:r.id,agencyId:r.agency_id,productTypes:r.product_types||[],states:r.states||[],minAccountAgeMonths:nums(r.min_account_age_months),maxAccountAgeMonths:nums(r.max_account_age_months),minAverageBalance:nums(r.min_average_balance),maxAverageBalance:nums(r.max_average_balance),minAccountCount:nums(r.min_account_count),maxAccountCount:nums(r.max_account_count),minPrice:nums(r.min_price),maxPrice:nums(r.max_price),preferredCreditors:r.preferred_creditors||[],paperQualities:r.paper_qualities||[],buyingFrequency:r.buying_frequency||'',lastPurchaseAt:r.last_purchase_at||undefined,notes:r.notes||''})));
  setProfiles((p2.data||[]).map((r:any)=>({id:r.id,portfolioId:r.portfolio_id,productType:r.product_type||'',states:r.states||[],accountAgeMonths:nums(r.account_age_months),averageBalance:nums(r.average_balance),paperQuality:r.paper_quality||'',saleRestrictions:r.sale_restrictions||''})));
  setMatches((p3.data||[]).map((r:any)=>({id:r.id,portfolioId:r.portfolio_id,agencyId:r.agency_id,score:Number(r.score||0),strength:r.strength,reasons:r.reasons||[],status:r.status||'recommended',assignedEmployeeId:r.assigned_employee_id||undefined,lastContactedAt:r.last_contacted_at||undefined})));
  setEmployees((p4.data||[]).map((r:any)=>({id:r.id,name:r.full_name||'Employee'})));
 }catch(e){setError(e instanceof Error?e.message:'Unable to load matching engine.')}finally{setLoading(false)}},[authProfile]);
 useEffect(()=>{refresh()},[refresh]);
 const saveBuyerPreference=async(agencyId:string,input:Partial<BuyerPreference>)=>{if(!authProfile)throw new Error('Profile unavailable');const payload:any={company_id:authProfile.company_id,agency_id:agencyId};
  if(input.productTypes!==undefined)payload.product_types=clean(input.productTypes);if(input.states!==undefined)payload.states=clean(input.states);if(input.minAccountAgeMonths!==undefined)payload.min_account_age_months=input.minAccountAgeMonths||null;if(input.maxAccountAgeMonths!==undefined)payload.max_account_age_months=input.maxAccountAgeMonths||null;if(input.minAverageBalance!==undefined)payload.min_average_balance=input.minAverageBalance||null;if(input.maxAverageBalance!==undefined)payload.max_average_balance=input.maxAverageBalance||null;if(input.minAccountCount!==undefined)payload.min_account_count=input.minAccountCount||null;if(input.maxAccountCount!==undefined)payload.max_account_count=input.maxAccountCount||null;if(input.minPrice!==undefined)payload.min_price=input.minPrice||null;if(input.maxPrice!==undefined)payload.max_price=input.maxPrice||null;if(input.preferredCreditors!==undefined)payload.preferred_creditors=clean(input.preferredCreditors);if(input.paperQualities!==undefined)payload.paper_qualities=clean(input.paperQualities);if(input.buyingFrequency!==undefined)payload.buying_frequency=input.buyingFrequency||null;if(input.lastPurchaseAt!==undefined)payload.last_purchase_at=input.lastPurchaseAt||null;if(input.notes!==undefined)payload.notes=input.notes||null;
  const {error:e}=await supabase.from('buyer_preferences').upsert(payload,{onConflict:'company_id,agency_id'});if(e)throw e;await refresh();};
 const savePortfolioProfile=async(portfolioId:string,input:Partial<PortfolioMatchProfile>)=>{if(!authProfile)throw new Error('Profile unavailable');const payload:any={company_id:authProfile.company_id,portfolio_id:portfolioId};if(input.productType!==undefined)payload.product_type=input.productType||null;if(input.states!==undefined)payload.states=clean(input.states);if(input.accountAgeMonths!==undefined)payload.account_age_months=input.accountAgeMonths||null;if(input.averageBalance!==undefined)payload.average_balance=input.averageBalance||null;if(input.paperQuality!==undefined)payload.paper_quality=input.paperQuality||null;if(input.saleRestrictions!==undefined)payload.sale_restrictions=input.saleRestrictions||null;const {error:e}=await supabase.from('portfolio_match_profiles').upsert(payload,{onConflict:'company_id,portfolio_id'});if(e)throw e;await refresh();};
 const calculate=(portfolioId:string,agencyId:string):PortfolioMatch=>{const portfolio=portfolios.find(p=>p.id===portfolioId)!;const pref=preferences.find(p=>p.agencyId===agencyId);const mp=profiles.find(p=>p.portfolioId===portfolioId);let score=0;const reasons:string[]=[];
  const product=(mp?.productType||portfolio.category||'').toLowerCase();if(pref?.productTypes.length&&pref.productTypes.some(x=>product.includes(x.toLowerCase())||x.toLowerCase().includes(product))){score+=30;reasons.push('Preferred product type');}
  if(pref?.states.length&&mp?.states.length&&overlap(pref.states,mp.states)){score+=15;reasons.push('State coverage overlap');}
  if(pref?.minAccountCount!==undefined||pref?.maxAccountCount!==undefined){const ok=(pref.minAccountCount===undefined||portfolio.accountCount>=pref.minAccountCount)&&(pref.maxAccountCount===undefined||portfolio.accountCount<=pref.maxAccountCount);if(ok){score+=10;reasons.push('Account count fits');}}
  if(pref?.minPrice!==undefined||pref?.maxPrice!==undefined){const ok=(pref.minPrice===undefined||portfolio.askingPrice>=pref.minPrice)&&(pref.maxPrice===undefined||portfolio.askingPrice<=pref.maxPrice);if(ok){score+=15;reasons.push('Price range fits');}}
  const avg=mp?.averageBalance|| (portfolio.accountCount?portfolio.faceValue/portfolio.accountCount:0);if(pref&&(pref.minAverageBalance!==undefined||pref.maxAverageBalance!==undefined)){const ok=(pref.minAverageBalance===undefined||avg>=pref.minAverageBalance)&&(pref.maxAverageBalance===undefined||avg<=pref.maxAverageBalance);if(ok){score+=10;reasons.push('Average balance fits');}}
  if(pref&&mp?.accountAgeMonths!==undefined&&(pref.minAccountAgeMonths!==undefined||pref.maxAccountAgeMonths!==undefined)){const ok=(pref.minAccountAgeMonths===undefined||mp.accountAgeMonths>=pref.minAccountAgeMonths)&&(pref.maxAccountAgeMonths===undefined||mp.accountAgeMonths<=pref.maxAccountAgeMonths);if(ok){score+=10;reasons.push('Account age fits');}}
  if(pref?.preferredCreditors.length&&pref.preferredCreditors.some(x=>portfolio.originalCreditor.toLowerCase().includes(x.toLowerCase()))){score+=5;reasons.push('Preferred creditor');}
  if(pref?.paperQualities.length&&mp?.paperQuality&&pref.paperQualities.some(x=>x.toLowerCase()===mp.paperQuality.toLowerCase())){score+=3;reasons.push('Paper quality fits');}
  if(pref?.buyingFrequency){score+=2;reasons.push('Active buying cadence');}
  if(!pref){score=Math.min(35,product?20:10);reasons.push('Preference profile incomplete');}
  score=Math.min(100,score);const strength=score>=75?'strong':score>=50?'moderate':'weak';const existing=matches.find(m=>m.portfolioId===portfolioId&&m.agencyId===agencyId);return {...existing,portfolioId,agencyId,score,strength,reasons,status:existing?.status||'recommended'};
 };
 const recalculate=async(portfolioId?:string)=>{if(!authProfile)throw new Error('Profile unavailable');const pids=portfolioId?[portfolioId]:portfolios.filter(p=>p.status!=='sold'&&p.status!=='archived').map(p=>p.id);const rows=pids.flatMap(pid=>agencies.map(a=>calculate(pid,a.id))).map(m=>({company_id:authProfile.company_id,portfolio_id:m.portfolioId,agency_id:m.agencyId,score:m.score,strength:m.strength,reasons:m.reasons,status:m.status,assigned_employee_id:m.assignedEmployeeId||null,last_contacted_at:m.lastContactedAt||null}));if(rows.length){const {error:e}=await supabase.from('portfolio_matches').upsert(rows,{onConflict:'company_id,portfolio_id,agency_id'});if(e)throw e;}await refresh();};
 const updateMatch=async(portfolioId:string,agencyId:string,patch:Partial<PortfolioMatch>)=>{if(!authProfile)throw new Error('Profile unavailable');const base=matches.find(m=>m.portfolioId===portfolioId&&m.agencyId===agencyId)||calculate(portfolioId,agencyId);const payload:any={company_id:authProfile.company_id,portfolio_id:portfolioId,agency_id:agencyId,score:base.score,strength:base.strength,reasons:base.reasons,status:patch.status??base.status,assigned_employee_id:patch.assignedEmployeeId??base.assignedEmployeeId??null,last_contacted_at:patch.lastContactedAt??base.lastContactedAt??null};const {error:e}=await supabase.from('portfolio_matches').upsert(payload,{onConflict:'company_id,portfolio_id,agency_id'});if(e)throw e;await refresh();};
 const value=useMemo<Store>(()=>({preferences,profiles,matches,employees,loading,error,refresh,saveBuyerPreference,savePortfolioProfile,recalculate,updateMatch}),[preferences,profiles,matches,employees,loading,error,refresh]);return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useMatchingStore(){const x=useContext(Context);if(!x)throw new Error('MatchingProvider missing');return x;}
