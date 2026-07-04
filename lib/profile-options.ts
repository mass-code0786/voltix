export type SelectOption = {
  value: string;
  label: string;
  search: string;
};

const regionCodes = [
  "AF","AX","AL","DZ","AS","AD","AO","AI","AQ","AG","AR","AM","AW","AU","AT","AZ","BS","BH","BD","BB","BY","BE","BZ","BJ","BM","BT","BO","BQ","BA","BW","BV","BR","IO","BN","BG","BF","BI","CV","KH","CM","CA","KY","CF","TD","CL","CN","CX","CC","CO","KM","CG","CD","CK","CR","CI","HR","CU","CW","CY","CZ","DK","DJ","DM","DO","EC","EG","SV","GQ","ER","EE","SZ","ET","FK","FO","FJ","FI","FR","GF","PF","TF","GA","GM","GE","DE","GH","GI","GR","GL","GD","GP","GU","GT","GG","GN","GW","GY","HT","HM","VA","HN","HK","HU","IS","IN","ID","IR","IQ","IE","IM","IL","IT","JM","JP","JE","JO","KZ","KE","KI","KP","KR","KW","KG","LA","LV","LB","LS","LR","LY","LI","LT","LU","MO","MG","MW","MY","MV","ML","MT","MH","MQ","MR","MU","YT","MX","FM","MD","MC","MN","ME","MS","MA","MZ","MM","NA","NR","NP","NL","NC","NZ","NI","NE","NG","NU","NF","MK","MP","NO","OM","PK","PW","PS","PA","PG","PY","PE","PH","PN","PL","PT","PR","QA","RE","RO","RU","RW","BL","SH","KN","LC","MF","PM","VC","WS","SM","ST","SA","SN","RS","SC","SL","SG","SX","SK","SI","SB","SO","ZA","GS","SS","ES","LK","SD","SR","SJ","SE","CH","SY","TW","TJ","TZ","TH","TL","TG","TK","TO","TT","TN","TR","TM","TC","TV","UG","UA","AE","GB","US","UM","UY","UZ","VU","VE","VN","VG","VI","WF","EH","YE","ZM","ZW",
] as const;

const fallbackCountryNames: Record<string, string> = {
  AX: "Aland Islands",
  BQ: "Caribbean Netherlands",
  CD: "Congo - Kinshasa",
  CG: "Congo - Brazzaville",
  CI: "Cote d'Ivoire",
  CV: "Cape Verde",
  CZ: "Czechia",
  FK: "Falkland Islands",
  FM: "Micronesia",
  GB: "United Kingdom",
  HK: "Hong Kong",
  IR: "Iran",
  KP: "North Korea",
  KR: "South Korea",
  LA: "Laos",
  MD: "Moldova",
  MK: "North Macedonia",
  MO: "Macao",
  PS: "Palestinian Territories",
  RU: "Russia",
  SY: "Syria",
  TW: "Taiwan",
  TZ: "Tanzania",
  US: "United States",
  VA: "Vatican City",
  VE: "Venezuela",
  VN: "Vietnam",
};

function countryName(code: string) {
  try {
    const displayNames = new Intl.DisplayNames(["en"], { type: "region" });
    return displayNames.of(code) ?? fallbackCountryNames[code] ?? code;
  } catch {
    return fallbackCountryNames[code] ?? code;
  }
}

export const countryOptions: SelectOption[] = regionCodes
  .map(code => {
    const label = countryName(code);
    return { value: label, label, search: `${label} ${code}`.toLowerCase() };
  })
  .sort((a, b) => a.label.localeCompare(b.label));

export const languageOptions: SelectOption[] = [
  ["en", "English"],
  ["hi", "Hindi"],
  ["ur", "Urdu"],
  ["ar", "Arabic"],
  ["bn", "Bengali"],
  ["ne", "Nepali"],
  ["zh", "Chinese"],
  ["es", "Spanish"],
  ["fr", "French"],
  ["de", "German"],
  ["ru", "Russian"],
  ["pt", "Portuguese"],
  ["id", "Indonesian"],
  ["tr", "Turkish"],
  ["vi", "Vietnamese"],
  ["th", "Thai"],
  ["ko", "Korean"],
  ["ja", "Japanese"],
].map(([value, label]) => ({ value, label, search: `${label} ${value}`.toLowerCase() }));

export function normalizeLanguage(value?: string | null) {
  const clean = value?.trim().toLowerCase();
  return languageOptions.some(option => option.value === clean) ? clean! : "en";
}

