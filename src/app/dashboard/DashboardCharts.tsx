"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";

// ---------------------------------------------------------------------------
// Tipos de datos que recibe el componente (todos precalculados en el server)
// ---------------------------------------------------------------------------
export interface ReplyRatePoint {
  name: string;         // nombre abreviado de la campaña
  opener: number | null;
  fu1: number | null;
  fu2: number | null;
}

export interface CountPoint {
  label: string;
  count: number;
}

export interface CampaignBarPoint {
  name: string;         // nombre abreviado de la campaña
  value: number;
}

export interface CostPoint {
  name: string;
  costTotal: number;
  costPerLead: number;
}

interface Props {
  replyRateData: ReplyRatePoint[];          // chart 1
  closingReasonsData: CountPoint[];         // chart 2 (global)
  answerQualityData: CountPoint[];          // chart 3 (global)
  convDepthData: CountPoint[];             // chart 4 (global)
  statusFunnelData: CountPoint[];           // chart 5 (global)
  conversionRateData: CampaignBarPoint[];   // chart 6
  costData: CostPoint[];                    // chart 7
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function chartColor(n: 1 | 2 | 3 | 4 | 5) {
  return `hsl(var(--chart-${n}))`;
}

const GRID_COLOR = "hsl(238 15% 22% / 0.6)";
const TICK_STYLE = { fontSize: 10, fill: "hsl(235 10% 52%)" };
const tooltipStyle: React.CSSProperties = {
  backgroundColor: "hsl(238 13% 14%)",
  border: "1px solid hsl(238 15% 22%)",
  borderRadius: 8,
  fontSize: 11,
  color: "hsl(235 12% 93%)",
};

function abbrev(name: string, max = 16): string {
  return name.length > max ? name.slice(0, max - 1) + "…" : name;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.08em] mb-3">
      {children}
    </p>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/50 bg-card p-5">
      <SectionTitle>{title}</SectionTitle>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chart 1: Reply rate por campaña (barras agrupadas opener/FU1/FU2)
// ---------------------------------------------------------------------------
function ReplyRateChart({ data }: { data: ReplyRatePoint[] }) {
  if (data.length === 0) {
    return <p className="text-xs text-muted-foreground">Sin datos de LH2 aún.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} barGap={3} barCategoryGap="30%">
        <CartesianGrid vertical={false} stroke={GRID_COLOR} />
        <XAxis dataKey="name" tick={TICK_STYLE} tickLine={false} axisLine={false} />
        <YAxis
          tickFormatter={(v) => `${v}%`}
          tick={TICK_STYLE}
          tickLine={false}
          axisLine={false}
          width={32}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v) => [`${(v as number | undefined)?.toFixed(1) ?? ""}%`]}
          cursor={{ fill: "hsl(238 15% 22% / 0.4)" }}
        />
        <Legend
          iconType="circle"
          iconSize={7}
          wrapperStyle={{ fontSize: 10, color: "hsl(235 10% 52%)" }}
        />
        <Bar dataKey="opener" name="Opener" fill={chartColor(1)} radius={[3, 3, 0, 0]} />
        <Bar dataKey="fu1" name="FU1" fill={chartColor(2)} radius={[3, 3, 0, 0]} />
        <Bar dataKey="fu2" name="FU2" fill={chartColor(3)} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Chart genérico de barras horizontales (closing reasons, status funnel, etc.)
