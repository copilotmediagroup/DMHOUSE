import type { Decision, Metric, Portfolio } from '../types/domain';
export const activePortfolio:Portfolio={id:'p1',name:'SmartPay Leasing',creditor:'SmartPay',accountCount:7327,faceValue:1812400,askingPrice:12500,status:'active',daysActive:4,highestOffer:11000};
export const metrics:Metric[]=[
 {label:'Agencies contacted',value:'86',hint:'+18 today'},
 {label:'Decision-makers',value:'31',hint:'36% reach rate'},
 {label:'Samples sent',value:'14',hint:'5 follow-ups due'},
 {label:'Active negotiations',value:'3',hint:'1 needs decision'}
];
export const decisions:Decision[]=[
 {id:'d1',type:'counter',title:'Buyer counter received',subtitle:'ABC Recovery · Sarah M.',amount:11000,urgency:'high'},
 {id:'d2',type:'reservation',title:'Reservation expires tomorrow',subtitle:'Vertex Collections · Michael R.',amount:11750,urgency:'normal'}
];
