export default function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h2 className="text-xl font-semibold text-stone-900">{title}</h2>
      <p className="mt-1 text-sm text-stone-600">{description}</p>
    </div>
  );
}
