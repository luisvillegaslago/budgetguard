/**
 * Component Tests: InlinePrefixForm
 *
 * The compact create-a-series form shared by the invoice modal and the company settings.
 * It uppercases what you type, refuses to submit an empty or blank code, and hands the
 * trimmed prefix to its parent — which is what decides whether to link it to a client.
 */

import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';

jest.mock('@/hooks/useTranslations', () => ({
  useTranslate: () => ({ t: (key: string) => key, locale: 'es', setLocale: jest.fn() }),
}));

import { InlinePrefixForm } from '@/components/invoices/InlinePrefixForm';

function renderForm(overrides?: { isPending?: boolean; onSubmit?: jest.Mock; onCancel?: jest.Mock }) {
  const onSubmit = overrides?.onSubmit ?? jest.fn(async () => {});
  const onCancel = overrides?.onCancel ?? jest.fn();

  render(
    <InlinePrefixForm
      inputId="newPrefixCode"
      isPending={overrides?.isPending ?? false}
      onSubmit={onSubmit}
      onCancel={onCancel}
    />,
  );

  const input = screen.getByLabelText('settings.billing.fields.prefix');
  const create = screen.getByRole('button', { name: 'common.buttons.create' });
  const cancel = screen.getByRole('button', { name: 'common.buttons.cancel' });

  return { onSubmit, onCancel, input, create, cancel };
}

describe('InlinePrefixForm', () => {
  it('uppercases the typed prefix', () => {
    const { input } = renderForm();

    fireEvent.change(input, { target: { value: 'acme' } });

    expect(input).toHaveValue('ACME');
  });

  it('submits the trimmed prefix', () => {
    const { input, create, onSubmit } = renderForm();

    fireEvent.change(input, { target: { value: '  acme  ' } });
    fireEvent.click(create);

    expect(onSubmit).toHaveBeenCalledWith('ACME');
  });

  it('keeps the create button disabled until a prefix is typed', () => {
    const { input, create, onSubmit } = renderForm();

    expect(create).toBeDisabled();

    // Whitespace alone is not a prefix
    fireEvent.change(input, { target: { value: '   ' } });
    expect(create).toBeDisabled();

    fireEvent.click(create);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('disables the create button while the mutation is in flight', () => {
    const { input, create } = renderForm({ isPending: true });

    fireEvent.change(input, { target: { value: 'ACME' } });

    expect(create).toBeDisabled();
  });

  it('cancels without submitting', () => {
    const { input, cancel, onSubmit, onCancel } = renderForm();

    fireEvent.change(input, { target: { value: 'ACME' } });
    fireEvent.click(cancel);

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
