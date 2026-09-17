import { TestBed } from '@angular/core/testing';
import { ConfirmService } from './confirm.service';

describe('ConfirmService', () => {
  let svc: ConfirmService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [ConfirmService] });
    svc = TestBed.inject(ConfirmService);
  });

  it('opens a confirm dialog with defaults + confirm kind', () => {
    const p = svc.confirm({ message: 'Delete this?' });
    const s = svc.state();
    expect(s).toBeTruthy();
    expect(s!.kind).toBe('confirm');
    expect(s!.message).toBe('Delete this?');
    expect(s!.variant).toBeUndefined();
    expect(svc.state()).not.toBeNull();
    // resolve so the pending promise doesn't linger
    svc.resolve(false);
    p.catch(() => {});
  });

  it('opens an alert dialog with a single-OK semantics and resolves true', async () => {
    const p = svc.alert({ title: 'Saved', message: 'Done' });
    expect(svc.state()?.kind).toBe('alert');
    svc.resolve(true);
    await expect(p).resolves.toBe(true);
    expect(svc.state()).toBeNull();
  });

  it('resolve(true) / resolve(false) propagate to the awaiting caller and clear state', async () => {
    const p = svc.confirm({ message: 'Proceed?', variant: 'danger' });
    svc.resolve(true);
    await expect(p).resolves.toBe(true);
    expect(svc.state()).toBeNull();
  });

  it('opening a second dialog resolves the first as cancelled', async () => {
    const first = svc.confirm({ message: 'First?' });
    const second = svc.confirm({ message: 'Second?' });
    expect(svc.state()?.message).toBe('Second?');
    await expect(first).resolves.toBe(false);
    second.then(() => {});
    svc.resolve(false);
  });

  it('closing via dismiss (resolve false) returns false', async () => {
    const p = svc.confirm({ message: 'Go?' });
    svc.resolve(false);
    await expect(p).resolves.toBe(false);
  });
});