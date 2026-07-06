const fallbackDocumentTypes = ["National ID", "Passport", "Driving Licence", "Residence Permit"];

const documentTypesByCountry: Record<string, string[]> = {
  india: ["Aadhaar Card", "PAN Card", "Voter ID", "Passport", "Driving Licence"],
  pakistan: ["CNIC / NIC", "Passport", "Driving Licence"],
  bangladesh: ["NID Card", "Passport", "Driving Licence"],
  nepal: ["Citizenship Certificate", "National ID", "Passport", "Driving Licence"],
  "united arab emirates": ["Emirates ID", "Passport", "Driving Licence"],
  uae: ["Emirates ID", "Passport", "Driving Licence"],
  "saudi arabia": ["National ID / Iqama", "Passport", "Driving Licence"],
  "united states": ["SSN Card", "State ID", "Passport", "Driving Licence"],
  usa: ["SSN Card", "State ID", "Passport", "Driving Licence"],
  "united kingdom": ["National Insurance Number", "Passport", "Driving Licence"],
  uk: ["National Insurance Number", "Passport", "Driving Licence"],
  malaysia: ["MyKad", "Passport", "Driving Licence"],
  indonesia: ["KTP", "Passport", "Driving Licence"],
  vietnam: ["Citizen ID Card", "Passport", "Driving Licence"],
  thailand: ["Thai National ID", "Passport", "Driving Licence"],
  china: ["Resident Identity Card", "Passport"],
  japan: ["My Number Card", "Residence Card", "Passport", "Driving Licence"],
  "south korea": ["Resident Registration Card", "Passport", "Driving Licence"],
};

export function getKycDocumentTypes(country: string | null | undefined) {
  const key = (country ?? "").trim().toLowerCase();
  return documentTypesByCountry[key] ?? fallbackDocumentTypes;
}
