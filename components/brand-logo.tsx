type BrandLogoProps = {
  compact?: boolean;
};

export function BrandLogo({ compact = false }: BrandLogoProps) {
  return (
    <span className={`flex ${compact ? "h-[34px]" : "h-10"} w-fit shrink-0 items-center justify-start`}>
      <img src="/logo.png" alt="VOLTIX" className={`${compact ? "h-[28px]" : "h-[34px]"} block w-auto object-contain opacity-100 mix-blend-normal filter-none transform-none`} />
    </span>
  );
}
