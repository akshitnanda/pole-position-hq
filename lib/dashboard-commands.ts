export type DashboardCommand = {
  id: string;
  label: string;
  detail: string;
  category: "Workspace" | "Driver" | "Theme" | "Action" | "Brief";
  keywords?: string;
  current?: boolean;
  disabled?: boolean;
  run: () => void;
};

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

export function searchDashboardCommands(commands: DashboardCommand[], query: string) {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  return commands.filter((command) => {
    const text = normalize(`${command.label} ${command.detail} ${command.category} ${command.keywords ?? ""}`);
    return terms.every((term) => text.includes(term));
  }).sort((a, b) => {
    if (!terms.length) return 0;
    const needle = terms.join(" ");
    return Number(normalize(b.label).startsWith(needle)) - Number(normalize(a.label).startsWith(needle));
  });
}
