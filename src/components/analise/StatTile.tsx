type StatTileProps = {
  label: string;
  value: string;
};

export default function StatTile({ label, value }: StatTileProps) {
  return (
    <div className="rounded-2xl border border-navy-700/10 bg-white px-6 py-5">
      <p className="text-[11px] tracking-[0.14em] uppercase text-navy-500">{label}</p>
      <p className="mt-2 font-serif text-3xl text-navy-950">{value}</p>
    </div>
  );
}
