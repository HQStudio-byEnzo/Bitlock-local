declare module '#auth-utils' {
  interface User {
    id: string
    username: string
    created_at?: string
    sessionVersion?: number
  }

  interface UserSession {
    hintChallenge?: {
      username: string
      expiresAt: number
    }
  }
}

export {}
