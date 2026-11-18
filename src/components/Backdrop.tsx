/**
 * Fundo animado leve: manchas de luz em gradiente (sem filtro de desfoque) e uma grade
 * que deriva devagar. Só anima `transform`, que a GPU compõe sem repintar o canvas 3D.
 */
export default function Backdrop({ accent = "#a78bfa" }: { accent?: string }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="bg-blob bg-blob-1 absolute -top-[30vmax] -left-[25vmax] h-[80vmax] w-[80vmax] rounded-full"
        style={{ background: `radial-gradient(closest-side, ${accent}38, transparent)` }}
      />
      <div
        className="bg-blob bg-blob-2 absolute -right-[25vmax] -bottom-[35vmax] h-[75vmax] w-[75vmax] rounded-full"
        style={{ background: "radial-gradient(closest-side, #6366f12e, transparent)" }}
      />
      <div
        className="bg-blob bg-blob-3 absolute top-[30%] left-[45%] h-[45vmax] w-[45vmax] rounded-full"
        style={{ background: "radial-gradient(closest-side, #22d3ee14, transparent)" }}
      />
      <div className="grid-drift absolute -inset-[48px] opacity-[0.07]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,#06060a_100%)]" />
    </div>
  );
}
