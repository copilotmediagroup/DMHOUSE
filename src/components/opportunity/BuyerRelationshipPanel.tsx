import { Card } from '../../components/Primitives';

export default function BuyerRelationshipPanel() {
  return (
    <Card className="p-6">
      <div className="space-y-6">
        <div>
          <p className="text-sm font-semibold text-blue-600">
            Buyer Relationship Intelligence · v2.3.0
          </p>

          <h2 className="mt-2 text-2xl font-semibold">
            Buyer 360
          </h2>

          <p className="mt-2 text-slate-500">
            This engine will become the single source of truth for buyer
            intelligence across the Sales OS.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Metric title="Health Score" value="--" />
          <Metric title="Lifetime Revenue" value="$0" />
          <Metric title="Purchases" value="0" />
          <Metric title="Win Rate" value="0%" />
          <Metric title="Response Rate" value="0%" />
          <Metric title="Avg Deal Size" value="$0" />
          <Metric title="Buyer Risk" value="Unknown" />
          <Metric title="Next Action" value="No recommendation yet" />
        </div>
      </div>
    </Card>
  );
}

function Metric({
  title,
  value,
}: {
  title: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <p className="text-xs text-slate-500">
        {title}
      </p>

      <p className="mt-2 text-xl font-semibold">
        {value}
      </p>
    </div>
  );
}
