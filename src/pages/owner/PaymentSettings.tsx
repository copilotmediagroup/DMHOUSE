import {useEffect,useState,type FormEvent} from 'react';
import {Building2,CheckCircle2,Landmark,ShieldCheck} from 'lucide-react';
import {Card,PrimaryButton,inputClass} from '../../components/Primitives';
import {supabase} from '../../lib/supabase';

type PaymentSettings={
  beneficiary_name:string;
  bank_name:string;
  bank_address:string;
  routing_number:string;
  account_number:string;
  swift_bic:string;
  wire_reference:string;
  payment_terms:string;
  payment_deadline:string;
  additional_instructions:string;
};

const initial:PaymentSettings={
  beneficiary_name:'',
  bank_name:'',
  bank_address:'',
  routing_number:'',
  account_number:'',
  swift_bic:'',
  wire_reference:'',
  payment_terms:'Payment in full by wire transfer before final portfolio release.',
  payment_deadline:'Payment due within 2 business days of execution.',
  additional_instructions:''
};

function Field({
  label,
  children
}:{
  label:string;
  children:React.ReactNode;
}){
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-slate-700">
        {label}
      </span>
      {children}
    </label>
  );
}

export default function PaymentSettings(){
  const [form,setForm]=useState<PaymentSettings>(initial);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');

  useEffect(()=>{
    void (async()=>{
      const {data,error}=await supabase.rpc('dmh_get_company_payment_settings');

      if(error){
        setMessage(error.message);
      }else if(data){
        setForm({...initial,...data});
      }

      setLoading(false);
    })();
  },[]);

  function update<K extends keyof PaymentSettings>(
    key:K,
    value:PaymentSettings[K]
  ){
    setForm(current=>({...current,[key]:value}));
  }

  async function save(e:FormEvent){
    e.preventDefault();
    setBusy(true);
    setMessage('');

    const {error}=await supabase.rpc(
      'dmh_save_company_payment_settings',
      {
        p_beneficiary_name:form.beneficiary_name,
        p_bank_name:form.bank_name,
        p_bank_address:form.bank_address,
        p_routing_number:form.routing_number,
        p_account_number:form.account_number,
        p_swift_bic:form.swift_bic,
        p_wire_reference:form.wire_reference,
        p_payment_terms:form.payment_terms,
        p_payment_deadline:form.payment_deadline,
        p_additional_instructions:form.additional_instructions
      }
    );

    setBusy(false);

    if(error){
      setMessage(error.message);
      return;
    }

    setMessage('Payment instructions saved. Future Purchase Agreements will use these instructions automatically.');
  }

  if(loading){
    return (
      <div className="mx-auto max-w-5xl p-10 text-slate-500">
        Loading payment settings…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl p-5 md:p-10">
      <header>
        <p className="text-sm font-semibold text-blue-600">
          OWNER SETTINGS
        </p>

        <h1 className="mt-1 text-3xl font-semibold">
          Payment & Wire Instructions
        </h1>

        <p className="mt-2 max-w-3xl text-slate-500">
          Enter the payment instructions once. DMHOUSE automatically inserts
          them into every Purchase Agreement sent to a buyer.
        </p>
      </header>

      {message&&(
        <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm font-semibold text-blue-800">
          {message}
        </div>
      )}

      <Card className="mt-7 p-6 md:p-8">
        <div className="flex items-start gap-4 border-b border-slate-100 pb-6">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-blue-600">
            <Landmark/>
          </div>

          <div>
            <h2 className="text-lg font-semibold">
              Wire destination
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Employees cannot edit these values during a transaction.
            </p>
          </div>
        </div>

        <form onSubmit={save} className="mt-7 grid gap-5 md:grid-cols-2">
          <Field label="Beneficiary / Account Name">
            <input
              className={inputClass}
              value={form.beneficiary_name}
              onChange={e=>update('beneficiary_name',e.target.value)}
              required
            />
          </Field>

          <Field label="Bank Name">
            <input
              className={inputClass}
              value={form.bank_name}
              onChange={e=>update('bank_name',e.target.value)}
              required
            />
          </Field>

          <Field label="Routing / ABA Number">
            <input
              className={inputClass}
              value={form.routing_number}
              onChange={e=>update('routing_number',e.target.value)}
              required
            />
          </Field>

          <Field label="Account Number">
            <input
              className={inputClass}
              value={form.account_number}
              onChange={e=>update('account_number',e.target.value)}
              required
            />
          </Field>

          <Field label="SWIFT / BIC — optional">
            <input
              className={inputClass}
              value={form.swift_bic}
              onChange={e=>update('swift_bic',e.target.value)}
            />
          </Field>

          <Field label="Wire Reference / Memo">
            <input
              className={inputClass}
              value={form.wire_reference}
              onChange={e=>update('wire_reference',e.target.value)}
              placeholder="Example: Buyer company + portfolio name"
            />
          </Field>

          <div className="md:col-span-2">
            <Field label="Bank Address — optional">
              <input
                className={inputClass}
                value={form.bank_address}
                onChange={e=>update('bank_address',e.target.value)}
              />
            </Field>
          </div>

          <div className="md:col-span-2">
            <Field label="Payment Terms">
              <textarea
                className={`${inputClass} min-h-24`}
                value={form.payment_terms}
                onChange={e=>update('payment_terms',e.target.value)}
              />
            </Field>
          </div>

          <div className="md:col-span-2">
            <Field label="Payment Deadline">
              <input
                className={inputClass}
                value={form.payment_deadline}
                onChange={e=>update('payment_deadline',e.target.value)}
              />
            </Field>
          </div>

          <div className="md:col-span-2">
            <Field label="Additional Payment Instructions">
              <textarea
                className={`${inputClass} min-h-28`}
                value={form.additional_instructions}
                onChange={e=>update('additional_instructions',e.target.value)}
              />
            </Field>
          </div>

          <div className="md:col-span-2 rounded-2xl bg-slate-50 p-5">
            <div className="flex gap-3">
              <ShieldCheck className="shrink-0 text-emerald-600"/>
              <div>
                <p className="font-semibold">
                  Owner-controlled information
                </p>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  These instructions are automatically copied into the
                  Purchase Agreement when an employee moves a buyer forward.
                </p>
              </div>
            </div>
          </div>

          <PrimaryButton
            className="md:col-span-2"
            disabled={busy}
          >
            {busy?'Saving…':'Save Payment Instructions'}
          </PrimaryButton>
        </form>
      </Card>
    </div>
  );
}
