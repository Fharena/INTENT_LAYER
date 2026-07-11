import type { IntentToken, IntentTokenCategory } from "./types";

export interface TailwindSemanticCandidate {
  value: string;
  token: string;
}

export interface TailwindSemanticToken {
  property: string;
  value: string;
  token: string;
  variant: string | null;
  candidates: TailwindSemanticCandidate[];
}

const spacingPattern =
  /^-?(?:p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|gap|gap-x|gap-y)-[\w.[\]/%()!-]+$/;
const radiusPattern = /^rounded(?:-[trbl]{1,2})?(?:-[\w.[\]/%-]+)?$/;
const sizingPattern = /^(?:w|h|min-w|min-h|max-w|max-h|size)-[\w.[\]/%()!-]+$/;
const displayPattern = /^(?:flex|grid|block|inline|inline-block|inline-flex|hidden)$/;
const layoutPattern =
  /^(?:grid-cols-\d+|flex-(?:1|auto|initial|none|row|row-reverse|col|col-reverse|wrap|wrap-reverse|nowrap)|items-[\w-]+|justify-[\w-]+|content-[\w-]+|self-[\w-]+)$/;
const typographyPattern =
  /^(?:text-(?:xs|sm|base|lg|xl|[2-9]xl)|font-[\w-]+|leading-[\w.[\]/%-]+)$/;
const effectPattern =
  /^(?:shadow(?:-(?:none|sm|md|lg|xl|2xl|inner))?|opacity-\d+|ring(?:-(?:0|1|2|4|8))?|transition(?:-(?:none|all|colors|opacity|shadow|transform))?)$/;
const colorPattern =
  /^(?:bg|text|border(?:-[trblxy])?|divide-[xy]|ring|ring-offset|outline|decoration|accent|caret|fill|stroke|shadow)-[\w/.[\]-]+$/;

const spacingValues = [
  "0",
  "px",
  "0.5",
  "1",
  "1.5",
  "2",
  "2.5",
  "3",
  "3.5",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "11",
  "12",
  "14",
  "16",
  "20",
  "24",
  "28",
  "32",
  "36",
  "40",
  "44",
  "48",
  "52",
  "56",
  "60",
  "64",
  "72",
  "80",
  "96"
];
const sizingValues = [...spacingValues, "auto", "1/2", "1/3", "2/3", "1/4", "3/4", "full", "screen", "min", "max", "fit"];
const radiusValues = ["none", "sm", "md", "lg", "xl", "2xl", "3xl", "full"];
const textSizeValues = ["xs", "sm", "base", "lg", "xl", "2xl", "3xl", "4xl", "5xl", "6xl", "7xl", "8xl", "9xl"];
const fontWeightValues = ["thin", "extralight", "light", "normal", "medium", "semibold", "bold", "extrabold", "black"];
const leadingValues = ["none", "tight", "snug", "normal", "relaxed", "loose", "3", "4", "5", "6", "7", "8", "9", "10"];
const opacityValues = ["0", "5", "10", "15", "20", "25", "30", "40", "50", "60", "70", "75", "80", "90", "95", "100"];
const colorFamilies = [
  "slate",
  "gray",
  "zinc",
  "neutral",
  "stone",
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "emerald",
  "teal",
  "cyan",
  "sky",
  "blue",
  "indigo",
  "violet",
  "purple",
  "fuchsia",
  "pink",
  "rose"
];
const colorShades = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"];
const semanticColors = ["transparent", "current", "inherit", "white", "black"];
const tokenCategoryCache = new Map<string, IntentTokenCategory | null>();
const classNameTokenCache = new Map<string, IntentToken[]>();
const maxClassNameTokenCacheSize = 1000;

function splitVariant(token: string): { variantPrefix: string; base: string } {
  const parts = token.split(":");
  return parts.length === 1
    ? { variantPrefix: "", base: token }
    : { variantPrefix: `${parts.slice(0, -1).join(":")}:`, base: parts[parts.length - 1] ?? token };
}

function withVariant(originalToken: string, nextBase: string): string {
  return `${splitVariant(originalToken).variantPrefix}${nextBase}`;
}

function uniqueCandidates(token: string, bases: string[]): string[] {
  return [...new Set([token, ...bases.map((base) => withVariant(token, base))])];
}

