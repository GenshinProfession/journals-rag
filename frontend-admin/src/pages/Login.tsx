import { FormEvent, useEffect, useId, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../api/client';
import { PRODUCT_NAME, ADMIN_CONSOLE_TAGLINE } from '../brand';

export function Login() {
  const nav = useNavigate();
  const formId = useId();
  const errId = `${formId}-err`;
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    document.body.classList.add('admin-login-active');
    return () => document.body.classList.remove('admin-login-active');
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(username.trim(), password);
      nav('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-gate">
      <div className="admin-gate__aurora" aria-hidden />
      <div className="admin-gate__grid" aria-hidden />
      <main className="admin-gate__main">
        <div className="admin-gate__card">
          <div className="admin-gate__accent" aria-hidden />
          <header className="admin-gate__brand">
            <div className="admin-gate__mark" aria-hidden="true">
              <svg width="44" height="44" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="2" y="2" width="44" height="44" rx="14" fill="url(#adminGateGrad)" />
                <path
                  d="M15 31V17h12M21 17h12M27 17v14"
                  stroke="#fff"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <defs>
                  <linearGradient id="adminGateGrad" x1="10" y1="4" x2="38" y2="44" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#14b8a6" />
                    <stop offset="1" stopColor="#0d9488" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <div className="admin-gate__brand-text">
              <span className="admin-gate__wordmark">{PRODUCT_NAME}</span>
              <span className="admin-gate__tagsub">{ADMIN_CONSOLE_TAGLINE}</span>
            </div>
          </header>

          <h1 className="admin-gate__title">登录</h1>
          <p className="admin-gate__lede">使用组织已开通的管理员账号验证身份。</p>

          <form className="admin-gate__form" onSubmit={onSubmit} noValidate aria-busy={loading}>
            <div className="admin-field">
              <label htmlFor={`${formId}-user`} className="admin-field__label">
                用户名
              </label>
              <input
                id={`${formId}-user`}
                className="admin-field__input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
                autoCapitalize="none"
                spellCheck={false}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errId : undefined}
              />
              <span className="admin-field__hint">区分大小写，与后台登记一致。</span>
            </div>

            <div className="admin-field">
              <div className="admin-field__label-row">
                <label htmlFor={`${formId}-pass`} className="admin-field__label">
                  密码
                </label>
              </div>
              <div className="admin-field__control">
                <input
                  id={`${formId}-pass`}
                  className="admin-field__input admin-field__input--with-action"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? errId : undefined}
                />
                <button
                  type="button"
                  className="admin-field__reveal"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-pressed={showPassword}
                  aria-label={showPassword ? '隐藏密码' : '显示密码'}
                >
                  {showPassword ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
              <span className="admin-field__hint">若多次失败，请确认未被锁定或联系超级管理员。</span>
            </div>

            {error ? (
              <p id={errId} className="admin-gate__error" role="alert">
                {error}
              </p>
            ) : null}

            <button className="admin-gate__submit" type="submit" disabled={loading}>
              {loading ? (
                <>
                  <span className="admin-gate__submit-spinner" aria-hidden />
                  正在验证…
                </>
              ) : (
                '进入控制台'
              )}
            </button>
          </form>

          {import.meta.env.DEV ? (
            <p className="admin-gate__devhint">
              开发环境默认可走 Bootstrap：<code>admin</code>
            </p>
          ) : null}
        </div>
      </main>
    </div>
  );
}
