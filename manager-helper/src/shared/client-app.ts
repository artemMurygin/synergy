/** Header that tells the backend which client application sends the request. */
export const CLIENT_APP_HEADER = 'X-Client-App'

/** Value identifying this application (the employee extension). */
export const CLIENT_APP = 'employee-app'

/** Adds the client application header to request options, keeping other headers. */
export function withClientApp(init?: RequestInit): RequestInit {
  const headers = new Headers(init?.headers)
  headers.set(CLIENT_APP_HEADER, CLIENT_APP)
  return { ...init, headers }
}
