type BrandLogoProps = {
  compact?: boolean;
};

export function BrandLogo({ compact = false }: BrandLogoProps) {
  return (
    <div className="flex shrink-0 items-center">
      <img
        src="/voltix-logo.svg"
        alt="Voltix"
        className={compact ? "h-[34px] w-[120px] object-contain object-left" : "h-[34px] w-[120px] object-contain object-left"}
      />
    </div>
  );
}