export function categorizeTailwindToken(token: string): IntentTokenCategory | null {
  if (tokenCategoryCache.has(token)) return tokenCategoryCache.get(token) ?? null;

  const { base } = splitVariant(token);
  let category: IntentTokenCategory | null = null;
  if (spacingPattern.test(base)) category = "spacing";
  else if (radiusPattern.test(base)) category = "radius";
  else if (sizingPattern.test(base) || displayPattern.test(base) || layoutPattern.test(base)) category = "layout";
  else if (typographyPattern.test(base)) category = "typography";
  else if (effectPattern.test(base)) category = "effect";
  else if (colorPattern.test(base)) category = "color";

  tokenCategoryCache.set(token, category);
  return category;
}

export function tokenizeClassName(className: string): IntentToken[] {
  const cached = classNameTokenCache.get(className);
  if (cached) return cached.map((token) => ({ ...token }));

  const tokens: IntentToken[] = [];
  const tokenPattern = /\S+/g;
  let match: RegExpExecArray | null;
  while ((match = tokenPattern.exec(className)) !== null) {
    const token = match[0];
    const category = categorizeTailwindToken(token);
    tokens.push({
      token,
      start: match.index,
      end: match.index + token.length,
      sourceStart: match.index,
      sourceEnd: match.index + token.length,
      category,
      editable: category !== null && candidatesForToken(token).length > 1
    });
  }

  if (classNameTokenCache.size >= maxClassNameTokenCacheSize) classNameTokenCache.clear();
  classNameTokenCache.set(className, tokens.map((token) => ({ ...token })));
  return tokens;
}

function colorCandidates(token: string, base: string): string[] | null {
  const match = base.match(
    /^((?:bg|text|border(?:-[trblxy])?|divide-[xy]|ring|ring-offset|outline|decoration|accent|caret|fill|stroke|shadow))-(.+)$/
  );
  if (!match) return null;

  const property = match[1];
  const [colorValue, opacity] = match[2].split("/", 2);
  if (colorValue.startsWith("[") || colorValue.includes("(")) return [token];

  const familyShade = colorValue.match(/^([a-z]+)-(50|100|200|300|400|500|600|700|800|900|950)$/);
  const suffix = opacity ? `/${opacity}` : "";
  if (familyShade && colorFamilies.includes(familyShade[1])) {
    const [, family, shade] = familyShade;
    return uniqueCandidates(token, [
      ...colorShades.map((nextShade) => `${property}-${family}-${nextShade}${suffix}`),
      ...colorFamilies.map((nextFamily) => `${property}-${nextFamily}-${shade}${suffix}`),
      ...semanticColors.map((color) => `${property}-${color}`)
    ]);
  }

  if (semanticColors.includes(colorValue)) {
    return uniqueCandidates(token, [
      ...semanticColors.map((color) => `${property}-${color}`),
      ...colorFamilies.map((family) => `${property}-${family}-500${suffix}`)
    ]);
  }

  return [token];
}

