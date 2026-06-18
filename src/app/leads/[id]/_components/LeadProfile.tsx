import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

type Props = {
  fullName: string | null;
  headline: string | null;
  currentPosition: string | null;
  currentCompany: string | null;
  locationName: string | null;
  csCity: string | null;
  csCountry: string | null;
  csGroup: string | null;
  summary: string | null;
  website: string | null;
  profileUrl: string | null;
  leadStatus: string;
};

export function LeadProfile({
  fullName,
  headline,
  currentPosition,
  currentCompany,
  locationName,
  csCity,
  csCountry,
  csGroup,
  summary,
  website,
  profileUrl,
  leadStatus,
}: Props) {
  const location = locationName ?? [csCity, csCountry].filter(Boolean).join(", ");

  return (
    <aside className="space-y-4">
      {/* Nombre y estado */}
      <div>
        <h2 className="text-lg font-semibold leading-tight">
          {fullName ?? "Sin nombre"}
        </h2>
        {headline && (
          <p className="text-sm text-muted-foreground mt-0.5">{headline}</p>
        )}
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge variant="outline" className="text-xs">
            {leadStatus}
          </Badge>
          {csGroup && (
            <Badge variant="secondary" className="text-xs">
              Grupo {csGroup}
            </Badge>
          )}
        </div>
      </div>

      <Separator />

      {/* Datos de trabajo */}
      <dl className="space-y-2 text-sm">
        {(currentPosition || currentCompany) && (
          <div>
            <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Cargo
            </dt>
            <dd className="mt-0.5">
              {[currentPosition, currentCompany].filter(Boolean).join(" · ")}
            </dd>
          </div>
        )}
        {location && (
          <div>
            <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Ubicación
            </dt>
            <dd className="mt-0.5">{location}</dd>
          </div>
        )}
        {profileUrl && (
          <div>
            <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              LinkedIn
            </dt>
            <dd className="mt-0.5">
              <a
                href={profileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline break-all"
              >
                Ver perfil ↗
              </a>
            </dd>
          </div>
        )}
        {website && (
          <div>
            <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Web
            </dt>
            <dd className="mt-0.5">
              <a
                href={website.startsWith("http") ? website : `https://${website}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline break-all"
              >
                {website}
              </a>
            </dd>
          </div>
        )}
      </dl>

      {/* Summary de LinkedIn */}
      {summary && (
        <>
          <Separator />
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
              Summary
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
              {summary.length > 600 ? summary.slice(0, 600) + "…" : summary}
            </p>
          </div>
        </>
      )}
    </aside>
  );
}
