import { checkPassword, hashPassword } from './password';

describe('password', () => {
  it('checks the right password and refuses a wrong one', async () => {
    const stored = await hashPassword('hunter2');
    expect(await checkPassword('hunter2', stored)).toBe(true);
    expect(await checkPassword('hunter3', stored)).toBe(false);
  });

  it('salts, so the same password never stores the same string', async () => {
    expect(await hashPassword('x')).not.toBe(await hashPassword('x'));
  });

  it('refuses a stored value in some other format', async () => {
    expect(await checkPassword('x', '$2b$10$abcdefghijklmnopqrstuv')).toBe(false);
  });
});
