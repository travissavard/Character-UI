import { sha256Hex } from './hash.js';
import { validateProfileDocument } from './schema.js';
import {
  COMPILER_ID,
  FORMAT_ID,
  SCHEMA_VERSION,
  type ProfileDocument,
  type ResolvedTrait,
  type SelectedTraitSnapshot,
  type UserProfile,
} from './types.js';

export async function snapshotTrait(resolved: ResolvedTrait): Promise<SelectedTraitSnapshot> {
  if (resolved.portableSnapshot) {
    return {
      ...resolved.portableSnapshot,
      source: { ...resolved.portableSnapshot.source },
    };
  }
  return {
    key: resolved.key,
    label: resolved.trait.label,
    categoryId: resolved.trait.categoryId,
    categoryLabel: resolved.category.label,
    description: resolved.trait.description,
    instruction: resolved.trait.instruction,
    order: resolved.trait.order,
    instructionHash: await sha256Hex(resolved.trait.instruction.normalize('NFC')),
    source: resolved.source,
  };
}

export async function createProfileDocument(
  profile: UserProfile,
  resolvedTraits: ResolvedTrait[],
): Promise<ProfileDocument> {
  const selected = new Set(profile.selectedTraitKeys);
  const selectedResolved = resolvedTraits.filter((trait) => selected.has(trait.key));
  const snapshots = await Promise.all(selectedResolved.map((trait) => snapshotTrait(trait)));

  const document: ProfileDocument = {
    format: FORMAT_ID,
    schemaVersion: SCHEMA_VERSION,
    kind: 'profile',
    profile: {
      id: profile.id,
      name: profile.name,
      description: profile.description,
      compiler: COMPILER_ID,
      categoryOrder: [...profile.categoryOrder],
      selectedTraits: snapshots,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    },
  };
  return validateProfileDocument(document);
}
