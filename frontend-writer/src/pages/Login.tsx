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
    <div className="login-shell login-shell--writer">
      <aside className="login-shell__aside" aria-hidden="true">
        <div className="login-shell__aside-inner">
          <div className="login-shell__brand-mark" aria-hidden="true">
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M12 8h16v26H12V8z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinejoin="round"
              />
              <path d="M16 14h8M16 19h8M16 24h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <p className="login-shell__eyebrow">Writer studio</p>
          <h2 className="login-shell__aside-title">代写工作台</h2>
          <p className="login-shell__aside-lead">
            项目、参考文献、RAG 检索与章节生成。使用管理员在后台为您开通的账号登录。
          </p>
          <ul className="login-shell__aside-list">
            <li>模板与标准参考文献</li>
            <li>向量索引与项目内检索</li>
            <li>大纲与章节导出</li>
          </ul>
        </div>
      </aside>

      <main className="login-shell__main">
        <div className="login-panel">
          <header className="login-panel__head">
            <h1 className="login-panel__title">登录工作台</h1>
            <p className="login-panel__subtitle">
              请输入管理员为您创建的写作者用户名与密码。
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
                '进入工作台'
              )}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
