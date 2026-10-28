import { NextResponse, type NextRequest } from 'next/server'

const PROTECTED = ['/dashboard', '/learn', '/profile', '/graph', '/engine']
const AUTH_PAGES = ['/login', '/signup']

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const token = request.cookies.get('synaptic_token')?.value

  const isProtected = PROTECTED.some(p => pathname.startsWith(p))
  const isAuthPage  = AUTH_PAGES.some(p => pathname === p)

  // Redirect unauthenticated users away from protected pages
  if (isProtected && !token) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Redirect authenticated users away from auth pages
  if (isAuthPage && token) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
}
