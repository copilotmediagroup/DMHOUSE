export type ExecutiveTone='default'|'warning'|'danger'|'success';
export type ExecutiveDrillDownRow={id:string;title:string;detail:string;meta?:string;value?:string;path:string;tone?:ExecutiveTone};
export type ExecutiveDrillDown={id:string;title:string;eyebrow:string;summary:string;emptyText:string;rows:ExecutiveDrillDownRow[]};
export type ExecutiveMetric={id:string;label:string;value:string;detail:string;path:string;tone?:ExecutiveTone;drillDown?:ExecutiveDrillDown};
export type ExecutiveQueueItem={id:string;title:string;detail:string;meta:string;path:string;tone?:ExecutiveTone};
export type ExecutiveActivity={id:string;title:string;detail:string;occurredAt:string;path:string};
export type ForecastStage={label:string;count:number;value:number;weightedValue:number};
