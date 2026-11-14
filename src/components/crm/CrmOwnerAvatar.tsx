import { initials } from "./crm-format";

export function OwnerAvatar({ name }: { name: string | null }) {
  if (!name) {
    return (
      <span
        title="Sem responsável"
        className="h-6 w-6 shrink-0 rounded-full border border-dashed border-crm-line-strong text-[10px] text-crm-faint flex items-center justify-center"
      >
        ?
      </span>
    );
  }
  return (
    <span
      title={`Responsável: ${name}`}
      className="h-6 w-6 shrink-0 rounded-full bg-crm-ink text-[10px] font-semibold text-crm-on-ink flex items-center justify-center"
    >
      {initials(name)}
    </span>
  );
}
