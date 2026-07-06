// ============================================================================
// Integration registry — modular extension point.
//
// Future integrations (קופת אביב / POS, בנק, WhatsApp, דיוור) each register
// here as a SELF-CONTAINED module. Core screens never import an integration
// directly; they only read from this registry. Adding an integration = adding
// one file that calls registerIntegration(...) — no change to core code.
// ============================================================================

export type IntegrationKind = "pos" | "bank" | "messaging" | "mail" | "accounting";

export interface Integration {
  id: string;
  name: string;
  kind: IntegrationKind;
  description: string;
  /** Pull data INTO the system (e.g. daily Z from the POS). Optional. */
  importDaily?: (dateISO: string) => Promise<Partial<import("../domain/types").DailyEntry>>;
  /** Push data OUT (e.g. send the daily Z report by mail). Optional. */
  send?: (payload: unknown) => Promise<void>;
  enabled: boolean;
}

const registry = new Map<string, Integration>();

export function registerIntegration(i: Integration) {
  registry.set(i.id, i);
}

export function listIntegrations(): Integration[] {
  return [...registry.values()];
}

export function getIntegration(id: string): Integration | undefined {
  return registry.get(id);
}

// No integrations are registered yet — planned:
//   pos-aviv (import daily Z), bank-feed (deposits), mail-z-report, whatsapp.
