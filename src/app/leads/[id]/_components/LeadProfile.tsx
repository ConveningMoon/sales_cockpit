import { Separator } from "@/components/ui/separator";
import { groupBadgeClass } from "@/lib/ui-helpers";
import { StatusSelector } from "./StatusSelector";
import { LeadTracking } from "./LeadTracking";
import { LeadCost } from "./LeadCost";
import { LeadNotes } from "./LeadNotes";

type Props = {
  leadId: string;
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
  closingReason: string | null;
  answerQuality: string | null;
  notes: string | null;
  batchName: string | null;
  costTotal: number;
  costByStage: { taskType: string; cost: number }[];
};

export function LeadProfile({
  leadId,
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
  closingReason,
  answerQuality,
  notes,
  batchName,
  costTotal,
  costByStage,
}: Props) {
  const location = locationName ?? [csCity, csCountry].filter(Boolean).join(", ");

  return (
    <aside className="space-y-5">
      {/* Nombre, headline y control de estado */}
      <div>
        <h2 className="text-[1.25rem] font-semibold leading-tight tracking-tight text-foreground">
          {fullName ?? "Sin nombre"}
        </h2>
        {headline && (
          <p className="text-sm text-muted-foreground mt-1 leading-snug">
            {headline}
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {/* Control de estado: badge semántico + select agrupado */}
          <StatusSelector leadId={leadId} currentStatus={leadStatus} />
          {csGroup && (
            <span
              className={`text-[11px] font-medium px-2 py-0.5 rounded-md ${groupBadgeClass(csGroup)}`}
            >
              Grupo {csGroup}
            </span>
          )}
          {batchName && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-muted/60 text-muted-foreground border border-border/40">
              {batchName}
            </span>
          )}
        </div>
      </div>

      <Separator className="opacity-40" />

      {/* Datos de trabajo */}
      <dl className="space-y-3.5 text-sm">
        {(currentPosition || currentCompany) && (
          <div>
            <dt className="text-[10px] font-medium text-muted-foreground uppercase tracking-[0.08em] mb-0.5">
              Cargo
            </dt>
            <dd className="text-foreground/90 leading-snug">
              {[currentPosition, currentCompany].filter(Boolean).join(" · ")}
            </dd>
          </div>
        )}
        {location && (
          <div>
            <dt className="text-[10px] font-medium text-muted-foreground uppercase tracking-[0.08em] mb-0.5">
              Ubicación
            </dt>
            <dd className="text-foreground/90">{location}</dd>
          </div>
        )}
        {profileUrl && (
          <div>
            <dt className="text-[10px] font-medium text-muted-foreground uppercase tracking-[0.08em] mb-0.5">
              LinkedIn
            </dt>
            <dd>
              <a
                href={profileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:text-primary/80 hover:underline underline-offset-2 transition-colors break-all text-sm"
              >
                Ver perfil ↗
              </a>
            </dd>
          </div>
        )}
        {website && (
          <div>
            <dt className="text-[10px] font-medium text-muted-foreground uppercase tracking-[0.08em] mb-0.5">
              Web
            </dt>
            <dd>
              <a
                href={website.startsWith("http") ? website : `https://${website}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:text-primary/80 hover:underline underline-offset-2 transition-colors break-all text-sm"
              >
                {website}
              </a>
            </dd>
          </div>
        )}
      </dl>

      <Separator className="opacity-40" />

      {/* Tracking manual (cero tokens) */}
      <LeadTracking
        leadId={leadId}
        currentClosingReason={closingReason}
        currentAnswerQuality={answerQuality}
      />

      <Separator className="opacity-40" />

      {/* Costo de IA atribuido a este lead */}
      <LeadCost total={costTotal} byStage={costByStage} />

      <Separator className="opacity-40" />

      {/* Notas internas */}
      <LeadNotes leadId={leadId} initialNotes={notes} />

      {/* Summary de LinkedIn */}
      {summary && (
        <>
          <Separator className="opacity-40" />
          <div>
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-[0.08em] mb-2">
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
