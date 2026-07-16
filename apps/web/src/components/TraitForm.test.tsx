// @vitest-environment jsdom

import { createElement } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TraitForm } from './TraitForm.js';

describe('TraitForm validation', () => {
  it('rejects whitespace-only content with visible feedback', () => {
    const onSubmit = vi.fn();
    const view = render(createElement(TraitForm, { onSubmit }));
    fireEvent.change(screen.getByLabelText('Trait label'), { target: { value: '   ' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: '   ' } });
    fireEvent.change(screen.getByLabelText('Exact system instruction'), {
      target: { value: '   ' },
    });
    fireEvent.submit(view.container.querySelector('form')!);

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('cannot be blank');
  });
});
