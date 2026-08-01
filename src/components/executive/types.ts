export type ExecutiveMetric={label:string;value:string;detail:string;path:string;tone?:'default'|'warning'|'danger'|'success'};
export type ExecutiveQueueItem={id:string;title:string;detail:string;meta:string;path:string;tone?:'default'|'warning'|'danger'|'success'};
export type ExecutiveActivity={id:string;title:string;detail:string;occurredAt:string;path:string};
export type ForecastStage={label:string;count:number;value:number;weightedValue:number};