// ---------------------------------------------------------------------------
function HorizontalBarChart({
  data,
  color,
  xFormatter,
}: {
  data: CountPoint[];
  color: string;
  xFormatter?: (v: number) => string;
}) {
  if (data.length === 0) {
    return <p className="text-xs text-muted-foreground">Sin datos aún.</p>;
  }
  const height = Math.max(160, data.length * 28 + 20);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" barCategoryGap="25%">
        <CartesianGrid horizontal={false} stroke={GRID_COLOR} />
        <XAxis
          type="number"
          tick={TICK_STYLE}
          tickLine={false}
          axisLine={false}
          tickFormatter={xFormatter}
        />
        <YAxis
          type="category"
          dataKey="label"
          width={120}
          tick={{ ...TICK_STYLE, textAnchor: "end" }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          cursor={{ fill: "hsl(238 15% 22% / 0.4)" }}
          formatter={xFormatter ? (v) => [xFormatter(v as number)] : undefined}
        />
        <Bar dataKey="count" fill={color} radius={[0, 3, 3, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Chart 4: Profundidad de conversación (barras verticales, colores por nivel)
// ---------------------------------------------------------------------------
const DEPTH_COLORS = [
  chartColor(1), // responded_once
  chartColor(4), // basic_exchange
  chartColor(2), // deep_conversation
  chartColor(2), // asks_about_system
  chartColor(2), // requests_call
];

function ConvDepthChart({ data }: { data: CountPoint[] }) {
  if (data.length === 0) {
    return <p className="text-xs text-muted-foreground">Sin datos de profundidad aún.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} barCategoryGap="30%">
        <CartesianGrid vertical={false} stroke={GRID_COLOR} />
        <XAxis
          dataKey="label"
          tick={{ ...TICK_STYLE, fontSize: 9 }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis tick={TICK_STYLE} tickLine={false} axisLine={false} width={24} />
        <Tooltip
          contentStyle={tooltipStyle}
          cursor={{ fill: "hsl(238 15% 22% / 0.4)" }}
        />
        <Bar dataKey="count" radius={[3, 3, 0, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={DEPTH_COLORS[i % DEPTH_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Chart 6: Tasa de conversión por campaña (barras verticales)
// ---------------------------------------------------------------------------
function ConversionRateChart({ data }: { data: CampaignBarPoint[] }) {
  if (data.length === 0) {
    return <p className="text-xs text-muted-foreground">Sin campañas aún.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} barCategoryGap="30%">
        <CartesianGrid vertical={false} stroke={GRID_COLOR} />
        <XAxis dataKey="name" tick={TICK_STYLE} tickLine={false} axisLine={false} />
        <YAxis
          tickFormatter={(v) => `${v}%`}
          tick={TICK_STYLE}
          tickLine={false}
          axisLine={false}
          width={32}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v) => [`${(v as number | undefined)?.toFixed(1) ?? ""}%`, "Conversión"]}
          cursor={{ fill: "hsl(238 15% 22% / 0.4)" }}
        />
        <Bar dataKey="value" fill={chartColor(2)} radius={[3, 3, 0, 0]} name="Conversión" />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Chart 7: Costo por campaña (barras $total + tooltip $/lead)
// ---------------------------------------------------------------------------
function CostChart({ data }: { data: CostPoint[] }) {
  if (data.length === 0) {
    return <p className="text-xs text-muted-foreground">Sin costo registrado aún.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} barCategoryGap="30%">
        <CartesianGrid vertical={false} stroke={GRID_COLOR} />
        <XAxis dataKey="name" tick={TICK_STYLE} tickLine={false} axisLine={false} />
        <YAxis
          tickFormatter={(v) => `$${v.toFixed(2)}`}
          tick={TICK_STYLE}
          tickLine={false}
          axisLine={false}
          width={42}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          cursor={{ fill: "hsl(238 15% 22% / 0.4)" }}
          formatter={(v, name) => {
            const n = (v as number) ?? 0;
            return [
              (name as string) === "costTotal" ? `$${n.toFixed(4)}` : `$${n.toFixed(4)}/lead`,
              (name as string) === "costTotal" ? "Costo total" : "$/lead",
            ];
          }}
        />
        <Bar dataKey="costTotal" fill={chartColor(3)} radius={[3, 3, 0, 0]} name="costTotal" />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Componente principal — grid de 7 charts
// ---------------------------------------------------------------------------
export function DashboardCharts({
  replyRateData,
  closingReasonsData,
  answerQualityData,
  convDepthData,
  statusFunnelData,
  conversionRateData,
  costData,
}: Props) {
  function abbrevData<T extends { name: string }>(arr: T[]): T[] {
    return arr.map((d) => ({ ...d, name: abbrev(d.name) }));
  }

  return (
    <div className="space-y-4">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.08em]">
        Gráficas
      </p>

      {/* Fila 1: Reply rate (ancho) */}
      <ChartCard title="Reply rate por campaña (%)">
        <ReplyRateChart data={abbrevData(replyRateData)} />
      </ChartCard>

      {/* Fila 2: Conversión + Costo */}
      <div className="grid gap-4 md:grid-cols-2">
        <ChartCard title="Tasa de conversión por campaña (%)">
          <ConversionRateChart data={abbrevData(conversionRateData)} />
        </ChartCard>
        <ChartCard title="Costo de IA por campaña">
          <CostChart data={abbrevData(costData)} />
        </ChartCard>
      </div>

      {/* Fila 3: Profundidad + Calidad */}
      <div className="grid gap-4 md:grid-cols-2">
        <ChartCard title="Profundidad de conversación — distribución global">
          <ConvDepthChart data={convDepthData} />
        </ChartCard>
        <ChartCard title="Calidad de respuesta — distribución global">
          <HorizontalBarChart data={answerQualityData} color={chartColor(2)} />
        </ChartCard>
      </div>

      {/* Fila 4: Embudo de estados + Razones de cierre */}
      <div className="grid gap-4 md:grid-cols-2">
        <ChartCard title="Embudo de estados — global">
          <HorizontalBarChart data={statusFunnelData} color={chartColor(1)} />
        </ChartCard>
        <ChartCard title="Razones de cierre — global">
          <HorizontalBarChart data={closingReasonsData} color="hsl(350 70% 52%)" />
        </ChartCard>
      </div>
    </div>
  );
}
