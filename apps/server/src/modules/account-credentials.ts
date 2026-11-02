export const USERNAME_PATTERN = /^[\p{L}\p{N}]+$/u;
export const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9\s])\S{10,128}$/;

export function accountCredentialError(username: string | undefined, email: string | undefined, password: string | undefined) {
  const normalizedUsername = username?.trim() ?? '';
  const normalizedEmail = email?.trim().toLowerCase() ?? '';
  const normalizedPassword = password ?? '';

  if (normalizedUsername.length < 2 || normalizedUsername.length > 24 || !USERNAME_PATTERN.test(normalizedUsername)) {
    return '用户名须为 2–24 位中英文或数字。';
  }
  if (!/^\S+@\S+\.\S+$/.test(normalizedEmail) || normalizedEmail.length > 254) {
    return '请输入有效的邮箱地址。';
  }
  if (!PASSWORD_PATTERN.test(normalizedPassword)) {
    return '密码须为 10–128 位，并同时包含大写字母、小写字母、数字和特殊字符，且不能含空格。';
  }

  const comparablePassword = normalizedPassword.toLocaleLowerCase();
  const emailPrefix = normalizedEmail.split('@')[0]?.toLocaleLowerCase() ?? '';
  if (comparablePassword.includes(normalizedUsername.toLocaleLowerCase()) || (emailPrefix.length >= 3 && comparablePassword.includes(emailPrefix))) {
    return '密码不能包含用户名或邮箱前缀。';
  }
  return undefined;
}
