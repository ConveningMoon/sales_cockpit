import Link from "next/link";
import { statusBadgeClass, statusLabel, formatActivityDate } from "@/lib/ui-helpers";

type Props = {
  id: string;
  fullName: string | null;
  currentCompany: string | null;
  currentPosition: string | null;
  csCity: string | null;
  csCountry: string | null;
  leadStatus: string;
  batchName?: string | null;
  lastActivity: string | null;
  awaiting: boolean;
  fragment?: string;
};

export function LeadCard({
  id,
  fullName,
  currentCompany,
  currentPosition,
  csCity,
  csCountry,
  leadStatus,
  batchName,
  lastActivity,
  awaiting,
  fragment,
}: Props) {
  const subtitle = [currentPosition, currentCompany].filter(Boolean).join(" · ");
  const location = [csCity, csCountry].filter(Boolean).join(", ");

  return (
    <Link href={`/leads/${id}`} className="block">
      <div
        className={[
          "relative flex items-start justify-between gap-3",
          "rounded-xl border bg-card px-4 py-3.5",
          "shadow-[0_1px_4px_hsl(238_16%_4%/0.45)]",
          "transition-all duration-150",
          "hover:bg-accent/25 hover:shadow-[0_2px_10px_hsl(238_16%_4%/0.65)]",
          awaiting
            ? "border-primary/30 hover:border-primary/45"
            : "border-border hover:border-border/70",
        ].join(" ")}
      >
        {/* Barra de acento izquierda para leads esperando respuesta */}
        {awaiting && (
          <div
            className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full"
            style={{ background: "var(--gradient-brand)" }}
          />
        )}

        <div className="min-w-0 flex-1 pl-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-foreground truncate">
              {fullName ?? "Sin nombre"}
            </span>
            {/* Badge de estado */}
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${statusBadgeClass(leadStatus)}`}>
              {statusLabel(leadStatus)}
            </span>
            {awaiting && (
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 tracking-wide"
                style={{
                  background: "var(--gradient-brand)",
                  color: "hsl(248 20% 8%)",
                }}
              >
                Por responder
              </span>
            )}
          </div>

          {subtitle && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {subtitle}
            </p>
          )}

          {fragment && awaiting ? (
            <p className="text-xs text-muted-foreground/75 mt-1.5 line-clamp-2 italic leading-relaxed">
              &ldquo;{fragment}&rdquo;
            </p>
          ) : location ? (
            <p className="text-xs text-muted-foreground/65 mt-0.5">{location}</p>
          ) : null}
          {batchName && (
            <p className="text-[10px] text-muted-foreground/50 mt-0.5 truncate">{batchName}</p>
          )}
        </div>

        <span className="text-[11px] text-muted-foreground/55 shrink-0 mt-0.5 whitespace-nowrap">
          {formatActivityDate(lastActivity)}
        </span>
      </div>
    </Link>
  );
}
