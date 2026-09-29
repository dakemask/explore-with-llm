// Preserve UTF-16 source offsets so selections after formulae still map exactly.
// Keep fenced and inline code literal.
export function normalizeMath(text: string) {
  return text
    .split(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g)
    .map((part, index) =>
      index % 2
        ? part
        : part
            .replace(/\\\[/g, () => "$$")
            .replace(/\\\]/g, () => "$$")
            .replace(/\\\(/g, () => "$ ")
            .replace(/\\\)/g, () => " $"),
    )
    .join("");
}
