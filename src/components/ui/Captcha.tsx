import { forwardRef } from 'react'
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile'

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY

type CaptchaProps = {
  onSuccess: (token: string) => void
  onExpire?: () => void
  onError?: () => void
}

export const Captcha = forwardRef<TurnstileInstance, CaptchaProps>(
  function Captcha({ onSuccess, onExpire, onError }, ref) {
    if (!SITE_KEY) return null

    return (
      <Turnstile
        ref={ref}
        siteKey={SITE_KEY}
        onSuccess={onSuccess}
        onExpire={onExpire}
        onError={onError}
        options={{
          theme: 'dark',
          size: 'flexible',
          retry: 'auto',
          refreshExpired: 'auto',
        }}
        className="mx-auto"
      />
    )
  }
)
