import { useState } from 'react'
import { supabase } from '../lib/supabase'

/**
 * AuthPage component providing Login, Sign Up, and Guest entry flows.
 */
export function AuthPage({ onAuthSuccess }) {
  const [mode, setMode] = useState('login') // 'login' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState(null)
  const [infoMessage, setInfoMessage] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErrorMessage(null)
    setInfoMessage(null)

    if (!email || !password) {
      setErrorMessage('Please fill in both email and password.')
      return
    }

    setIsLoading(true)

    try {
      if (mode === 'login') {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })

        if (error) {
          setErrorMessage(error.message)
          setIsLoading(false)
          return
        }

        if (data?.user && onAuthSuccess) {
          onAuthSuccess(data.user)
        }
      } else {
        // Sign Up
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        })

        if (error) {
          setErrorMessage(error.message)
          setIsLoading(false)
          return
        }

        // If email confirmation is enabled, user may not have an active session yet
        if (data?.session && data?.user) {
          if (onAuthSuccess) {
            onAuthSuccess(data.user)
          }
        } else if (data?.user) {
          setInfoMessage('Account created! Please check your email to confirm your account, or sign in.')
          setMode('login')
        }
      }
    } catch (err) {
      setErrorMessage(err.message || 'An unexpected error occurred during authentication.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleGuestEntry = async () => {
    setErrorMessage(null)
    setInfoMessage(null)
    setIsLoading(true)

    try {
      const { data, error } = await supabase.auth.signInAnonymously()

      if (error) {
        setErrorMessage(`Guest login failed: ${error.message}`)
        setIsLoading(false)
        return
      }

      if (data?.user && onAuthSuccess) {
        onAuthSuccess(data.user)
      }
    } catch (err) {
      setErrorMessage(err.message || 'Failed to sign in as guest.')
    } finally {
      setIsLoading(false)
    }
  }

  const toggleMode = () => {
    setErrorMessage(null)
    setInfoMessage(null)
    setMode((prev) => (prev === 'login' ? 'signup' : 'login'))
  }

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-logo">💺</div>
          <h1 className="auth-title">SeatSync</h1>
          <p className="auth-subtitle">
            {mode === 'login'
              ? 'Sign in to reserve and book your seats'
              : 'Create an account to start booking seats'}
          </p>
        </div>

        {errorMessage && (
          <div className="alert alert--error auth-alert" role="alert">
            {errorMessage}
          </div>
        )}

        {infoMessage && (
          <div className="alert alert--success auth-alert" role="status">
            {infoMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form" noValidate>
          <div className="form-group">
            <label htmlFor="auth-email" className="form-label">
              Email Address
            </label>
            <input
              id="auth-email"
              type="email"
              className="form-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              disabled={isLoading}
              required
              autoComplete="email"
            />
          </div>

          <div className="form-group">
            <label htmlFor="auth-password" className="form-label">
              Password
            </label>
            <input
              id="auth-password"
              type="password"
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              disabled={isLoading}
              required
              minLength={6}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </div>

          <button
            type="submit"
            className="btn btn--primary auth-submit-btn"
            disabled={isLoading}
          >
            {isLoading
              ? 'Please wait...'
              : mode === 'login'
              ? 'Sign In'
              : 'Create Account'}
          </button>
        </form>

        <div className="auth-toggle">
          {mode === 'login' ? (
            <p>
              Don&apos;t have an account?{' '}
              <button
                type="button"
                className="link-button"
                onClick={toggleMode}
                disabled={isLoading}
              >
                Sign Up
              </button>
            </p>
          ) : (
            <p>
              Already have an account?{' '}
              <button
                type="button"
                className="link-button"
                onClick={toggleMode}
                disabled={isLoading}
              >
                Sign In
              </button>
            </p>
          )}
        </div>

        <div className="auth-divider">
          <span>or</span>
        </div>

        <button
          type="button"
          className="btn btn--guest"
          onClick={handleGuestEntry}
          disabled={isLoading}
        >
          Continue as Guest
        </button>
      </div>
    </div>
  )
}

export default AuthPage
