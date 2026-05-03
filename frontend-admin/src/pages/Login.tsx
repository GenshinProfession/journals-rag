import { FormEvent, useId, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../api/client';

export function Login() {
  const nav = useNavigate();
  const formId = useId();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
    <div className="login-shell login-shell--admin">
      <aside className="login-shell__aside" aria-hidden="true">
        <div className="login-shell__aside-inner">
          <div className="login-shell__brand-mark" aria-hidden="true">
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="4" y="8" width="32" height="24" rx="5" stroke="currentColor" strokeWidth="2" />
              <path d="M14 18h12M14 22h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <p className="login-shell__eyebrow">Journals RAG</p>
          <h2 className="login-shell__aside-title">管理员控制台</h2>
          <p className="login-shell__aside-lead">
            用户、充值、模型与计费在一处管理。登录后仅管理员可访问。
          </p>
          <ul className="login-shell__aside-list">
            <li>学校模板与写作者账号</li>
            <li>中继模型与内部成本核算</li>
            <li>钱包与账单流水</li>
          </ul>
        </div>
      </aside>

      <main className="login-shell__main">
        <div className="login-panel">
          <header className="login-panel__head">
            <h1 className="login-panel__title">欢迎回来</h1>
            <p className="login-panel__subtitle">
              使用 Bootstrap 或数据库中的 <span className="login-panel__kbd">admin</span> 账号登录。写作者请前往
              代写工作台。
            </p>
          </header>

          <form id={formId} className="login-form" onSubmit={onSubmit} noValidate>
            <div className="login-field">
              <label htmlFor={`${formId}-user`}>用户名</label>
              <input
                id={`${formId}-user`}
                className="login-field__input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
                autoCapitalize="none"
                spellCheck={false}
              />
            </div>
            <div className="login-field">
              <label htmlFor={`${formId}-pass`}>密码</label>
              <input
                id={`${formId}-pass`}
                className="login-field__input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>

            {error ? (
              <div className="login-alert login-alert--error" role="alert">
                {error}
              </div>
            ) : null}

            <button className="login-submit" type="submit" disabled={loading} aria-busy={loading}>
              {loading ? (
                <>
                  <span className="login-submit__spinner" aria-hidden="true" />
                  <span>登录中…</span>
                </>
              ) : (
                '进入控制台'
              )}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
