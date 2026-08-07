import {useCallback,useEffect,useMemo,useState} from 'react';
import {supabase} from '../lib/supabase';
import {usePortfolioStore} from '../store/PortfolioStore';
import {
  deriveTransactionIntelligence,
  type StaffTransaction,
  type TransactionIntelligence
} from '../lib/transactionIntelligence';

export function useTransactionIntelligence(){
  const {profile}=usePortfolioStore();

  const [transactions,setTransactions]=useState<StaffTransaction[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');

  const role=
    profile?.role==='owner'
      ?'owner'
      :'employee';

  const refresh=useCallback(async()=>{
    if(!profile){
      setTransactions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    const {data,error}=await supabase.rpc(
      'dmh_staff_transaction_workspace'
    );

    if(error){
      setError(error.message);
      setLoading(false);
      return;
    }

    setTransactions(
      (data||[]) as StaffTransaction[]
    );

    setLoading(false);
  },[profile]);

  useEffect(()=>{
    void refresh();

    const channel=supabase
      .channel('dmh-transaction-intelligence')
      .on(
        'postgres_changes',
        {
          event:'*',
          schema:'public',
          table:'buyer_deal_rooms'
        },
        ()=>void refresh()
      )
      .on(
        'postgres_changes',
        {
          event:'*',
          schema:'public',
          table:'deal_documents_generated'
        },
        ()=>void refresh()
      )
      .subscribe();

    return()=>{
      void supabase.removeChannel(channel);
    };
  },[refresh]);

  const items=useMemo<TransactionIntelligence[]>(
    ()=>transactions
      .map(transaction=>
        deriveTransactionIntelligence(
          transaction,
          role
        )
      )
      .sort((a,b)=>
        b.priority-a.priority||
        new Date(b.transaction.updated_at).getTime()-
        new Date(a.transaction.updated_at).getTime()
      ),
    [transactions,role]
  );

  const actionable=useMemo(
    ()=>items.filter(item=>
      !item.complete&&
      item.actionOwner===role
    ),
    [items,role]
  );

  const waiting=useMemo(
    ()=>items.filter(item=>
      !item.complete&&
      item.actionOwner!==role
    ),
    [items,role]
  );

  return {
    transactions,
    items,
    actionable,
    waiting,
    loading,
    error,
    refresh
  };
}