export function candidatesForToken(token: string): string[] {
  const { base } = splitVariant(token);

  const spacingMatch = base.match(
    /^(-?(?:p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|gap|gap-x|gap-y))-([\w.[\]/%()!-]+)$/
  );
  if (spacingMatch) return uniqueCandidates(token, spacingValues.map((value) => `${spacingMatch[1]}-${value}`));

  const sizingMatch = base.match(/^((?:w|h|min-w|min-h|max-w|max-h|size))-([\w.[\]/%()!-]+)$/);
  if (sizingMatch) return uniqueCandidates(token, sizingValues.map((value) => `${sizingMatch[1]}-${value}`));

  if (displayPattern.test(base)) {
    return uniqueCandidates(token, ["block", "inline-block", "flex", "inline-flex", "grid", "hidden"]);
  }

  const radiusMatch = base.match(/^(rounded(?:-[trbl]{1,2})?)(?:-([\w.[\]/%-]+))?$/);
  if (radiusMatch) {
    return uniqueCandidates(
      token,
      radiusValues.map((value) => (value === "md" ? radiusMatch[1] : `${radiusMatch[1]}-${value}`))
    );
  }

  const gridMatch = base.match(/^(grid-cols)-(\d+)$/);
  if (gridMatch) return uniqueCandidates(token, Array.from({ length: 12 }, (_, index) => `${gridMatch[1]}-${index + 1}`));

  const flexMatch = base.match(/^(flex)-(1|auto|initial|none|row|row-reverse|col|col-reverse|wrap|wrap-reverse|nowrap)$/);
  if (flexMatch) {
    const values = ["1", "auto", "initial", "none", "row", "row-reverse", "col", "col-reverse", "wrap", "wrap-reverse", "nowrap"];
    return uniqueCandidates(token, values.map((value) => `flex-${value}`));
  }

  const layoutMatch = base.match(/^(items|justify|content|self)-([\w-]+)$/);
  if (layoutMatch) {
    const values =
      layoutMatch[1] === "items"
        ? ["start", "end", "center", "baseline", "stretch"]
        : layoutMatch[1] === "justify"
          ? ["normal", "start", "end", "center", "between", "around", "evenly", "stretch"]
          : layoutMatch[1] === "content"
            ? ["normal", "center", "start", "end", "between", "around", "evenly", "baseline", "stretch"]
            : ["auto", "start", "end", "center", "stretch", "baseline"];
    return uniqueCandidates(token, values.map((value) => `${layoutMatch[1]}-${value}`));
  }

  const textMatch = base.match(/^(text)-(xs|sm|base|lg|xl|[2-9]xl)$/);
  if (textMatch) return uniqueCandidates(token, textSizeValues.map((value) => `text-${value}`));

  const fontMatch = base.match(/^font-([\w-]+)$/);
  if (fontMatch && fontWeightValues.includes(fontMatch[1])) {
    return uniqueCandidates(token, fontWeightValues.map((value) => `font-${value}`));
  }

  const leadingMatch = base.match(/^leading-([\w.[\]/%-]+)$/);
  if (leadingMatch) return uniqueCandidates(token, leadingValues.map((value) => `leading-${value}`));

  if (/^shadow(?:-(?:none|sm|md|lg|xl|2xl|inner))?$/.test(base)) {
    return uniqueCandidates(token, ["shadow-none", "shadow-sm", "shadow", "shadow-md", "shadow-lg", "shadow-xl", "shadow-2xl", "shadow-inner"]);
  }

  const opacityMatch = base.match(/^opacity-(\d+)$/);
  if (opacityMatch) return uniqueCandidates(token, opacityValues.map((value) => `opacity-${value}`));

  if (/^ring(?:-(?:0|1|2|4|8))?$/.test(base)) {
    return uniqueCandidates(token, ["ring-0", "ring-1", "ring", "ring-2", "ring-4", "ring-8"]);
  }

  if (/^transition(?:-(?:none|all|colors|opacity|shadow|transform))?$/.test(base)) {
    return uniqueCandidates(token, ["transition-none", "transition", "transition-all", "transition-colors", "transition-opacity", "transition-shadow", "transition-transform"]);
  }

  return colorCandidates(token, base) ?? [token];
}

function spacingProperty(prefix: string): string | null {
  const properties: Record<string, string> = {
    p: "spacing.padding",
    px: "spacing.paddingX",
    py: "spacing.paddingY",
    pt: "spacing.paddingTop",
    pr: "spacing.paddingRight",
    pb: "spacing.paddingBottom",
    pl: "spacing.paddingLeft",
    m: "spacing.margin",
    mx: "spacing.marginX",
    my: "spacing.marginY",
    mt: "spacing.marginTop",
    mr: "spacing.marginRight",
    mb: "spacing.marginBottom",
    ml: "spacing.marginLeft",
    gap: "layout.gap",
    "gap-x": "layout.gapX",
    "gap-y": "layout.gapY"
  };
  return properties[prefix] ?? null;
}

function colorProperty(prefix: string): string {
  if (prefix === "bg") return "color.background";
  if (prefix === "text") return "color.text";
  if (prefix.startsWith("border")) return "color.border";
  if (prefix.startsWith("divide")) return "color.divide";
  if (prefix === "ring-offset") return "color.ringOffset";
  return `color.${prefix}`;
}

