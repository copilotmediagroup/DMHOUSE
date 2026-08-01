import {ArrowRight} from 'lucide-react';
import {useNavigate} from 'react-router-dom';
import {Card,Pill} from '../Primitives';
import type {ExecutiveQueueItem} from './types';

const pillTone={default:'neutral',warning:'warning',danger:'danger',success:'success'} as const;
export default function ExecutiveQueuePanel({title,eyebrow,items,emptyText}:{title:string;eyebrow:string;items:ExecutiveQueueItem[];emptyText:string}){const navigate=useNavigate();return <Card className="overflow-hidden"><div className="border-b border-slate-100 p-6"><p className="text-sm font-medium text-slate-500">{eyebrow}</p><h3 className="mt-1 text-xl font-semibold">{title}</h3></div><div className="divide-y divide-slate-100">{items.length?items.slice(0,6).map(item=><button key={item.id} onClick={()=>navigate(item.path)} className="flex w-full items-start justify-between gap-4 p-5 text-left transition hover:bg-slate-50"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate font-semibold text-slate-900">{item.title}</p><Pill tone={pillTone[item.tone||'default']}>{item.meta}</Pill></div><p className="mt-1 line-clamp-2 text-sm leading-5 text-slate-500">{item.detail}</p></div><ArrowRight size={18} className="mt-1 shrink-0 text-slate-300"/></button>):<div className="p-6 text-sm text-slate-500">{emptyText}</div>}</div></Card>}
