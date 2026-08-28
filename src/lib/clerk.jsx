// Clerk, made optional.
//
// main.jsx mounts <ClerkProvider> only when VITE_CLERK_PUBLISHABLE_KEY is set,
// and renders the routes bare when it is not. That fallback could not work:
// Landing, App and Account called useUser()/useAuth() unconditionally, and a
// Clerk hook outside its provider throws — so with no key the landing page
// rendered nothing at all.
//
// These are drop-in replacements for the Clerk imports. With a key they ARE the
// Clerk exports; without one they are signed-out stubs, so a build with no Clerk
// credentials runs anonymously instead of white-screening.
//
// The branch is taken once at module load, not inside a hook body: the env var is
// substituted at build time, so each export is a single stable function for the
// life of the bundle and hook order never varies between renders.

import {
  useUser as clerkUseUser,
  useAuth as clerkUseAuth,
  UserButton as ClerkUserButton,
  SignInButton as ClerkSignInButton,
  SignUpButton as ClerkSignUpButton,
} from '@clerk/clerk-react'

export const clerkEnabled = !!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

// Shapes match the fields this app actually reads off the real hooks.
const SIGNED_OUT_USER = { isSignedIn: false, isLoaded: true, user: null }
const SIGNED_OUT_AUTH = { isSignedIn: false, isLoaded: true, userId: null, getToken: async () => null }

export const useUser = clerkEnabled ? clerkUseUser : () => SIGNED_OUT_USER
export const useAuth = clerkEnabled ? clerkUseAuth : () => SIGNED_OUT_AUTH

// No account to show when auth is off.
export const UserButton = clerkEnabled ? ClerkUserButton : () => null

// Sign-in/up wrappers style their own children, so keep rendering them — the page
// keeps its layout and the button is simply inert without Clerk to open a modal.
const PassThrough = ({ children }) => children ?? null
export const SignInButton = clerkEnabled ? ClerkSignInButton : PassThrough
export const SignUpButton = clerkEnabled ? ClerkSignUpButton : PassThrough
