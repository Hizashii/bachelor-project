type StepHeadingProps = { number: string; title: string; hint: string };

export function StepHeading({ number, title, hint }: StepHeadingProps) {
  return (
    <div className="step-heading">
      <span className="step-number">{number}</span>
      <h2>{title}</h2>
      <span className="step-hint">{hint}</span>
    </div>
  );
}