function semanticParts(base: string): { property: string; value: string } | null {
  const spacing = base.match(
    /^(-?)(p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|gap|gap-x|gap-y)-(.+)$/
  );
  if (spacing) {
    const property = spacingProperty(spacing[2]);
    return property ? { property, value: `${spacing[1]}${spacing[3]}` } : null;
  }

  const sizing = base.match(/^(w|h|min-w|min-h|max-w|max-h|size)-(.+)$/);
  if (sizing) {
    const properties: Record<string, string> = {
      w: "size.width",
      h: "size.height",
      "min-w": "size.minWidth",
      "min-h": "size.minHeight",
      "max-w": "size.maxWidth",
      "max-h": "size.maxHeight",
      size: "size.both"
    };
    return { property: properties[sizing[1]], value: sizing[2] };
  }

  if (displayPattern.test(base)) return { property: "layout.display", value: base };

  const radius = base.match(/^(rounded(?:-[trbl]{1,2})?)(?:-(.+))?$/);
  if (radius) return { property: `radius.${radius[1]}`, value: radius[2] ?? "default" };

  const grid = base.match(/^grid-cols-(\d+)$/);
  if (grid) return { property: "layout.gridColumns", value: grid[1] };

  const flex = base.match(/^flex-(1|auto|initial|none|row|row-reverse|col|col-reverse|wrap|wrap-reverse|nowrap)$/);
  if (flex) {
    const value = flex[1];
    const property =
      value === "row" || value === "row-reverse" || value === "col" || value === "col-reverse"
        ? "layout.flexDirection"
        : value === "wrap" || value === "wrap-reverse" || value === "nowrap"
          ? "layout.flexWrap"
          : "layout.flex";
    return { property, value };
  }

  const alignment = base.match(/^(items|justify|content|self)-(.+)$/);
  if (alignment) {
    const properties: Record<string, string> = {
      items: "layout.alignItems",
      justify: "layout.justifyContent",
      content: "layout.alignContent",
      self: "layout.alignSelf"
    };
    return { property: properties[alignment[1]], value: alignment[2] };
  }

  const textSize = base.match(/^text-(xs|sm|base|lg|xl|[2-9]xl)$/);
  if (textSize) return { property: "typography.size", value: textSize[1] };

  const fontWeight = base.match(/^font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)$/);
  if (fontWeight) return { property: "typography.weight", value: fontWeight[1] };

  const leading = base.match(/^leading-(.+)$/);
  if (leading) return { property: "typography.lineHeight", value: leading[1] };

  const shadow = base.match(/^shadow(?:-(none|sm|md|lg|xl|2xl|inner))?$/);
  if (shadow) return { property: "effect.shadow", value: shadow[1] ?? "default" };

  const opacity = base.match(/^opacity-(\d+)$/);
  if (opacity) return { property: "effect.opacity", value: opacity[1] };

  const ring = base.match(/^ring(?:-(0|1|2|4|8))?$/);
  if (ring) return { property: "effect.ringWidth", value: ring[1] ?? "default" };

  const transition = base.match(/^transition(?:-(none|all|colors|opacity|shadow|transform))?$/);
  if (transition) return { property: "effect.transition", value: transition[1] ?? "default" };

  const color = base.match(
    /^((?:bg|text|border(?:-[trblxy])?|divide-[xy]|ring|ring-offset|outline|decoration|accent|caret|fill|stroke|shadow))-(.+)$/
  );
  if (color) return { property: colorProperty(color[1]), value: color[2] };

  return null;
}

export function describeTailwindToken(token: string): TailwindSemanticToken | null {
  const split = splitVariant(token);
  const current = semanticParts(split.base);
  if (!current) return null;

  const candidates: TailwindSemanticCandidate[] = [];
  const seen = new Set<string>();
  for (const candidate of candidatesForToken(token)) {
    const candidateParts = semanticParts(splitVariant(candidate).base);
    if (!candidateParts || candidateParts.property !== current.property) continue;
    const key = `${candidateParts.value}\0${candidate}`;
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({ value: candidateParts.value, token: candidate });
  }

  return {
    property: current.property,
    value: current.value,
    token,
    variant: split.variantPrefix ? split.variantPrefix.slice(0, -1) : null,
    candidates
  };
}
