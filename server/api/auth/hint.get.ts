export default defineEventHandler(async (event) => {
  const username = normalizeUsername(getQuery(event).username)
  enforceRateLimit(event, 'auth-password-hint-ip', 20, 15 * 60 * 1000)
  enforceRateLimit(event, 'auth-password-hint-account', 3, 15 * 60 * 1000, username)
  const session = await getUserSession(event)
  const challenge = session?.hintChallenge
  if (
    !challenge ||
    challenge.username !== username ||
    !Number.isFinite(challenge.expiresAt) ||
    challenge.expiresAt < Date.now()
  ) {
    throw createError({
      statusCode: 403,
      message: 'Effectuez d’abord une tentative de connexion pour afficher cet indice.',
    })
  }

  const db = useDB()
  const result = await db.execute({
    sql: 'SELECT password_hint FROM users WHERE username = ?',
    args: [username],
  })
  setHeader(event, 'Cache-Control', 'no-store')
  // setUserSession fusionne : il faut effacer la session pour consommer le défi.
  await clearUserSession(event)
  return { hint: result.rows[0]?.password_hint || null }
})
