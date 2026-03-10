import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from './lib/supabase/middleware'
import { createServerClient } from '@supabase/ssr'

export async function middleware(request: NextRequest) {
    const response = await updateSession(request)

    // Quick check using cookies to avoid blocking network call during navigation
    const hasAuthCookie = Array.from(request.cookies.getAll()).some(cookie => 
        cookie.name.startsWith('sb-') && cookie.name.endsWith('-auth-token')
    )

    if (request.nextUrl.pathname.startsWith('/dashboard') && !hasAuthCookie) {
        return NextResponse.redirect(new URL('/login', request.url))
    }

    if ((request.nextUrl.pathname === '/login' || request.nextUrl.pathname === '/register') && hasAuthCookie) {
        return NextResponse.redirect(new URL('/dashboard', request.url))
    }

    return response
}

export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
}
