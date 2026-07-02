type BrandLogoProps = {
  compact?: boolean;
};

export function BrandLogo({ compact = false }: BrandLogoProps) {
  return (
    <div className="flex shrink-0 items-center">
      <img
        src="/voltix-logo.svg"
        alt="Voltix"
        className={compact ? "h-7 w-auto object-contain" : "h-9 w-auto object-contain"}
      />
    </div>
  );
}
