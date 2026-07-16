import { useState, type FormEvent } from 'react';

import { DEFAULT_CATEGORIES, type TraitDefinition } from '@character-ui/core';

interface TraitFormProps {
  initial?: Pick<TraitDefinition, 'label' | 'categoryId' | 'description' | 'instruction'>;
  onSubmit(
    value: Pick<TraitDefinition, 'label' | 'categoryId' | 'description' | 'instruction'>,
  ): void;
}

const blankTrait = {
  label: '',
  categoryId: 'personality',
  description: '',
  instruction: '',
};

export function TraitForm({ initial = blankTrait, onSubmit }: TraitFormProps) {
  const [value, setValue] = useState(initial);
  const [validationError, setValidationError] = useState<string | null>(null);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = {
      label: value.label.trim(),
      categoryId: value.categoryId,
      description: value.description.trim(),
      instruction: value.instruction.trim(),
    };
    if (!trimmed.label || !trimmed.description || !trimmed.instruction) {
      setValidationError('Label, description, and exact instruction cannot be blank.');
      return;
    }
    setValidationError(null);
    onSubmit(trimmed);
  };

  return (
    <form
      id="trait-form"
      className="form-stack"
      onSubmit={submit}
      onChange={() => setValidationError(null)}
    >
      <label>
        <span>Trait label</span>
        <input
          required
          maxLength={160}
          value={value.label}
          onChange={(event) => setValue((current) => ({ ...current, label: event.target.value }))}
          placeholder="Candid but considerate"
        />
      </label>
      <label>
        <span>Category</span>
        <select
          value={value.categoryId}
          onChange={(event) =>
            setValue((current) => ({ ...current, categoryId: event.target.value }))
          }
        >
          {DEFAULT_CATEGORIES.map((category) => (
            <option key={category.id} value={category.id}>
              {category.label}
            </option>
          ))}
          <option value="custom">Custom</option>
        </select>
      </label>
      <label>
        <span>Description</span>
        <textarea
          required
          maxLength={1000}
          rows={3}
          value={value.description}
          onChange={(event) =>
            setValue((current) => ({ ...current, description: event.target.value }))
          }
          placeholder="Explain when this trait is useful."
        />
      </label>
      <label>
        <span>Exact system instruction</span>
        <textarea
          required
          maxLength={2000}
          rows={5}
          value={value.instruction}
          onChange={(event) =>
            setValue((current) => ({ ...current, instruction: event.target.value }))
          }
          placeholder="Be candid without being unkind."
        />
      </label>
      {validationError ? (
        <p className="form-error" role="alert">
          {validationError}
        </p>
      ) : null}
    </form>
  );
}
