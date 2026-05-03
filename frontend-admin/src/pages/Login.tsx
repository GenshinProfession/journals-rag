import { FormEvent, useEffect, useId, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../api/client';

export function Login() {
  const nav = useNavigate();
  const formId = useId();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
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
      await login(username, password);
      nav('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="google-login-page">
      <main className="google-login-page__inner">
        <div className="google-card google-card--admin">
          <div className="google-card__logo google-card__logo--admin" aria-hidden="true">
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="4" y="8" width="32" height="24" rx="5" stroke="currentColor" strokeWidth="2" />
              <path d="M14 18h12M14 22h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <h1 className="google-card__title">登录</h1>
          <p className="google-card__subtitle">
            使用您的 <strong>Journals RAG</strong> 管理员账号。写作者请前往代写工作台。
          </p>
          <p className="google-card__hint">
            本地开发可使用 Bootstrap 账号 <span className="google-card__kbd">admin</span>。
          </p>

          <form className="google-card__form" onSubmit={onSubmit} noValidate>
            <div className="google-field">
              <label htmlFor={`${formId}-user`}>用户名或电子邮件</label>
              <input
                id={`${formId}-user`}
                className="google-field__input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
                autoCapitalize="none"
                spellCheck={false}
              />
            </div>
            <div className="google-field">
              <label htmlFor={`${formId}-pass`}>输入您的密码</label>
              <input
                id={`${formId}-pass`}
                className="google-field__input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            {error ? (
              <p className="google-card__error" role="alert">
                {error}
              </p>
            ) : null}
            <div className="google-card__actions google-card__actions--admin">
              <button className="google-btn google-btn--primary google-btn--blue" type="submit" disabled={loading} aria-busy={loading}>
                {loading ? '请稍候…' : '登录'}
              </button>
            </div>
          </form>
        </div>
        <p className="google-login-page__footer muted">管理员控制台 · 安全登录</p>
      </main>
    </div>
  );
}
