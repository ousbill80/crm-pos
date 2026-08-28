/** Logo typographique identique à la boutique en ligne (MAJOR / AUTO PARTS). */
export function MajorBrandMark({
  variant = 'ticket',
}: {
  variant?: 'ticket' | 'doc';
}) {
  return (
    <div
      className={`major-brand-mark major-brand-mark--${variant}`}
      aria-label="MAJOR AUTO PARTS"
    >
      <span className="brand-major">MAJOR</span>
      <span className="brand-auto">AUTO PARTS</span>
    </div>
  );
}
