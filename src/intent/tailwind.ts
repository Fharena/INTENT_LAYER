import type { IntentToken, IntentTokenCategory } from "./types";

const spacingPattern =
  /^-?(?:p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|gap|gap-x|gap-y)-[\w.[\]/%-]+$/;
const radiusPattern = /^rounded(?:-[trbl]{1,2})?(?:-[\w.[\]/%-]+)?$/;
const layoutPattern =
  /^(?:grid-cols-\d+|flex-(?:row|col|wrap|nowrap)|items-[\w-]+|justify-[\w-]+|content-[\w-]+|self-[\w-]+)$/;
const typographyPattern =
  /^(?:text-(?:xs|sm|base|lg|xl|[2-9]xl)|font-[\w-]+|leading-[\w.[\]/%-]+)$/;
const colorPattern = /^(?:bg|text|border)-[\w/.[\]-]+$/;

const spacingValues = ["0", "1", "2", "3", "4", "5", "6", "8", "10", "12", "16"];
const radiusValues = ["none", "sm", "md", "lg", "xl", "2xl", "3xl", "full"];
const gridColumnValues = ["1", "2", "3", "4", "5", "6"];
const textSizeValues = ["xs", "sm", "base", "lg", "xl", "2xl", "3xl", "4xl"];
const tokenCategoryCache = new Map<string, IntentTokenCategory | null>();
const classNameTokenCache = new Map<string, IntentToken[]>();
const maxClassNameTokenCacheSize = 1000;

function splitVariant(token: string): { variantPrefix: string; base: string } {
  const parts = token.split(":");
  if (parts.length === 1) {
    return { variantPrefix: "", base: token };
  }

  return {
    variantPrefix: `${parts.slice(0, -1).join(":")}:`,
    base: parts[parts.length - 1] ?? token
  };
}

function withVariant(originalToken: string, nextBase: string): string {
  return `${splitVariant(originalToken).variantPrefix}${nextBase}`;
}

export function categorizeTailwindToken(token: string): IntentTokenCategory | null {
  if (tokenCategoryCache.has(token)) {
    return tokenCategoryCache.get(token) ?? null;
  }

  const { base } = splitVariant(token);

  let category: IntentTokenCategory | null = null;
  if (spacingPattern.test(base)) category = "spacing";
  else if (radiusPattern.test(base)) category = "radius";
  else if (layoutPattern.test(base)) category = "layout";
  else if (typographyPattern.test(base)) category = "typography";
  else if (colorPattern.test(base)) category = "color";

  tokenCategoryCache.set(token, category);
  return category;
}

export function tokenizeClassName(className: string): IntentToken[] {
  const cached = classNameTokenCache.get(className);
  if (cached) {
    return cached.map((token) => ({ ...token }));
  }

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
      editable: category !== null
    });
  }

  if (classNameTokenCache.size >= maxClassNameTokenCacheSize) {
    classNameTokenCache.clear();
  }
  classNameTokenCache.set(className, tokens.map((token) => ({ ...token })));
  return tokens;
}

export function candidatesForToken(token: string): string[] {
  const { base } = splitVariant(token);

  const spacingMatch = base.match(
    /^(-?(?:p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|gap|gap-x|gap-y))-([\w.[\]/%-]+)$/
  );
  if (spacingMatch) {
    return spacingValues.map((value) => withVariant(token, `${spacingMatch[1]}-${value}`));
  }

  const radiusMatch = base.match(/^(rounded(?:-[trbl]{1,2})?)(?:-([\w.[\]/%-]+))?$/);
  if (radiusMatch) {
    return radiusValues.map((value) =>
      value === "md"
        ? withVariant(token, radiusMatch[1])
        : withVariant(token, `${radiusMatch[1]}-${value}`)
    );
  }

  const gridMatch = base.match(/^(grid-cols)-(\d+)$/);
  if (gridMatch) {
    return gridColumnValues.map((value) => withVariant(token, `${gridMatch[1]}-${value}`));
  }

  const textMatch = base.match(/^(text)-(xs|sm|base|lg|xl|[2-9]xl)$/);
  if (textMatch) {
    return textSizeValues.map((value) => withVariant(token, `${textMatch[1]}-${value}`));
  }

  return [token];
}
