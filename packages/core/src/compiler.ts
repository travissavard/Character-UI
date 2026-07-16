import { sha256Hex, normalizeString } from './hash.js';
import {
  BUILTIN_CATEGORY_ORDER,
  COMPILER_ID,
  type CategoryDefinition,
  type CompiledInstructions,
  type SelectedTraitSnapshot,
} from './types.js';

const builtinOrder = new Map<string, number>(
  BUILTIN_CATEGORY_ORDER.map((categoryId, index) => [categoryId, index]),
);

function categoryRank(categoryId: string, explicitOrder: string[]): number {
  const explicitIndex = explicitOrder.indexOf(categoryId);
  if (explicitIndex >= 0) return explicitIndex;
  const builtInIndex = builtinOrder.get(categoryId);
  if (builtInIndex !== undefined) return builtInIndex;
  return 10_000;
}

function normalizeInstruction(value: string): string {
  return normalizeString(value)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n  ');
}

function compareOrdinal(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export async function compileSnapshots(
  traits: SelectedTraitSnapshot[],
  categories: CategoryDefinition[],
  categoryOrder: string[] = [...BUILTIN_CATEGORY_ORDER],
): Promise<CompiledInstructions> {
  const identities = new Set<string>();
  for (const trait of traits) {
    if (identities.has(trait.key)) {
      throw new Error(`Duplicate selected trait: ${trait.key}`);
    }
    identities.add(trait.key);
  }

  const categoryLabels = new Map(categories.map((category) => [category.id, category.label]));
  for (const trait of traits) {
    if (!categoryLabels.has(trait.categoryId)) {
      categoryLabels.set(trait.categoryId, trait.categoryLabel);
    }
  }

  const sorted = [...traits].sort((left, right) => {
    const categoryDifference =
      categoryRank(left.categoryId, categoryOrder) - categoryRank(right.categoryId, categoryOrder);
    if (categoryDifference !== 0) return categoryDifference;
    if (left.categoryId !== right.categoryId)
      return compareOrdinal(left.categoryId, right.categoryId);
    if (left.order !== right.order) return left.order - right.order;
    return compareOrdinal(left.key, right.key);
  });

  const sections = new Map<string, SelectedTraitSnapshot[]>();
  for (const trait of sorted) {
    const section = sections.get(trait.categoryId) ?? [];
    section.push(trait);
    sections.set(trait.categoryId, section);
  }

  const text =
    Array.from(sections.entries())
      .map(([categoryId, sectionTraits]) => {
        const heading = categoryLabels.get(categoryId) ?? categoryId;
        const bullets = sectionTraits.map(
          (trait) => `- ${normalizeInstruction(trait.instruction)}`,
        );
        return `# ${normalizeString(heading)}\n${bullets.join('\n')}`;
      })
      .join('\n\n') + (sections.size > 0 ? '\n' : '');

  return {
    compiler: COMPILER_ID,
    text,
    traitCount: traits.length,
    characterCount: text.length,
    sha256: await sha256Hex(text),
  };
}
