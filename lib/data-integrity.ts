type DriverIdentity = {
  permanentNumber?: string | number | null;
  abbreviation?: string | null;
  fullName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
};

type DriverCandidate = {
  driver_number: number;
  name_acronym: string;
  full_name: string;
  first_name: string;
  last_name: string;
};

const CONSTRUCTOR_ALIASES = new Map<string, string>([
  ["mclaren", "McLaren"],
  ["mclaren formula 1 team", "McLaren"],
  ["scuderia ferrari", "Ferrari"],
  ["scuderia ferrari hp", "Ferrari"],
  ["ferrari", "Ferrari"],
  ["mercedes", "Mercedes"],
  ["mercedes amg petronas", "Mercedes"],
  ["mercedes amg petronas formula one team", "Mercedes"],
  ["red bull racing", "Red Bull Racing"],
  ["oracle red bull racing", "Red Bull Racing"],
  ["williams", "Williams"],
  ["williams racing", "Williams"],
  ["atlassian williams f1 team", "Williams"],
  ["aston martin", "Aston Martin"],
  ["aston martin aramco", "Aston Martin"],
  ["alpine", "Alpine"],
  ["alpine f1 team", "Alpine"],
  ["bwt alpine f1 team", "Alpine"],
  ["haas", "Haas F1 Team"],
  ["haas f1 team", "Haas F1 Team"],
  ["moneygram haas f1 team", "Haas F1 Team"],
  ["racing bulls", "Racing Bulls"],
  ["visa cash app racing bulls", "Racing Bulls"],
  ["visa cash app rb", "Racing Bulls"],
  ["audi", "Audi"],
  ["audi f1 team", "Audi"],
  ["kick sauber", "Audi"],
  ["stake f1 team kick sauber", "Audi"],
  ["cadillac", "Cadillac"],
  ["cadillac formula 1 team", "Cadillac"],
  ["cadillac f1 team", "Cadillac"],
]);

function normalizeText(value: string | number | null | undefined) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function nameCase(value: string | null | undefined) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return "";
  }

  const source = trimmed === trimmed.toUpperCase() ? trimmed.toLowerCase() : trimmed;
  return source.replace(/(^|[\s'-])([a-z\u00c0-\u024f])/g, (_, prefix: string, letter: string) =>
    `${prefix}${letter.toUpperCase()}`,
  );
}

export function canonicalizeConstructorName(value: string | null | undefined) {
  return CONSTRUCTOR_ALIASES.get(normalizeText(value)) ?? null;
}

export function formatDriverName(identity: DriverIdentity) {
  const firstName = nameCase(identity.firstName);
  const lastName = nameCase(identity.lastName);
  const assembled = `${firstName} ${lastName}`.trim();
  return assembled || nameCase(identity.fullName) || "Driver unavailable";
}

export function findDriverMatch<T extends DriverCandidate>(
  identity: DriverIdentity,
  candidates: T[],
) {
  const number = normalizeText(identity.permanentNumber);
  const abbreviation = normalizeText(identity.abbreviation);
  const fullName = normalizeText(identity.fullName);
  const assembledName = normalizeText(`${identity.firstName ?? ""} ${identity.lastName ?? ""}`);

  let bestCandidate: T | undefined;
  let bestScore = 0;
  for (const candidate of candidates) {
    let score = 0;
    if (number && number !== "0" && normalizeText(candidate.driver_number) === number) {
      score = 100;
    } else if (abbreviation && normalizeText(candidate.name_acronym) === abbreviation) {
      score = 80;
    } else if (fullName && normalizeText(candidate.full_name) === fullName) {
      score = 70;
    } else if (
      assembledName &&
      normalizeText(`${candidate.first_name} ${candidate.last_name}`) === assembledName
    ) {
      score = 60;
    }

    if (score > bestScore) {
      bestCandidate = candidate;
      bestScore = score;
    }
  }

  return bestCandidate;
}
