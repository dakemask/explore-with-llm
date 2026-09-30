import type { ParameterState, Provider, Settings } from "./types";
import { effectiveParameters, parseParameters } from "./parameters";
export const blankProvider: Provider = {
  id: "",
  name: "",
  baseUrl: "",
  key: "",
  model: "",
  remember: true,
  protocol: "chat-completions",
  models: [],
};
export function resolveModel(
  settings: Settings,
  id = settings.selected,
  state?: ParameterState,
): Provider | undefined {
  for (const p of settings.providers) {
    const model = p.models?.find((m) => m.id === id);
    if (model)
      return {
        ...p,
        id: model.id,
        model: model.model,
        models: undefined,
        customParameters: model.customParameters,
        parameterState: state,
        supportsEncryptedReasoning: model.supportsEncryptedReasoning,
      };
  }
}
export function allModels(settings: Settings) {
  return settings.providers.flatMap((p) =>
    (p.models ?? []).map((m) => ({ ...m, provider: p })),
  );
}
export function normalizeSettings(s: Settings): Settings {
  // Old configurations are deliberately not migrated.
  const providers = s.providers.filter((p) => Array.isArray(p.models));
  const next = { ...s, providers };
  if (!resolveModel(next)) next.selected = "";
  return next;
}
export function reconcileState(
  old: Provider | undefined,
  next: Provider,
  state: ParameterState = {},
): ParameterState {
  if (
    old &&
    (old.protocol !== next.protocol ||
      old.parameterRevision !== next.parameterRevision)
  )
    return {};
  const parameters = parseParameters(next.customParameters ?? ""),
    previous = parseParameters(old?.customParameters ?? "");
  const retained = { ...state };
  for (const p of parameters)
    if (previous.find((q) => q.id === p.id)?.type !== p.type)
      delete retained[p.id];
  const effective = effectiveParameters(parameters, retained);
  return Object.fromEntries(
    parameters
      .filter((p) => effective.adjustable[p.id])
      .map((p) => [p.id, effective.state[p.id]]),
  );
}
