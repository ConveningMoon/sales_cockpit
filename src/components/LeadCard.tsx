import Link from "next/link";
import { Badge } from "@/components/ui/badge";

type Props = {
  id: string;
  fullName: string | null;
  currentCompany: string | null;
  currentPosition: string | null;
  csCity: string | null;
  csCountry: string | null;
  lastActivity: string | null;
  awaiting: boolean;
  fragment?: string;
};

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

export function LeadCard({
  id,
  fullName,
  currentCompany,
  currentPosition,
  csCity,
  csCountry,
  lastActivity,
  awaiting,
  fragment,
}: Props) {
  const subtitle = [currentPosition, currentCompany].filter(Boolean).join(" · ");
  const location = [csCity, csCountry].filter(Boolean).join(", ");

  return (
    <Link href={`/leads/${id}`} className="block">
      <div className="flex items-start justify-between gap-3 rounded-lg border bg-card px-4 py-3 hover:bg-accent/40 transition-colors">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm truncate">
              {fullName ?? "Sin nombre"}
            </span>
            {awaiting && (
              <Badge variant="default" className="text-xs shrink-0">
                Por responder
              </Badge>
            )}
          </div>

          {subtitle && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {subtitle}
            </p>
          )}

          {fragment && awaiting ? (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2 italic">
              &ldquo;{fragment}&rdquo;
            </p>
          ) : location ? (
            <p className="text-xs text-muted-foreground mt-0.5">{location}</p>
          ) : null}
        </div>

        <span className="text-xs text-muted-foreground shrink-0 mt-0.5">
          {timeAgo(lastActivity)}
        </span>
      </div>
    </Link>
  );
}
