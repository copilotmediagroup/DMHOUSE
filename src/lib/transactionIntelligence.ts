export type StaffRole='owner'|'employee';

export type StaffTransaction={
  room_id:string;
  buyer_id:string;
  buyer_user_id:string|null;
  buyer_name:string;
  buyer_company:string;
  buyer_email:string;

  portfolio_id:string;
  portfolio_name:string;
  asking_price:number;
  account_count:number;

  status:string;
  agreement_approved_at:string|null;
  payment_confirmed_at:string|null;
  final_file_released_at:string|null;
  closed_at:string|null;
  created_at:string;
  updated_at:string;

  nda_document_id:string|null;
  nda_status:string|null;
  nda_sent_at:string|null;
  nda_buyer_signed_at:string|null;

  purchase_document_id:string|null;
  purchase_status:string|null;
  purchase_sent_at:string|null;
  purchase_buyer_signed_at:string|null;

  employee_id:string|null;
  unmasked_uploaded:boolean;
};

export type TransactionAction=
  |'waiting_buyer_nda'
  |'send_purchase_agreement'
  |'waiting_buyer_purchase'
  |'upload_final_file'
  |'confirm_payment'
  |'waiting_owner'
  |'system_release'
  |'complete';

export type TransactionIntelligence={
  transaction:StaffTransaction;

  stage:
    |'nda'
    |'purchase_agreement'
    |'payment'
    |'release'
    |'complete';

  stageLabel:string;

  action:TransactionAction;

  actionOwner:'buyer'|'employee'|'owner'|'system'|'none';

  headline:string;
  detail:string;
  buttonLabel:string|null;

  priority:number;

  complete:boolean;
};

export function deriveTransactionIntelligence(
  transaction:StaffTransaction,
  viewerRole:StaffRole
):TransactionIntelligence{
  const ndaSigned=
    transaction.nda_status==='fully_executed';

  const purchaseSent=
    transaction.purchase_status==='sent_to_buyer'||
    transaction.purchase_status==='seller_signed'||
    transaction.purchase_status==='fully_executed';

  const purchaseSigned=
    transaction.purchase_status==='fully_executed';

  const paymentConfirmed=
    Boolean(transaction.payment_confirmed_at);

  const released=
    Boolean(transaction.final_file_released_at);

  if(released){
    return {
      transaction,
      stage:'complete',
      stageLabel:'Complete',
      action:'complete',
      actionOwner:'none',
      headline:'Transaction complete',
      detail:'Payment is confirmed and the buyer has access to the final portfolio.',
      buttonLabel:'Open Transaction',
      priority:0,
      complete:true
    };
  }

  if(paymentConfirmed){
    return {
      transaction,
      stage:'release',
      stageLabel:'Final Release',
      action:'system_release',
      actionOwner:'system',
      headline:'Final release processing',
      detail:'Payment is confirmed. DMHOUSE is responsible for releasing the final portfolio.',
      buttonLabel:'Open Transaction',
      priority:96,
      complete:false
    };
  }

  if(purchaseSigned){
    if(!transaction.unmasked_uploaded){
      if(viewerRole==='owner'){
        return {
          transaction,
          stage:'payment',
          stageLabel:'Ready for Closing',
          action:'upload_final_file',
          actionOwner:'owner',
          headline:'Upload final portfolio',
          detail:'The Purchase Agreement is signed. Upload the unmasked file before confirming payment.',
          buttonLabel:'Open Transaction',
          priority:100,
          complete:false
        };
      }

      return {
        transaction,
        stage:'payment',
        stageLabel:'Waiting on Owner',
        action:'waiting_owner',
        actionOwner:'owner',
        headline:'Waiting for Owner',
        detail:'The Purchase Agreement is signed. The Owner must prepare the final portfolio and confirm payment.',
        buttonLabel:'Open Transaction',
        priority:55,
        complete:false
      };
    }

    if(viewerRole==='owner'){
      return {
        transaction,
        stage:'payment',
        stageLabel:'Payment Confirmation',
        action:'confirm_payment',
        actionOwner:'owner',
        headline:'Confirm payment',
        detail:'The signed agreement and final file are ready. Confirm cleared funds to trigger automatic release.',
        buttonLabel:'Open Transaction',
        priority:110,
        complete:false
      };
    }

    return {
      transaction,
      stage:'payment',
      stageLabel:'Waiting on Owner',
      action:'waiting_owner',
      actionOwner:'owner',
      headline:'Waiting for Owner',
      detail:'The Purchase Agreement is signed. The Owner must confirm cleared payment. Employees cannot release the final file.',
      buttonLabel:'Open Transaction',
      priority:60,
      complete:false
    };
  }

  if(purchaseSent){
    return {
      transaction,
      stage:'purchase_agreement',
      stageLabel:'Purchase Agreement Sent',
      action:'waiting_buyer_purchase',
      actionOwner:'buyer',
      headline:'Waiting for buyer signature',
      detail:'The Purchase Agreement has been sent and is waiting for the buyer to sign.',
      buttonLabel:'Open Transaction',
      priority:65,
      complete:false
    };
  }

  if(ndaSigned){
    if(viewerRole==='employee'){
      return {
        transaction,
        stage:'purchase_agreement',
        stageLabel:'NDA Signed',
        action:'send_purchase_agreement',
        actionOwner:'employee',
        headline:'Send Purchase Agreement',
        detail:'The buyer signed the NDA. Move this transaction to the Purchase Agreement now.',
        buttonLabel:'Continue Transaction',
        priority:105,
        complete:false
      };
    }

    return {
      transaction,
      stage:'purchase_agreement',
      stageLabel:'NDA Signed',
      action:'send_purchase_agreement',
      actionOwner:'employee',
      headline:'Employee action required',
      detail:'The NDA is signed. The assigned employee must send the Purchase Agreement.',
      buttonLabel:'Open Transaction',
      priority:70,
      complete:false
    };
  }

  return {
    transaction,
    stage:'nda',
    stageLabel:'NDA Sent',
    action:'waiting_buyer_nda',
    actionOwner:'buyer',
    headline:'Waiting for buyer',
    detail:'The NDA has been sent and is waiting for the buyer to sign.',
    buttonLabel:'Open Transaction',
    priority:50,
    complete:false
  };
}

export function transactionPath(
  role:StaffRole,
  roomId?:string
){
  const base=
    role==='employee'
      ?'/employee/transactions'
      :'/transactions';

  return roomId
    ?`${base}?room=${encodeURIComponent(roomId)}`
    :base;
}
